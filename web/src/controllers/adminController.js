const { pool } = require('../config/db');
const { logAudit } = require('../middleware/auditMiddleware');

exports.getDashboard = async (req, res) => {
  try {
    // 1. Tổng thành viên đang hoạt động
    const [activeMembers] = await pool.execute('SELECT COUNT(*) as count FROM club_memberships WHERE status = "active"');
    
    // 2. Thành viên mới (trong 30 ngày qua)
    const [newMembers] = await pool.execute(
      'SELECT COUNT(*) as count FROM club_memberships WHERE joined_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)'
    );

    // 3. Tổng số sự kiện
    const [totalEvents] = await pool.execute('SELECT COUNT(*) as count FROM events');

    // 4. Tổng lượt đăng ký
    const [totalRegistrations] = await pool.execute('SELECT COUNT(*) as count FROM event_registrations WHERE status != "cancelled"');

    // 5. Thống kê điểm danh & Tỷ lệ tham gia
    const [attendanceStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_attendance,
        SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) as attended_count,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) as excused_count
      FROM attendance
    `);
    const totalAtt = attendanceStats[0].total_attendance || 0;
    const attended = attendanceStats[0].attended_count || 0;
    const attendanceRate = totalAtt > 0 ? Math.round((attended / totalAtt) * 100) : 0;

    // 6. Tổng thu, Tổng chi, Số dư thực tế
    const [financeStats] = await pool.execute(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
      FROM finance_transactions
    `);
    const totalIncome = parseFloat(financeStats[0].total_income);
    const totalExpense = parseFloat(financeStats[0].total_expense);
    const balance = totalIncome - totalExpense;

    // 7. Báo cáo tài chính theo danh mục (tính thật từ DB)
    const [categoryFinance] = await pool.execute(`
      SELECT category, type, SUM(amount) as total_amount
      FROM finance_transactions
      GROUP BY category, type
      ORDER BY total_amount DESC
    `);

    // 8. Báo cáo sự kiện gần đây
    const [recentEvents] = await pool.execute(`
      SELECT e.id, e.title, e.start_at, e.capacity, e.status,
             (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status != 'cancelled') as registered_count,
             (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id AND a.status IN ('present', 'late')) as attended_count
      FROM events e
      ORDER BY e.start_at DESC LIMIT 5
    `);

    // 9. Nhật ký thao tác gần nhất
    const [recentAuditLogs] = await pool.execute(`
      SELECT al.*, u.full_name as actor_name, u.username
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      ORDER BY al.created_at DESC LIMIT 6
    `);

    res.render('admin/dashboard', {
      title: 'Báo cáo & Thống kê Quản trị',
      stats: {
        activeMembers: activeMembers[0].count,
        newMembers: newMembers[0].count,
        totalEvents: totalEvents[0].count,
        totalRegistrations: totalRegistrations[0].count,
        attendanceRate,
        attended,
        totalAtt,
        totalIncome,
        totalExpense,
        balance
      },
      categoryFinance,
      recentEvents,
      recentAuditLogs,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi dashboard admin:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tính toán thống kê dashboard.', status: 500 });
  }
};

