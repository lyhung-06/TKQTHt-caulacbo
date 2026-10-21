const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.use(isAuthenticated);

router.get('/dashboard', memberController.getDashboard);
router.get('/profile', memberController.getProfile);
router.post('/profile', memberController.postProfile);
router.get('/events', memberController.getMyEvents);
router.post('/events/:id/register', memberController.registerEvent);
router.post('/events/:id/cancel', memberController.cancelRegistration);
router.get('/attendance', memberController.getAttendance);

module.exports = router;
