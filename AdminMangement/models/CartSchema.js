const mongoose = require("mongoose");

/* ================= CART ITEM SCHEMA ================= */
const cartItemSchema = new mongoose.Schema({
  meal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Meal",
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    default: 1
  },
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative']
  },
  totalPrice: {
    type: Number,
    required: true,
    min: [0, 'Total price cannot be negative']
  }
}, { _id: true });

/* ================= CART SCHEMA ================= */
const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true // One cart per user
    },
    items: [cartItemSchema],
    cartTotal: {
      type: Number,
      default: 0,
      min: [0, 'Cart total cannot be negative']
    },
    totalItems: {
      type: Number,
      default: 0,
      min: [0, 'Total items cannot be negative']
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  { 
    timestamps: true,
    collection: 'carts'
  }
);

/* ================= INDEXES ================= */
cartSchema.index({ user: 1 });
cartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 * 30 }); // Auto-delete after 30 days

/* ================= PRE-SAVE MIDDLEWARE ================= */
cartSchema.pre('save', function() {
  // Recalculate totals before saving (safety check)
  this.cartTotal = this.items.reduce((acc, item) => acc + item.totalPrice, 0);
  this.totalItems = this.items.reduce((acc, item) => acc + item.quantity, 0);
  this.lastUpdated = new Date();
});

/* ================= INSTANCE METHODS ================= */
cartSchema.methods.addItem = function(mealId, quantity, price) {
  const existingItem = this.items.find(item => item.meal.toString() === mealId);
  
  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.totalPrice = existingItem.quantity * price;
  } else {
    this.items.push({
      meal: mealId,
      quantity: quantity,
      price: price,
      totalPrice: price * quantity
    });
  }
  return this;
};

cartSchema.methods.removeItem = function(mealId) {
  this.items = this.items.filter(item => item.meal.toString() !== mealId);
  return this;
};

cartSchema.methods.updateItem = function(mealId, quantity) {
  const item = this.items.find(item => item.meal.toString() === mealId);
  if (item) {
    item.quantity = quantity;
    item.totalPrice = item.price * quantity;
  }
  return this;
};

cartSchema.methods.clearCart = function() {
  this.items = [];
  return this;
};

module.exports = mongoose.model("Cart", cartSchema);