// Quản lý người dùng, vai trò và trạng thái khóa
exports.getUsers = async (req, res) => {
  const { role, is_active, search } = req.query;
  try {
    let query = `
      SELECT u.id, u.username, u.email, u.full_name, u.phone, u.role, u.is_active, u.created_at,
             cm.member_code, cm.status as member_status, cm.position
      FROM users u
      LEFT JOIN club_memberships cm ON u.id = cm.user_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR cm.member_code LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    if (role) {
      query += ' AND u.role = ?';
      params.push(role);
    }

    if (is_active !== undefined && is_active !== '') {
      query += ' AND u.is_active = ?';
      params.push(is_active === '1' ? 1 : 0);
    }

    query += ' ORDER BY u.id ASC';

    const [users] = await pool.execute(query, params);

    res.render('admin/users', {
      title: 'Quản lý Tài khoản & Phân quyền',
      users,
      search: search || '',
      role: role || '',
      is_active: is_active || '',
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi tải danh sách người dùng:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải danh sách người dùng.', status: 500 });
  }
};

exports.updateUserRole = async (req, res) => {
  const targetUserId = req.params.id;
  const { role } = req.body;
  const currentUserId = req.session.user.id;
  const validRoles = ['member', 'officer', 'admin'];

  if (!validRoles.includes(role)) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Vai trò phân quyền không hợp lệ.'));
  }

  // Không cho phép tự đổi quyền của chính mình để tránh mất quyền admin
  if (parseInt(targetUserId, 10) === currentUserId) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Bạn không thể tự thay đổi vai trò của chính mình.'));
  }

  try {
    await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId]);
    await logAudit(currentUserId, 'UPDATE_USER_ROLE', 'users', targetUserId, { new_role: role });

    return res.redirect('/admin/users?success=' + encodeURIComponent('Cập nhật vai trò thành công!'));
  } catch (err) {
    console.error('Lỗi phân quyền:', err);
    return res.redirect('/admin/users?error=' + encodeURIComponent('Đã xảy ra lỗi khi phân quyền người dùng.'));
  }
};

exports.toggleUserStatus = async (req, res) => {
  const targetUserId = req.params.id;
  const currentUserId = req.session.user.id;

  if (parseInt(targetUserId, 10) === currentUserId) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Bạn không thể tự khóa tài khoản của chính mình.'));
  }

  try {
    const [users] = await pool.execute('SELECT is_active, username FROM users WHERE id = ?', [targetUserId]);
    if (!users.length) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Người dùng không tồn tại.'));
    }

    const newStatus = !users[0].is_active;
    await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, targetUserId]);

    await logAudit(currentUserId, newStatus ? 'UNLOCK_USER' : 'LOCK_USER', 'users', targetUserId, {
      username: users[0].username,
      is_active: newStatus
    });

    const msg = newStatus ? 'Đã mở khóa tài khoản thành công!' : 'Đã khóa tài khoản thành công!';
    return res.redirect('/admin/users?success=' + encodeURIComponent(msg));
  } catch (err) {
    console.error('Lỗi chuyển trạng thái tài khoản:', err);
    return res.redirect('/admin/users?error=' + encodeURIComponent('Đã xảy ra lỗi khi cập nhật trạng thái tài khoản.'));
  }
};

// Quản lý Ban / Nhóm
exports.getTeams = async (req, res) => {
  try {
    const [teams] = await pool.execute(`
      SELECT t.*, u.full_name as leader_name,
             (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
      FROM teams t
      LEFT JOIN users u ON t.leader_user_id = u.id
      ORDER BY t.id ASC
    `);

    const [eligibleLeaders] = await pool.execute(
      'SELECT id, full_name, role FROM users WHERE role IN ("admin", "officer") AND is_active = TRUE ORDER BY full_name ASC'
    );

    const [teamMembers] = await pool.execute(`
      SELECT tm.*, t.name as team_name, u.full_name, u.email, cm.member_code
      FROM team_members tm
      JOIN teams t ON tm.team_id = t.id
      JOIN users u ON tm.user_id = u.id
      LEFT JOIN club_memberships cm ON u.id = cm.user_id
      ORDER BY t.name, tm.joined_at DESC
    `);

    const [allActiveUsers] = await pool.execute(
      'SELECT id, full_name, email FROM users WHERE is_active = TRUE ORDER BY full_name ASC'
    );

    res.render('admin/teams', {
      title: 'Quản lý Ban / Nhóm công tác',
      teams,
      eligibleLeaders,
      teamMembers,
      allActiveUsers,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi trang ban nhóm:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải danh sách ban nhóm.', status: 500 });
  }
};

exports.postCreateTeam = async (req, res) => {
  const { name, description, leader_user_id } = req.body;
  const currentUserId = req.session.user.id;

  if (!name || name.trim().length === 0) {
    return res.redirect('/admin/teams?error=' + encodeURIComponent('Tên ban nhóm không được để trống.'));
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO teams (club_id, name, description, leader_user_id) VALUES (1, ?, ?, ?)',
      [name.trim(), description ? description.trim() : null, leader_user_id || null]
    );

    await logAudit(currentUserId, 'CREATE_TEAM', 'teams', result.insertId, { name: name.trim() });

    return res.redirect('/admin/teams?success=' + encodeURIComponent('Tạo ban/nhóm mới thành công!'));
  } catch (err) {
    console.error('Lỗi tạo ban nhóm:', err);
    return res.redirect('/admin/teams?error=' + encodeURIComponent('Đã xảy ra lỗi khi tạo ban nhóm.'));
  }
};

exports.postAddTeamMember = async (req, res) => {
  const { team_id, user_id, role_in_team } = req.body;
  const currentUserId = req.session.user.id;

  if (!team_id || !user_id) {
    return res.redirect('/admin/teams?error=' + encodeURIComponent('Vui lòng chọn ban nhóm và thành viên.'));
  }

  try {
    await pool.execute(
      'INSERT INTO team_members (team_id, user_id, role_in_team, joined_at) VALUES (?, ?, ?, CURDATE())',
      [team_id, user_id, role_in_team || 'Thành viên ban']
    );

    await logAudit(currentUserId, 'ADD_TEAM_MEMBER', 'team_members', `${team_id}-${user_id}`);

    return res.redirect('/admin/teams?success=' + encodeURIComponent('Thêm thành viên vào ban thành công!'));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.redirect('/admin/teams?error=' + encodeURIComponent('Thành viên này đã có trong ban.'));
    }
    console.error('Lỗi thêm thành viên vào ban:', err);
    return res.redirect('/admin/teams?error=' + encodeURIComponent('Đã xảy ra lỗi khi thêm thành viên.'));
  }
};

exports.deleteTeamMember = async (req, res) => {
  const { team_id, user_id } = req.params;
  const currentUserId = req.session.user.id;

  try {
    await pool.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [team_id, user_id]);
    await logAudit(currentUserId, 'REMOVE_TEAM_MEMBER', 'team_members', `${team_id}-${user_id}`);

    return res.redirect('/admin/teams?success=' + encodeURIComponent('Đã xóa thành viên khỏi ban.'));
  } catch (err) {
    console.error('Lỗi xóa thành viên khỏi ban:', err);
    return res.redirect('/admin/teams?error=' + encodeURIComponent('Đã xảy ra lỗi khi xóa thành viên.'));
  }
};

// Quản lý Thu / Chi tài chính
exports.getFinance = async (req, res) => {
  const { type, category } = req.query;
  try {
    let query = `
      SELECT ft.*, u.full_name as creator_name
      FROM finance_transactions ft
      LEFT JOIN users u ON ft.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      query += ' AND ft.type = ?';
      params.push(type);
    }

    if (category) {
      query += ' AND ft.category = ?';
      params.push(category);
    }

    query += ' ORDER BY ft.transaction_date DESC, ft.id DESC';

    const [transactions] = await pool.execute(query, params);

    // Tính toán tổng thu, tổng chi và số dư
    const [summary] = await pool.execute(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
      FROM finance_transactions
    `);

    const totalIncome = parseFloat(summary[0].total_income);
    const totalExpense = parseFloat(summary[0].total_expense);
    const balance = totalIncome - totalExpense;

    const [categories] = await pool.execute('SELECT DISTINCT category FROM finance_transactions ORDER BY category ASC');

    res.render('admin/finance', {
      title: 'Quản lý Tài chính Thu / Chi',
      transactions,
      categories,
      totalIncome,
      totalExpense,
      balance,
      type: type || '',
      category: category || '',
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Lỗi trang tài chính:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải dữ liệu tài chính.', status: 500 });
  }
};

exports.postCreateTransaction = async (req, res) => {
  const { type, category, amount, description, transaction_date } = req.body;
  const currentUserId = req.session.user.id;

  if (!type || !category || !amount || !transaction_date) {
    return res.redirect('/admin/finance?error=' + encodeURIComponent('Vui lòng điền đầy đủ các thông tin bắt buộc.'));
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount < 0) {
    return res.redirect('/admin/finance?error=' + encodeURIComponent('Số tiền phải là số hợp lệ lớn hơn hoặc bằng 0.'));
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO finance_transactions (club_id, type, category, amount, description, transaction_date, created_by)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
      [type, category.trim(), numAmount, description ? description.trim() : null, transaction_date, currentUserId]
    );

    await logAudit(currentUserId, 'RECORD_FINANCE', 'finance_transactions', result.insertId, {
      type,
      category: category.trim(),
      amount: numAmount
    });

    return res.redirect('/admin/finance?success=' + encodeURIComponent('Ghi nhận giao dịch tài chính thành công!'));
  } catch (err) {
    console.error('Lỗi tạo giao dịch tài chính:', err);
    return res.redirect('/admin/finance?error=' + encodeURIComponent('Đã xảy ra lỗi khi lưu giao dịch.'));
  }
};

// Xem Audit Logs
exports.getAuditLogs = async (req, res) => {
  const { action, actor_id } = req.query;
  try {
    let query = `
      SELECT al.*, u.full_name as actor_name, u.username, u.role as actor_role
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      query += ' AND al.action = ?';
      params.push(action);
    }

    if (actor_id) {
      query += ' AND al.actor_user_id = ?';
      params.push(actor_id);
    }

    query += ' ORDER BY al.created_at DESC LIMIT 100';

    const [logs] = await pool.execute(query, params);
    const [actions] = await pool.execute('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC');

    res.render('admin/audit-logs', {
      title: 'Nhật ký Kiểm toán Hệ thống (Audit Logs)',
      logs,
      actions,
      action: action || '',
      actor_id: actor_id || ''
    });
  } catch (err) {
    console.error('Lỗi audit logs:', err);
    res.status(500).render('error', { title: 'Lỗi', message: 'Không thể tải nhật ký kiểm toán.', status: 500 });
  }
};
