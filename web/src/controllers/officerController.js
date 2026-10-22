const { pool } = require('../config/db');
const { logAudit } = require('../middleware/auditMiddleware');

exports.getDashboard = async (req, res) => {
  try {
    const [memberCount] = await pool.execute('SELECT COUNT(*) as count FROM club_memberships WHERE status = "active"');
    const [upcomingEventsCount] = await pool.execute('SELECT COUNT(*) as count FROM events WHERE status = "published" AND start_at >= NOW()');
    const [recentAnnouncements] = await pool.execute('SELECT * FROM announcements ORDER BY published_at DESC LIMIT 5');
    const [eventsToManage] = await pool.execute('SELECT * FROM events ORDER BY start_at DESC LIMIT 5');

    res.render('officer/dashboard', {
      title: 'Bảng điều khiển Ban Điều hành',
      memberCount: memberCount[0].count,
      upcomingEventsCount: upcomingEventsCount[0].count,
      recentAnnouncements,
      eventsToManage,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi dashboard cán bộ:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải bảng điều khiển cán bộ.', status: 500 });
  }
};

exports.getMembers = async (req, res) => {
  const { search, status, team_id } = req.query;
  try {
    let query = `
      SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.is_active,
             cm.member_code, cm.position, cm.joined_at, cm.status as membership_status,
             t.name as team_name
      FROM users u
      JOIN club_memberships cm ON u.id = cm.user_id
      LEFT JOIN team_members tm ON u.id = tm.user_id
      LEFT JOIN teams t ON tm.team_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR cm.member_code LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    if (status) {
      query += ' AND cm.status = ?';
      params.push(status);
    }

    if (team_id) {
      query += ' AND tm.team_id = ?';
      params.push(team_id);
    }

    query += ' ORDER BY cm.joined_at DESC';

    const [members] = await pool.execute(query, params);
    const [teams] = await pool.execute('SELECT * FROM teams WHERE club_id = 1');

    res.render('officer/members', {
      title: 'Quản lý Thành viên',
      members,
      teams,
      search: search || '',
      status: status || '',
      team_id: team_id || '',
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi lấy danh sách thành viên:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải danh sách thành viên.', status: 500 });
  }
};

exports.updateMemberStatus = async (req, res) => {
  const targetUserId = req.params.id;
  const { status, position } = req.body;
  const validStatuses = ['pending', 'active', 'suspended', 'left'];

  if (!validStatuses.includes(status)) {
    return res.redirect('/officer/members?error=' + encodeURIComponent('Trạng thái thành viên không hợp lệ.'));
  }

  try {
    await pool.execute(
      'UPDATE club_memberships SET status = ?, position = ? WHERE user_id = ?',
      [status, position || 'Thành viên', targetUserId]
    );

    await logAudit(req.session.user.id, 'UPDATE_MEMBER_STATUS', 'club_memberships', targetUserId, { status, position });

    return res.redirect('/officer/members?success=' + encodeURIComponent('Cập nhật trạng thái thành viên thành công!'));
  } catch (err) {
    console.error('Lỗi cập nhật thành viên:', err);
    return res.redirect('/officer/members?error=' + encodeURIComponent('Đã xảy ra lỗi khi cập nhật.'));
  }
};

exports.getEvents = async (req, res) => {
  try {
    const [events] = await pool.execute(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status != 'cancelled') as registered_count,
              (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id AND a.status IN ('present', 'late')) as attended_count
       FROM events e 
       ORDER BY e.start_at DESC`
    );

    res.render('officer/event-manage', {
      title: 'Quản lý Sự kiện',
      events,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi quản lý sự kiện:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải danh sách sự kiện.', status: 500 });
  }
};

exports.getCreateEvent = (req, res) => {
  res.render('officer/event-form', {
    title: 'Tạo Sự kiện mới',
    event: null,
    error: null
  });
};

exports.postCreateEvent = async (req, res) => {
  const { title, description, location, start_at, end_at, capacity, registration_deadline, status } = req.body;
  const userId = req.session.user.id;

  // Validation
  if (!title || !location || !start_at || !end_at || !capacity || !registration_deadline) {
    return res.render('officer/event-form', {
      title: 'Tạo Sự kiện mới',
      event: req.body,
      error: 'Vui lòng điền đầy đủ các thông tin bắt buộc.'
    });
  }

  const cap = parseInt(capacity, 10);
  if (isNaN(cap) || cap <= 0) {
    return res.render('officer/event-form', {
      title: 'Tạo Sự kiện mới',
      event: req.body,
      error: 'Sức chứa sự kiện phải là số nguyên dương lớn hơn 0.'
    });
  }

  const startDate = new Date(start_at);
  const endDate = new Date(end_at);
  const deadline = new Date(registration_deadline);

  if (endDate <= startDate) {
    return res.render('officer/event-form', {
      title: 'Tạo Sự kiện mới',
      event: req.body,
      error: 'Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.'
    });
  }

  if (deadline > startDate) {
    return res.render('officer/event-form', {
      title: 'Tạo Sự kiện mới',
      event: req.body,
      error: 'Hạn chót đăng ký phải trước hoặc bằng thời gian bắt đầu sự kiện.'
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO events (club_id, title, description, location, start_at, end_at, capacity, registration_deadline, status, created_by)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description ? description.trim() : null, location.trim(), start_at, end_at, cap, registration_deadline, status || 'draft', userId]
    );

    await logAudit(userId, 'CREATE_EVENT', 'events', result.insertId, { title: title.trim() });

    return res.redirect('/officer/events?success=' + encodeURIComponent('Tạo sự kiện mới thành công!'));
  } catch (err) {
    console.error('Lỗi tạo sự kiện:', err);
    return res.render('officer/event-form', {
      title: 'Tạo Sự kiện mới',
      event: req.body,
      error: 'Đã xảy ra lỗi khi tạo sự kiện. Vui lòng kiểm tra lại ràng buộc dữ liệu.'
    });
  }
};

exports.getEditEvent = async (req, res) => {
  const eventId = req.params.id;
  try {
    const [events] = await pool.execute('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!events.length) {
      return res.redirect('/officer/events?error=' + encodeURIComponent('Không tìm thấy sự kiện.'));
    }

    res.render('officer/event-form', {
      title: 'Chỉnh sửa Sự kiện',
      event: events[0],
      error: null
    });
  } catch (err) {
    console.error('Lỗi lấy thông tin sự kiện:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải sự kiện để chỉnh sửa.', status: 500 });
  }
};

exports.postEditEvent = async (req, res) => {
  const eventId = req.params.id;
  const { title, description, location, start_at, end_at, capacity, registration_deadline, status } = req.body;
  const userId = req.session.user.id;

  const cap = parseInt(capacity, 10);
  if (isNaN(cap) || cap <= 0) {
    return res.render('officer/event-form', {
      title: 'Chỉnh sửa Sự kiện',
      event: { ...req.body, id: eventId },
      error: 'Sức chứa sự kiện phải là số nguyên dương lớn hơn 0.'
    });
  }

  const startDate = new Date(start_at);
  const endDate = new Date(end_at);
  const deadline = new Date(registration_deadline);

  if (endDate <= startDate || deadline > startDate) {
    return res.render('officer/event-form', {
      title: 'Chỉnh sửa Sự kiện',
      event: { ...req.body, id: eventId },
      error: 'Thời gian không hợp lệ: kết thúc phải sau bắt đầu, hạn chót phải trước khi bắt đầu.'
    });
  }

  try {
    await pool.execute(
      `UPDATE events 
       SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, capacity = ?, registration_deadline = ?, status = ?
       WHERE id = ?`,
      [title.trim(), description ? description.trim() : null, location.trim(), start_at, end_at, cap, registration_deadline, status, eventId]
    );

    await logAudit(userId, 'UPDATE_EVENT', 'events', eventId, { title: title.trim(), status });

    return res.redirect('/officer/events?success=' + encodeURIComponent('Cập nhật sự kiện thành công!'));
  } catch (err) {
    console.error('Lỗi cập nhật sự kiện:', err);
    return res.render('officer/event-form', {
      title: 'Chỉnh sửa Sự kiện',
      event: { ...req.body, id: eventId },
      error: 'Đã xảy ra lỗi khi cập nhật sự kiện.'
    });
  }
};

// Quản lý và thực hiện điểm danh
exports.getAttendance = async (req, res) => {
  const eventId = req.params.id;
  try {
    const [events] = await pool.execute('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!events.length) {
      return res.redirect('/officer/events?error=' + encodeURIComponent('Không tìm thấy sự kiện.'));
    }

    const [registrations] = await pool.execute(
      `SELECT er.id as reg_id, er.user_id, er.registered_at, er.status as reg_status, er.note as reg_note,
              u.full_name, u.email, u.phone, cm.member_code,
              a.id as att_id, a.status as att_status, a.note as att_note, a.checked_at, checker.full_name as checker_name
       FROM event_registrations er
       JOIN users u ON er.user_id = u.id
       LEFT JOIN club_memberships cm ON u.id = cm.user_id
       LEFT JOIN attendance a ON (a.event_id = er.event_id AND a.user_id = er.user_id)
       LEFT JOIN users checker ON a.checked_by = checker.id
       WHERE er.event_id = ? AND er.status != 'cancelled'
       ORDER BY u.full_name ASC`,
      [eventId]
    );

    res.render('officer/attendance', {
      title: 'Điểm danh Sự kiện',
      event: events[0],
      registrations,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi trang điểm danh:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải trang điểm danh.', status: 500 });
  }
};

exports.postAttendance = async (req, res) => {
  const eventId = req.params.id;
  const { user_id, status, note } = req.body;
  const checkerId = req.session.user.id;
  const validStatuses = ['present', 'late', 'absent', 'excused'];

  if (!validStatuses.includes(status)) {
    return res.redirect(`/officer/events/${eventId}/attendance?error=` + encodeURIComponent('Trạng thái điểm danh không hợp lệ.'));
  }

  try {
    // Chèn hoặc cập nhật điểm danh (tránh bản ghi trùng với ON DUPLICATE KEY UPDATE)
    await pool.execute(
      `INSERT INTO attendance (event_id, user_id, status, checked_at, checked_by, note)
       VALUES (?, ?, ?, NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), checked_at = NOW(), checked_by = VALUES(checked_by), note = VALUES(note)`,
      [eventId, user_id, status, checkerId, note ? note.trim() : null]
    );

    // Cập nhật trạng thái đăng ký tương ứng
    const regStatus = (status === 'present' || status === 'late') ? 'attended' : 'absent';
    await pool.execute(
      'UPDATE event_registrations SET status = ? WHERE event_id = ? AND user_id = ?',
      [regStatus, eventId, user_id]
    );

    await logAudit(checkerId, 'CHECK_ATTENDANCE', 'attendance', eventId, { user_id, status });

    return res.redirect(`/officer/events/${eventId}/attendance?success=` + encodeURIComponent('Điểm danh thành công!'));
  } catch (err) {
    console.error('Lỗi ghi nhận điểm danh:', err);
    return res.redirect(`/officer/events/${eventId}/attendance?error=` + encodeURIComponent('Đã xảy ra lỗi khi điểm danh.'));
  }
};

// Quản lý thông báo CLB
exports.getAnnouncements = async (req, res) => {
  try {
    const [announcements] = await pool.execute(
      `SELECT a.*, u.full_name as author_name 
       FROM announcements a 
       LEFT JOIN users u ON a.created_by = u.id 
       ORDER BY a.published_at DESC`
    );

    res.render('officer/announcements', {
      title: 'Quản lý Thông báo',
      announcements,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi lấy thông báo:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải thông báo.', status: 500 });
  }
};

exports.postAnnouncement = async (req, res) => {
  const { title, content, status } = req.body;
  const userId = req.session.user.id;

  if (!title || !content) {
    return res.redirect('/officer/announcements?error=' + encodeURIComponent('Tiêu đề và nội dung thông báo không được để trống.'));
  }

  try {
    await pool.execute(
      'INSERT INTO announcements (club_id, title, content, created_by, published_at, status) VALUES (1, ?, ?, ?, NOW(), ?)',
      [title.trim(), content.trim(), userId, status || 'published']
    );

    await logAudit(userId, 'CREATE_ANNOUNCEMENT', 'announcements', null, { title: title.trim() });

    return res.redirect('/officer/announcements?success=' + encodeURIComponent('Đăng thông báo thành công!'));
  } catch (err) {
    console.error('Lỗi đăng thông báo:', err);
    return res.redirect('/officer/announcements?error=' + encodeURIComponent('Đã xảy ra lỗi khi đăng thông báo.'));
  }
};
