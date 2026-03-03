const mongoose = require("mongoose");

/* ================= IMAGE SCHEMA ================= */
const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
  },
  { _id: true }
);

/* ================= MEAL SCHEMA ================= */
const mealSchema = new mongoose.Schema(
  {
    /* BASIC INFO */
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    /* DISCOUNT SYSTEM */
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    discountPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* CATEGORY & RELATIONS */
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    foodType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodType",
      default: null,
    },

    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tags",
      },
    ],

    /* IMAGES */
    images: [imageSchema],

    /* AVAILABILITY */
    isAvailable: {
      type: Boolean,
      default: true,
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    /* STOCK CONTROL */
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    isUnlimitedStock: {
      type: Boolean,
      default: true,
    },

    /* RATING SYSTEM */
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    totalReviews: {
      type: Number,
      default: 0,
    },

    /* PREPARATION INFO */
    preparationTime: {
      type: Number, // in minutes
      default: 0,
    },

    servingSize: {
      type: String,
      default: "",
    },

    /* NUTRITION (Optional but Professional) */
    calories: {
      type: Number,
      default: 0,
    },

    protein: {
      type: Number,
      default: 0,
    },

    carbs: {
      type: Number,
      default: 0,
    },

    fat: {
      type: Number,
      default: 0,
    },

    /* SOFT DELETE */
    isDeleted: {
      type: Boolean,
      default: false,
    },

    /* CREATED BY */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */
mealSchema.index({ name: "text", description: "text" });
mealSchema.index({ slug: 1 });

module.exports = mongoose.model("Meal", mealSchema);