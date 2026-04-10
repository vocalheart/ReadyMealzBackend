const mongoose = require('mongoose');

const advertisementSchema = new mongoose.Schema(
{
  title: { type: String, required: true, trim: true },
  subtitle: { type: String, trim: true },
  description: { type: String, trim: true },

  image: { type: String, required: true },

  buttonText: { type: String, default: "Click Here" },
  buttonLink: { type: String, default: "/" },

  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 1 },

  Admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },

  startDate: { type: Date },
  endDate: { type: Date }

},
{ timestamps: true }
);

module.exports = mongoose.model('Advertisement', advertisementSchema);