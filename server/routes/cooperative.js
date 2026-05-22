const express = require('express');
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/news', requireAuth, (req, res) => {
  const news = db.prepare('SELECT * FROM cooperative_news ORDER BY id DESC').all();
  res.json(news);
});

router.get('/stats', requireAuth, (req, res) => {
  const totalDeliveries = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'").get().c;
  const totalMembers = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  const totalCommerces = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'commerce'").get().c;
  const totalCouriers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'courier'").get().c;

  res.json({
    total_deliveries: totalDeliveries,
    total_members: totalMembers,
    total_commerces: totalCommerces,
    total_couriers: totalCouriers,
  });
});

module.exports = router;
