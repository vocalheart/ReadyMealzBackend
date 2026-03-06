const mongoose = require("mongoose");

const BulkOrderQuoteSchema = new mongoose.Schema(
  {
    /* ── Which bulk order pack was selected ── */
    bulkOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BulkOrder",
      required: true,
    },

    /* ── Customer Info ── */
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      default: "",
      trim: true,
    },

    /* ── Event Details ── */
    eventType: {
      type: String,
      required: true,
      enum: ["Corporate Event","Wedding","Birthday Party","College Fest","Office Lunch","Religious Gathering","Other"],
    },
    eventDate: {
      type: Date,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    requirements: {
      type: String,
      default: "",
      trim: true,
    },

    /* ── Estimated Price (calculated on server) ── */
    estimatedTotal: {
      type: Number,
      default: 0,
    },

    /* ── Status ── */
    status: {
      type: String,
      enum: ["pending", "contacted", "confirmed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BulkOrderQuote", BulkOrderQuoteSchema);