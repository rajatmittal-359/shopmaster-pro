const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const n = require('../controllers/notificationController');
const pushCtl = require('../controllers/pushController');

/**
 * The bell and the phone, for every signed-in role (plan 2.30 / 2.26).
 * Mounted at /api/notifications. Each handler reads only req.user's rows.
 */
router.use(authMiddleware);

router.get('/', n.list);
router.get('/unread-count', n.unreadCount);
router.post('/read-all', n.readAll);
router.get('/preferences', n.getPreferences);
router.patch('/preferences', n.setPreferences);
router.patch('/:id/read', n.markRead);

// Devices for push - the same five calls the seller router had, now for anyone signed in.
router.get('/push/public-key', pushCtl.publicKey);
router.get('/push', pushCtl.list);
router.post('/push/subscribe', pushCtl.subscribe);
router.delete('/push/subscribe', pushCtl.unsubscribe);
router.post('/push/test', pushCtl.test);

module.exports = router;
