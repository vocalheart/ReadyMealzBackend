const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Subscription = require("../models/Subscription.model");
const Meal = require("../../AdminMangement/models/meal");
const protect = require("../../middleware/FullRoleMiddleware");
const authorizeRoles = require("../../middleware/roleMiddleware");

// ─────────────────────────────────────────────────────────────────────────────────
//  CREATE SUBSCRIPTION (User Only)
// ─────────────────────────────────────────────────────────────────────────────────
router.post("/create", protect, authorizeRoles("user"), async (req, res) => {
  try {
    const { mealId, planId, mealTime, startDate, deliveryAddress, paymentMethod, autoRenew } = req.body;

    // Validate required fields
    if (!mealId || !planId || !mealTime || !startDate) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: mealId, planId, mealTime, startDate",
      });
    }

    // Validate meal exists
    const meal = await Meal.findById(mealId);
    if (!meal) {
      return res.status(404).json({
        success: false,
        message: "Meal not found",
      });
    }

    // Validate meal is available
    if (!meal.isAvailable) {
      return res.status(400).json({
        success: false,
        message: "This meal is currently unavailable",
      });
    }

    // Plan configurations
    const planConfigs = {
      "3days": { days: 3, pricePerMeal: 99, label: "3 Days Plan" },
      "7days": { days: 7, pricePerMeal: 89, label: "7 Days Plan" },
      "15days": { days: 15, pricePerMeal: 79, label: "15 Days Plan" },
      "30days": { days: 30, pricePerMeal: 69, label: "30 Days Plan" },
    };

    const plan = planConfigs[planId];
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Choose from: 3days, 7days, 15days, 30days",
      });
    }

    // Validate meal time
    const validMealTimes = ["lunch", "dinner", "both"];
    if (!validMealTimes.includes(mealTime)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meal time. Choose from: lunch, dinner, both",
      });
    }

    // Validate start date
    const start = new Date(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);

    if (start < today) {
      return res.status(400).json({
        success: false,
        message: "Start date must be today or in the future",
      });
    }

    // Calculate meals and pricing
    const mealMultiplier = mealTime === "both" ? 2 : 1;
    const totalMeals = plan.days * mealMultiplier;
    const subtotal = plan.pricePerMeal * totalMeals;

    // Calculate discount
    const discountAmount = meal.discountPercentage
      ? Math.floor((subtotal * meal.discountPercentage) / 100)
      : 0;

    const totalAmount = subtotal - discountAmount;

    // Calculate end date
    const end = new Date(start);
    end.setDate(end.getDate() + plan.days);

    // Validate payment method
    const validPaymentMethods = ["upi", "card", "cod"];
    if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // Create subscription object
    const subscription = new Subscription({
      userId: req.user._id,
      mealId,
      planId,
      planLabel: plan.label,
      planDays: plan.days,
      pricePerMeal: plan.pricePerMeal,
      mealName: meal.name,
      mealImage: meal.images?.[0]?.url || null,
      mealDescription: meal.description,
      mealTime,
      startDate: start,
      endDate: end,
      deliveryAddress: {
        name: deliveryAddress?.name || "",
        phone: deliveryAddress?.phone || "",
        flat: deliveryAddress?.flat || "",
        area: deliveryAddress?.area || "",
        landmark: deliveryAddress?.landmark || "",
        pincode: deliveryAddress?.pincode || "",
      },
      paymentMethod: paymentMethod || "upi",
      subtotal,
      deliveryCharges: 0,
      discount: discountAmount,
      totalAmount,
      totalMeals,
      autoRenew: autoRenew || false,
      status: "active",
      paymentStatus: "pending",
    });

    await subscription.save();

    // Populate meal details in response
    await subscription.populate("mealId", "name description price images");

    res.status(201).json({
      success: true,
      message: "Subscription created successfully",
      subscription,
    });
  } catch (error) {
    console.error("Create subscription error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error creating subscription",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
//  GET USER'S SUBSCRIPTIONS (User Only)
// ─────────────────────────────────────────────────────────────────────────────────
router.get("/my-subscriptions", protect, authorizeRoles("user"), async (req, res) => {
  try {
    const { status = "all", page = 1, limit = 10 } = req.query;

    // Validate pagination params
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));

    const filter = { userId: new mongoose.Types.ObjectId(req.user._id) };

    // Filter by status if provided
    if (status !== "all") {
      const validStatuses = ["active", "paused", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status filter",
        });
      }
      filter.status = status;
    }

    const skip = (pageNum - 1) * limitNum;

    // Fetch subscriptions with meal details
    const subscriptions = await Subscription.find(filter)
      .populate("mealId", "name images description")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const total = await Subscription.countDocuments(filter);

    res.json({
      success: true,
      subscriptions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Get subscriptions error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching subscriptions",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
//  GET SUBSCRIPTION DETAILS (User Only)
// ─────────────────────────────────────────────────────────────────────────────────
router.get("/:subscriptionId", protect, authorizeRoles("user"), async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    // Validate subscription ID format
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription ID format",
      });
    }

    const subscription = await Subscription.findById(subscriptionId)
      .populate("mealId", "name images description price discountPercentage")
      .populate("userId", "name email phone");

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    // Check ownership - user can only view their own subscriptions
    if (subscription.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized - You can only view your own subscriptions",
      });
    }

    res.json({
      success: true,
      subscription,
    });
  } catch (error) {
    console.error("Get subscription details error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching subscription details",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// UPDATE SUBSCRIPTION STATUS (User Only - Own Subscription)
// ─────────────────────────────────────────────────────────────────────────────────
router.patch("/:subscriptionId/status",
  protect,
  authorizeRoles("user"),
  async (req, res) => {
    try {
      const { subscriptionId } = req.params;
      const { status, reason } = req.body;

      // Validate subscription ID format
      if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid subscription ID format",
        });
      }

      // Validate status
      const validStatuses = ["active", "paused", "completed", "cancelled"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Choose from: ${validStatuses.join(", ")}`,
        });
      }

      const subscription = await Subscription.findById(subscriptionId);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "Subscription not found",
        });
      }

      // Check ownership
      if (subscription.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized - You can only manage your own subscriptions",
        });
      }

      // Update status
      subscription.status = status;

      if (status === "cancelled") {
        subscription.cancelledAt = new Date();
        subscription.cancelReason = reason || "User cancelled subscription";
      }

      if (status === "paused") {
        subscription.pausedAt = new Date();
      }

      if (status === "active" && subscription.pausedAt) {
        subscription.pausedAt = null;
      }

      await subscription.save();

      await subscription.populate("mealId", "name images");

      res.json({
        success: true,
        message: `Subscription ${status} successfully`,
        subscription,
      });
    } catch (error) {
      console.error("Update subscription status error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error updating subscription status",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────────
//  MARK MEAL AS DELIVERED (Admin Only)
// ─────────────────────────────────────────────────────────────────────────────────
router.patch("/:subscriptionId/mark-delivered", protect, authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { subscriptionId } = req.params;

      // Validate subscription ID format
      if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid subscription ID format",
        });
      }

      const subscription = await Subscription.findById(subscriptionId);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "Subscription not found",
        });
      }

      // Check if subscription is active
      if (subscription.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "Can only mark meals as delivered for active subscriptions",
        });
      }

      // Check if all meals have been delivered
      if (subscription.mealsDelivered >= subscription.totalMeals) {
        return res.status(400).json({
          success: false,
          message: "All meals have already been delivered for this subscription",
        });
      }

      // Mark meal as delivered
      subscription.mealsDelivered += 1;

      // Check if all meals are now delivered
      if (subscription.mealsDelivered === subscription.totalMeals) {
        subscription.status = "completed";
      }

      await subscription.save();

      await subscription.populate("mealId", "name images");

      res.json({
        success: true,
        message: `Meal ${subscription.mealsDelivered} of ${subscription.totalMeals} marked as delivered`,
        subscription,
      });
    } catch (error) {
      console.error("Mark delivered error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error marking meal as delivered",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────────
//  GET SUBSCRIPTION STATISTICS (User Only - Their Own Stats)
// ─────────────────────────────────────────────────────────────────────────────────
router.get("/stats/overview", protect, authorizeRoles("user"), async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const stats = await Subscription.aggregate([
      {
        $match: { userId },
      },
      {
        $group: {
          _id: null,
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          pausedCount: {
            $sum: { $cond: [{ $eq: ["$status", "paused"] }, 1, 0] },
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          totalSpent: { $sum: "$totalAmount" },
          totalMealsOrdered: { $sum: "$totalMeals" },
          totalMealsDelivered: { $sum: "$mealsDelivered" },
        },
      },
    ]);
    const overview = stats[0] || {
      activeCount: 0,
      pausedCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      totalSpent: 0,
      totalMealsOrdered: 0,
      totalMealsDelivered: 0,
    };

    res.json({
      success: true,
      stats: overview,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching statistics",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// ADMIN: GET ALL SUBSCRIPTIONS (Admin/SuperAdmin Only)
// ─────────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/all-subscriptions",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { status = "all", page = 1, limit = 10, userId } = req.query;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));

      const filter = {};

      // Filter by user if provided
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        filter.userId = new mongoose.Types.ObjectId(userId);
      }

      // Filter by status
      if (status !== "all") {
        const validStatuses = ["active", "paused", "completed", "cancelled"];
        if (validStatuses.includes(status)) {
          filter.status = status;
        }
      }

      const skip = (pageNum - 1) * limitNum;

      const subscriptions = await Subscription.find(filter)
        .populate("mealId", "name images")
        .populate("userId", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      const total = await Subscription.countDocuments(filter);

      res.json({
        success: true,
        subscriptions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Get all subscriptions error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error fetching subscriptions",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────────
// ADMIN: GET SUBSCRIPTION STATISTICS (Admin/SuperAdmin Only)
// ─────────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/stats/overview",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const stats = await Subscription.aggregate([
        {
          $group: {
            _id: null,
            totalSubscriptions: { $sum: 1 },
            activeCount: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
            },
            pausedCount: {
              $sum: { $cond: [{ $eq: ["$status", "paused"] }, 1, 0] },
            },
            completedCount: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            cancelledCount: {
              $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
            },
            totalRevenue: { $sum: "$totalAmount" },
            totalMealsDelivered: { $sum: "$mealsDelivered" },
            totalMealsPending: {
              $sum: {
                $subtract: ["$totalMeals", "$mealsDelivered"],
              },
            },
            avgMealPrice: { $avg: "$pricePerMeal" },
          },
        },
      ]);

      const overview = stats[0] || {
        totalSubscriptions: 0,
        activeCount: 0,
        pausedCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        totalRevenue: 0,
        totalMealsDelivered: 0,
        totalMealsPending: 0,
        avgMealPrice: 0,
      };

      res.json({
        success: true,
        stats: overview,
      });
    } catch (error) {
      console.error("Get admin stats error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error fetching statistics",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────────
// ADMIN: UPDATE PAYMENT STATUS (Admin/SuperAdmin Only)
// ─────────────────────────────────────────────────────────────────────────────────
router.patch(
  "/:subscriptionId/payment-status",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { subscriptionId } = req.params;
      const { paymentStatus, transactionId } = req.body;

      if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid subscription ID format",
        });
      }

      const validPaymentStatuses = ["pending", "completed", "failed"];
      if (!paymentStatus || !validPaymentStatuses.includes(paymentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid payment status. Choose from: ${validPaymentStatuses.join(", ")}`,
        });
      }

      const subscription = await Subscription.findById(subscriptionId);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "Subscription not found",
        });
      }

      subscription.paymentStatus = paymentStatus;
      if (transactionId) {
        subscription.transactionId = transactionId;
      }

      await subscription.save();

      await subscription.populate("mealId", "name images");

      res.json({
        success: true,
        message: "Payment status updated successfully",
        subscription,
      });
    } catch (error) {
      console.error("Update payment status error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error updating payment status",
      });
    }
  }
);

module.exports = router;