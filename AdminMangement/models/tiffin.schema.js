const mongoose = require("mongoose");

const TiffinSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    description: {
      type: String,
      required: true,
    },

    // Rich HTML description for detailed service info
    htmlDescription: {
      type: String,
      default: null,
    },

    image: {
      url: String,
      key: String,
    },

    // Gallery images for multiple photos
    gallery: [
      {
        url: String,
        key: String,
      },
    ],

    // Pricing structure
    pricing: {
      basePrice: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        default: "INR",
        enum: ["INR", "USD", "EUR"],
      },
      // Pricing tiers for different quantities/subscriptions
      tiers: [
        {
          name: {
            type: String,
            enum: ["daily", "weekly", "monthly"],
          },
          price: {
            type: Number,
            required: true,
            min: 0,
          },
          discount: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
          },
        },
      ],
      // Discounts for bulk orders
      bulkDiscount: {
        minQuantity: Number,
        discountPercentage: {
          type: Number,
          min: 0,
          max: 100,
        },
      },
    },

    // Service details
    service: {
      deliveryDays: [
        {
          type: String,
          enum: [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ],
        },
      ],
      deliveryTime: {
        start: String, // "08:00 AM"
        end: String, // "10:00 AM"
      },
      minDeliveryDistance: Number, // in km
      maxDeliveryDistance: Number, // in km
      isAvailable: {
        type: Boolean,
        default: true,
      },
      prepareTime: {
        type: Number,
        default: 30, // in minutes
      },
    },

    // Menu items included in tiffin
    menuItems: [
      {
        name: String,
        description: String,
        category: {
          type: String,
          enum: ["veg", "non-veg", "vegan", "jain"],
        },
      },
    ],

    // Ingredients & dietary info
    dietary: {
      isVegetarian: {
        type: Boolean,
        default: false,
      },
      isVegan: {
        type: Boolean,
        default: false,
      },
      isJain: {
        type: Boolean,
        default: false,
      },
      allergens: [String], // e.g., ["nuts", "dairy", "gluten"]
      noOfServings: Number,
    },

    // Ratings and reviews
    ratings: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      totalReviews: {
        type: Number,
        default: 0,
      },
    },

    // Tags for filtering
    tags: [String], // e.g., ["homemade", "organic", "fast-delivery"]

    // Admin tracking
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    // Status
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tiffin", TiffinSchema);