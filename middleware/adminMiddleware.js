const jwt = require('jsonwebtoken');
const Admin = require('../AdminMangement/models/Admin');

const adminAuth = async (req, res, next) => {
  try {
    // 1️ Get token from cookies
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: No token provided',
      });
    }
    // 2️ Verify JWT token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'SECRET_KEY'
    );
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload',
      });
    }
    // 3️ Find admin in database
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin not found',
      });
    }
    // 4️ Check if blocked
    if (admin.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your admin account is blocked by SuperAdmin',
      });
    }
    // 5️ Attach admin to request
    req.admin = {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    };
    next(); //  IMPORTANT
  } catch (error) {
    console.error('Admin Auth Error:', error.message);
    // Token expired
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
      });
    }
    // Invalid token
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

module.exports = adminAuth;