const express = require('express');
const db = require('../database/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', requireAuth, requireRole('courier'), (req, res) => {
  const profile = db.prepare('SELECT * FROM courier_profiles WHERE user_id = ?').get(req.user.id);
  if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE courier_id = ? AND status = 'delivered'
    AND date(updated_at) = ?
  `).get(req.user.id, today).count;

  const weekCount = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE courier_id = ? AND status = 'delivered'
    AND date(updated_at) >= date('now', '-7 days')
  `).get(req.user.id).count;

  res.json({
    balance: profile.balance,
    rating: profile.rating,
    available: !!profile.available,
    total_deliveries: profile.total_deliveries,
    today_deliveries: todayCount,
    week_deliveries: weekCount,
  });
});

router.put('/availability', requireAuth, requireRole('courier'), (req, res) => {
  const { available } = req.body;
  if (typeof available !== 'boolean') {
    return res.status(400).json({ error: 'Campo "available" requerido (boolean)' });
  }
  db.prepare('UPDATE courier_profiles SET available = ? WHERE user_id = ?')
    .run(available ? 1 : 0, req.user.id);
  res.json({ available });
});

router.get('/active-delivery', requireAuth, requireRole('courier'), (req, res) => {
  const order = db.prepare(`
    SELECT o.*,
           u.name as commerce_name,
           cp.address as commerce_address
    FROM orders o
    JOIN users u ON u.id = o.commerce_id
    LEFT JOIN commerce_profiles cp ON cp.user_id = o.commerce_id
    WHERE o.courier_id = ? AND o.status IN ('assigned','transit')
    ORDER BY o.id DESC LIMIT 1
  `).get(req.user.id);

  if (!order) return res.json(null);

  const events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id ASC').all(order.id);
  res.json({ ...order, events });
});

module.exports = router;
