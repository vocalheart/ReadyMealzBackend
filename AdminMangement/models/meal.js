const mongoose = require("mongoose");

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

const mealSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    //  Food Type (Single)
    foodType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodType",
      default: null,
    },

    //  Tags (Multiple)
    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tags",
      },
    ],

    images: [imageSchema],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Meal", mealSchema);