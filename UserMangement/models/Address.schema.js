const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  user: {type: mongoose.Schema.Types.ObjectId,ref: "User", required: true},
  recipientName: {type: String,required: true,trim: true},
  phoneNumber: {type: String,required: true,match: [/^[0-9]{10,12}$/, "Phone number must be 10-12 digits"]},
  fullAddress: {type: String,required: true,trim: true},
  city: {type: String,required: true,trim: true},
  pincode: {type: String,required: true,match: [/^[0-9]{6}$/, "Pincode must be 6 digits"]},
  state: {type: String,required: true,default: "Madhya Pradesh"},
  isDefault: {type: Boolean,default: false}
}, { timestamps: true });

module.exports = mongoose.model("Address", addressSchema);