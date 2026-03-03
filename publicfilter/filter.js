const express = require("express");
const router = express.Router();

const Category = require("../AdminMangement/models/category");
const Tags     = require("../AdminMangement/models/Tags");
const FoodType = require("../AdminMangement/models/Food-Type");
const Meal     = require("../AdminMangement/models/meal");

/* ══════════════════════════════════════════════
   CATEGORY ROUTES
══════════════════════════════════════════════ */

/**
 * GET /categories
 * All categories (with optional meal count)
 * Query: withCount=true
 */
router.get("/categories", async (req, res) => {
  try {
    const { withCount = "false" } = req.query;

    const categories = await Category.find()
      .select("-__v")
      .sort({ name: 1 })
      .lean();

    if (withCount === "true") {
      const withCounts = await Promise.all(
        categories.map(async (cat) => {
          const mealCount = await Meal.countDocuments({
            category:    cat._id,
            status:      "active",
            isAvailable: true,
            isDeleted:   false,
          });
          return { ...cat, mealCount };
        })
      );
      return res.json({ success: true, categories: withCounts, count: withCounts.length });
    }

    res.json({ success: true, categories, count: categories.length });
  } catch (err) {
    console.error("[PUBLIC GET-CATEGORIES]", err);
    res.status(500).json({ success: false, message: "Failed to fetch categories" });
  }
});

/**
 * GET /categories/:id
 * Single category by ID
 */
router.get("/categories/:id", async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).select("-__v").lean();
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    res.json({ success: true, category });
  } catch (err) {
    console.error("[PUBLIC GET-CATEGORY-ID]", err);
    res.status(500).json({ success: false, message: "Failed to fetch category" });
  }
});

/**
 * GET /categories/slug/:slug
 * Single category by slug
 */
router.get("/categories/slug/:slug", async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug })
      .select("-__v")
      .lean();
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    res.json({ success: true, category });
  } catch (err) {
    console.error("[PUBLIC GET-CATEGORY-SLUG]", err);
    res.status(500).json({ success: false, message: "Failed to fetch category" });
  }
});

/* ══════════════════════════════════════════════
   FOOD TYPE ROUTES
══════════════════════════════════════════════ */

/**
 * GET /food-types
 * All food types
 */
router.get("/food-types", async (req, res) => {
  try {
    const foodTypes = await FoodType.find()
      .select("-__v -createdBy")
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, foodTypes, count: foodTypes.length });
  } catch (err) {
    console.error("[PUBLIC GET-FOODTYPES]", err);
    res.status(500).json({ success: false, message: "Failed to fetch food types" });
  }
});

/**
 * GET /food-types/:id
 * Single food type by ID
 */
router.get("/food-types/:id", async (req, res) => {
  try {
    const foodType = await FoodType.findById(req.params.id)
      .select("-__v -createdBy")
      .lean();
    if (!foodType) {
      return res.status(404).json({ success: false, message: "Food type not found" });
    }
    res.json({ success: true, foodType });
  } catch (err) {
    console.error("[PUBLIC GET-FOODTYPE-ID]", err);
    res.status(500).json({ success: false, message: "Failed to fetch food type" });
  }
});

/* ══════════════════════════════════════════════
   TAGS ROUTES
══════════════════════════════════════════════ */

/**
 * GET /tags
 * All tags
 * Query: search (optional name filter)
 */
router.get("/tags", async (req, res) => {
  try {
    const { search } = req.query;

    const query = search?.trim()
      ? { name: { $regex: search.trim(), $options: "i" } }
      : {};

    const tags = await Tags.find(query)
      .select("-__v -createdBy")
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, tags, count: tags.length });
  } catch (err) {
    console.error("[PUBLIC GET-TAGS]", err);
    res.status(500).json({ success: false, message: "Failed to fetch tags" });
  }
});

/**
 * GET /tags/:id
 * Single tag by ID
 */
router.get("/tags/:id", async (req, res) => {
  try {
    const tag = await Tags.findById(req.params.id)
      .select("-__v -createdBy")
      .lean();
    if (!tag) {
      return res.status(404).json({ success: false, message: "Tag not found" });
    }
    res.json({ success: true, tag });
  } catch (err) {
    console.error("[PUBLIC GET-TAG-ID]", err);
    res.status(500).json({ success: false, message: "Failed to fetch tag" });
  }
});

/* ══════════════════════════════════════════════
   COMBINED (for filter UI in one call)
══════════════════════════════════════════════ */

/**
 * GET /filters
 * Returns categories + foodTypes + tags in one request
 * Useful for menu filter panel — saves 3 API calls
 */
router.get("/filters", async (req, res) => {
  try {
    const [categories, foodTypes, tags] = await Promise.all([
      Category.find().select("name slug description").sort({ name: 1 }).lean(),
      FoodType.find().select("name").sort({ name: 1 }).lean(),
      Tags.find().select("name").sort({ name: 1 }).lean(),
    ]);

    res.json({
      success: true,
      categories,
      foodTypes,
      tags,
    });
  } catch (err) {
    console.error("[PUBLIC GET-FILTERS]", err);
    res.status(500).json({ success: false, message: "Failed to fetch filters" });
  }
});

module.exports = router;