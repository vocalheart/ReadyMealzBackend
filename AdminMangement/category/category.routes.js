const express = require('express');
const router = express.Router(); //  correct

const protect = require('../../middleware/FullRoleMiddleware'); // your auth middleware
const authorizeRoles = require('../../middleware/roleMiddleware');
const Category = require('../models/category'); 
router.post('/create',protect,authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    const { name, slug, description } = req.body;
    try {
      // 1️ Validation
      if (!name || !slug) {
        return res.status(400).json({
          success: false,
          message: "Name and slug are required",
        });
      }
      // 2️ Check duplicate (FIXED LOGIC)
      const existingCategory = await Category.findOne({
        $or: [{ name: name.trim() }, { slug: slug.toLowerCase().trim() }],
      });
      if (existingCategory) {
        return res.status(409).json({success: false,message: "Category with this name or slug already exists",});
      }
      // 3️ Create category (FIXED SYNTAX)
      const newCategory = await Category.create({
        name: name.trim(),
        slug: slug.toLowerCase().trim(),
        description: description || "",
      });
      res.status(201).json({
        success: true,
        message: "Category created successfully",
        category: newCategory,
        createdBy: req.user._id,
        role: req.user.role,
      });

    } catch (error) {
      console.error("Category Create Error:", error);
      res.status(500).json({
        success: false,
        message: "Something went wrong in your code",
      });
    }
  }
);
module.exports = router