const { pool } = require('../config/db');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/login?error=' + encodeURIComponent('Vui lòng đăng nhập để tiếp tục.'));
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/auth/login');
    }
    const userRole = req.session.user.role;
    if (roles.includes(userRole)) {
      return next();
    }
    return res.status(403).render('error', {
      title: 'Truy cập bị từ chối (403)',
      message: 'Bạn không có quyền truy cập vào chức năng hoặc tài nguyên này.',
      status: 403
    });
  };
}

async function checkActive(req, res, next) {
  if (req.session && req.session.user) {
    try {
      const [rows] = await pool.execute('SELECT is_active, role FROM users WHERE id = ?', [req.session.user.id]);
      if (!rows.length || !rows[0].is_active) {
        req.session.destroy();
        return res.redirect('/auth/login?error=' + encodeURIComponent('Tài khoản của bạn đã bị khóa hoặc không tồn tại.'));
      }
      // Đồng bộ role mới nhất nếu admin thay đổi
      req.session.user.role = rows[0].role;
    } catch (err) {
      console.error('Lỗi kiểm tra trạng thái người dùng:', err);
    }
  }
  next();
}

module.exports = {
  isAuthenticated,
  requireRole,
  checkActive
};
