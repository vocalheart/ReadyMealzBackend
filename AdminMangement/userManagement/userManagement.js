const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const protect = require('../../middleware/FullRoleMiddleware');
const authorizeRoles = require('../../middleware/roleMiddleware');
const User = require('../../UserMangement/models/User'); // adjust path to your User model

/* =========================================
   HELPER: VALID OBJECT ID CHECK
========================================= */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================================
   GET ALL USERS (paginated + search) - Admin + Superadmin
========================================= */
router.get(
  '/',
  protect,
  authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    try {
      let { page = 1, limit = 10, search = "" } = req.query;

      page = parseInt(page);
      limit = parseInt(limit);

      if (isNaN(page) || page < 1) page = 1;
      if (isNaN(limit) || limit < 1 || limit > 100) limit = 10;

      const query = {};
      if (search && search.trim() !== "") {
        query.$or = [
          { name: { $regex: search.trim(), $options: "i" } },
          { email: { $regex: search.trim(), $options: "i" } },
          { mobile: { $regex: search.trim(), $options: "i" } },
        ];
      }

      const [users, total] = await Promise.all([
        User.find(query)
          .select('-password -loginAttempts') // never expose sensitive fields
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        User.countDocuments(query),
      ]);

      const totalPages = Math.ceil(total / limit);
      const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;

      const nextPage = page < totalPages ? page + 1 : null;
      const prevPage = page > 1 ? page - 1 : null;

      return res.status(200).json({
        success: true,
        total,
        page,
        limit,
        totalPages,
        count: users.length,
        users,
        pagination: {
          next: nextPage
            ? `${baseUrl}?page=${nextPage}&limit=${limit}${
                search ? `&search=${encodeURIComponent(search)}` : ''
              }`
            : null,
          previous: prevPage
            ? `${baseUrl}?page=${prevPage}&limit=${limit}${
                search ? `&search=${encodeURIComponent(search)}` : ''
              }`
            : null,
        },
      });
    } catch (error) {
      console.error("GET ALL USERS ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching users",
      });
    }
  }
);

/* =========================================
   GET SINGLE USER BY ID - Admin + Superadmin
========================================= */
router.get(
  '/:id',
  protect,
  authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const user = await User.findById(id).select('-password -loginAttempts');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      console.error("GET USER BY ID ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching user",
      });
    }
  }
);

/* =========================================
   UPDATE USER - Admin + Superadmin (with restrictions)
========================================= */
router.put(
  '/:id',
  protect,
  authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        email,
        mobile,
        role,
        status,
        isActive,
        profileImage,
      } = req.body;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Admin cannot modify superadmin
      if (req.user.role === "admin" && user.role === "superadmin") {
        return res.status(403).json({
          success: false,
          message: "Admins cannot modify superadmin accounts",
        });
      }

      // Prevent changing own role to lower (optional safety)
      if (req.user._id.toString() === id && role && role !== req.user.role) {
        return res.status(403).json({
          success: false,
          message: "You cannot change your own role",
        });
      }

      // Update fields if provided
      if (name) user.name = name.trim();
      if (email) user.email = email.trim().toLowerCase();
      if (mobile !== undefined) user.mobile = mobile.trim() || '';
      if (profileImage) user.profileImage = profileImage;

      // Role change → only superadmin can do it
      if (role && req.user.role === "superadmin") {
        if (!["user", "admin", "superadmin"].includes(role)) {
          return res.status(400).json({ success: false, message: "Invalid role" });
        }
        user.role = role;
      }

      if (status) {
        if (!["pending", "approved", "rejected"].includes(status)) {
          return res.status(400).json({ success: false, message: "Invalid status" });
        }
        user.status = status;
      }

      if (isActive !== undefined) user.isActive = !!isActive;

      await user.save();

      const updatedUser = await User.findById(id).select('-password -loginAttempts');

      return res.status(200).json({
        success: true,
        message: "User updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("UPDATE USER ERROR:", error);
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "Email or mobile already in use",
        });
      }
      return res.status(500).json({
        success: false,
        message: "Error updating user",
      });
    }
  }
);

/* =========================================
   BLOCK USER - Admin + Superadmin
========================================= */
router.put(
  '/:id/block',
  protect,
  authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Admin cannot block superadmin
      if (req.user.role === "admin" && user.role === "superadmin") {
        return res.status(403).json({
          success: false,
          message: "Cannot block superadmin account",
        });
      }

      if (user.isBlocked) {
        return res.status(400).json({
          success: false,
          message: "User is already blocked",
        });
      }

      user.isBlocked = true;
      user.blockedAt = new Date();
      user.blockedReason = req.body.reason || "Blocked by admin";

      await user.save();

      return res.status(200).json({
        success: true,
        message: "User blocked successfully",
        user: { _id: user._id, isBlocked: true, blockedReason: user.blockedReason },
      });
    } catch (error) {
      console.error("BLOCK USER ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Error blocking user",
      });
    }
  }
);

/* =========================================
   UNBLOCK USER - Admin + Superadmin
========================================= */
router.put(
  '/:id/unblock',
  protect,
  authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (!user.isBlocked) {
        return res.status(400).json({
          success: false,
          message: "User is not blocked",
        });
      }

      user.isBlocked = false;
      user.blockedAt = null;
      user.blockedReason = "";

      await user.save();

      return res.status(200).json({
        success: true,
        message: "User unblocked successfully",
        user: { _id: user._id, isBlocked: false },
      });
    } catch (error) {
      console.error("UNBLOCK USER ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Error unblocking user",
      });
    }
  }
);

/* =========================================
   DELETE USER - SUPERADMIN ONLY
========================================= */
router.delete(
  '/:id',
  protect,
  authorizeRoles("superadmin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Cannot delete self
      if (user._id.toString() === req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You cannot delete your own account",
        });
      }

      await User.findByIdAndDelete(id);

      return res.status(200).json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      console.error("DELETE USER ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Error deleting user",
      });
    }
  }
);

module.exports = router;