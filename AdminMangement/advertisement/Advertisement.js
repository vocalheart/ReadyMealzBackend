const express = require('express');
const router = express.Router();

const Advertisement = require('../models/Advertisement');
const { upload, deleteFromS3 } = require('../config/s3');
const adminAuth = require('../../middleware/adminMiddleware');


// ================= PUBLIC GET (ACTIVE ADS) =================
//  Always keep this ABOVE /:id
router.get('/public/active', async (req, res) => {
  try {
    const currentDate = new Date();
    const ads = await Advertisement.find({isActive: true,
      $and: [
        {
          $or: [
            { startDate: { $exists: false } },
            { startDate: { $lte: currentDate } }
          ]
        },
        {
          $or: [
            { endDate: { $exists: false } },
            { endDate: { $gte: currentDate } }
          ]
        }
      ]
    }).sort({ priority: 1 }).select('-__v');
    res.json({success: true,count: ads.length,data: ads});
  } catch (error) {
    res.status(500).json({success: false,error: error.message});
  }
});


// ================= CREATE =================
router.post('/create', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required"
      });
    }

    const ad = await Advertisement.create({
      ...req.body,
      image: req.file.location,
      Admin: req.admin._id
    });

    res.status(201).json({
      success: true,
      data: ad
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ================= GET ALL =================
router.get('/', async (req, res) => {
  try {
    const ads = await Advertisement.find()
      .populate('Admin', 'name email')
      .sort({ priority: 1 });

    res.json({
      success: true,
      data: ads
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ================= GET SINGLE =================
router.get('/:id', async (req, res) => {
  try {
    const ad = await Advertisement.findById(req.params.id)
      .populate('Admin', 'name email');

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "Ad not found"
      });
    }

    res.json({
      success: true,
      data: ad
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ================= UPDATE =================
router.put('/:id', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const ad = await Advertisement.findById(req.params.id);
    if (!ad) {
      return res.status(404).json({success: false,message: "Ad not found"});
    }
    // Ownership check
    if (ad.Admin.toString() !== req.admin._id.toString()) {
      return res.status(403).json({success: false,message: "Not allowed"});
    }
    // Image update
    if (req.file) {
      if (ad.image) {
        const oldKey = ad.image.split(".com/")[1];
        await deleteFromS3(oldKey);
      };
      ad.image = req.file.location;
    }
    // Update other fields
    Object.assign(ad, req.body);
    await ad.save();
    res.json({success: true,data: ad});
  } catch (error) {res.status(500).json({success: false,error: error.message });
  }
});


// ================= DELETE =================
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const ad = await Advertisement.findById(req.params.id);
    if (!ad) {
      return res.status(404).json({success: false,message: "Ad not found"});
    }
    // Ownership check
    if (ad.Admin.toString() !== req.admin._id.toString()) {
      return res.status(403).json({success: false,message: "Not allowed"});
    }
    // Delete image
    if (ad.image) {
      const key = ad.image.split(".com/")[1];
      await deleteFromS3(key);
    }
    await ad.deleteOne();
    res.json({success: true,message: "Deleted successfully"});
  } catch (error) {res.status(500).json({success: false,error: error.message});
  }
});
module.exports = router;