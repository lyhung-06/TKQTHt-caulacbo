const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { logAudit } = require('../middleware/auditMiddleware');

exports.getLogin = (req, res) => {
  if (req.session.user) {
    return redirectByRole(req.session.user.role, res);
  }
  res.render('public/login', {
    title: 'Đăng nhập',
    error: req.query.error || null,
    success: req.query.success || null
  });
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  const attemptedUsername = safeLogValue(username);
  if (!username || !password) {
    logLoginEvent(req, 'LOGIN_FAILED', attemptedUsername, 'missing_credentials');
    return res.render('public/login', {
      title: 'Đăng nhập',
      error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.',
      success: null
    });
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, password_hash, full_name, role, is_active FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username.trim(), username.trim()]
    );

    if (users.length === 0) {
      logLoginEvent(req, 'LOGIN_FAILED', attemptedUsername, 'invalid_credentials');
      return res.render('public/login', {
        title: 'Đăng nhập',
        error: 'Tên đăng nhập hoặc mật khẩu không chính xác.',
        success: null
      });
    }

    const user = users[0];

    if (!user.is_active) {
      logLoginEvent(req, 'LOGIN_FAILED', safeLogValue(user.username), 'account_disabled');
      await logAudit(user.id, 'LOGIN_BLOCKED', 'users', user.id, { reason: 'Tài khoản bị khóa' });
      return res.render('public/login', {
        title: 'Đăng nhập',
        error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Ban Quản trị.',
        success: null
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      logLoginEvent(req, 'LOGIN_FAILED', safeLogValue(user.username), 'invalid_credentials');
      await logAudit(user.id, 'LOGIN_FAILED', 'users', user.id, { reason: 'Sai mật khẩu' });
      return res.render('public/login', {
        title: 'Đăng nhập',
        error: 'Tên đăng nhập hoặc mật khẩu không chính xác.',
        success: null
      });
    }

    // Đăng nhập thành công -> Lưu session
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role
    };

    logLoginEvent(req, 'LOGIN_SUCCESS', safeLogValue(user.username));
    await logAudit(user.id, 'LOGIN_SUCCESS', 'users', user.id, { role: user.role });

    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    if (returnTo) {
      return res.redirect(returnTo);
    }

    return redirectByRole(user.role, res);
  } catch (err) {
    logLoginEvent(req, 'LOGIN_ERROR', attemptedUsername, 'authentication_error');
    console.error('Lỗi đăng nhập:', err);
    return res.render('public/login', {
      title: 'Đăng nhập',
      error: 'Đã xảy ra lỗi trong quá trình xử lý. Vui lòng thử lại sau.',
      success: null
    });
  }
};

function safeLogValue(value) {
  return String(value || '').replace(/[\r\n\t]/g, ' ').slice(0, 64);
}

function logLoginEvent(req, event, username, reason) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: event === 'LOGIN_ERROR' ? 'error' : 'warn',
    event,
    ip: req.ip,
    user: username
  };
  if (reason) entry.reason = reason;
  console.warn(JSON.stringify(entry));
}

exports.getRegister = (req, res) => {
  if (req.session.user) {
    return redirectByRole(req.session.user.role, res);
  }
  res.render('public/register', {
    title: 'Đăng ký thành viên',
    error: req.query.error || null,
    success: null
  });
};

exports.postRegister = async (req, res) => {
  const { username, email, full_name, phone, password, confirm_password } = req.body;

  // Validation
  if (!username || !email || !full_name || !password || !confirm_password) {
    return res.render('public/register', {
      title: 'Đăng ký thành viên',
      error: 'Vui lòng điền đầy đủ các trường bắt buộc.',
      success: null
    });
  }

  if (password !== confirm_password) {
    return res.render('public/register', {
      title: 'Đăng ký thành viên',
      error: 'Mật khẩu xác nhận không trùng khớp.',
      success: null
    });
  }

  if (password.length < 6) {
    return res.render('public/register', {
      title: 'Đăng ký thành viên',
      error: 'Mật khẩu phải có ít nhất 6 ký tự.',
      success: null
    });
  }

  // Tên đăng nhập chỉ chứa chữ cái, số và dấu gạch dưới
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  if (!usernameRegex.test(username.trim())) {
    return res.render('public/register', {
      title: 'Đăng ký thành viên',
      error: 'Tên đăng nhập từ 3-30 ký tự, chỉ gồm chữ cái, số và dấu gạch dưới.',
      success: null
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Kiểm tra trùng username hoặc email
    const [exist] = await conn.execute(
      'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username.trim(), email.trim()]
    );

    if (exist.length > 0) {
      await conn.rollback();
      return res.render('public/register', {
        title: 'Đăng ký thành viên',
        error: 'Tên đăng nhập hoặc email đã được sử dụng.',
        success: null
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // Bắt buộc vai trò là member, không thể tự nâng quyền
    const [insertResult] = await conn.execute(
      'INSERT INTO users (username, email, password_hash, full_name, phone, role, is_active) VALUES (?, ?, ?, ?, ?, "member", TRUE)',
      [username.trim(), email.trim(), hashedPassword, full_name.trim(), phone ? phone.trim() : null]
    );

    const newUserId = insertResult.insertId;

    // Tự động gán mã thành viên duy nhất
    const memberCode = 'CLB-' + new Date().getFullYear() + '-' + String(newUserId).padStart(3, '0');
    await conn.execute(
      'INSERT INTO club_memberships (club_id, user_id, member_code, joined_at, status, position) VALUES (1, ?, ?, CURDATE(), "active", "Thành viên")',
      [newUserId, memberCode]
    );

    await conn.commit();

    await logAudit(newUserId, 'REGISTER', 'users', newUserId, { username: username.trim(), member_code: memberCode });

    return res.redirect('/auth/login?success=' + encodeURIComponent('Đăng ký tài khoản thành công! Bạn có thể đăng nhập ngay.'));
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi đăng ký:', err);
    return res.render('public/register', {
      title: 'Đăng ký thành viên',
      error: 'Đã xảy ra lỗi khi tạo tài khoản. Vui lòng thử lại.',
      success: null
    });
  } finally {
    conn.release();
  }
};

exports.logout = async (req, res) => {
  if (req.session.user) {
    await logAudit(req.session.user.id, 'LOGOUT', 'users', req.session.user.id);
  }
  req.session.destroy(err => {
    if (err) console.error('Lỗi xóa session:', err);
    res.clearCookie('connect.sid');
    return res.redirect('/auth/login?success=' + encodeURIComponent('Đã đăng xuất an toàn khỏi hệ thống.'));
  });
};

function redirectByRole(role, res) {
  if (role === 'admin') return res.redirect('/admin/dashboard');
  if (role === 'officer') return res.redirect('/officer/dashboard');
  return res.redirect('/member/dashboard');
}
