const express = require("express");
const { validationResult, body } = require("express-validator");
const { upload } = require("../config/s3");
const Meal = require("../models/meal");
const Category = require("../models/category");
const protect = require("../../middleware/FullRoleMiddleware");
const authorizeRoles = require("../../middleware/roleMiddleware");
const deleteFromS3 = require("../config/s3Delete");

const router = express.Router();

/* ─────────────────────────────────────────
   HELPER: generate slug from name
───────────────────────────────────────── */
function generateSlug(name) {
  return name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

/* ─────────────────────────────────────────
   VALIDATION MIDDLEWARE
───────────────────────────────────────── */
const validateMealInput = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Meal name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2-100 characters'),

  body('price')
    .isFloat({ min: 0 })
    .withMessage('Valid price (≥ 0) is required'),

  body('discountPercentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount must be between 0-100%'),

  body('stock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stock must be a positive integer'),

  body('preparationTime')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Preparation time must be positive'),

  body('calories')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Calories must be positive'),

  body('protein')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Protein must be positive'),

  body('carbs')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Carbs must be positive'),

  body('fat')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Fat must be positive')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({ field: err.param, message: err.msg }))
    });
  }
  next();
};

/* ─────────────────────────────────────────
   CREATE MEAL  POST /add-meal
───────────────────────────────────────── */
router.post(
  "/add-meal",
  protect,
  authorizeRoles("superadmin", "admin"),
  upload.array("images", 5),
  validateMealInput,
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        name,
        price,
        description,
        categoryId,
        foodType,
        tags,
        // discount
        discountPercentage,
        discountPrice,
        discountExpiry,
        // availability
        isAvailable,
        isFeatured,
        status,
        visibility,
        // stock
        stock,
        isUnlimitedStock,
        lowStockThreshold,
        // prep info
        preparationTime,
        servingSize,
        servingsPerItem,
        // nutrition
        calories,
        protein,
        carbs,
        fat,
        fiber,
        sodium,
        // allergens & dietary
        allergens,
        dietaryFlags,
      } = req.body;

      /* ── required validations ── */
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

      /* ── category check (optional) ── */
      let category = null;
      if (categoryId) {
        category = await Category.findById(categoryId);
        if (!category) {
          return res.status(404).json({ success: false, message: "Category not found" });
        }
      }

      /* ── slug: generate unique ── */
      let slug = generateSlug(name.trim());
      const slugExists = await Meal.findOne({ slug });
      if (slugExists) slug = `${slug}-${Date.now()}`;

      /* ── images ── */
      const imagesData = req.files.map((file, index) => ({
        url: file.location,
        key: file.key,
        altText: name,
        isMainImage: index === 0 // First image is main
      }));

      /* ── tags: accept string or array ── */
      const parsedTags = tags
        ? Array.isArray(tags)
          ? tags
          : [tags]
        : [];

      /* ── allergens & dietary flags ── */
      const parsedAllergens = allergens
        ? Array.isArray(allergens)
          ? allergens
          : [allergens]
        : [];

      const parsedDietaryFlags = dietaryFlags
        ? Array.isArray(dietaryFlags)
          ? dietaryFlags
          : [dietaryFlags]
        : [];

      /* ── discount price calc: if % given, auto-calc unless overridden ── */
      let finalDiscountPrice = discountPrice ? Number(discountPrice) : 0;
      const finalDiscountPercentage = discountPercentage ? Number(discountPercentage) : 0;
      if (finalDiscountPercentage > 0 && !discountPrice) {
        finalDiscountPrice = Number(price) - (Number(price) * finalDiscountPercentage) / 100;
      }

      const meal = await Meal.create({
        name: name.trim(),
        slug,
        price: Number(price),
        description: description?.trim() || "",
        category: category?._id || null,
        foodType: foodType || null,
        tags: parsedTags,
        images: imagesData,
        // discount
        discountPercentage: finalDiscountPercentage,
        discountPrice: finalDiscountPrice,
        discountExpiry: discountExpiry || null,
        // availability
        isAvailable: isAvailable !== undefined ? isAvailable === "true" || isAvailable === true : true,
        isFeatured: isFeatured === "true" || isFeatured === true || false,
        status: status || "active",
        visibility: visibility || "public",
        // stock
        stock: stock !== undefined ? Number(stock) : 0,
        isUnlimitedStock: isUnlimitedStock !== undefined ? isUnlimitedStock === "true" || isUnlimitedStock === true : true,
        lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : 5,
        // prep
        preparationTime: preparationTime ? Number(preparationTime) : 0,
        servingSize: servingSize?.trim() || "",
        servingsPerItem: servingsPerItem ? Number(servingsPerItem) : 1,
        // nutrition
        nutrition: {
          calories: calories ? Number(calories) : 0,
          protein: protein ? Number(protein) : 0,
          carbs: carbs ? Number(carbs) : 0,
          fat: fat ? Number(fat) : 0,
          fiber: fiber ? Number(fiber) : 0,
          sodium: sodium ? Number(sodium) : 0,
        },
        // allergens & dietary
        allergens: parsedAllergens,
        dietaryFlags: parsedDietaryFlags,
        // meta
        createdBy: req.user?._id || null,
      });

      const populated = await meal.populate([
        { path: "category", select: "name" },
        { path: "foodType", select: "name" },
        { path: "tags", select: "name" },
      ]);

      return res.status(201).json({
        success: true,
        message: "Meal created successfully",
        data: populated,
      });
    } catch (error) {
      console.error("[ADD-MEAL] Error:", error);

      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, message: "File too large (max 5MB per image)" });
      }
      if (error.name === "MulterError") {
        return res.status(400).json({ success: false, message: error.message || "File upload error" });
      }
      if (error.code === 11000 && error.keyPattern?.slug) {
        return res.status(400).json({ success: false, message: "Slug conflict — try a different name" });
      }

      return res.status(500).json({ success: false, message: "Failed to create meal", error: error.message });
    }
  }
);

