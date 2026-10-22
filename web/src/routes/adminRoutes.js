const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAuthenticated, requireRole } = require('../middleware/authMiddleware');

router.use(isAuthenticated, requireRole('admin'));

router.get('/dashboard', adminController.getDashboard);

// User & Role Management
router.get('/users', adminController.getUsers);
router.post('/users/:id/role', adminController.updateUserRole);
router.post('/users/:id/status', adminController.toggleUserStatus);

// Teams Management
router.get('/teams', adminController.getTeams);
router.post('/teams', adminController.postCreateTeam);
router.post('/teams/members', adminController.postAddTeamMember);
router.post('/teams/:team_id/members/:user_id/delete', adminController.deleteTeamMember);

// Finance Management
router.get('/finance', adminController.getFinance);
router.post('/finance', adminController.postCreateTransaction);

// Audit Logs
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
