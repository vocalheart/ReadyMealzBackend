const express = require('express');
const router = express.Router();

const { upload } = require('../config/s3');
const deleteFromS3 = require('../config/s3Delete');
const BulkOrder = require('../models/bulkorderSchema');

const protect = require("../.././middleware/FullRoleMiddleware");
const authorizeRoles = require("../.././middleware/roleMiddleware");


/* =================================================
   CREATE BULK ORDER
================================================= */

router.post("/create",protect,authorizeRoles("superadmin", "admin"), upload.array("images", 5),async (req, res) => {
    try {
      const {name, description,   price,   minQuantity,
        maxQuantity,
        category,
        preparationTime
      } = req.body;
      const images = req.files.map(file => ({
        url: file.location,
        key: file.key
      }));
      const bulk = await BulkOrder.create({name,description,price,minQuantity,maxQuantity,category,preparationTime,imageUrl: images,
        createdBy: req.user._id
      });
      res.status(201).json({success: true, message: "Bulk Order Created", data: bulk });
    } catch (error) {
      res.status(500).json({success: false,message: error.message});
    }
  }
);



/* =================================================
   GET ALL BULK ORDERS
================================================= */

router.get("/", async (req, res) => {
  try {
    const data = await BulkOrder.find().sort({ createdAt: -1 });
    res.json({success: true,count: data.length,data});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* =================================================
   GET BULK ORDER BY ID
================================================= */
router.get("/:id", async (req, res) => {
  try {
    const data = await BulkOrder.findById(req.params.id);
    if (!data) {return res.status(404).json({success: false,message: "Bulk order not found"});}
    res.json({success: true,data});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



/* =================================================
   UPDATE BULK ORDER
================================================= */
router.put("/update/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const bulk = await BulkOrder.findByIdAndUpdate(req.params.id,req.body,{ new: true });
      res.json({success: true,message: "Bulk Order Updated",data: bulk });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);
/* =================================================
   UPDATE IMAGE
================================================= */
router.put("/update-image/:id",protect,authorizeRoles("admin", "superadmin"),upload.array("images", 5),async (req, res) => {
    try {
      const bulk = await BulkOrder.findById(req.params.id);
      if (!bulk) {
        return res.status(404).json({success: false,message: "Bulk order not found"});
      }
      const images = req.files.map(file => ({url: file.location,key: file.key}));
      bulk.imageUrl.push(...images);
      await bulk.save();
      res.json({success: true,message: "Images Updated",data: bulk});
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);



/* =================================================
   DELETE SINGLE IMAGE
================================================= */

router.delete("/delete-image/:id/:imageId", protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const bulk = await BulkOrder.findById(req.params.id);
      const image = bulk.imageUrl.id(req.params.imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "Image not found"
        });
      }
      await deleteFromS3(image.key);
      image.remove();
      await bulk.save();
      res.json({success: true, message: "Image Deleted"});
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);



/* =================================================
   DELETE BULK ORDER
================================================= */

router.delete("/delete/:id",protect,authorizeRoles("admin", "superadmin"),async (req, res) => {
    try {
      const bulk = await BulkOrder.findById(req.params.id);
      if (!bulk) {
        return res.status(404).json({
          success: false,
          message: "Bulk order not found"
        });
      }
      for (const img of bulk.imageUrl) {
        await deleteFromS3(img.key);
      }
      await bulk.deleteOne();
      res.json({success: true,message: "Bulk Order Deleted"});
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/* ============================================
   PUBLIC - GET ALL BULK ORDERS
============================================ */

router.get('/public', async (req, res) => {
  try {
    const data = await bulkOrderSchema.find({ isAvailable: true }).sort({ createdAt: -1 });
    res.status(200).json({success: true,count: data.length,data});
  } catch (error) {
    res.status(500).json({success: false,message: error.message});
  }
});

/* ============================================
   PUBLIC - GET BULK ORDER BY ID
============================================ */
router.get('/public/:id', async (req, res) => {
  try {
    const bulkOrder = await bulkOrderSchema.findById(req.params.id);
    if (!bulkOrder) {return res.status(404).json({success: false,message: "Bulk order not found"}) }
    res.status(200).json({success: true,data: bulkOrder});
  } catch (error) {
    res.status(500).json({success: false,message: error.message });
  }
});

module.exports = router;