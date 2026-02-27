const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
    },

    //  Mobile login support (since your frontend uses identifier)
    mobile: {
      type: String,
      default: '',
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },

    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin'],
      default: 'user',
    },

    //  Account Active / Inactive
    isActive: {
      type: Boolean,
      default: true,
    },

    //  Block by admin
    isBlocked: {
      type: Boolean,
      default: false,
    },

    // Account status (more scalable)
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },

    // 🖼Profile Image
    profileImage: {
      type: String,
      default: '',
    },

    //  Security
    loginAttempts: {
      type: Number,
      default: 0,
    },

    lastLogin: {
      type: Date,
    },

    blockedAt: {
      type: Date,
    },

    blockedReason: {
      type: String,
      default: '',
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);