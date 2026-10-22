const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'club_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'club_management',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  timezone: '+07:00'
});

async function testConnection(retries = 10, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await pool.getConnection();
      console.log('✅ Kết nối cơ sở dữ liệu MySQL thành công!');
      connection.release();
      return true;
    } catch (err) {
      console.warn(`⏳ Đang chờ kết nối MySQL (lần ${i}/${retries}): ${err.message}`);
      if (i === retries) {
        console.error('❌ Không thể kết nối tới MySQL sau nhiều lần thử.');
        throw err;
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

module.exports = {
  pool,
  testConnection
};
