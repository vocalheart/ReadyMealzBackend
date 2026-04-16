const express = require("express");
const router = express.Router();

const Subscription = require("../models/subscriptionSchema");
const Tiffin = require("../models/tiffin.schema");
const Address = require("../../UserMangement/models/Address.schema");

const authMiddleware = require("../../middleware/authMiddleware");

/* ───────── Helper ───────── */
const calculateEndDate = (startDate, days) => {
  const date = new Date(startDate);
  date.setDate(date.getDate() + days - 1);
  return date;
};

/* ─────────────────────────────────────────────
   CREATE SUBSCRIPTION
───────────────────────────────────────────── */
router.post("/tiffin-subscription", authMiddleware, async (req, res) => {
  try {
    const { tiffin, plan, mealTime, startDate, address, payment } = req.body;

    if (!tiffin || !plan || !mealTime || !startDate || !address || !payment) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (![15, 30].includes(plan.days)) {
      return res.status(400).json({
        success: false,
        message: "Only 15 or 30 days plan allowed",
      });
    }

    const tiffinExists = await Tiffin.findById(tiffin);
    if (!tiffinExists) {
      return res.status(404).json({
        success: false,
        message: "Tiffin service not found",
      });
    }

    const addressExists = await Address.findById(address);
    if (!addressExists) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    const existing = await Subscription.findOne({
      user: req.user.id,
      tiffin,
      status: "active",
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You already have an active subscription",
      });
    }

    const endDate = calculateEndDate(startDate, plan.days);
    const mealMultiplier = mealTime === "both" ? 2 : 1;
    const totalMeals = plan.days * mealMultiplier;

    const paymentData = {
      method: payment.method,
      status: payment.method === "cod" ? "pending" : "paid",
      transactionId: payment.transactionId || null,
    };

    const subscription = await Subscription.create({
      user: req.user.id,
      tiffin,
      plan,
      mealTime,
      startDate,
      endDate,
      address,
      payment: paymentData,
      delivery: { totalMeals },
    });

    const populated = await subscription.populate([
      { path: "tiffin", select: "name pricing image" },
      { path: "address" },
    ]);

    res.status(201).json({
      success: true,
      message: "Subscription created successfully",
      data: populated,
    });
  } catch (error) {
    console.error("Subscription Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────
   GET ALL SUBSCRIPTIONS (USER) - WITH PAGINATION
───────────────────────────────────────────── */
router.get("/my-subscriptions", authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    // Count total subscriptions
    const total = await Subscription.countDocuments({ user: req.user.id });

    const subscriptions = await Subscription.find({ user: req.user.id })
      .populate("tiffin", "name pricing image")
      .populate("address")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      total,
      totalPages,
      currentPage: page,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      data: subscriptions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ─────────────────────────────────────────────
    GET SUBSCRIPTION BY ID
───────────────────────────────────────────── */
router.get("/subscription/:id", authMiddleware, async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id)
      .populate("tiffin", "name pricing image description")
      .populate("address");

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    if (subscription.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    res.status(200).json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ─────────────────────────────────────────────
   CANCEL SUBSCRIPTION
───────────────────────────────────────────── */
router.put("/subscription/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    if (subscription.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    subscription.status = "cancelled";
    await subscription.save();

    res.status(200).json({
      success: true,
      message: "Subscription cancelled successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;