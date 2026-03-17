const mongoose = require("mongoose");

/* ================= ORDER ITEM SCHEMA ================= */
const orderItemSchema = new mongoose.Schema({
  meal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Meal",
    required: true
  },
  name: {
    type: String,
    required: [true, 'Meal name is required']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  totalPrice: {
    type: Number,
    required: [true, 'Total price is required'],
    min: [0, 'Total price cannot be negative']
  }
}, { _id: true });

/* ================= DELIVERY ADDRESS SCHEMA ================= */
const deliveryAddressSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Recipient name is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[0-9]{10,12}$/, 'Invalid phone number'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true
  },
  pincode: {
    type: String,
    required: [true, 'Pincode is required'],
    match: [/^[0-9]{6}$/, 'Invalid pincode format (must be 6 digits)'],
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, { _id: false });

/* ================= ORDER SCHEMA ================= */
const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, 'User is required']
    },
    orderNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
      // Generate as ORD-${Date}-${random} before save
    },
    items: {
      type: [orderItemSchema],
      required: [true, 'Order must have at least one item'],
      validate: {
        validator: function(items) {
          return items && items.length > 0;
        },
        message: 'Order must contain at least one item'
      }
    },
    orderTotal: {
      type: Number,
      required: [true, 'Order total is required'],
      min: [0, 'Order total cannot be negative']
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    tax: {
      type: Number,
      default: 0,
      min: 0
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['cod', 'online', 'upi', 'wallet'],
        message: 'Invalid payment method'
      },
      default: "cod"
    },
    paymentStatus: {
      type: String,
      enum: {
        values: ['pending', 'paid', 'failed', 'refunded'],
        message: 'Invalid payment status'
      },
      default: "pending"
    },
    paymentReference: {
      type: String,
      trim: true,
      default: null
    },
    orderStatus: {
      type: String,
      enum: {
        values: ['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'returned'],
        message: 'Invalid order status'
      },
      default: "placed"
    },
    statusHistory: [{
      status: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      notes: String
    }],
    deliveryAddress: {
      type: deliveryAddressSchema,
      required: [true, 'Delivery address is required']
    },
    estimatedDeliveryTime: {
      type: Date
    },
    actualDeliveryTime: {
      type: Date
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: ''
    },
    specialRequests: {
      type: String,
      trim: true,
      maxlength: [500, 'Special requests cannot exceed 500 characters'],
      default: ''
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    cancelReason: {
      type: String,
      trim: true,
      default: null
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    refundStatus: {
      type: String,
      enum: ['pending', 'processed', 'rejected'],
      default: 'pending'
    }
  },
  {
    timestamps: true,
    collection: 'orders'
  }
);

/* ================= INDEXES ================= */
orderSchema.index({ user: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true, sparse: true });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'deliveryAddress.pincode': 1 });
orderSchema.index({ user: 1, createdAt: -1 });

/* ================= PRE-SAVE MIDDLEWARE ================= */
orderSchema.pre('save', function() {
  // Generate order number if not exists
  if (!this.orderNumber) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    this.orderNumber = `ORD-${timestamp}-${random}`;
  }

  // Recalculate total
  this.orderTotal = this.items.reduce((acc, item) => acc + item.totalPrice, 0);

  // Initialize status history if new order
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory = [{
      status: this.orderStatus,
      timestamp: new Date(),
      notes: 'Order placed'
    }];
  }

});

/* ================= INSTANCE METHODS ================= */
orderSchema.methods.updateOrderStatus = function(newStatus, notes = '') {
  if (!this.orderStatus || this.orderStatus !== newStatus) {
    this.orderStatus = newStatus;
    this.statusHistory.push({
      status: newStatus,
      timestamp: new Date(),
      notes: notes
    });
  }
  return this;
};

orderSchema.methods.cancelOrder = function(reason = 'User request') {
  this.orderStatus = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelReason = reason;
  this.statusHistory.push({
    status: 'cancelled',
    timestamp: new Date(),
    notes: reason
  });
  return this;
};

orderSchema.methods.markDelivered = function() {
  this.orderStatus = 'delivered';
  this.actualDeliveryTime = new Date();
  this.statusHistory.push({
    status: 'delivered',
    timestamp: new Date(),
    notes: 'Order delivered'
  });
  return this;
};

orderSchema.methods.getOrderSummary = function() {
  return {
    orderNumber: this.orderNumber,
    status: this.orderStatus,
    total: this.orderTotal,
    items: this.items.length,
    createdAt: this.createdAt,
    deliveryAddress: this.deliveryAddress
  };
};

/* ================= STATIC METHODS ================= */
orderSchema.statics.getOrdersByUser = function(userId) {
  return this.find({ user: userId }).sort({ createdAt: -1 });
};

orderSchema.statics.getOrdersByStatus = function(status) {
  return this.find({ orderStatus: status }).sort({ createdAt: -1 });
};

module.exports = mongoose.model("Order", orderSchema);