/* ─────────────────────────────────────────
   UPDATE MEAL  PUT /update-meal/:id
───────────────────────────────────────── */
router.put(
  "/update-meal/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  upload.array("images", 5),
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        name,
        price,
        description,
        categoryId,
        foodType,
        tags,
        deleteImages,
        // discount
        discountPercentage,
        discountPrice,
        discountExpiry,
        // availability
        isAvailable,
        isFeatured,
        status,
        visibility,
        // stock
        stock,
        isUnlimitedStock,
        lowStockThreshold,
        // prep info
        preparationTime,
        servingSize,
        servingsPerItem,
        // nutrition
        calories,
        protein,
        carbs,
        fat,
        fiber,
        sodium,
        // allergens & dietary
        allergens,
        dietaryFlags,
        // soft delete
        isDeleted,
      } = req.body;

      const meal = await Meal.findById(req.params.id);
      if (!meal) {
        return res.status(404).json({ success: false, message: "Meal not found" });
      }

      const updateData = {};

      /* ── basic fields ── */
      if (name?.trim()) {
        updateData.name = name.trim();
        if (name.trim() !== meal.name) {
          let slug = generateSlug(name.trim());
          const slugExists = await Meal.findOne({ slug, _id: { $ne: meal._id } });
          if (slugExists) slug = `${slug}-${Date.now()}`;
          updateData.slug = slug;
        }
      }

      if (price !== undefined && !isNaN(price)) updateData.price = Number(price);
      if (description !== undefined) updateData.description = description.trim();
      if (categoryId !== undefined) updateData.category = categoryId || null;
      if (foodType !== undefined) updateData.foodType = foodType || null;
      if (visibility !== undefined) updateData.visibility = visibility;

      /* ── tags ── */
      if (tags !== undefined) {
        updateData.tags = Array.isArray(tags) ? tags : tags ? [tags] : [];
      }

      /* ── allergens & dietary flags ── */
      if (allergens !== undefined) {
        updateData.allergens = Array.isArray(allergens) ? allergens : allergens ? [allergens] : [];
      }
      if (dietaryFlags !== undefined) {
        updateData.dietaryFlags = Array.isArray(dietaryFlags) ? dietaryFlags : dietaryFlags ? [dietaryFlags] : [];
      }

      /* ── discount ── */
      if (discountPercentage !== undefined) updateData.discountPercentage = Number(discountPercentage);
      if (discountPrice !== undefined) updateData.discountPrice = Number(discountPrice);
      if (discountExpiry !== undefined) updateData.discountExpiry = discountExpiry || null;

      if (discountPercentage !== undefined && discountPrice === undefined) {
        const basePrice = price !== undefined ? Number(price) : meal.price;
        updateData.discountPrice =
          Number(discountPercentage) > 0
            ? basePrice - (basePrice * Number(discountPercentage)) / 100
            : 0;
      }

      /* ── availability & status ── */
      if (isAvailable !== undefined) updateData.isAvailable = isAvailable === "true" || isAvailable === true;
      if (isFeatured !== undefined) updateData.isFeatured = isFeatured === "true" || isFeatured === true;
      if (status !== undefined) updateData.status = status;

      /* ── stock ── */
      if (stock !== undefined) updateData.stock = Number(stock);
      if (isUnlimitedStock !== undefined)
        updateData.isUnlimitedStock = isUnlimitedStock === "true" || isUnlimitedStock === true;
      if (lowStockThreshold !== undefined) updateData.lowStockThreshold = Number(lowStockThreshold);

      /* ── prep info ── */
      if (preparationTime !== undefined) updateData.preparationTime = Number(preparationTime);
      if (servingSize !== undefined) updateData.servingSize = servingSize.trim();
      if (servingsPerItem !== undefined) updateData.servingsPerItem = Number(servingsPerItem);

      /* ── nutrition ── */
      if (calories !== undefined || protein !== undefined || carbs !== undefined || fat !== undefined || fiber !== undefined || sodium !== undefined) {
        updateData.nutrition = {
          calories: calories !== undefined ? Number(calories) : meal.nutrition.calories,
          protein: protein !== undefined ? Number(protein) : meal.nutrition.protein,
          carbs: carbs !== undefined ? Number(carbs) : meal.nutrition.carbs,
          fat: fat !== undefined ? Number(fat) : meal.nutrition.fat,
          fiber: fiber !== undefined ? Number(fiber) : meal.nutrition.fiber,
          sodium: sodium !== undefined ? Number(sodium) : meal.nutrition.sodium,
        };
      }

      /* ── soft delete ── */
      if (isDeleted !== undefined) updateData.isDeleted = isDeleted === "true" || isDeleted === true;

      /* ── delete images from S3 ── */
      if (deleteImages) {
        const keys = Array.isArray(deleteImages) ? deleteImages : [deleteImages];
        if (keys.length > 0) {
          await deleteFromS3(keys).catch(e => console.error("S3 delete failed:", e));
          updateData.$pull = { images: { key: { $in: keys } } };
        }
      }

      /* ── add new images ── */
      if (req.files?.length) {
        const newImages = req.files.map((f, index) => ({
          url: f.location,
          key: f.key,
          altText: name || meal.name,
          isMainImage: index === 0 && (!meal.images || meal.images.length === 0)
        }));
        updateData.$push = { images: { $each: newImages } };
      }

      const updated = await Meal.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      }).populate([
        { path: "category", select: "name" },
        { path: "foodType", select: "name" },
        { path: "tags", select: "name" },
      ]);

      res.json({ success: true, message: "Meal updated successfully", data: updated });
    } catch (err) {
      console.error("[UPDATE-MEAL] Error:", err);
      res.status(500).json({ success: false, message: err.message || "Failed to update meal" });
    }
  }
);

