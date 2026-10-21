const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

router.get('/', publicController.getIndex);
router.get('/events', publicController.getEvents);
router.get('/events/:id', publicController.getEventDetail);
router.get('/announcements', publicController.getAnnouncements);
router.get('/about', publicController.getAbout);

module.exports = router;
