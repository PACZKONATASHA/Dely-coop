const express = require('express');
const db = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PRICES = { 'Pequeño': 300, 'Mediano': 450, 'Grande': 600, 'Muy grande': 800 };

function nextOrderNum() {
  const last = db.prepare("SELECT order_num FROM orders ORDER BY id DESC LIMIT 1").get();
  if (!last) return '#1027';
  const n = parseInt(last.order_num.replace('#', ''), 10);
  return '#' + (n + 1);
}

function formatDate(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return isToday ? `Hoy, ${hh}:${mm}` : `Ayer, ${hh}:${mm}`;
}

// Commerce: create order
router.post('/', requireAuth, requireRole('commerce'), (req, res) => {
  const { package_size, destination_address, reference, observations } = req.body;
  if (!package_size || !destination_address) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const price = PRICES[package_size] || 450;
  const order_num = nextOrderNum();

  const stmt = db.prepare(`
    INSERT INTO orders (order_num, commerce_id, status, package_size, destination_address, reference, observations, price)
    VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)
  `);
  const orderId = stmt.run(order_num, req.user.id, package_size, destination_address, reference || null, observations || null, price).lastInsertRowid;

  db.prepare("INSERT INTO order_events (order_id, event_type, description) VALUES (?, 'created', 'Pedido recibido')")
    .run(orderId);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  res.status(201).json(order);
});

// Commerce: list own orders
router.get('/', requireAuth, requireRole('commerce'), (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM orders WHERE commerce_id = ?';
  const params = [req.user.id];
  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }
  query += ' ORDER BY id DESC';
  const orders = db.prepare(query).all(...params);
  res.json(orders.map(o => ({ ...o, time: formatDate(o.created_at) })));
});

// Courier: list available (pending) orders
router.get('/available', requireAuth, requireRole('courier'), (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.name as commerce_name,
           cp.address as commerce_address
    FROM orders o
    JOIN users u ON u.id = o.commerce_id
    LEFT JOIN commerce_profiles cp ON cp.user_id = o.commerce_id
    WHERE o.status = 'pending'
    ORDER BY o.id DESC
  `).all();
  res.json(orders.map(o => ({ ...o, time: formatDate(o.created_at) })));
});

// Courier: list own deliveries
router.get('/my-deliveries', requireAuth, requireRole('courier'), (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.name as commerce_name
    FROM orders o
    JOIN users u ON u.id = o.commerce_id
    WHERE o.courier_id = ?
    ORDER BY o.id DESC LIMIT 20
  `).all(req.user.id);
  res.json(orders.map(o => ({ ...o, time: formatDate(o.created_at) })));
});

// Single order detail
router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare(`
    SELECT o.*,
           u.name as commerce_name,
           cp.address as commerce_address,
           cu.name as courier_name,
           coup.rating as courier_rating
    FROM orders o
    JOIN users u ON u.id = o.commerce_id
    LEFT JOIN commerce_profiles cp ON cp.user_id = o.commerce_id
    LEFT JOIN users cu ON cu.id = o.courier_id
    LEFT JOIN courier_profiles coup ON coup.user_id = o.courier_id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  const isOwner = req.user.role === 'commerce'
    ? order.commerce_id === req.user.id
    : order.courier_id === req.user.id;
  if (!isOwner && req.user.role !== 'commerce') {
    return res.status(403).json({ error: 'Sin acceso' });
  }

  const events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id ASC').all(order.id);
  res.json({ ...order, events, time: formatDate(order.created_at) });
});

// Courier: accept order
router.put('/:id/accept', requireAuth, requireRole('courier'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.status !== 'pending') return res.status(409).json({ error: 'El pedido ya no está disponible' });

  db.prepare("UPDATE orders SET courier_id = ?, status = 'assigned', updated_at = datetime('now') WHERE id = ?")
    .run(req.user.id, order.id);
  db.prepare("INSERT INTO order_events (order_id, event_type, description) VALUES (?, 'assigned', 'Repartidor asignado')")
    .run(order.id);

  res.json({ success: true });
});

// Courier: mark pickup
router.put('/:id/pickup', requireAuth, requireRole('courier'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND courier_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.status !== 'assigned') return res.status(409).json({ error: 'Estado inválido para esta acción' });

  db.prepare("UPDATE orders SET status = 'transit', updated_at = datetime('now') WHERE id = ?").run(order.id);
  db.prepare("INSERT INTO order_events (order_id, event_type, description) VALUES (?, 'transit', 'Pedido retirado del comercio')")
    .run(order.id);

  res.json({ success: true });
});

// Courier: mark delivered
router.put('/:id/deliver', requireAuth, requireRole('courier'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND courier_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.status !== 'transit') return res.status(409).json({ error: 'Estado inválido para esta acción' });

  db.prepare("UPDATE orders SET status = 'delivered', updated_at = datetime('now') WHERE id = ?").run(order.id);
  db.prepare("INSERT INTO order_events (order_id, event_type, description) VALUES (?, 'delivered', 'Entregado al cliente')")
    .run(order.id);

  // update courier balance and delivery count
  db.prepare("UPDATE courier_profiles SET balance = balance + ?, total_deliveries = total_deliveries + 1 WHERE user_id = ?")
    .run(order.price, req.user.id);

  res.json({ success: true, earned: order.price });
});

// Commerce: cancel order
router.put('/:id/cancel', requireAuth, requireRole('commerce'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND commerce_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (['delivered', 'cancelled'].includes(order.status)) {
    return res.status(409).json({ error: 'No se puede cancelar este pedido' });
  }

  db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(order.id);
  db.prepare("INSERT INTO order_events (order_id, event_type, description) VALUES (?, 'cancelled', 'Pedido cancelado por el comercio')")
    .run(order.id);

  res.json({ success: true });
});

module.exports = router;
