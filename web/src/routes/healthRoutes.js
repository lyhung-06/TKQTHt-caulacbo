const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: 'connected'
    });
  } catch (err) {
    return res.status(503).json({
      status: 'DEGRADED',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed'
    });
  }
});

module.exports = router;
