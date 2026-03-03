const express = require("express");
const Meal = require("../AdminMangement/models/meal.js");
const Category = require("../AdminMangement/models/category.js");

const router = express.Router();

/**
 * ─────────────────────────────────────────────
 * GET ALL MEALS (Public)
 * GET /meals
 *
 * Query params:
 *   search        - text search (name/description)
 *   category      - category ObjectId
 *   foodType      - foodType ObjectId
 *   tags          - comma-separated tag IDs  e.g. tags=id1,id2
 *   minPrice      - number
 *   maxPrice      - number
 *   isFeatured    - true / false
 *   sortBy        - price | createdAt | averageRating | preparationTime
 *   sortOrder     - asc | desc
 *   page          - number (default 1)
 *   limit         - number (default 12)
 * ─────────────────────────────────────────────
 */
router.get("/meals", async (req, res) => {
  try {
    const {
      search,
      category,
      foodType,
      tags,
      minPrice,
      maxPrice,
      isFeatured,
      sortBy     = "createdAt",
      sortOrder  = "desc",
      page       = 1,
      limit      = 12,
    } = req.query;

    // Only show active, available, non-deleted meals publicly
    const query = {
      status:      "active",
      isAvailable: true,
      isDeleted:   false,
    };

    // Text search
    if (search?.trim()) {
      query.$text = { $search: search.trim() };
    }

    // Filters
    if (category)   query.category = category;
    if (foodType)   query.foodType = foodType;
    if (isFeatured !== undefined) query.isFeatured = isFeatured === "true";

    // Tags filter (comma-separated)
    if (tags) {
      const tagArray = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (tagArray.length) query.tags = { $in: tagArray };
    }

    // Price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    const allowedSortFields = ["price", "createdAt", "averageRating", "preparationTime"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };

    const skip = (Number(page) - 1) * Number(limit);

    const [meals, total] = await Promise.all([
      Meal.find(query)
        .populate("category", "name slug")
        .populate("foodType", "name")
        .populate("tags", "name")
        .select("-__v -createdBy -isDeleted")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Meal.countDocuments(query),
    ]);

    res.json({
      success: true,
      meals,
      page:       Number(page),
      limit:      Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
      count:      meals.length,
    });
  } catch (err) {
    console.error("[PUBLIC GET-MEALS] Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch meals" });
  }
});

/**
 * ─────────────────────────────────────────────
 * GET FEATURED MEALS (Public)
 * GET /meals/featured
 *
 * Returns top featured + active meals
 * Query: limit (default 8)
 * ─────────────────────────────────────────────
 */
router.get("/meals/featured", async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const meals = await Meal.find({
      isFeatured:  true,
      status:      "active",
      isAvailable: true,
      isDeleted:   false,
    })
      .populate("category", "name slug")
      .populate("foodType", "name")
      .populate("tags", "name")
      .select("-__v -createdBy -isDeleted")
      .sort({ averageRating: -1, createdAt: -1 })
      .limit(Number(limit));

    res.json({ success: true, meals, count: meals.length });
  } catch (err) {
    console.error("[PUBLIC FEATURED-MEALS] Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch featured meals" });
  }
});

/**
 * ─────────────────────────────────────────────
 * GET MEALS BY CATEGORY (Public)
 * GET /meals/category/:categoryId
 *
 * Query: page, limit, sortBy, sortOrder
 * ─────────────────────────────────────────────
 */
router.get("/meals/category/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 12, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const query = {
      category:    categoryId,
      status:      "active",
      isAvailable: true,
      isDeleted:   false,
    };

    const allowedSortFields = ["price", "createdAt", "averageRating", "preparationTime"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };
    const skip = (Number(page) - 1) * Number(limit);

    const [meals, total] = await Promise.all([
      Meal.find(query)
        .populate("category", "name slug")
        .populate("foodType", "name")
        .populate("tags", "name")
        .select("-__v -createdBy -isDeleted")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Meal.countDocuments(query),
    ]);

    res.json({
      success: true,
      category: { _id: category._id, name: category.name },
      meals,
      page:       Number(page),
      limit:      Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
      count:      meals.length,
    });
  } catch (err) {
    console.error("[PUBLIC MEALS-BY-CATEGORY] Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch meals" });
  }
});

/**
 * ─────────────────────────────────────────────
 * GET SINGLE MEAL BY ID (Public)
 * GET /meals/:id
 * ─────────────────────────────────────────────
 */