/* ─────────────────────────────────────────
   DELETE MEAL  DELETE /delete-meal/:id
───────────────────────────────────────── */
router.delete(
  "/delete-meal/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const meal = await Meal.findById(req.params.id);
      if (!meal) {
        return res.status(404).json({ success: false, message: "Meal not found" });
      }

      if (meal.images?.length) {
        const keys = meal.images.map((img) => img.key);
        await deleteFromS3(keys).catch((e) => console.error("S3 delete failed:", e));
      }

      await meal.deleteOne();
      res.json({ success: true, message: "Meal deleted successfully" });
    } catch (err) {
      console.error("[DELETE-MEAL] Error:", err);
      res.status(500).json({ success: false, message: "Failed to delete meal" });
    }
  }
);

/* ─────────────────────────────────────────
   SOFT DELETE  PATCH /soft-delete/:id
───────────────────────────────────────── */
router.patch(
  "/soft-delete/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const meal = await Meal.findByIdAndUpdate(
        req.params.id,
        { isDeleted: true, status: "inactive" },
        { new: true }
      );
      if (!meal) return res.status(404).json({ success: false, message: "Meal not found" });
      res.json({ success: true, message: "Meal soft-deleted", data: meal });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ─────────────────────────────────────────
   GET ALL MEALS  GET /get-meals
