const express = require("express");
const { upload } = require("../config/s3");
const Meal = require("../models/meal");
const Category = require("../models/category");
const protect = require("../../middleware/FullRoleMiddleware");
const authorizeRoles = require("../../middleware/roleMiddleware");
const deleteFromS3 = require("../config/s3Delete");

const router = express.Router();

/**
 * CREATE MEAL
 */
router.post("/add-meal",protect,authorizeRoles("superadmin", "admin"),upload.array("images", 5),async (req, res) => {
    try {
      const { name, price, description, categoryId } = req.body;
      // Validation
      if (!name?.trim()) {
        return res.status(400).json({ success: false, message: "Name is required" });
      }
      if (!price || isNaN(price) || Number(price) <= 0) {
        return res.status(400).json({ success: false, message: "Valid price is required" });
      }
      if (!req.files?.length) {
        return res.status(400).json({ success: false, message: "At least one image is required" });
      }
      if (req.files.length > 5) {
        return res.status(400).json({ success: false, message: "Maximum 5 images allowed" });
      }
      // Category check (optional)
      let category = null;
      if (categoryId) {
        category = await Category.findById(categoryId);
        if (!category) {
          return res.status(404).json({ success: false, message: "Category not found" });
        }
      }
      // Prepare images
      const imagesData = req.files.map((file) => ({
        url: file.location,
        key: file.key,
      }));
      const meal = await Meal.create({
        name: name.trim(),
        price: Number(price),
        description: description?.trim() || "",
        category: category?._id || null,
        images: imagesData,
        createdBy: req.user?._id || null,
      });

      // Populate for response
      const populated = await meal.populate("category");
      return res.status(201).json({
        success: true,
        message: "Meal created successfully",
        data: populated,
      });
    } catch (error) {
      console.error("[ADD-MEAL] Error:", error);

      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File too large (max 5MB per image)",
        });
      }

      if (error.name === "MulterError") {
        return res.status(400).json({
          success: false,
          message: error.message || "File upload error",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to create meal",
        error: error.message,
      });
    }
  }
);

/**
 * UPDATE MEAL
 */
router.put(
  "/update-meal/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  upload.array("images", 5),
  async (req, res) => {
    try {
      const { name, price, description, categoryId, foodType, tags, deleteImages } = req.body;

      const meal = await Meal.findById(req.params.id);
      if (!meal) {
        return res.status(404).json({ success: false, message: "Meal not found" });
      }

      const updateData = {};

      if (name?.trim()) updateData.name = name.trim();
      if (price && !isNaN(price)) updateData.price = Number(price);
      if (description !== undefined) updateData.description = description.trim();
      if (categoryId !== undefined) updateData.category = categoryId || null;
      if (foodType !== undefined) updateData.foodType = foodType || null;
      if (tags) {
        updateData.tags = Array.isArray(tags) ? tags : tags ? [tags] : [];
      }

      // Handle image deletion
      if (deleteImages) {
        const keys = Array.isArray(deleteImages) ? deleteImages : [deleteImages];
        if (keys.length > 0) {
          await deleteFromS3(keys);
          updateData.$pull = { images: { key: { $in: keys } } };
        }
      }

      // Add new images
      if (req.files?.length) {
        const newImages = req.files.map((f) => ({
          url: f.location,
          key: f.key,
        }));
        updateData.$push = { images: { $each: newImages } };
      }

      const updated = await Meal.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      }).populate("category foodType tags");

      res.json({
        success: true,
        message: "Meal updated successfully",
        meal: updated,
      });
    } catch (err) {
      console.error("[UPDATE-MEAL] Error:", err);
      res.status(500).json({
        success: false,
        message: err.message || "Failed to update meal",
      });
    }
  }
);

/**
 * DELETE MEAL
 */
router.delete("/delete-meal/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const meal = await Meal.findById(req.params.id);
      if (!meal) {
        return res.status(404).json({ success: false, message: "Meal not found" });
      }
      // Delete images from S3
      if (meal.images?.length) {
        const keys = meal.images.map((img) => img.key);
        await deleteFromS3(keys).catch((e) => console.error("S3 delete failed:", e));
      }
      await meal.deleteOne();
      res.json({ success: true, message: "Meal deleted successfully" });
    } catch (err) {
      console.error("[DELETE-MEAL] Error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to delete meal",
      });
    }
  }
);

/**
 * GET ALL MEALS (with basic search support)
 */
router.get("/get-meals", protect, authorizeRoles("admin", "superadmin"), async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const query = search ? { name: { $regex: search.trim(), $options: "i" } } : {};
    const skip = (Number(page) - 1) * Number(limit);
    const meals = await Meal.find(query).populate("category", "name").populate("foodType", "name").populate("tags", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Meal.countDocuments(query);

    res.json({
      success: true,
      meals,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
      count: meals.length,
    });
  } catch (err) {
    console.error("[GET-MEALS] Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET SINGLE MEAL
 */
router.get("/get-meal/:id", protect, authorizeRoles("admin", "superadmin"), async (req, res) => {
  try {
    const meal = await Meal.findById(req.params.id)
      .populate("category", "name")
      .populate("foodType", "name")
      .populate("tags", "name");

    if (!meal) {
      return res.status(404).json({ success: false, message: "Meal not found" });
    }

    res.json({ success: true, meal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/get-category",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const categories = await Category.find({});
      if (categories.length === 0) {
        return res.status(200).json({success: true,message: "No categories found",categories: []});
      }
      return res.status(200).json({success: true, message: "Successfully fetched categories", categories});
    } catch (error) { return res.status(500).json({ success: false, message: "Something is wrong in your code", error: error.message});
    }
  }
);

module.exports = router;