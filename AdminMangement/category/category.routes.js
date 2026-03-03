const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const protect = require('../../middleware/FullRoleMiddleware');
const authorizeRoles = require('../../middleware/roleMiddleware');
const Category = require('../models/category');

/* =========================================
   HELPER: VALID OBJECT ID CHECK
========================================= */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================================
   CREATE CATEGORY (Admin + SuperAdmin)
========================================= */
router.post(
  '/create',
  protect,
  authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    try {
      let { name, slug, description } = req.body;

      if (!name || !slug) {
        return res.status(400).json({
          success: false,
          message: "Name and slug are required",
        });
      }

      name = name.trim();
      slug = slug.toLowerCase().trim();

      const existingCategory = await Category.findOne({
        $or: [{ name }, { slug }],
      });

      if (existingCategory) {
        return res.status(409).json({
          success: false,
          message: "Category with this name or slug already exists",
        });
      }

      const newCategory = await Category.create({
        name,
        slug,
        description: description || "",
        createdBy: req.user?._id || null,
      });

      return res.status(201).json({
        success: true,
        message: "Category created successfully",
        category: newCategory,
      });
    } catch (error) {
      console.error("CREATE CATEGORY ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while creating category",
      });
    }
  }
);

/* =========================================
   GET CATEGORY BY SLUG (before :id)
========================================= */
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const category = await Category.findOne({
      slug: slug.toLowerCase(),
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    console.error("GET BY SLUG ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching category by slug",
    });
  }
});

/* =========================================
   GET ALL CATEGORIES - with Pagination + next/prev links
========================================= */
router.get('/', async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "" } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1 || limit > 100) limit = 10;

    const query = {};
    if (search && search.trim() !== "") {
      query.name = { $regex: search.trim(), $options: "i" };
    }

    const [categories, total] = await Promise.all([
      Category.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(), // slightly faster
      Category.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;

    // Build next & previous links (only if they exist)
    const nextPage = page < totalPages ? page + 1 : null;
    const prevPage = page > 1 ? page - 1 : null;

    const response = {
      success: true,
      total,
      page,
      limit,
      totalPages,
      count: categories.length,
      categories,
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
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("GET ALL CATEGORIES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching categories",
    });
  }
});

/* =========================================
   GET CATEGORY BY ID
========================================= */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    console.error("GET CATEGORY BY ID ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching category",
    });
  }
});

/* =========================================
   UPDATE CATEGORY (PUT)
========================================= */
router.put(
  '/:id',
  protect,
  authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      let { name, slug, description } = req.body;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
      }

      const category = await Category.findById(id);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      if (name) name = name.trim();
      if (slug) slug = slug.toLowerCase().trim();

      if (name || slug) {
        const duplicate = await Category.findOne({
          _id: { $ne: id },
          $or: [
            name ? { name } : null,
            slug ? { slug } : null,
          ].filter(Boolean),
        });

        if (duplicate) {
          return res.status(409).json({
            success: false,
            message: "Category with same name or slug already exists",
          });
        }
      }

      category.name = name || category.name;
      category.slug = slug || category.slug;
      category.description =
        description !== undefined ? description : category.description;

      await category.save();

      return res.status(200).json({
        success: true,
        message: "Category updated successfully",
        category,
      });
    } catch (error) {
      console.error("UPDATE CATEGORY ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Error updating category",
      });
    }
  }
);

/* =========================================
   DELETE CATEGORY (SUPERADMIN ONLY)
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
          message: "Invalid category ID",
        });
      }

      const category = await Category.findById(id);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      await Category.findByIdAndDelete(id);

      return res.status(200).json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error) {
      console.error("DELETE CATEGORY ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Error deleting category",
      });
    }
  }
);



module.exports = router;