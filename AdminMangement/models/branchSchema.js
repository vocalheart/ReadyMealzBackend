const mongoose = require("mongoose");

const deliveryChargeSchema = new mongoose.Schema({
  minKm: Number,
  maxKm: Number,
  charge: Number,
});

const branchSchema = new mongoose.Schema(
  {
    Admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    // Branch Information
    name: {
      type: String,
      required: true,
      trim: true,
    },
    branchCode: {
      type: String,
      unique: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    phone: String,
    email: String,
    // Geo Location
    location: {
      lat: {
        type: Number,
        required: true,
      },

      lng: {
        type: Number,
        required: true,
      },
    },

    // MongoDB GeoJSON
    geoLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },

      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
    },

    // Branch Status
    isActive: {
      type: Boolean,
      default: true,
    },

    isOpen: {
      type: Boolean,
      default: true,
    },

    // Delivery Settings
    deliveryRadiusKm: {
      type: Number,
      default: 10,
    },

    minimumOrderAmount: {
      type: Number,
      default: 99,
    },

    freeDeliveryAbove: {
      type: Number,
      default: 499,
    },

    estimatedDeliveryTime: {
      min: {
        type: Number,
        default: 25,
      },

      max: {
        type: Number,
        default: 45,
      },
    },

    // Distance Based Charges
    deliveryCharges: [
      {
        minKm: Number,
        maxKm: Number,
        charge: Number,
      },
    ],

    // Surge Pricing
    surgePricing: {
      enabled: {
        type: Boolean,
        default: true,
      },
      lunchExtraCharge: {
        type: Number,
        default: 10,
      },
      dinnerExtraCharge: {
        type: Number,
        default: 20,
      },
      rainExtraCharge: {
        type: Number,
        default: 30,
      },
      weekendExtraCharge: {
        type: Number,
        default: 15,
      },
    },
    // Extra Charges
    packagingCharge: {
      type: Number,
      default: 10,
    },
    gstPercentage: {
      type: Number,
      default: 5,
    },
    // Working Hours
    openingTime: {
      type: String,
      default: "09:00 AM",
    },
    closingTime: {
      type: String,
      default: "11:00 PM",
    },
    // Branch Images
    branchImage: String,
    // Ratings
    rating: {
      type: Number,
      default: 4.5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Geo Index
branchSchema.index({ geoLocation: "2dsphere" });

module.exports = mongoose.model("Branch", branchSchema);