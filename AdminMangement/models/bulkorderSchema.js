const mongoose = require('mongoose');

const image = new mongoose.Schema({
    url: { type: String, required: true },
    key: { type: String, required: true }
}, { _id: true });

const BulkOrderSchema = new mongoose.Schema({

    name: { 
        type: String, 
        required: true,
        trim: true
    },

    description: { 
        type: String, 
        required: true 
    },

    price: { 
        type: Number, 
        required: true 
    },

    minQuantity: {
        type: Number,
        default: 1
    },

    maxQuantity: {
        type: Number,
        default: 100
    },

    category: {
        type: String,
        enum: ["veg", "non-veg", "mixed"],
        default: "veg"
    },

    isAvailable: {
        type: Boolean,
        default: true
    },

    preparationTime: {
        type: Number, // minutes
        default: 30
    },

    imageUrl: [image],

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin"
    }

}, { timestamps: true });

const BulkOrderModel = mongoose.model("BulkOrder", BulkOrderSchema);

module.exports = BulkOrderModel;