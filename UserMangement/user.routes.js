const express = require('express');
const router = express.Router();
const UserProfile = require('./profile/profile.controller.js');
const  protect = require('../middleware/authMiddleware.js'); // Auth Middleware

/**
 * =========================================
 * USER PROFILE ROUTES (Protected)
 * Base: /api/user
 * =========================================
 */
/**
 *  Get Logged In User Profile
 * Fields: name, email, mobile, role, profileImage
 * GET /api/user/me
 */
router.get('/me', protect, UserProfile.getMyProfile);

/**
 *  Update Profile (Name, Email, Mobile Number)
 * PUT /api/user/profile
**/
router.put('/profile', protect, UserProfile.updateProfile);

/**
 *  Update Only Basic Info (Name, Email, Mobile)
 * PATCH /api/user/update-basic
 */
router.patch('/update-basic', protect, UserProfile.updateBasicInfo);

/**
 *  Change Password (Authenticated User)
 * PUT /api/user/change-password
 */
router.put('/change-password', protect, UserProfile.changePassword);
/**
 *  Forgot Password (Send reset logic / future OTP)
 * POST /api/user/forgot-password
 * Body: { email OR mobile }
 */
router.post('/forgot-password', UserProfile.forgotPassword);
/**
 *  Reset Password (After Forgot Password)
 * PUT /api/user/reset-password
 */
router.put('/reset-password', UserProfile.resetPassword);

module.exports = router;