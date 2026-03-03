const express = require("express");
const router = express.Router();
const FoodType = require("../models/Food-Type.js");
const protect = require("../../middleware/FullRoleMiddleware");
const authorizeRoles = require("../../middleware/roleMiddleware");

/* ===========================
   CREATE FOOD TYPE
=========================== */
router.post("/create-foodtype",protect,authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Food type name is required",
        });
      };
      const existing = await FoodType.findOne({ name });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Food type already exists",
        });
      }
      const foodType = await FoodType.create({ name, createdBy: req.user?._id || null,});
      return res.status(201).json({
        success: true,
        message: "Food type created successfully",
        foodType,
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Something went wrong",
        error: error.message,
      });
    }
  }
);

/* ===========================
   GET ALL FOOD TYPES
=========================== */
// GET ALL FOOD TYPES with search & pagination
router.get("/get-foodtypes", protect, authorizeRoles("admin", "superadmin"), async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const query = search
      ? { name: { $regex: search.trim(), $options: "i" } }
      : {};

    const skip = (Number(page) - 1) * Number(limit);

    const foodTypes = await FoodType.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await FoodType.countDocuments(query);

    res.status(200).json({
      success: true,
      foodTypes,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
      count: foodTypes.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
});

/* ===========================
   GET FOOD TYPE BY ID
=========================== */
router.get("/get-foodtype/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const foodType = await FoodType.findById(req.params.id);
      if (!foodType) {
        return res.status(404).json({
          success: false,
          message: "Food type not found",
        });
      }
      return res.status(200).json({success: true,foodType,});
    } catch (error) {
      return res.status(500).json({success: false,message: "Invalid ID or server error"});
    }
  }
);

/* ===========================
   UPDATE FOOD TYPE
=========================== */
router.put("/update-foodtype/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const { name } = req.body;
      const updated = await FoodType.findByIdAndUpdate(req.params.id,{ name },{ new: true });
      if (!updated) {
          return res.status(404).json({success: false,message: "Food type not found"});
      }
      return res.status(200).json({success: true,message: "Food type updated successfully",foodType: updated});
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Something went wrong",
      });
    }
  }
);

/* ===========================
   DELETE FOOD TYPE
=========================== */
router.delete("/delete-foodtype/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const deleted = await FoodType.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({success: false,message: "Food type not found"});
      }
      return res.status(200).json({success: true,message: "Food type deleted successfully"});
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Invalid ID or server error",
      });
    }
  }
);



module.exports = router;