───────────────────────────────────────── */
router.get(
  "/get-meals",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const {
        search,
        page = 1,
        limit = 10,
        category,
        foodType,
        status,
        isAvailable,
        isFeatured,
        isDeleted = "false",
        minPrice,
        maxPrice,
        allergen,
        dietary,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const query = {};

      // soft-delete filter
      query.isDeleted = isDeleted === "true";

      if (search) query.$text = { $search: search.trim() };
      if (category) query.category = category;
      if (foodType) query.foodType = foodType;
      if (status) query.status = status;
      if (isAvailable !== undefined) query.isAvailable = isAvailable === "true";
      if (isFeatured !== undefined) query.isFeatured = isFeatured === "true";

      // Filter by allergen
      if (allergen) query.allergens = allergen;

      // Filter by dietary flag
      if (dietary) query.dietaryFlags = dietary;

      // Price range
      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = Number(minPrice);
        if (maxPrice) query.price.$lte = Number(maxPrice);
      }

      const skip = (Number(page) - 1) * Number(limit);
      const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

      const [meals, total] = await Promise.all([
        Meal.find(query)
          .populate("category", "name")
          .populate("foodType", "name")
          .populate("tags", "name")
          .sort(sort)
          .skip(skip)
          .limit(Number(limit)),
        Meal.countDocuments(query),
      ]);

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
  }
);

/* ─────────────────────────────────────────
   GET SINGLE MEAL  GET /get-meal/:id
───────────────────────────────────────── */
router.get(
  "/get-meal/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const meal = await Meal.findById(req.params.id)
        .populate("category", "name")
        .populate("foodType", "name")
        .populate("tags", "name");

      if (!meal) return res.status(404).json({ success: false, message: "Meal not found" });

      res.json({ success: true, data: meal });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ─────────────────────────────────────────
   GET MEAL BY SLUG  GET /get-meal-by-slug/:slug
───────────────────────────────────────── */
router.get(
  "/get-meal-by-slug/:slug",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const meal = await Meal.findOne({ slug: req.params.slug, isDeleted: false })
        .populate("category", "name")
        .populate("foodType", "name")
        .populate("tags", "name");

      if (!meal) return res.status(404).json({ success: false, message: "Meal not found" });

      res.json({ success: true, data: meal });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ─────────────────────────────────────────
   TOGGLE AVAILABILITY  PATCH /toggle-availability/:id
───────────────────────────────────────── */
router.patch(
  "/toggle-availability/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const meal = await Meal.findById(req.params.id);
      if (!meal) return res.status(404).json({ success: false, message: "Meal not found" });

      meal.isAvailable = !meal.isAvailable;
      await meal.save();

      res.json({
        success: true,
        message: `Meal is now ${meal.isAvailable ? "available" : "unavailable"}`,
        isAvailable: meal.isAvailable,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ─────────────────────────────────────────
   PUBLIC: GET FEATURED MEALS (No auth)
   GET /public/featured
───────────────────────────────────────── */
router.get(
  "/public/featured",
  async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 10;

      const meals = await Meal.find()
        .featured()
        .populate("category", "name")
        .populate("foodType", "name")
        .populate("tags", "name")
        .limit(limit);

      res.json({
        success: true,
        count: meals.length,
        data: meals
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ─────────────────────────────────────────
   PUBLIC: GET TOP RATED MEALS (No auth)
   GET /public/top-rated
───────────────────────────────────────── */
router.get(
  "/public/top-rated",
  async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 10;

      const meals = await Meal.getTopRated(limit);

      res.json({
        success: true,
        count: meals.length,
        data: meals
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ─────────────────────────────────────────
   PUBLIC: SEARCH MEALS (No auth)
   GET /public/search
───────────────────────────────────────── */
router.get(
  "/public/search",
  async (req, res) => {
    try {
      const { query } = req.query;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Search query must be at least 2 characters"
        });
      }

      const meals = await Meal.searchByName(query);

      res.json({
        success: true,
        count: meals.length,
        data: meals
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ─────────────────────────────────────────
   GET CATEGORIES (Admin)
   GET /get-category
───────────────────────────────────────── */
router.get("/get-category",protect,authorizeRoles("admin", "superadmin"),
  async (req, res) => {try {
      const categories = await Category.find({});
      if (categories.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No categories found",
          data: []
        });
      }
      return res.status(200).json({
        success: true,
        message: "Successfully fetched categories",
        data: categories
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch categories",
        error: error.message
      });
    }
  }
);

module.exports = router;