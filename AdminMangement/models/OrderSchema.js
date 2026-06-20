const mongoose = require("mongoose");

/* ─── Order Item ─────────────────────────────── */
const orderItemSchema = new mongoose.Schema({
  meal:       { type: mongoose.Schema.Types.ObjectId, ref: "Meal", required: true },
  name:       { type: String,  required: [true, 'Meal name is required'] },
  price:      { type: Number,  required: [true, 'Price is required'],       min: [0, 'Price cannot be negative'] },
  quantity:   { type: Number,  required: [true, 'Quantity is required'],    min: [1, 'Quantity must be at least 1'] },
  totalPrice: { type: Number,  required: [true, 'Total price is required'], min: [0, 'Total price cannot be negative'] },
}, { _id: true });

/* ─── Order ──────────────────────────────────── */
const orderSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: [true, 'User is required'] },
    orderNumber: { type: String, unique: true, sparse: true, trim: true },

    items: {
      type: [orderItemSchema],
      required: [true, 'Order must have at least one item'],
      validate: { validator: items => items?.length > 0, message: 'Order must contain at least one item' },
    },

    // ── Amounts ────────────────────────────────
    subtotal:        { type: Number, default: 0,    min: 0 },
    discount:        { type: Number, default: 0,    min: 0 },
    deliveryCharge:  { type: Number, default: 0,    min: 0 },
    surgeCharge:     { type: Number, default: 0,    min: 0 },   // ✅ added
    packagingCharge: { type: Number, default: 0,    min: 0 },   // ✅ added
    tax:             { type: Number, default: 0,    min: 0 },
    orderTotal:      { type: Number, required: [true, 'Order total is required'], min: [0, 'Order total cannot be negative'] },
    distanceKm:      { type: Number, default: 0 },              // ✅ added

    // ── Payment ────────────────────────────────
    paymentMethod:    { type: String, enum: { values: ['cod', 'online', 'upi', 'wallet'], message: 'Invalid payment method' }, default: 'cod' },
    paymentStatus:    { type: String, enum: { values: ['pending', 'paid', 'failed', 'refunded'], message: 'Invalid payment status' }, default: 'pending' },
    paymentReference: { type: String, trim: true, default: null },

    // ── Status ─────────────────────────────────
    orderStatus: {
      type: String,
      enum: { values: ['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'returned'], message: 'Invalid order status' },
      default: 'placed',
    },
    statusHistory: [{ status: String, timestamp: { type: Date, default: Date.now }, notes: String }],

    // ── Delivery ───────────────────────────────
    deliveryAddress:       { type: mongoose.Schema.Types.ObjectId, ref: "Address", required: [true, 'Delivery address is required'] },
    estimatedDeliveryTime: { type: Date },
    actualDeliveryTime:    { type: Date },

    // ── Misc ───────────────────────────────────
    notes:           { type: String, trim: true, maxlength: [500, 'Notes cannot exceed 500 characters'], default: '' },
    specialRequests: { type: String, trim: true, maxlength: [500, 'Special requests cannot exceed 500 characters'], default: '' },

    // ── Cancellation / Refund ──────────────────
    cancelledAt:  { type: Date,   default: null },
    cancelReason: { type: String, trim: true, default: null },
    refundAmount: { type: Number, default: 0, min: 0 },
    refundStatus: { type: String, enum: ['pending', 'processed', 'rejected'], default: 'pending' },
  },
  { timestamps: true, collection: 'orders' }
);

/* ─── Indexes ────────────────────────────────── */
orderSchema.index({ user: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true, sparse: true });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });

/* ─── Pre-save ───────────────────────────────── */
orderSchema.pre('save', function () {
  // Auto-generate order number
  if (!this.orderNumber) {
    this.orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  // Recalculate subtotal from items
  this.subtotal = this.items.reduce((acc, item) => acc + item.totalPrice, 0);

  //  FIX: include surgeCharge + packagingCharge in total
  this.orderTotal =
    this.subtotal +
    this.tax +
    this.deliveryCharge +
    this.surgeCharge +
    this.packagingCharge -
    this.discount;

  // Seed status history on new order
  if (this.isNew && !this.statusHistory?.length) {
    this.statusHistory = [{ status: this.orderStatus, timestamp: new Date(), notes: 'Order placed' }];
  }
});

/* ─── Instance methods ───────────────────────── */
orderSchema.methods.updateOrderStatus = function (newStatus, notes = '') {
  this.orderStatus = newStatus;
  this.statusHistory.push({ status: newStatus, timestamp: new Date(), notes });
  return this;
};

orderSchema.methods.cancelOrder = function (reason = 'User request') {
  this.orderStatus  = 'cancelled';
  this.cancelledAt  = new Date();
  this.cancelReason = reason;
  this.statusHistory.push({ status: 'cancelled', timestamp: new Date(), notes: reason });
  return this;
};

orderSchema.methods.markDelivered = function () {
  this.orderStatus       = 'delivered';
  this.actualDeliveryTime = new Date();
  this.statusHistory.push({ status: 'delivered', timestamp: new Date(), notes: 'Order delivered' });
  return this;
};

orderSchema.methods.getOrderSummary = function () {
  return {
    orderNumber:     this.orderNumber,
    status:          this.orderStatus,
    total:           this.orderTotal,
    items:           this.items.length,
    createdAt:       this.createdAt,
    deliveryAddress: this.deliveryAddress,
  };
};

/* ─── Static methods ─────────────────────────── */
orderSchema.statics.getOrdersByUser   = function (userId) { return this.find({ user: userId }).sort({ createdAt: -1 }); };
orderSchema.statics.getOrdersByStatus = function (status) { return this.find({ orderStatus: status }).sort({ createdAt: -1 }); };

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);