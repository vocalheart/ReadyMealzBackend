const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema(
  {
    fullName: {type: String,required: true,trim: true,},
    phone: {type: String,required: true,trim: true},
    email: {type: String,trim: true,lowercase: true},
    password: {type: String,required: true,minlength: 6},
    businessName: {type: String,required: true,trim: true,},
    city: {type: String,required: true,trim: true,},
    address: {type: String,required: true,
      trim: true,
    },

    serviceTypes: [
      {
        type: String,
        enum: ["daily", "tiffin", "bulk"],
      },
    ],

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Partner", partnerSchema);