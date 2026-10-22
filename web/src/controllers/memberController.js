const { pool } = require('../config/db');
const { logAudit } = require('../middleware/auditMiddleware');

exports.getDashboard = async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [membership] = await pool.execute(
      `SELECT cm.*, c.name as club_name, c.logo_path 
       FROM club_memberships cm 
       JOIN clubs c ON cm.club_id = c.id 
       WHERE cm.user_id = ? LIMIT 1`,
      [userId]
    );

    const [registeredEvents] = await pool.execute(
      `SELECT er.registered_at, er.status as reg_status, e.* 
       FROM event_registrations er 
       JOIN events e ON er.event_id = e.id 
       WHERE er.user_id = ? AND er.status != 'cancelled'
       ORDER BY e.start_at DESC LIMIT 5`,
      [userId]
    );

    const [attendanceHistory] = await pool.execute(
      `SELECT a.*, e.title as event_title, e.start_at, u.full_name as checker_name 
       FROM attendance a 
       JOIN events e ON a.event_id = e.id 
       LEFT JOIN users u ON a.checked_by = u.id 
       WHERE a.user_id = ? 
       ORDER BY a.checked_at DESC LIMIT 5`,
      [userId]
    );

    const [announcements] = await pool.execute(
      `SELECT a.*, u.full_name as author_name 
       FROM announcements a 
       LEFT JOIN users u ON a.created_by = u.id 
       WHERE a.status = 'published' 
       ORDER BY a.published_at DESC LIMIT 3`
    );

    res.render('member/dashboard', {
      title: 'Bảng điều khiển Thành viên',
      membership: membership[0] || {},
      registeredEvents,
      attendanceHistory,
      announcements,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi dashboard thành viên:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải bảng điều khiển.', status: 500 });
  }
};

exports.getProfile = async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [users] = await pool.execute(
      `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.role, u.created_at,
              cm.member_code, cm.position, cm.joined_at, cm.status as member_status,
              c.name as club_name
       FROM users u 
       LEFT JOIN club_memberships cm ON u.id = cm.user_id 
       LEFT JOIN clubs c ON cm.club_id = c.id 
       WHERE u.id = ? LIMIT 1`,
      [userId]
    );

    res.render('member/profile', {
      title: 'Hồ sơ cá nhân',
      user: users[0] || {},
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi hồ sơ cá nhân:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải thông tin hồ sơ.', status: 500 });
  }
};

exports.postProfile = async (req, res) => {
  const userId = req.session.user.id;
  const { full_name, phone } = req.body;

  if (!full_name || full_name.trim().length === 0) {
    return res.redirect('/member/profile?error=' + encodeURIComponent('Họ và tên không được để trống.'));
  }

  try {
    await pool.execute(
      'UPDATE users SET full_name = ?, phone = ? WHERE id = ?',
      [full_name.trim(), phone ? phone.trim() : null, userId]
    );
    req.session.user.full_name = full_name.trim();

    await logAudit(userId, 'UPDATE_PROFILE', 'users', userId, { full_name: full_name.trim() });

    return res.redirect('/member/profile?success=' + encodeURIComponent('Cập nhật hồ sơ cá nhân thành công!'));
  } catch (err) {
    console.error('Lỗi cập nhật hồ sơ:', err);
    return res.redirect('/member/profile?error=' + encodeURIComponent('Đã xảy ra lỗi khi lưu thông tin.'));
  }
};

exports.getMyEvents = async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [events] = await pool.execute(
      `SELECT e.*, er.id as reg_id, er.registered_at, er.status as reg_status, er.note as reg_note 
       FROM event_registrations er 
       JOIN events e ON er.event_id = e.id 
       WHERE er.user_id = ? 
       ORDER BY e.start_at DESC`,
      [userId]
    );

    res.render('member/my-events', {
      title: 'Sự kiện đã đăng ký',
      events,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi lấy danh sách sự kiện cá nhân:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải danh sách sự kiện của bạn.', status: 500 });
  }
};

