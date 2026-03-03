const mongoose = require("mongoose");

const TagsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tags", TagsSchema);