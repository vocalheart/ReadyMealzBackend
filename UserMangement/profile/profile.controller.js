const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * =========================================
 * GET MY PROFILE
 * =========================================
 */
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    };
    res.status(200).json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        profileImage: user.profileImage,
        status: user.status,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
    });
  }
};

/**
 * =========================================
 * UPDATE FULL PROFILE
 * (Name, Email, Mobile, Profile Image)
 * =========================================
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, mobile } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    if (name) user.name = name;
    if (email) user.email = email;
    if (mobile) user.mobile = mobile;
    await user.save();
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Profile update failed',
    });
  }
};
/**
 * =========================================
 * UPDATE BASIC INFO (Name, Email, Mobile Only)
 * =========================================
 */
exports.updateBasicInfo = async (req, res) => {
  try {
    const { name, email, mobile } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, mobile },
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Basic info updated',
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Update failed',
    });
  }
};
/**
 * =========================================
 * CHANGE PASSWORD (AUTH USER)
 * =========================================
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Password change failed',
    });
  }
};

/**
 * =========================================
 * FORGOT PASSWORD (Email OR Mobile)
 * =========================================
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email, mobile } = req.body;

    const user = await User.findOne({
      $or: [{ email }, { mobile }],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email or mobile',
      });
    }

    //  Future: OTP / Email Logic (You can integrate later)
    res.status(200).json({
      success: true,
      message: 'Password reset link/OTP will be sent (Implement OTP logic)',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Forgot password failed',
    });
  }
};
/**
 * =========================================
 * RESET PASSWORD
 * =========================================
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, mobile, newPassword } = req.body;

    const user = await User.findOne({
      $or: [{ email }, { mobile }],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Reset password failed',
    });
  }
};