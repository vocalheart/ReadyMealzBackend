const mongoose = require("mongoose");
const { string } = require('zod');

const subscriptionSchema = new mongoose.Schema(
  {
    // ─── User & Meal References ─────────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    mealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meal",
      required: true,
      index: true,
    },

    // ─── Plan Details ───────────────────────────────────────────
    planId: {
      type: String,
      enum: ["3days", "7days", "15days", "30days"],
      required: true,
    },
    planLabel: {
      type: String,
      required: true, // e.g., "7 Days Plan"
    },
    planDays: {
      type: Number,
      required: true, // e.g., 7
    },
    pricePerMeal: {
      type: Number,
      required: true, // e.g., 89
    },
    // ─── Meal Snapshot (at time of subscription) ────────────────
    mealName: String,
    mealImage: String,
    mealDescription: String,
    // ─── User Preferences ───────────────────────────────────────
    mealTime: {
      type: String,
      enum: ["lunch", "dinner", "both"],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
    },

    // ─── Delivery Address ────────────────────────────────────────
    deliveryAddress: {
      name: {
        type: string,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      flat: {
        type: String,
        required: true,
      },
      area: {
        type: String,
        required: true,
      },
      landmark: String,
      pincode: {
        type: String,
        required: true,
      },
    },
    // ─── Payment Details ────────────────────────────────────────
    paymentMethod: {
      type: String,
      enum: ["upi", "card", "cod"],
      required: true,
      default: "upi",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    transactionId: {
      type: String,
      sparse: true, // Allow null values
    },

    // ─── Pricing Details ────────────────────────────────────────
    subtotal: {
      type: Number,
      required: true,
    },
    deliveryCharges: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },

    // ─── Subscription Status ────────────────────────────────────
    status: {
      type: String,
      enum: ["active", "paused", "completed", "cancelled"],
      default: "active",
      index: true,
    },
    cancelledAt: Date,
    cancelReason: String,
    pausedAt: Date,

    // ─── Meal Delivery Tracking ─────────────────────────────────
    mealsDelivered: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalMeals: {
      type: Number,
      required: true,
    },

    // ─── Additional Features ────────────────────────────────────
    notes: String,
    autoRenew: {
      type: Boolean,
      default: false,
    },
    isRenewed: {
      type: Boolean,
      default: false,
    },

    // ─── Admin Tracking ─────────────────────────────────────────
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      sparse: true,
    },

    // ─── Timestamps ─────────────────────────────────────────────
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes for Performance ────────────────────────────────
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ userId: 1, createdAt: -1 });
subscriptionSchema.index({ startDate: 1 });
subscriptionSchema.index({ status: 1, paymentStatus: 1 });
subscriptionSchema.index({ mealId: 1 });

// ─── Virtual for remaining meals ────────────────────────────
subscriptionSchema.virtual("mealsRemaining").get(function () {
  return Math.max(0, this.totalMeals - this.mealsDelivered);
});

// ─── Virtual for progress percentage ────────────────────────
subscriptionSchema.virtual("deliveryProgress").get(function () {
  if (this.totalMeals === 0) return 0;
  return Math.round((this.mealsDelivered / this.totalMeals) * 100);
});

// ─── Pre-save middleware to update updatedAt ────────────────
subscriptionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// ─── Method to check if subscription is active ──────────────
subscriptionSchema.methods.isActive = function () {
  return (
    this.status === "active" &&
    this.paymentStatus === "completed" &&
    new Date() >= new Date(this.startDate) &&
    new Date() <= new Date(this.endDate)
  );
};

// ─── Method to get subscription summary ────────────────────
subscriptionSchema.methods.getSummary = function () {
  return {
    _id: this._id,
    mealName: this.mealName,
    planLabel: this.planLabel,
    mealTime: this.mealTime,
    status: this.status,
    mealsDelivered: this.mealsDelivered,
    totalMeals: this.totalMeals,
    deliveryProgress: this.deliveryProgress,
    mealsRemaining: this.mealsRemaining,
    totalAmount: this.totalAmount,
    startDate: this.startDate,
    endDate: this.endDate,
  };
};

// ─── Ensure virtuals are included in JSON ──────────────────
subscriptionSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Subscription", subscriptionSchema);