const express = require('express');
const router = express.Router();

const Advertisement = require('../models/Advertisement');
const adminAuth = require('../../middleware/adminMiddleware');
const s3Config = require('../config/s3');

console.log("S3 CONFIG:", s3Config);

const upload = s3Config.upload;

const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const deleteFromS3 = async (key) => {

  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });

  return await s3.send(command);
};

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
router.put(
  '/:id',
  adminAuth,
  upload.single('image'),
  async (req, res) => {
    try {

      const ad = await Advertisement.findById(req.params.id);

      if (!ad) {
        return res.status(404).json({
          success: false,
          message: "Ad not found"
        });
      }

      // Ownership check
      if (ad.Admin.toString() !== req.admin._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not allowed"
        });
      }

      // IMAGE UPDATE
      if (req.file) {

        // DELETE OLD IMAGE FROM S3
        if (ad.image) {

          const url = new URL(ad.image);

          const oldKey = decodeURIComponent(
            url.pathname.substring(1)
          );

          console.log("OLD IMAGE KEY:", oldKey);

          await deleteFromS3(oldKey);
        }

        // NEW IMAGE URL
        const imageUrl =
          req.file.location ||
          `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.file.key}`;

        ad.image = imageUrl;
      }

      // UPDATE OTHER FIELDS
      Object.assign(ad, req.body);

      await ad.save();

      res.json({
        success: true,
        message: "Advertisement updated successfully",
        data: ad
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);



// ================= DELETE =================
router.delete('/:id', adminAuth, async (req, res) => {
  try {

    const ad = await Advertisement.findById(req.params.id);

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "Ad not found"
      });
    }

    // Ownership check
    if (ad.Admin.toString() !== req.admin._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not allowed"
      });
    }

    // DELETE IMAGE FROM S3
    if (ad.image) {

      const url = new URL(ad.image);

      const key = decodeURIComponent(
        url.pathname.substring(1)
      );

      console.log("DELETE IMAGE KEY:", key);

      await deleteFromS3(key);
    }

    // DELETE DOCUMENT
    await ad.deleteOne();

    res.json({
      success: true,
      message: "Advertisement deleted successfully"
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
module.exports = router;