// Đăng ký sự kiện sử dụng TRANSACTION và FOR UPDATE
exports.registerEvent = async (req, res) => {
  const userId = req.session.user.id;
  const eventId = req.params.id;
  const { note } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Khóa và lấy thông tin sự kiện
    const [events] = await conn.execute(
      'SELECT id, title, capacity, registration_deadline, status FROM events WHERE id = ? FOR UPDATE',
      [eventId]
    );

    if (events.length === 0) {
      await conn.rollback();
      return res.redirect(`/events?error=` + encodeURIComponent('Sự kiện không tồn tại.'));
    }

    const event = events[0];

    // 2. Kiểm tra trạng thái
    if (event.status !== 'published') {
      await conn.rollback();
      return res.redirect(`/events/${eventId}?error=` + encodeURIComponent('Sự kiện này hiện không mở đăng ký.'));
    }

    // 3. Kiểm tra hạn chót
    if (new Date() > new Date(event.registration_deadline)) {
      await conn.rollback();
      return res.redirect(`/events/${eventId}?error=` + encodeURIComponent('Đã quá thời hạn đăng ký tham gia sự kiện này.'));
    }

    // 4. Kiểm tra xem người dùng đã đăng ký trước đó chưa
    const [existingReg] = await conn.execute(
      'SELECT id, status FROM event_registrations WHERE event_id = ? AND user_id = ?',
      [eventId, userId]
    );

    if (existingReg.length > 0 && existingReg[0].status !== 'cancelled') {
      await conn.rollback();
      return res.redirect(`/events/${eventId}?error=` + encodeURIComponent('Bạn đã đăng ký sự kiện này rồi.'));
    }

    // 5. Kiểm tra sức chứa hiện tại
    const [regCountResult] = await conn.execute(
      'SELECT COUNT(*) as current_count FROM event_registrations WHERE event_id = ? AND status != "cancelled"',
      [eventId]
    );

    if (regCountResult[0].current_count >= event.capacity) {
      await conn.rollback();
      return res.redirect(`/events/${eventId}?error=` + encodeURIComponent('Sự kiện đã đạt giới hạn số lượng đăng ký (đầy chỗ).'));
    }

    // 6. Ghi nhận đăng ký (hoặc cập nhật nếu trước đó đã hủy)
    if (existingReg.length > 0) {
      await conn.execute(
        'UPDATE event_registrations SET status = "registered", registered_at = NOW(), note = ? WHERE id = ?',
        [note || null, existingReg[0].id]
      );
    } else {
      await conn.execute(
        'INSERT INTO event_registrations (event_id, user_id, status, note) VALUES (?, ?, "registered", ?)',
        [eventId, userId, note || null]
      );
    }

    await conn.commit();

    await logAudit(userId, 'REGISTER_EVENT', 'events', eventId, { title: event.title });

    return res.redirect(`/events/${eventId}?success=` + encodeURIComponent('Đăng ký tham gia sự kiện thành công!'));
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi đăng ký sự kiện:', err);
    return res.redirect(`/events/${eventId}?error=` + encodeURIComponent('Đã xảy ra lỗi khi đăng ký. Vui lòng thử lại.'));
  } finally {
    conn.release();
  }
};

// Hủy đăng ký sự kiện
exports.cancelRegistration = async (req, res) => {
  const userId = req.session.user.id;
  const eventId = req.params.id;

  try {
    const [events] = await pool.execute('SELECT start_at, status FROM events WHERE id = ?', [eventId]);
    if (!events.length) {
      return res.redirect('/member/events?error=' + encodeURIComponent('Sự kiện không tồn tại.'));
    }

    // Không cho phép hủy khi sự kiện đã bắt đầu hoặc đã kết thúc
    if (new Date() >= new Date(events[0].start_at)) {
      return res.redirect('/member/events?error=' + encodeURIComponent('Không thể hủy đăng ký khi sự kiện đã hoặc đang diễn ra.'));
    }

    const [result] = await pool.execute(
      'UPDATE event_registrations SET status = "cancelled" WHERE event_id = ? AND user_id = ? AND status = "registered"',
      [eventId, userId]
    );

    if (result.affectedRows === 0) {
      return res.redirect('/member/events?error=' + encodeURIComponent('Không tìm thấy đăng ký hợp lệ để hủy.'));
    }

    await logAudit(userId, 'CANCEL_REGISTRATION', 'events', eventId);

    return res.redirect('/member/events?success=' + encodeURIComponent('Đã hủy đăng ký tham gia sự kiện thành công.'));
  } catch (err) {
    console.error('Lỗi hủy đăng ký:', err);
    return res.redirect('/member/events?error=' + encodeURIComponent('Đã xảy ra lỗi khi hủy đăng ký.'));
  }
};

exports.getAttendance = async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [records] = await pool.execute(
      `SELECT a.*, e.title as event_title, e.location, e.start_at, u.full_name as checked_by_name 
       FROM attendance a 
       JOIN events e ON a.event_id = e.id 
       LEFT JOIN users u ON a.checked_by = u.id 
       WHERE a.user_id = ? 
       ORDER BY e.start_at DESC`,
      [userId]
    );

    res.render('member/attendance', {
      title: 'Lịch sử điểm danh',
      records
    });
  } catch (err) {
    console.error('Lỗi lấy lịch sử điểm danh:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải lịch sử điểm danh.', status: 500 });
  }
};
