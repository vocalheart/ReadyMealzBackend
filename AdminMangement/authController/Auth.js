const express = require('express');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const router = express.Router();
const jwt = require('jsonwebtoken');

const adminAuth = require('../../middleware/adminMiddleware');
const adminRole = require('../../middleware/adminRole');

/* =========================
   ADMIN SIGNUP (SuperAdmin Only)
========================= */
router.post('/signup',adminAuth,adminRole('superadmin'),  async (req, res) => {
    try {
      const { name, email, password, role } = req.body;
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({success: false,message: 'Email already exists'});
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const admin = await Admin.create({
        name,
        email,
        password: hashedPassword,
        role: role || 'admin',
      });
      res.status(201).json({success: true,message: 'Admin created successfully',admin});
    } catch (error) {
      res.status(500).json({success: false,error: error.message});
    }
  }
);
/* ========================
   ADMIN LOGIN (PUBLIC)
========================= */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({success: false,message: 'Admin not found'});
    }
    //  Block check
    if (admin.isBlocked) {
      return res.status(403).json({success: false,message: 'Your account is blocked by Super Admin'});
    }
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({success: false,message: 'Invalid password'});
    }
    //  Generate JWT Token
    const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET || 'SECRET_KEY', { expiresIn: '7d' });
    //  Store token in cookie (VERY IMPORTANT)
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/* =========================
   BLOCK ADMIN (SuperAdmin Only)
========================= */
router.put('/block/:id',adminAuth,adminRole('superadmin'), 
  async (req, res) => {
    try {
      const admin = await Admin.findByIdAndUpdate( req.params.id, { isBlocked: true },{ new: true });
      res.json({success: true,message: 'Admin blocked successfully',admin});
    } catch (error) {
      res.status(500).json({success: false,error: error.message});
    }
  }
);

/* =========================
   UNBLOCK ADMIN (SuperAdmin Only)
========================= */
router.put('/unblock/:id',adminAuth,adminRole('superadmin'),async (req, res) => {
    try {
      const admin = await Admin.findByIdAndUpdate(req.params.id,{ isBlocked: false },{ new: true });
      res.json({success: true, message: 'Admin unblocked successfully', admin, });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);
/* =========================
   GET CURRENT ADMIN (AUTH.ME)
   Verify token from cookie
========================= */
router.get('/me', adminAuth, async (req, res) => {
  try {
    // adminAuth middleware already verified token
    // and attached req.admin
    res.status(200).json({
      success: true,
      message: 'Admin authenticated',
      admin: {
        id: req.admin._id,
        name: req.admin.name,
        email: req.admin.email,
        role: req.admin.role,
      },
    });
  } catch (error) {
    console.error('Auth Me Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin data',
    });
  }
});

/* =========================
   ADMIN LOGOUT (CLEAR COOKIE)
========================= */
router.post('/logout', adminAuth, (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      sameSite: 'lax',
    });

    res.status(200).json({
      success: true,
      message: 'Admin logged out successfully',
    });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
});

module.exports = router;