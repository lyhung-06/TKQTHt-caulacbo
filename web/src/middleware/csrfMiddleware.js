const crypto = require('crypto');

function csrfMiddleware(req, res, next) {
  // Bỏ qua kiểm tra CSRF cho endpoint /health
  if (req.path === '/health') {
    return next();
  }

  // Khởi tạo token nếu chưa có trong session
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }

  // Truyền token sang view
  res.locals.csrfToken = req.session.csrfToken;

  // Kiểm tra với các phương thức thay đổi trạng thái
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const clientToken = (req.body && req.body._csrf) ||
                      req.headers['x-csrf-token'] ||
                      req.headers['csrf-token'];

  if (!clientToken || clientToken !== req.session.csrfToken) {
    console.warn(`[CSRF] Phát hiện yêu cầu không hợp lệ từ IP: ${req.ip}`);
    return res.status(403).render('error', {
      title: 'Lỗi xác thực CSRF (403)',
      message: 'Phiên làm việc hoặc mã xác thực biểu mẫu không hợp lệ. Vui lòng tải lại trang và thử lại.',
      status: 403
    });
  }

  next();
}

module.exports = csrfMiddleware;
