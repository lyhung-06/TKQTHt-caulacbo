-- ==============================================================================
-- CLUB MANAGEMENT SYSTEM DATABASE INITIALIZATION SCRIPT (MySQL 8)
-- Sinh viên: Lý Văn Hưng - MSSV: DTC245180162 - Lớp: KTPM K23B
-- ==============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. BẢNG USERS (Người dùng hệ thống)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `role` ENUM('member', 'officer', 'admin') NOT NULL DEFAULT 'member',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. BẢNG CLUBS (Thông tin câu lạc bộ)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `clubs`;
CREATE TABLE `clubs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `logo_path` VARCHAR(255) DEFAULT '/public/img/logo.png',
  `contact_email` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. BẢNG CLUB_MEMBERSHIPS (Tư cách thành viên CLB)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `club_memberships`;
CREATE TABLE `club_memberships` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `club_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `member_code` VARCHAR(30) NOT NULL UNIQUE,
  `joined_at` DATE NOT NULL,
  `status` ENUM('pending', 'active', 'suspended', 'left') NOT NULL DEFAULT 'active',
  `position` VARCHAR(100) DEFAULT 'Thành viên',
  `notes` TEXT DEFAULT NULL,
  CONSTRAINT `fk_memberships_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_memberships_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `uk_club_user` UNIQUE (`club_id`, `user_id`),
  INDEX `idx_memberships_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. BẢNG TEAMS (Các ban / nhóm công tác trong CLB)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `teams`;
