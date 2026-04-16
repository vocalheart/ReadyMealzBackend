const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    //User Reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Tiffin Service Reference
    tiffin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tiffin",
      required: true,
    },

    // Selected Plan (15 / 30 days)
    plan: {
      days: {
        type: Number,
        enum: [15, 30],
        required: true,
      },
      pricePerMeal: {
        type: Number,
        required: true,
      },
      totalAmount: {
        type: Number,
        required: true,
      },
      discount: {
        type: Number,
        default: 0,
      },
    },

    //Meal Timing
    mealTime: {
      type: String,
      enum: ["lunch", "dinner", "both"],
      required: true,
    },

    // Subscription Dates
    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    // Address (Reference)
    address: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },

    // Payment Info
    payment: {
      method: {
        type: String,
        enum: ["upi", "card", "cod"],
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "paid", "failed"],
        default: "pending",
      },
      transactionId: {
        type: String,
        default: null,
      },
    },

    // Order Status
    status: {
      type: String,
      enum: ["active", "paused", "cancelled", "completed"],
      default: "active",
    },

    // Delivery Tracking
    delivery: {
      totalMeals: Number,
      deliveredMeals: {
        type: Number,
        default: 0,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Subscription || mongoose.model("TiifinSubscription", subscriptionSchema);