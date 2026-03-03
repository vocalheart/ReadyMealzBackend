const express = require("express");
const router = express.Router();
const Tags = require("../models/Tags");
const protect = require("../../middleware/FullRoleMiddleware");
const authorizeRoles = require("../../middleware/roleMiddleware");

/* ===========================
   CREATE TAG
=========================== */
router.post("/create-tag",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {return res.status(400).json({success: false,message: "Tag name is required"});
      }
      const tag = await Tags.create({ name, createdBy: req.user?._id || null,});
      return res.status(201).json({success: true,message: "Tag created successfully",tag});
    } catch (error) {
      return res.status(500).json({success: false, message: "Something went wrong", error: error.message});
    }
  }
);

/* ===========================
   GET ALL TAGS
=========================== */
// 1. Add search functionality to GET all tags
router.get("/get-tags", protect, authorizeRoles("admin", "superadmin"), async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const query = {};

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    const skip = (Number(page) - 1) * Number(limit);
    const tags = await Tags.find(query).populate("createdBy", "name email").sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Tags.countDocuments(query);
    res.status(200).json({
      success: true,
      tags,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
      count: tags.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ===========================
   GET TAG BY ID
=========================== */
router.get("/get-tag/:id", protect, authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const tag = await Tags.findById(req.params.id).populate("createdBy", "name email");
      if (!tag) {
        return res.status(404).json({success: false,message: "Tag not found"});
      }
      return res.status(200).json({success: true,tag});
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Invalid ID or server error",
      });
    }
  }
);

/* ===========================
   UPDATE TAG BY ID
=========================== */
router.put("/update-tag/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {  
    try {
      const { name } = req.body;
      const updatedTag = await Tags.findByIdAndUpdate(req.params.id,{ name },{ new: true });
      if (!updatedTag) { return res.status(404).json({success: false,message: "Tag not found"});
      }
      return res.status(200).json({success: true, message: "Tag updated successfully", tag: updatedTag});
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Something went wrong",
      });
    }
  }
);

/* ===========================
   DELETE TAG BY ID
=========================== */
router.delete("/delete-tag/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const deletedTag = await Tags.findByIdAndDelete(req.params.id);
      if (!deletedTag) {return res.status(404).json({success: false,message: "Tag not found"});
      }
      return res.status(200).json({success: true,message: "Tag deleted successfully"});
    } catch (error) {
      return res.status(500).json({success: false,message: "Invalid ID or server error"});
    }
  }
);

module.exports = router;