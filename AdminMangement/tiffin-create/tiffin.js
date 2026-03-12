const express = require("express");
const router = express.Router();

const Tiffin = require("../models/tiffin.schema.js");

const protect = require("../../middleware/FullRoleMiddleware");
const authorizeRoles = require("../../middleware/roleMiddleware.js");

const upload = require("./config/s3");
const deleteFromS3 = require("./config/s3Delete");

/* ===========================
   CREATE TIFFIN
============================== */
router.post("/create-tiffin", protect, authorizeRoles("admin", "superadmin"),upload.single("image"),async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name || !description) {return res.status(400).json({success: false,message: "Name and description required"})}
      const tiffin = await Tiffin.create({name,description,
        image: {
          url: req.file.location,
          key: req.file.key,
        },
        createdBy: req.user?._id || null,
      });
      res.status(201).json({
        success: true,
        message: "Tiffin created successfully",
        tiffin,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/* ===========================
   UPDATE TIFFIN
=========================== */

router.put("/update-tiffin/:id",protect,authorizeRoles("admin", "superadmin"),upload.single("image"),async (req, res) => {
    try {
      const { name, description } = req.body;
      const tiffin = await Tiffin.findById(req.params.id);
      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
        });
      }
      if (req.file) {
        if (tiffin.image?.key) {
          await deleteFromS3(tiffin.image.key);
        };
        tiffin.image = {
          url: req.file.location,
          key: req.file.key,
        };
      }
      if (name) tiffin.name = name;
      if (description) tiffin.description = description;
      await tiffin.save();
      res.json({success: true,message: "Tiffin updated",tiffin});
    } catch (error) {
      res.status(500).json({success: false,message: error.message});
    }
  }
);

/* ===========================
   DELETE TIFFIN
=========================== */

router.delete("/delete-tiffin/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const tiffin = await Tiffin.findById(req.params.id);
      if (!tiffin) {
        return res.status(404).json({success: false, message: "Tiffin not found"});
      }
      if (tiffin.image?.key) {await deleteFromS3(tiffin.image.key)}
      await Tiffin.findByIdAndDelete(req.params.id);
      res.json({success: true,message: "Tiffin deleted successfully"});
    } catch (error) {
      res.status(500).json({success: false,message: error.message});
    }
  }
);

module.exports = router;