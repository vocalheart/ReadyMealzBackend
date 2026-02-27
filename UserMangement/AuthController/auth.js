const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

/* =========================================
    GENERATE JWT TOKEN
========================================= */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/* =========================================
    USER SIGNUP
========================================= */
exports.signup = async (req, res) => {
  try {
    const { name, email, password, mobile } = req.body;

    // Check existing user (email or mobile)
    const existingUser = await User.findOne({
      $or: [{ email }, { mobile }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email or Mobile already registered',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      mobile,
      password: hashedPassword,
      role: 'user',
      isActive: true,
      isBlocked: false,
      status: 'approved',
    });


    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({
      success: false,
      message: 'Signup failed',
    });
  }
};

/* =========================================
   USER LOGIN (EMAIL OR MOBILE)
========================================= */
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body; // email OR mobile

    // Find user by email OR mobile
    const user = await User.findOne({
      $or: [
        { email: identifier },
        { mobile: identifier },
      ],
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email/mobile or password',
      });
    }

    //  Block check
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account is blocked by admin',
      });
    }

    //  Active check
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
      });
    }

    //  Approval check (useful for admin approval systems)
    if (user.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Account is not approved yet',
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      user.loginAttempts += 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid email/mobile or password',
      });
    }

    // Reset login attempts + update last login
    user.loginAttempts = 0;
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    // Cookie store
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive,
        isBlocked: user.isBlocked,
      },
      token,
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
};

/* =========================================
    LOGOUT (CLEAR COOKIE)
========================================= */
exports.logout = async (req, res) => {
  try {
    res.clearCookie('token');

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
};

/* =========================================
    GET CURRENT LOGGED-IN USER
========================================= */
exports.getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // IMPORTANT FIX: use id not _id
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('GetMe Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
    });
  }
};
/* =========================================
    ADMIN: BLOCK USER
========================================= */
exports.blockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isBlocked: true,
        blockedAt: new Date(),
        blockedReason: req.body.reason || 'Violation',
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
      user,
    });
  } catch (error) {
    console.error('Block Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user',
    });
  }
};
/* ========================================
    ADMIN: UNBLOCK USER
========================================= */
exports.unblockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isBlocked: false,
        blockedAt: null,
        blockedReason: '',
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
      user,
    });
  } catch (error) {
    console.error('Unblock Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unblock user',
    });
  }
};

/* =========================================
    ADMIN: DEACTIVATE USER
========================================= */
exports.deactivateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      user,
    });
  } catch (error) {
    console.error('Deactivate Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user',
    });
  }
};

/* =========================================
    ADMIN: ACTIVATE USER
========================================= */
exports.activateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'User activated successfully',
      user,
    });
  } catch (error) {
    console.error('Activate Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate user',
    });
  }
};

