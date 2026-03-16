const express = require("express");
const router = express.Router();
const Tiffin = require("../models/tiffin.schema");

const protect = require("../../middleware/FullRoleMiddleware");
const authorizeRoles = require("../../middleware/roleMiddleware");

const upload = require("./config/s3");
const deleteFromS3 = require("./config/s3Delete");

/* ===========================
   GET ALL--TIFFINS (ADMIN)
=========================== */

router.get("/tiffins",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { status, page = 1, limit = 15, search, sortBy = "createdAt" } =
        req.query;

      const filter = {};

      if (status) filter.status = status;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (page - 1) * limit;

      const tiffins = await Tiffin.find(filter).populate("createdBy", "name email").populate("updatedBy", "name email")
        .sort({ [sortBy]: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalCount = await Tiffin.countDocuments(filter);

      res.json({
        success: true,
        data: tiffins,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit),
        },
        message: "All tiffins fetched successfully",
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
   GET SINGLE TIFFIN (ADMIN)
=========================== */

router.get(
  "/tiffin/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const tiffin = await Tiffin.findById(req.params.id)
        .populate("createdBy", "name email role")
        .populate("updatedBy", "name email role");

      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
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
  }
);

/* ===========================
   CREATE TIFFIN (ADMIN)
=========================== */

router.post(
  "/create-tiffin",
  protect,
  authorizeRoles("admin", "superadmin"),
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        name,
        description,
        htmlDescription,
        pricing,
        service,
        menuItems,
        dietary,
        tags,
      } = req.body;

      // Validation
      if (!name || !description) {
        return res.status(400).json({
          success: false,
          message: "Name and description are required",
        });
      }

      if (!pricing) {
        return res.status(400).json({
          success: false,
          message: "Pricing information is required",
        });
      }

      // Parse JSON fields
      let parsedPricing = pricing;
      let parsedService = service || {};
      let parsedMenuItems = menuItems || [];
      let parsedDietary = dietary || {};
      let parsedTags = tags || [];

      if (typeof pricing === "string") parsedPricing = JSON.parse(pricing);
      if (typeof service === "string") parsedService = JSON.parse(service);
      if (typeof menuItems === "string") parsedMenuItems = JSON.parse(menuItems);
      if (typeof dietary === "string") parsedDietary = JSON.parse(dietary);
      if (typeof tags === "string")
        parsedTags = tags.split(",").map((t) => t.trim());

      // Validate pricing
      if (!parsedPricing.basePrice) {
        return res.status(400).json({
          success: false,
          message: "Base price is required in pricing",
        });
      }

      const tiffin = await Tiffin.create({
        name,
        description,
        htmlDescription: htmlDescription || null,
        image: req.file
          ? {
              url: req.file.location,
              key: req.file.key,
            }
          : null,
        pricing: {
          basePrice: parsedPricing.basePrice,
          currency: parsedPricing.currency || "INR",
          tiers: parsedPricing.tiers || [],
          bulkDiscount: parsedPricing.bulkDiscount || null,
        },
        service: {
          deliveryDays: parsedService.deliveryDays || [],
          deliveryTime: parsedService.deliveryTime || {},
          minDeliveryDistance: parsedService.minDeliveryDistance || 0,
          maxDeliveryDistance: parsedService.maxDeliveryDistance || 50,
          isAvailable: parsedService.isAvailable !== false,
          prepareTime: parsedService.prepareTime || 30,
        },
        menuItems: parsedMenuItems,
        dietary: {
          isVegetarian: parsedDietary.isVegetarian || false,
          isVegan: parsedDietary.isVegan || false,
          isJain: parsedDietary.isJain || false,
          allergens: parsedDietary.allergens || [],
          noOfServings: parsedDietary.noOfServings || 1,
        },
        tags: parsedTags,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        status: "active",
      });

      res.status(201).json({
        success: true,
        message: "Tiffin created successfully",
        data: tiffin,
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
   UPDATE TIFFIN (ADMIN)
=========================== */

router.put("/update-tiffin/:id",protect,authorizeRoles("admin", "superadmin"), upload.single("image"),async (req, res) => {
    try {
      const {
        name,
        description,
        htmlDescription,
        pricing,
        service,
        menuItems,
        dietary,
        tags,
        status,
      } = req.body;

      const tiffin = await Tiffin.findById(req.params.id);

      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
        });
      }

      // Update main image
      if (req.file) {
        if (tiffin.image?.key) {
          await deleteFromS3(tiffin.image.key);
        }
        tiffin.image = {
          url: req.file.location,
          key: req.file.key,
        };
      }

      // Update basic fields
      if (name) tiffin.name = name;
      if (description) tiffin.description = description;
      if (htmlDescription !== undefined) tiffin.htmlDescription = htmlDescription;
      if (status && ["active", "inactive", "archived"].includes(status)) {
        tiffin.status = status;
      }

      // Update pricing
      if (pricing) {
        const parsedPricing =
          typeof pricing === "string" ? JSON.parse(pricing) : pricing;
        tiffin.pricing = {
          basePrice: parsedPricing.basePrice || tiffin.pricing.basePrice,
          currency: parsedPricing.currency || tiffin.pricing.currency,
          tiers: parsedPricing.tiers || tiffin.pricing.tiers,
          bulkDiscount:
            parsedPricing.bulkDiscount || tiffin.pricing.bulkDiscount,
        };
      }

      // Update service
      if (service) {
        const parsedService =
          typeof service === "string" ? JSON.parse(service) : service;
        tiffin.service = {
          ...tiffin.service,
          ...parsedService,
        };
      }

      // Update menu items
      if (menuItems) {
        const parsedMenuItems =
          typeof menuItems === "string" ? JSON.parse(menuItems) : menuItems;
        tiffin.menuItems = parsedMenuItems;
      }

      // Update dietary
      if (dietary) {
        const parsedDietary =
          typeof dietary === "string" ? JSON.parse(dietary) : dietary;
        tiffin.dietary = {
          ...tiffin.dietary,
          ...parsedDietary,
        };
      }

      // Update tags
      if (tags) {
        const parsedTags =
          typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : tags;
        tiffin.tags = parsedTags;
      }

      tiffin.updatedBy = req.user._id;
      await tiffin.save();

      res.json({
        success: true,
        message: "Tiffin updated successfully",
        data: tiffin,
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
   DELETE TIFFIN (ADMIN)
=========================== */

router.delete(
  "/delete-tiffin/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const tiffin = await Tiffin.findById(req.params.id);

      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
        });
      }

      // Delete main image
      if (tiffin.image?.key) {
        await deleteFromS3(tiffin.image.key);
      }

      // Delete gallery images
      if (tiffin.gallery && tiffin.gallery.length > 0) {
        for (const img of tiffin.gallery) {
          if (img.key) {
            await deleteFromS3(img.key);
          }
        }
      }

      await Tiffin.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: "Tiffin deleted successfully",
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
   UPLOAD GALLERY IMAGES (ADMIN)
=========================== */

router.post(
  "/:id/upload-gallery",
  protect,
  authorizeRoles("admin", "superadmin"),
  upload.array("images", 10),
  async (req, res) => {
    try {
      const tiffin = await Tiffin.findById(req.params.id);

      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        });
      }

      const newImages = req.files.map((file) => ({
        url: file.location,
        key: file.key,
      }));

      tiffin.gallery.push(...newImages);
      tiffin.updatedBy = req.user._id;
      await tiffin.save();

      res.json({
        success: true,
        message: "Gallery updated successfully",
        data: tiffin,
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
   DELETE GALLERY IMAGE (ADMIN)
=========================== */

router.delete(
  "/:id/gallery/:imageKey",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { id, imageKey } = req.params;
      const tiffin = await Tiffin.findById(id);

      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
        });
      }

      const imageIndex = tiffin.gallery.findIndex((img) => img.key === imageKey);

      if (imageIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Image not found",
        });
      }

      const imageToDelete = tiffin.gallery[imageIndex];
      if (imageToDelete.key) {
        await deleteFromS3(imageToDelete.key);
      }

      tiffin.gallery.splice(imageIndex, 1);
      tiffin.updatedBy = req.user._id;
      await tiffin.save();

      res.json({
        success: true,
        message: "Image deleted successfully",
        data: tiffin,
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
   UPDATE PRICING (ADMIN)
=========================== */

router.patch(
  "/:id/pricing",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { basePrice, currency, tiers, bulkDiscount } = req.body;
      const tiffin = await Tiffin.findById(req.params.id);

      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
        });
      }

      if (basePrice) tiffin.pricing.basePrice = basePrice;
      if (currency) tiffin.pricing.currency = currency;
      if (tiers) tiffin.pricing.tiers = tiers;
      if (bulkDiscount) tiffin.pricing.bulkDiscount = bulkDiscount;

      tiffin.updatedBy = req.user._id;
      await tiffin.save();

      res.json({
        success: true,
        message: "Pricing updated successfully",
        data: tiffin.pricing,
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
   UPDATE SERVICE (ADMIN)
=========================== */

router.patch(
  "/:id/service",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { deliveryDays, deliveryTime, minDistance, maxDistance, isAvailable, prepareTime } = req.body;
      const tiffin = await Tiffin.findById(req.params.id);

      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
        });
      }

      if (deliveryDays) tiffin.service.deliveryDays = deliveryDays;
      if (deliveryTime) tiffin.service.deliveryTime = deliveryTime;
      if (minDistance !== undefined) tiffin.service.minDeliveryDistance = minDistance;
      if (maxDistance !== undefined) tiffin.service.maxDeliveryDistance = maxDistance;
      if (isAvailable !== undefined) tiffin.service.isAvailable = isAvailable;
      if (prepareTime) tiffin.service.prepareTime = prepareTime;

      tiffin.updatedBy = req.user._id;
      await tiffin.save();

      res.json({
        success: true,
        message: "Service details updated successfully",
        data: tiffin.service,
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
   CHANGE TIFFIN STATUS (ADMIN)
=========================== */

router.patch(
  "/:id/status",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!["active", "inactive", "archived"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }

      const tiffin = await Tiffin.findByIdAndUpdate(
        req.params.id,
        { status, updatedBy: req.user._id },
        { new: true }
      );

      if (!tiffin) {
        return res.status(404).json({
          success: false,
          message: "Tiffin not found",
        });
      }

      res.json({
        success: true,
        message: `Tiffin status changed to ${status}`,
        data: tiffin,
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
   GET TIFFIN STATISTICS (ADMIN)
=========================== */

router.get(
  "/stats/overview",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const totalTiffins = await Tiffin.countDocuments();
      const activeTiffins = await Tiffin.countDocuments({ status: "active" });
      const inactiveTiffins = await Tiffin.countDocuments({ status: "inactive" });
      const archivedTiffins = await Tiffin.countDocuments({
        status: "archived",
      });

      const avgPrice = await Tiffin.aggregate([
        { $match: { status: "active" } },
        { $group: { _id: null, avgPrice: { $avg: "$pricing.basePrice" } } },
      ]);

      const topRated = await Tiffin.find({ status: "active" })
        .sort({ "ratings.average": -1 })
        .limit(5)
        .select("name ratings.average pricing.basePrice");

      res.json({
        success: true,
        data: {
          totalTiffins,
          activeTiffins,
          inactiveTiffins,
          archivedTiffins,
          averagePrice: avgPrice[0]?.avgPrice || 0,
          topRatedTiffins: topRated,
        },
        message: "Statistics fetched successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

module.exports = router;