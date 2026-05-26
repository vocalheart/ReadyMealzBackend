const express = require('express');
const router = express.Router();
const { validationResult, body } = require('express-validator');
const Cart = require('../models/CartSchema');
const Meal = require('../models/meal');
const AuthMiddleware = require('../../middleware/authMiddleware');
// Validation middleware
const validateMealId = body('mealId').notEmpty().withMessage('Meal ID is required').isMongoId().withMessage('Invalid Meal ID format');
const validateQuantity = body('quantity').notEmpty().withMessage('Quantity is required').isInt({ min: -100, max: 100 }).withMessage('Quantity must be a valid integer');

// Error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({ field: err.param, message: err.msg }))
    });
  }
  next();
};

// ======================== ADD TO CART ========================
router.post("/add",AuthMiddleware,validateMealId,validateQuantity,handleValidationErrors,async (req, res) => {
    try {
      const userId = req.user.id;
      const { mealId, quantity } = req.body;
      // ================= FETCH MEAL =================
      const meal = await Meal.findById(mealId);
      if (!meal) {
        return res.status(404).json({
          success: false,
          message: "Meal not found"
        });
      }
      // ================= CHECK AVAILABILITY =================
      if (!meal.isAvailable || meal.status === "inactive") {
        return res.status(400).json({
          success: false,
          message: "This meal is currently unavailable"
        });
      }
      // ================= FIND OR CREATE CART =================
      let cart = await Cart.findOne({ user: userId });

      if (!cart) {
        cart = new Cart({
          user: userId,
          items: []
        });
      }

      // ================= CHECK EXISTING ITEM =================
      const existingItem = cart.items.find(
        item => item.meal.toString() === mealId
      );

      // =======================================================
      // IF ITEM ALREADY EXISTS
      // =======================================================
      if (existingItem) {

        const newQuantity = existingItem.quantity + quantity;

        // ================= REMOVE ITEM IF QUANTITY <= 0 =================
        if (newQuantity <= 0) {
          cart.items = cart.items.filter(
            item => item.meal.toString() !== mealId
          );
        } else {

          // ================= STOCK VALIDATION =================
          if (!meal.isUnlimitedStock && newQuantity > meal.stock) {
            return res.status(400).json({
              success: false,
              message: `Only ${meal.stock} items available in stock`,
              currentInCart: existingItem.quantity,
              availableStock: meal.stock
            });
          }

          // ================= UPDATE QUANTITY =================
          existingItem.quantity = newQuantity;
          existingItem.price = meal.price;
          existingItem.totalPrice = newQuantity * meal.price;
        }

      } else {

        // =======================================================
        // NEW ITEM ADD
        // =======================================================

        if (quantity <= 0) {
          return res.status(400).json({
            success: false,
            message: "Quantity must be greater than 0"
          });
        }

        // ================= STOCK CHECK =================
        if (!meal.isUnlimitedStock && quantity > meal.stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${meal.stock} items available in stock`,
            availableStock: meal.stock
          });
        }

        // ================= PUSH NEW ITEM =================
        cart.items.push({
          meal: mealId,
          quantity: quantity,
          price: meal.price,
          totalPrice: meal.price * quantity
        });
      }

      // ================= RECALCULATE CART =================
      cart.cartTotal = cart.items.reduce(
        (acc, item) => acc + item.totalPrice,
        0
      );

      cart.totalItems = cart.items.reduce(
        (acc, item) => acc + item.quantity,
        0
      );

      // ================= SAVE CART =================
      await cart.save();

      // ================= POPULATE MEAL DATA =================
      await cart.populate(
        "items.meal",
        "name description price images"
      );

      // ================= RESPONSE =================
      res.status(200).json({
        success: true,
        message: "Cart updated successfully",
        data: cart
      });

    } catch (error) {

      console.error("Cart add error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update cart",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined
      });
    }
  }
);

// ======================== GET CART ========================
router.get('/',AuthMiddleware,async (req, res) => {
    try {
      const userId = req.user.id; //  FIX: Use _id not id
      const cart = await Cart.findOne({ user: userId }).populate('items.meal', 'name description price images');
      // Always return success, even if cart is empty
      if (!cart || cart.items.length === 0) {
        return res.status(200).json({ success: true,message: 'Cart is empty',data: {
            items: [],
            cartTotal: 0,
            totalItems: 0
          }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Cart retrieved successfully',
        data: {
          _id: cart._id,
          items: cart.items,
          cartTotal: cart.cartTotal,
          totalItems: cart.totalItems,
          user: cart.user
        }
      });
    } catch (error) {
      console.error('Get cart error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve cart',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// ======================== UPDATE CART ITEM ========================
router.put('/update',AuthMiddleware,validateMealId,validateQuantity,handleValidationErrors,async (req, res) => {
    try {
      const { mealId, quantity } = req.body;
      const userId = req.user.id; //FIX: Use _id not id
      // Fetch meal
      const meal = await Meal.findById(mealId);
      if (!meal) {
        return res.status(404).json({
          success: false,
          message: 'Meal not found'
        });
      }

      // Check stock
      if (!meal.isUnlimitedStock && quantity > meal.stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${meal.stock} items available in stock`,
          availableStock: meal.stock
        });
      }

      // Find cart
      const cart = await Cart.findOne({ user: userId });
      if (!cart) {
        return res.status(404).json({
          success: false,
          message: 'Cart not found'
        });
      }

      // Find item in cart
      const item = cart.items.find(
        cartItem => cartItem.meal.toString() === mealId
      );

      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Item not found in cart'
        });
      }

      // Update quantity
      item.quantity = quantity;
      item.totalPrice = item.price * quantity;

      // Recalculate totals
      cart.cartTotal = cart.items.reduce((acc, i) => acc + i.totalPrice, 0);
      cart.totalItems = cart.items.reduce((acc, i) => acc + i.quantity, 0);

      await cart.save();
      await cart.populate('items.meal', 'name description price images');

      res.status(200).json({
        success: true,
        message: 'Cart updated successfully',
        data: {
          _id: cart._id,
          items: cart.items,
          cartTotal: cart.cartTotal,
          totalItems: cart.totalItems
        }
      });
    } catch (error) {
      console.error('Cart update error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update cart',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// ======================== REMOVE FROM CART ========================
router.delete('/remove',AuthMiddleware, validateMealId,handleValidationErrors,async (req, res) => {
    try {
      const { mealId } = req.body;
      const userId = req.user.id; // FIX: Use _id not id

      // Find cart
      const cart = await Cart.findOne({ user: userId });
      if (!cart) {
        return res.status(404).json({
          success: false,
          message: 'Cart not found'
        });
      }

      // Find item to remove
      const itemIndex = cart.items.findIndex(
        item => item.meal.toString() === mealId
      );

      if (itemIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Item not found in cart'
        });
      }

      // Store item details for response
      const removedItem = cart.items[itemIndex];

      // Remove item
      cart.items.splice(itemIndex, 1);

      // Recalculate totals
      cart.cartTotal = cart.items.reduce((acc, i) => acc + i.totalPrice, 0);
      cart.totalItems = cart.items.reduce((acc, i) => acc + i.quantity, 0);

      await cart.save();
      await cart.populate('items.meal', 'name description price images');

      res.status(200).json({
        success: true,
        message: 'Item removed from cart successfully',
        data: {
          _id: cart._id,
          items: cart.items,
          cartTotal: cart.cartTotal,
          totalItems: cart.totalItems,
          removedItem: {
            mealId: removedItem.meal,
            quantity: removedItem.quantity,
            price: removedItem.price
          }
        }
      });
    } catch (error) {
      console.error('Cart remove error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove item from cart',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// ======================== CLEAR CART ========================
router.delete('/clear',AuthMiddleware, async (req, res) => {
    try {
      const userId = req.user.id; // FIX: Use _id not id
      const cart = await Cart.findOne({ user: userId });
      if (!cart) {return res.status(404).json({success: false,message: 'Cart not found'});
      }
      const itemCount = cart.items.length;
      cart.items = [];
      cart.cartTotal = 0;
      cart.totalItems = 0;
      await cart.save();
      res.status(200).json({success: true,
      message: `Cart cleared. Removed ${itemCount} items`,
        data: {
          _id: cart._id,
          items: [],
          cartTotal: 0,
          totalItems: 0
        }
      });
    } catch (error) {
      console.error('Cart clear error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear cart',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;