const express = require('express');
const router = express.Router();
const officerController = require('../controllers/officerController');
const { isAuthenticated, requireRole } = require('../middleware/authMiddleware');

router.use(isAuthenticated, requireRole('officer', 'admin'));

router.get('/dashboard', officerController.getDashboard);
router.get('/members', officerController.getMembers);
router.post('/members/:id/status', officerController.updateMemberStatus);

router.get('/events', officerController.getEvents);
router.get('/events/create', officerController.getCreateEvent);
router.post('/events/create', officerController.postCreateEvent);
router.get('/events/:id/edit', officerController.getEditEvent);
router.post('/events/:id/edit', officerController.postEditEvent);
router.get('/events/:id/attendance', officerController.getAttendance);
router.post('/events/:id/attendance', officerController.postAttendance);

router.get('/announcements', officerController.getAnnouncements);
router.post('/announcements', officerController.postAnnouncement);

module.exports = router;
