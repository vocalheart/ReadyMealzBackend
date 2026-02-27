const express = require('express');
const router = express.Router();
const authController = require('../UserMangement/AuthController/auth');
const Authmiddleware = require('../middleware/authMiddleware')
const ProfileController = require('../UserMangement/profile/profile.controller')
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', Authmiddleware, authController.getMe);

// Admin Controls
router.put('/block/:id', authController.blockUser);
router.put('/unblock/:id', authController.unblockUser);
router.put('/activate/:id', authController.activateUser);
router.put('/deactivate/:id', authController.deactivateUser);

module.exports = router;