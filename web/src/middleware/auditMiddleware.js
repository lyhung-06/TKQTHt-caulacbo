const { pool } = require('../config/db');

async function logAudit(actorUserId, action, entityType, entityId = null, metadata = {}) {
  try {
    // Loại bỏ các trường nhạy cảm nếu có trong metadata
    const sanitizedMetadata = { ...metadata };
    delete sanitizedMetadata.password;
    delete sanitizedMetadata.password_hash;
    delete sanitizedMetadata._csrf;
    delete sanitizedMetadata.token;

    await pool.execute(
      'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?)',
      [actorUserId || null, action, entityType, String(entityId || ''), JSON.stringify(sanitizedMetadata)]
    );
  } catch (err) {
    console.error('Không thể ghi audit log:', err.message);
  }
}

module.exports = { logAudit };