CREATE TABLE `teams` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `club_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `leader_user_id` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_teams_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_teams_leader` FOREIGN KEY (`leader_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. BẢNG TEAM_MEMBERS (Thành viên thuộc ban / nhóm)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `team_members`;
CREATE TABLE `team_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `team_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role_in_team` VARCHAR(100) DEFAULT 'Thành viên ban',
  `joined_at` DATE NOT NULL,
  CONSTRAINT `fk_team_members_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_team_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `uk_team_user` UNIQUE (`team_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. BẢNG EVENTS (Sự kiện / Hoạt động CLB)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `events`;
CREATE TABLE `events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `club_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `location` VARCHAR(200) NOT NULL,
  `start_at` DATETIME NOT NULL,
  `end_at` DATETIME NOT NULL,
  `capacity` INT NOT NULL,
  `registration_deadline` DATETIME NOT NULL,
  `status` ENUM('draft', 'published', 'cancelled', 'completed') NOT NULL DEFAULT 'draft',
  `created_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_events_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_events_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_event_time` CHECK (`end_at` > `start_at` AND `registration_deadline` <= `start_at`),
  CONSTRAINT `chk_event_capacity` CHECK (`capacity` > 0),
  INDEX `idx_events_status_start` (`status`, `start_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 7. BẢNG EVENT_REGISTRATIONS (Đăng ký tham gia sự kiện)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `event_registrations`;
CREATE TABLE `event_registrations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `event_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `registered_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('registered', 'cancelled', 'attended', 'absent') NOT NULL DEFAULT 'registered',
  `note` TEXT DEFAULT NULL,
  CONSTRAINT `fk_registrations_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_registrations_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `uk_event_user_reg` UNIQUE (`event_id`, `user_id`),
  INDEX `idx_registrations_user` (`user_id`),
  INDEX `idx_registrations_event` (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 8. BẢNG ATTENDANCE (Điểm danh sự kiện)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `attendance`;
CREATE TABLE `attendance` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `event_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `status` ENUM('present', 'late', 'absent', 'excused') NOT NULL DEFAULT 'present',
  `checked_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `checked_by` INT DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
  CONSTRAINT `fk_attendance_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_checker` FOREIGN KEY (`checked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `uk_event_user_att` UNIQUE (`event_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 9. BẢNG ANNOUNCEMENTS (Thông báo CLB)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `announcements`;
CREATE TABLE `announcements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `club_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `content` TEXT NOT NULL,
  `created_by` INT DEFAULT NULL,
  `published_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
  CONSTRAINT `fk_announcements_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_announcements_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_announcements_status` (`status`, `published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 10. BẢNG FINANCE_TRANSACTIONS (Khoản thu / chi CLB)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `finance_transactions`;
CREATE TABLE `finance_transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `club_id` INT NOT NULL,
  `type` ENUM('income', 'expense') NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `transaction_date` DATE NOT NULL,
  `created_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_finance_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_finance_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_finance_amount` CHECK (`amount` >= 0),
  INDEX `idx_finance_date_type` (`transaction_date`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 11. BẢNG AUDIT_LOGS (Nhật ký kiểm toán hệ thống)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `actor_user_id` INT DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(50) NOT NULL,
  `entity_id` VARCHAR(50) DEFAULT NULL,
  `metadata` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_audit_actor_created` (`actor_user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- SEED DATA KHỞI TẠO HỢP LÝ CHO HỆ THỐNG
-- Mật khẩu đã được mã hóa bằng bcrypt (cost 10)
-- Admin: Admin@Club2026!
-- Officer: Officer@Club2026!
-- Member: Member@Club2026!
-- ==============================================================================

-- 1. Thêm Câu lạc bộ demo
INSERT INTO `clubs` (`id`, `name`, `description`, `logo_path`, `contact_email`) VALUES
(1, 'Câu lạc bộ Tin học & Kỹ thuật Phần mềm (ICTU Club)', 'Câu lạc bộ học thuật và nghiên cứu phát triển phần mềm, quy tụ sinh viên đam mê công nghệ thông tin, DevOps và AI.', '/public/img/logo.png', 'club.ictu@gmail.com');

-- 2. Thêm Người dùng demo
INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `full_name`, `phone`, `role`, `is_active`) VALUES
(1, 'admin', 'admin@club.ictu.edu.vn', '$2b$10$oyIXjK61GwnhnAVbxASR/ex3PsQINzebJ/2Q72JT5LUlTYqRt7oPC', 'Lý Văn Hưng (Chủ nhiệm CLB)', '0987654321', 'admin', TRUE),
(2, 'officer1', 'mai.tt@club.ictu.edu.vn', '$2b$10$TwqeGYEFRMKuvTofcQaKFOxPwWh9tnNvT3GF6GVuwt/qxwDvCFTgy', 'Trần Thị Mai (Phó CN/Sự kiện)', '0912345678', 'officer', TRUE),
(3, 'officer2', 'an.nv@club.ictu.edu.vn', '$2b$10$TwqeGYEFRMKuvTofcQaKFOxPwWh9tnNvT3GF6GVuwt/qxwDvCFTgy', 'Nguyễn Văn An (Thủ quỹ/Truyền thông)', '0923456789', 'officer', TRUE),
(4, 'member1', 'nam.lh@club.ictu.edu.vn', '$2b$10$fOZIRlE3FpOSMAXl9rSJCeELpdvQT3uUIH8xleK2JdSgDKiPBZGye', 'Lê Hoàng Nam', '0934567890', 'member', TRUE),
(5, 'member2', 'anh.pq@club.ictu.edu.vn', '$2b$10$fOZIRlE3FpOSMAXl9rSJCeELpdvQT3uUIH8xleK2JdSgDKiPBZGye', 'Phạm Quỳnh Anh', '0945678901', 'member', TRUE),
(6, 'member3', 'tuan.dm@club.ictu.edu.vn', '$2b$10$fOZIRlE3FpOSMAXl9rSJCeELpdvQT3uUIH8xleK2JdSgDKiPBZGye', 'Đỗ Minh Tuấn', '0956789012', 'member', TRUE),
(7, 'locked_user', 'khoa.vd@club.ictu.edu.vn', '$2b$10$fOZIRlE3FpOSMAXl9rSJCeELpdvQT3uUIH8xleK2JdSgDKiPBZGye', 'Vũ Đình Khoa (Tài khoản bị khóa)', '0967890123', 'member', FALSE);

-- 3. Thêm Tư cách thành viên
INSERT INTO `club_memberships` (`club_id`, `user_id`, `member_code`, `joined_at`, `status`, `position`, `notes`) VALUES
(1, 1, 'CLB-2026-001', '2025-09-01', 'active', 'Chủ nhiệm CLB', 'Quản lý toàn diện hoạt động CLB'),
(1, 2, 'CLB-2026-002', '2025-09-01', 'active', 'Phó chủ nhiệm', 'Phụ trách chuyên môn và tổ chức sự kiện'),
(1, 3, 'CLB-2026-003', '2025-09-15', 'active', 'Thủ quỹ', 'Quản lý thu chi và tài chính CLB'),
(1, 4, 'CLB-2026-004', '2025-10-01', 'active', 'Thành viên cốt cán', 'Thành viên Ban Chuyên môn'),
(1, 5, 'CLB-2026-005', '2025-10-01', 'active', 'Thành viên cốt cán', 'Thành viên Ban Truyền thông'),
(1, 6, 'CLB-2026-006', '2026-01-15', 'active', 'Thành viên', 'Thành viên mới kỳ 2'),
(1, 7, 'CLB-2026-007', '2026-02-01', 'suspended', 'Thành viên', 'Tạm ngưng sinh hoạt do vi phạm nội quy');

-- 4. Thêm Ban / Nhóm chuyên môn
INSERT INTO `teams` (`id`, `club_id`, `name`, `description`, `leader_user_id`) VALUES
(1, 1, 'Ban Chuyên môn & Dự án', 'Nghiên cứu công nghệ mới, tổ chức seminar và hướng dẫn các dự án thực tế.', 2),
(2, 1, 'Ban Truyền thông & Sự kiện', 'Thiết kế ấn phẩm, quản lý fanpage, chụp ảnh và tổ chức các sự kiện lớn.', 3),
(3, 1, 'Ban Tài chính & Hậu cần', 'Quản lý thu chi, quỹ câu lạc bộ và chuẩn bị hậu cần cho các buổi sinh hoạt.', 3);

-- 5. Thêm Thành viên vào Ban
INSERT INTO `team_members` (`team_id`, `user_id`, `role_in_team`, `joined_at`) VALUES
(1, 2, 'Trưởng ban', '2025-09-05'),
(1, 4, 'Lập trình viên Backend', '2025-10-05'),
(2, 3, 'Trưởng ban', '2025-09-20'),
(2, 5, 'Phụ trách nội dung Fanpage', '2025-10-10');

-- 6. Thêm Sự kiện / Hoạt động
INSERT INTO `events` (`id`, `club_id`, `title`, `description`, `location`, `start_at`, `end_at`, `capacity`, `registration_deadline`, `status`, `created_by`) VALUES
(1, 1, 'Seminar: Tổng quan Kiến trúc Microservices & Docker', 'Buổi chia sẻ chuyên sâu về triển khai container và kiến trúc hệ thống phân tán.', 'Hội trường C1 - Trường CNTT & TT', '2026-10-05 08:30:00', '2026-10-05 11:30:00', 50, '2026-10-04 18:00:00', 'completed', 1),
(2, 1, 'Workshop: Lập trình Full-stack Web với Express & MySQL', 'Thực hành xây dựng ứng dụng web quản lý theo chuẩn MVC với xác thực và phân quyền.', 'Phòng thực hành Lab 302', '2026-10-28 14:00:00', '2026-10-28 17:00:00', 40, '2026-10-27 23:59:59', 'published', 2),
(3, 1, 'Teambuilding: Chào đón Tân sinh viên K23', 'Giao lưu văn nghệ, trò chơi tập thể và định hướng học tập cho tân sinh viên.', 'Khu sinh thái Hồ Núi Cốc', '2026-11-08 07:30:00', '2026-11-08 16:30:00', 80, '2026-11-06 20:00:00', 'published', 2),
(4, 1, 'Cuộc thi: Mini Hackathon 2026 - Thử thách 24 giờ', 'Cuộc thi lập trình ứng dụng giải quyết bài toán thực tế trong trường đại học.', 'Tòa nhà Thư viện', '2026-11-20 08:00:00', '2026-11-21 08:00:00', 30, '2026-11-18 18:00:00', 'draft', 1),
(5, 1, 'Chuyến tham quan thực tế tại Doanh nghiệp FPT Software', 'Tham quan môi trường làm việc chuyên nghiệp tại khu công nghệ cao.', 'FPT Software Hòa Lạc', '2026-10-15 07:00:00', '2026-10-15 18:00:00', 45, '2026-10-12 18:00:00', 'cancelled', 1);

-- 7. Thêm Đăng ký tham gia sự kiện
INSERT INTO `event_registrations` (`event_id`, `user_id`, `registered_at`, `status`, `note`) VALUES
(1, 4, '2026-10-01 10:15:00', 'attended', 'Đăng ký sớm, có mặt đúng giờ'),
(1, 5, '2026-10-01 14:30:00', 'attended', 'Tham gia hỗ trợ check-in'),
(1, 6, '2026-10-02 09:20:00', 'attended', 'Xin phép đến muộn 15 phút do bận lịch thi'),
(2, 4, '2026-10-20 08:00:00', 'registered', 'Đăng ký tham gia thực hành'),
(2, 5, '2026-10-20 09:12:00', 'registered', 'Quan tâm phần xác thực JWT');

-- 8. Thêm Điểm danh sự kiện hoàn thành
INSERT INTO `attendance` (`event_id`, `user_id`, `status`, `checked_at`, `checked_by`, `note`) VALUES
(1, 4, 'present', '2026-10-05 08:25:00', 2, 'Có mặt đúng giờ'),
(1, 5, 'present', '2026-10-05 08:20:00', 2, 'Có mặt sớm hỗ trợ ban tổ chức'),
(1, 6, 'late', '2026-10-05 08:45:00', 2, 'Đến muộn 15 phút');

-- 9. Thêm Thông báo CLB
INSERT INTO `announcements` (`id`, `club_id`, `title`, `content`, `created_by`, `published_at`, `status`) VALUES
(1, 1, 'Chào mừng năm học mới 2025 - 2026', 'Ban Chủ nhiệm CLB chúc toàn thể thành viên một năm học mới đạt nhiều thành tích xuất sắc và tích cực tham gia các dự án công nghệ của CLB.', 1, '2025-09-02 08:00:00', 'published'),
(2, 1, 'Phát động đăng ký Workshop Lập trình Full-stack Web', 'Mời toàn thể thành viên đăng ký tham gia Workshop thực hành Express & MySQL diễn ra vào ngày 28/10/2026. Số lượng chỗ ngồi có hạn (40 suất).', 2, '2026-10-18 09:00:00', 'published'),
(3, 1, 'Dự thảo kế hoạch ngân sách và phân bổ kinh phí quý IV', 'Bản dự thảo chi tiết các khoản dự chi cho hoạt động teambuilding và hackathon.', 3, '2026-10-20 16:30:00', 'draft');

-- 10. Thêm Giao dịch Tài chính (Thu / Chi)
INSERT INTO `finance_transactions` (`club_id`, `type`, `category`, `amount`, `description`, `transaction_date`, `created_by`) VALUES
(1, 'income', 'Hội phí', 4500000.00, 'Thu quỹ hoạt động CLB học kỳ 1 năm học 2025-2026 từ 45 thành viên', '2025-09-10', 3),
(1, 'income', 'Tài trợ', 10000000.00, 'Tài trợ phát triển nhân tài trẻ từ Doanh nghiệp phần mềm đối tác', '2025-10-01', 1),
(1, 'expense', 'Văn phòng phẩm', 1250000.00, 'Mua bảng tên đeo, sổ tay, bút dạ và in ấn tài liệu seminar', '2025-10-03', 3),
(1, 'expense', 'Cơ sở vật chất', 2800000.00, 'Thuê thiết bị âm thanh, máy chiếu phụ vụ hội trường C1', '2025-10-04', 3),
(1, 'income', 'Thu phí Workshop', 1500000.00, 'Thu phí tài liệu từ người tham gia ngoài CLB cho Workshop Express', '2026-10-19', 3),
(1, 'expense', 'Hậu cần & Giải khát', 850000.00, 'Chi nước suối và bánh ngọt giữa giờ cho buổi Workshop', '2026-10-20', 3);

-- 11. Thêm Nhật ký kiểm toán mẫu (Audit Logs)
INSERT INTO `audit_logs` (`actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata`) VALUES
(1, 'INITIALIZE_SYSTEM', 'system', '1', '{"ip": "127.0.0.1", "description": "Khởi tạo hệ thống CLB thành công"}'),
(1, 'CREATE_CLUB', 'clubs', '1', '{"club_name": "Câu lạc bộ Tin học & Kỹ thuật Phần mềm"}'),
(2, 'CREATE_EVENT', 'events', '2', '{"event_title": "Workshop: Lập trình Full-stack Web với Express & MySQL"}'),
(3, 'RECORD_FINANCE', 'finance_transactions', '1', '{"type": "income", "amount": 4500000, "category": "Hội phí"}'),
(2, 'CHECK_ATTENDANCE', 'attendance', '1', '{"event_id": 1, "attendees_count": 3}');