router.get("/meals/:id", async (req, res) => {
  try {
    const meal = await Meal.findOne({
      _id:         req.params.id,
      status:      "active",
      isAvailable: true,
      isDeleted:   false,
    })
      .populate("category", "name slug")
      .populate("foodType", "name")
      .populate("tags", "name")
      .select("-__v -createdBy -isDeleted");

    if (!meal) {
      return res.status(404).json({ success: false, message: "Meal not found" });
    }

    res.json({ success: true, meal });
  } catch (err) {
    console.error("[PUBLIC GET-MEAL] Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch meal" });
  }
});

/**
 * ─────────────────────────────────────────────
 * GET SINGLE MEAL BY SLUG (Public)
 * GET /meals/slug/:slug
 * ─────────────────────────────────────────────
 */
router.get("/meals/slug/:slug", async (req, res) => {
  try {
    const meal = await Meal.findOne({
      slug:        req.params.slug,
      status:      "active",
      isAvailable: true,
      isDeleted:   false,
    })
      .populate("category", "name slug")
      .populate("foodType", "name")
      .populate("tags", "name")
      .select("-__v -createdBy -isDeleted");

    if (!meal) {
      return res.status(404).json({ success: false, message: "Meal not found" });
    }

    res.json({ success: true, meal });
  } catch (err) {
    console.error("[PUBLIC GET-MEAL-SLUG] Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch meal" });
  }
});

/**
 * ─────────────────────────────────────────────
 * GET RELATED MEALS (Public)
 * GET /meals/:id/related
 *
 * Returns meals from same category (excluding current)
 * Query: limit (default 6)
 * ─────────────────────────────────────────────
 */
router.get("/meals/:id/related", async (req, res) => {
  try {
    const { limit = 6 } = req.query;

    const meal = await Meal.findById(req.params.id).select("category tags");
    if (!meal) {
      return res.status(404).json({ success: false, message: "Meal not found" });
    }

    const query = {
      _id:         { $ne: meal._id },
      status:      "active",
      isAvailable: true,
      isDeleted:   false,
    };

    // Match by category first, fallback to tags
    if (meal.category) query.category = meal.category;
    else if (meal.tags?.length) query.tags = { $in: meal.tags };

    const meals = await Meal.find(query)
      .populate("category", "name slug")
      .populate("foodType", "name")
      .select("-__v -createdBy -isDeleted")
      .sort({ averageRating: -1 })
      .limit(Number(limit));

    res.json({ success: true, meals, count: meals.length });
  } catch (err) {
    console.error("[PUBLIC RELATED-MEALS] Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch related meals" });
  }
});

/**
 * ─────────────────────────────────────────────
 * GET ALL CATEGORIES WITH MEAL COUNT (Public)
 * GET /meals-categories
 *
 * Useful for building filter UI / nav
 * ─────────────────────────────────────────────
 */
router.get("/meals-categories", async (req, res) => {
  try {
    const categories = await Category.find().select("name slug").lean();

    // Attach meal count per category
    const withCounts = await Promise.all(
      categories.map(async (cat) => {
        const count = await Meal.countDocuments({
          category:    cat._id,
          status:      "active",
          isAvailable: true,
          isDeleted:   false,
        });
        return { ...cat, mealCount: count };
      })
    );

    // Only return categories that have at least 1 active meal
    const filtered = withCounts.filter((c) => c.mealCount > 0);

    res.json({ success: true, categories: filtered, count: filtered.length });
  } catch (err) {
    console.error("[PUBLIC MEALS-CATEGORIES] Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch categories" });
  }
});

/**
 * ─────────────────────────────────────────────
 * SEARCH MEALS (Public — quick search)
 * GET /meals-search?q=biryani
 *
 * Lightweight endpoint for search bar / autocomplete
 * Returns only name, price, slug, image
 * ─────────────────────────────────────────────
 */
router.get("/meals-search", async (req, res) => {
  try {
    const { q, limit = 8 } = req.query;

    if (!q?.trim()) {
      return res.status(400).json({ success: false, message: "Query param 'q' is required" });
    }

    const meals = await Meal.find({
      name:        { $regex: q.trim(), $options: "i" },
      status:      "active",
      isAvailable: true,
      isDeleted:   false,
    })
      .select("name slug price discountPrice discountPercentage images category")
      .populate("category", "name")
      .limit(Number(limit));

    res.json({ success: true, meals, count: meals.length });
  } catch (err) {
    console.error("[PUBLIC MEALS-SEARCH] Error:", err);
    res.status(500).json({ success: false, message: "Search failed" });
  }
});

module.exports = router;