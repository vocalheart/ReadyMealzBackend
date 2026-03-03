

const mongoose = require("mongoose");

const FoodTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    createdBy: {type: mongoose.Schema.Types.ObjectId,ref: "Admin", default: null},
  },
  { timestamps: true }
);

module.exports = mongoose.model("FoodType", FoodTypeSchema);