const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const dotenv = require('dotenv');
const client = require('prom-client');

dotenv.config();

const { testConnection } = require('./config/db');
const { checkActive } = require('./middleware/authMiddleware');
const csrfMiddleware = require('./middleware/csrfMiddleware');

// Khởi tạo ứng dụng Express
const app = express();
const PORT = process.env.PORT || 3000;
const metricsRegistry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry });
const httpRequests = new client.Counter({
  name: 'club_http_requests_total',
  help: 'Total HTTP responses returned by the club web application.',
  labelNames: ['method', 'status_code'],
  registers: [metricsRegistry]
});
const httpRequestDuration = new client.Histogram({
  name: 'club_http_request_duration_seconds',
  help: 'HTTP response duration in seconds for the club web application.',
  labelNames: ['method'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry]
});
app.set('trust proxy', 1);

// Cấu hình bảo mật Helmet với Content Security Policy phù hợp EJS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Xử lý dữ liệu gửi lên (giới hạn payload 1MB tránh DoS)
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  if (req.path === '/metrics') {
    return next();
  }

  const endTimer = httpRequestDuration.startTimer({ method: req.method });
  res.on('finish', () => {
    httpRequests.inc({ method: req.method, status_code: String(res.statusCode) });
    endTimer();
  });
  next();
});

app.get('/metrics', (req, res, next) => {
  metricsRegistry.metrics()
    .then((metrics) => {
      res.set('Content-Type', metricsRegistry.contentType);
      res.end(metrics);
    })
    .catch(next);
});

// Phục vụ tệp tĩnh (CSS, JS, hình ảnh)
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// Cấu hình View Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cấu hình Session an toàn
const isHttps = process.env.NODE_ENV === 'production' && process.env.USE_HTTPS === 'true';
app.use(session({
  name: 'club.sid',
  secret: process.env.SESSION_SECRET || 'club_default_session_secret_at_least_20_chars',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps ? 'auto' : false,
    maxAge: 24 * 60 * 60 * 1000 // 24 giờ
  }
}));

// Middleware toàn cục: Đưa thông tin đăng nhập vào views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

// Kiểm tra trạng thái tài khoản
app.use(checkActive);

// Chống CSRF
app.use(csrfMiddleware);

// Định tuyến (Routes)
app.use(require('./routes/healthRoutes'));
app.use('/', require('./routes/publicRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/member', require('./routes/memberRoutes'));
app.use('/officer', require('./routes/officerRoutes'));
app.use('/admin', require('./routes/adminRoutes'));

// Xử lý 404 Không tìm thấy trang
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Không tìm thấy trang (404)',
    message: 'Địa chỉ bạn yêu cầu không tồn tại trên hệ thống.',
    status: 404
  });
});

// Xử lý lỗi tập trung 500 (Không tiết lộ chi tiết nội bộ)
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).render('error', {
    title: 'Lỗi hệ thống (500)',
    message: 'Đã xảy ra sự cố nội bộ. Vui lòng liên hệ quản trị viên hoặc thử lại sau.',
    status: 500
  });
});

// Khởi động server sau khi kiểm tra kết nối CSDL
async function startServer() {
  try {
    await testConnection(12, 3000);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Hệ thống Quản lý Câu lạc bộ đang chạy tại http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Không thể khởi động ứng dụng do lỗi kết nối DB:', err);
    process.exit(1);
  }
}

startServer();
