const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { email, password, role, name, phone, business_name, address } = req.body;
  if (!email || !password || !role || !name) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if (!['commerce', 'courier'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'El email ya está registrado' });

  const hash = bcrypt.hashSync(password, 10);
  const insertUser = db.prepare(
    'INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)'
  );
  const userId = insertUser.run(email, hash, role, name, phone || null).lastInsertRowid;

  if (role === 'commerce') {
    db.prepare('INSERT INTO commerce_profiles (user_id, business_name, address) VALUES (?, ?, ?)')
      .run(userId, business_name || name, address || null);
  } else {
    db.prepare('INSERT INTO courier_profiles (user_id) VALUES (?)').run(userId);
  }

  const token = jwt.sign({ id: userId, email, role, name }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: { id: userId, email, role, name } });
});

router.post('/login', (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  if (role && user.role !== role) {
    return res.status(401).json({ error: `Esta cuenta no es de tipo ${role === 'commerce' ? 'Comercio' : 'Repartidor'}` });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, role, name, phone, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  let profile = null;
  if (user.role === 'commerce') {
    profile = db.prepare('SELECT * FROM commerce_profiles WHERE user_id = ?').get(user.id);
  } else {
    profile = db.prepare('SELECT * FROM courier_profiles WHERE user_id = ?').get(user.id);
  }

  res.json({ ...user, profile });
});

module.exports = router;
