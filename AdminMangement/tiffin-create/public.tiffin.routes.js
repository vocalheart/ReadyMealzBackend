const express = require("express");
const router = express.Router();
const Tiffin = require("../models/tiffin.schema");

/* ===========================
   GET ALL TIFFINS (PUBLIC)
=========================== */

router.get("/tiffins", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      minPrice,
      maxPrice,
      tags,
      vegetarian,
      vegan,
      jain,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // Build filter object
    const filter = { status: "active" };

    // Price range filter
    if (minPrice || maxPrice) {
      filter["pricing.basePrice"] = {};
      if (minPrice) filter["pricing.basePrice"].$gte = parseFloat(minPrice);
      if (maxPrice) filter["pricing.basePrice"].$lte = parseFloat(maxPrice);
    }

    // Tags filter
    if (tags) {
      const tagArray = typeof tags === "string" ? tags.split(",") : tags;
      filter.tags = { $in: tagArray };
    }

    // Dietary filters
    if (vegetarian === "true") filter["dietary.isVegetarian"] = true;
    if (vegan === "true") filter["dietary.isVegan"] = true;
    if (jain === "true") filter["dietary.isJain"] = true;

    // Sorting
    const sortOrder = order === "asc" ? 1 : -1;
    const sortObj = { [sortBy]: sortOrder };

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Query
    const tiffins = await Tiffin.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .select("-htmlDescription -createdBy -updatedBy -__v"); // Exclude sensitive fields

    // Get total count for pagination
    const totalCount = await Tiffin.countDocuments(filter);

    res.json({
      success: true,
      data: tiffins,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit),
      },
      message: "Tiffins fetched successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ===========================
   GET SINGLE TIFFIN (PUBLIC)
=========================== */

router.get("/tiffin/:id", async (req, res) => {
  try {
    const tiffin = await Tiffin.findById(req.params.id).select(
      "-createdBy -updatedBy -__v"
    );

    if (!tiffin) {
      return res.status(404).json({
        success: false,
        message: "Tiffin not found",
      });
    }

    // Check if tiffin is active
    if (tiffin.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "This tiffin is currently unavailable",
      });
    }

    res.json({
      success: true,
      data: tiffin,
      message: "Tiffin fetched successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Invalid tiffin ID",
    });
  }
});

/* ===========================
   SEARCH TIFFINS (PUBLIC)
=========================== */

router.post("/search", async (req, res) => {
  try {
    const {
      searchTerm,
      tags,
      minPrice,
      maxPrice,
      vegetarian,
      vegan,
      jain,
      deliveryDays,
      available = true,
      page = 1,
      limit = 10,
    } = req.body;

    const filter = { status: "active" };
    // Search by name or description
    if (searchTerm) {
      filter.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { description: { $regex: searchTerm, $options: "i" } },
        { tags: { $regex: searchTerm, $options: "i" } },
      ];
    }
    // Price filtering
    if (minPrice || maxPrice) {
      filter["pricing.basePrice"] = {};
      if (minPrice) filter["pricing.basePrice"].$gte = minPrice;
      if (maxPrice) filter["pricing.basePrice"].$lte = maxPrice;
    }
    // Tags filtering
    if (tags && tags.length > 0) {
      filter.tags = { $in: tags };
    }
    // Dietary preferences
    if (vegetarian) filter["dietary.isVegetarian"] = true;
    if (vegan) filter["dietary.isVegan"] = true;
    if (jain) filter["dietary.isJain"] = true;
    // Delivery days
    if (deliveryDays && deliveryDays.length > 0) {
      filter["service.deliveryDays"] = { $in: deliveryDays };
    }
    // Availability
    if (available) filter["service.isAvailable"] = true;
    // Pagination
    const skip = (page - 1) * limit;
    const tiffins = await Tiffin.find(filter).skip(skip).limit(limit).select("-htmlDescription -createdBy -updatedBy -__v");
    const totalCount = await Tiffin.countDocuments(filter);

    res.json({
      success: true,
      data: tiffins,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
      },
      message: "Search completed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ===========================
   GET TIFFINS BY PRICE RANGE
=========================== */

router.get("/price-range/:minPrice/:maxPrice", async (req, res) => {
  try {
    const { minPrice, maxPrice } = req.params;

    const tiffins = await Tiffin.find({
      status: "active",
      "pricing.basePrice": {
        $gte: parseFloat(minPrice),
        $lte: parseFloat(maxPrice),
      },
    })
      .select("-htmlDescription -createdBy -updatedBy -__v")
      .sort({ "pricing.basePrice": 1 });

    res.json({
      success: true,
      data: tiffins,
      priceRange: {
        min: parseFloat(minPrice),
        max: parseFloat(maxPrice),
      },
      message: "Tiffins fetched successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ===========================
   GET TIFFINS BY TAGS
=========================== */

router.get("/tags/:tag", async (req, res) => {
  try {
    const { tag } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const tiffins = await Tiffin.find({
      status: "active",
      tags: { $in: [tag] },
    })
      .skip(skip)
      .limit(parseInt(limit))
      .select("-htmlDescription -createdBy -updatedBy -__v");

    const totalCount = await Tiffin.countDocuments({
      status: "active",
      tags: { $in: [tag] },
    });

    res.json({
      success: true,
      data: tiffins,
      tag,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
      },
      message: "Tiffins fetched successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ===========================
   GET AVAILABLE TIFFINS
=========================== */

router.get("/available/today", async (req, res) => {
  try {
    const today = new Date().toLocaleString("en-US", { weekday: "long" });

    const tiffins = await Tiffin.find({
      status: "active",
      "service.isAvailable": true,
      "service.deliveryDays": today,
    })
      .select("-htmlDescription -createdBy -updatedBy -__v")
      .sort({ "ratings.average": -1 });

    res.json({
      success: true,
      data: tiffins,
      deliveryDay: today,
      message: "Available tiffins fetched successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ===========================
   GET PRICING OPTIONS
=========================== */

router.get("/:id/pricing", async (req, res) => {
  try {
    const tiffin = await Tiffin.findById(req.params.id).select(
      "name pricing ratings"
    );

    if (!tiffin) {
      return res.status(404).json({
        success: false,
        message: "Tiffin not found",
      });
    }

    res.json({
      success: true,
      data: {
        name: tiffin.name,
        basePrice: tiffin.pricing.basePrice,
        currency: tiffin.pricing.currency,
        tiers: tiffin.pricing.tiers,
        bulkDiscount: tiffin.pricing.bulkDiscount,
        rating: tiffin.ratings.average,
        totalReviews: tiffin.ratings.totalReviews,
      },
      message: "Pricing details fetched successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;