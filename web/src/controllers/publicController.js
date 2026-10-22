const { pool } = require('../config/db');

exports.getIndex = async (req, res) => {
  try {
    const [club] = await pool.execute('SELECT * FROM clubs WHERE id = 1 LIMIT 1');
    const [upcomingEvents] = await pool.execute(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status != 'cancelled') as registered_count
       FROM events e 
       WHERE e.status = 'published' AND e.start_at >= NOW() 
       ORDER BY e.start_at ASC LIMIT 3`
    );
    const [announcements] = await pool.execute(
      `SELECT a.*, u.full_name as author_name 
       FROM announcements a 
       LEFT JOIN users u ON a.created_by = u.id 
       WHERE a.status = 'published' 
       ORDER BY a.published_at DESC LIMIT 3`
    );
    const [teams] = await pool.execute('SELECT * FROM teams WHERE club_id = 1 ORDER BY id ASC');

    res.render('public/index', {
      title: 'Trang chủ',
      club: club[0] || {},
      upcomingEvents,
      announcements,
      teams
    });
  } catch (err) {
    console.error('Lỗi tải trang chủ:', err);
    res.status(500).render('error', { title: 'Lỗi máy chủ', message: 'Không thể tải dữ liệu trang chủ.', status: 500 });
  }
};

exports.getEvents = async (req, res) => {
  try {
    const [events] = await pool.execute(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status != 'cancelled') as registered_count
       FROM events e 
       WHERE e.status IN ('published', 'completed') 
       ORDER BY e.start_at DESC`
    );

    res.render('public/events', {
      title: 'Hoạt động & Sự kiện CLB',
      events
    });
  } catch (err) {
    console.error('Lỗi tải sự kiện:', err);
    res.status(500).render('error', { title: 'Lỗi máy chủ', message: 'Không thể tải danh sách sự kiện.', status: 500 });
  }
};

exports.getEventDetail = async (req, res) => {
  try {
    const eventId = req.params.id;
    const [events] = await pool.execute(
      `SELECT e.*, u.full_name as creator_name,
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status != 'cancelled') as registered_count
       FROM events e 
       LEFT JOIN users u ON e.created_by = u.id 
       WHERE e.id = ? AND e.status IN ('published', 'completed') LIMIT 1`,
      [eventId]
    );

    if (events.length === 0) {
      return res.status(404).render('error', { title: 'Không tìm thấy (404)', message: 'Sự kiện không tồn tại hoặc chưa được công bố.', status: 404 });
    }

    let isRegistered = false;
    let registrationStatus = null;
    if (req.session.user) {
      const [regs] = await pool.execute(
        'SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ? LIMIT 1',
        [eventId, req.session.user.id]
      );
      if (regs.length > 0) {
        isRegistered = regs[0].status !== 'cancelled';
        registrationStatus = regs[0].status;
      }
    }

    res.render('public/event-detail', {
      title: events[0].title,
      event: events[0],
      isRegistered,
      registrationStatus,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Lỗi chi tiết sự kiện:', err);
    res.status(500).render('error', { title: 'Lỗi máy chủ', message: 'Không thể tải chi tiết sự kiện.', status: 500 });
  }
};

exports.getAnnouncements = async (req, res) => {
  try {
    const [announcements] = await pool.execute(
      `SELECT a.*, u.full_name as author_name 
       FROM announcements a 
       LEFT JOIN users u ON a.created_by = u.id 
       WHERE a.status = 'published' 
       ORDER BY a.published_at DESC`
    );

    res.render('public/announcements', {
      title: 'Thông báo Câu lạc bộ',
      announcements
    });
  } catch (err) {
    console.error('Lỗi tải thông báo:', err);
    res.status(500).render('error', { title: 'Lỗi máy chủ', message: 'Không thể tải danh sách thông báo.', status: 500 });
  }
};

exports.getAbout = async (req, res) => {
  try {
    const [club] = await pool.execute('SELECT * FROM clubs WHERE id = 1 LIMIT 1');
    const [teams] = await pool.execute(
      `SELECT t.*, u.full_name as leader_name,
              (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
       FROM teams t 
       LEFT JOIN users u ON t.leader_user_id = u.id 
       WHERE t.club_id = 1`
    );
    const [officers] = await pool.execute(
      `SELECT u.full_name, u.email, cm.position 
       FROM club_memberships cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE u.role IN ('admin', 'officer') AND cm.status = 'active'
       ORDER BY FIELD(u.role, 'admin', 'officer')`
    );

    res.render('public/about', {
      title: 'Giới thiệu Câu lạc bộ',
      club: club[0] || {},
      teams,
      officers
    });
  } catch (err) {
    console.error('Lỗi trang giới thiệu:', err);
    res.status(500).render('error', { title: 'Lỗi máy chủ', message: 'Không thể tải trang giới thiệu.', status: 500 });
  }
};
