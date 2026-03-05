const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const router = express.Router();

const adminAuth = require('../../middleware/adminMiddleware');      // verifies JWT & attaches req.admin
const adminRole = require('../../middleware/adminRole');          // checks role

/* =============================================
   GET ALL ADMINS - Superadmin only - with pagination
   GET /admin?page=1&limit=10
============================================= */
router.get('/', adminAuth, adminRole('superadmin'), async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1 || limit > 50) limit = 10; // reasonable max

    const skip = (page - 1) * limit;

    const [admins, total] = await Promise.all([
      Admin.find({})
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Admin.countDocuments(),
    ]);

    const totalPages = Math.ceil(total / limit);

    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;

    const response = {
      success: true,
      admins,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        count: admins.length,
        next: page < totalPages
          ? `${baseUrl}?page=${page + 1}&limit=${limit}`
          : null,
        previous: page > 1
          ? `${baseUrl}?page=${page - 1}&limit=${limit}`
          : null,
      },
    };

    return res.json(response);
  } catch (err) {
    console.error('GET ADMINS ERROR:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});
/* =============================================
   ADMIN SIGNUP - Superadmin only
   POST /admin/signup
   Body: { name, email, password, role? ("admin"|"superadmin") }
============================================= */
router.post('/signup', adminAuth, adminRole('superadmin' , 'admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newAdmin = await Admin.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      role: role === 'superadmin' ? 'superadmin' : 'admin', // only allow superadmin role if explicitly set
    });

    return res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      admin: {
        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
      },
    });
  } catch (err) {
    console.error('ADMIN SIGNUP ERROR:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* =============================================
   ADMIN LOGIN - Public
   POST /admin/login
   Body: { email, password }
   Sets httpOnly cookie 'token'
============================================= */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (admin.isBlocked) {
      return res.status(403).json({ success: false, message: 'Account is blocked' });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET || 'fallback-secret-change-me',
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error('ADMIN LOGIN ERROR:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* =============================================
   GET ALL ADMINS - Superadmin only (list for management)
   GET /admin
============================================= */
router.get('/', adminAuth, adminRole('superadmin'), async (req, res) => {
  try {
    const admins = await Admin.find({})
      .select('-password')
      .sort({ createdAt: -1 });
    return res.json({ success: true, admins });
  } catch (err) {
    console.error('GET ADMINS ERROR:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* =============================================
   UPDATE ADMIN (role + name/email optional) - Superadmin only
   PUT /admin/:id
   Body: { name?, email?, role? }
============================================= */
router.put('/:id', adminAuth, adminRole('superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    if (!['admin', 'superadmin'].includes(role) && role !== undefined) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.trim().toLowerCase();
    if (role) updateData.role = role;

    const updated = await Admin.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      select: '-password',
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    return res.json({
      success: true,
      message: 'Admin updated',
      admin: updated,
    });
  } catch (err) {
    console.error('UPDATE ADMIN ERROR:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


/* =============================================
   DELETE ADMIN - Superadmin only (cannot delete self)
   DELETE /admin/:id
============================================= */
router.delete('/:id', adminAuth, adminRole('superadmin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.admin._id.toString()) {
      return res.status(403).json({ success: false, message: 'Cannot delete your own account' });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    await Admin.findByIdAndDelete(id);

    return res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (err) {
    console.error('DELETE ADMIN ERROR:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* =============================================
   BLOCK / UNBLOCK - Superadmin only
============================================= */
router.put('/block/:id', adminAuth, adminRole('superadmin'), async (req, res) => {
  try {
    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true, select: '-password' }
    );
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    return res.json({ success: true, message: 'Admin blocked', admin });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/unblock/:id', adminAuth, adminRole('superadmin'), async (req, res) => {
  try {
    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true, select: '-password' }
    );
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    return res.json({ success: true, message: 'Admin unblocked', admin });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* =============================================
   GET CURRENT ADMIN (/me)
   Authenticated only
============================================= */
router.get('/me', adminAuth, (req, res) => {
  res.json({
    success: true,
    admin: {
      id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
      isBlocked: req.admin.isBlocked,
    },
  });
});

/* =============================================
   LOGOUT - Clear cookie
============================================= */
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;