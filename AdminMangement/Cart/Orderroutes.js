const express = require('express');
const router = express.Router();
const { validationResult, body } = require('express-validator');
const protect = require('../../middleware/FullRoleMiddleware');
const authorizeRoles = require('../../middleware/roleMiddleware');
const Order = require('../models/OrderSchema');
const Cart = require('../models/CartSchema');
const Meal = require('../models/meal');
const User = require('../../UserMangement/models/User');
const razorpay = require("./config/Razorpay");
const crypto = require("crypto");
/* ======================== VALIDATION MIDDLEWARE ======================== */

const validateDeliveryAddress = [
  body('deliveryAddress.name')
    .trim()
    .notEmpty()
    .withMessage('Recipient name is required')
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters'),
  body('deliveryAddress.phone')
    .trim()
    .matches(/^[0-9]{10,12}$/)
    .withMessage('Valid phone number (10-12 digits) is required'),
  body('deliveryAddress.address')
    .trim()
    .notEmpty()
    .withMessage('Address is required')
    .isLength({ min: 5 })
    .withMessage('Address must be at least 5 characters'),
  body('deliveryAddress.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  body('deliveryAddress.pincode')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Pincode must be exactly 6 digits'),
  body('deliveryAddress.state')
    .trim()
    .optional()
];

const validatePaymentMethod = body('paymentMethod')
  .isIn(['cod', 'online', 'upi', 'wallet'])
  .withMessage('Invalid payment method');

// Handle validation errors
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

/* ======================== USER ROUTES ======================== */

/**
 * CREATE ORDER - User creates order from cart or custom items
 * POST /api/orders/create
 */
router.post('/create', protect, authorizeRoles('user'), validateDeliveryAddress, validatePaymentMethod, handleValidationErrors, async (req, res) => {
  try {
    // FIX: Use both _id and id to handle different middleware implementations
    const userId = req.user._id || req.user.id;
    console.log('Creating order for user:', userId);
    const {
      items,
      paymentMethod = 'cod',
      paymentReference = null,
      specialRequests = '',
      useCart = true,
      subtotal = 0,
      tax = 0,
      deliveryCharge = 0
    } = req.body;
    let orderItems = [];
    let finalSubtotal = subtotal;
    // Get items from cart if useCart is true
    if (useCart) {
      console.log('Finding cart for user:', userId);
      const cart = await Cart.findOne({ user: userId }).populate('items.meal');
      if (!cart || cart.items.length === 0) {
        console.log('Cart empty or not found');
        return res.status(400).json({
          success: false,
          message: 'Cart is empty. Add items before creating order.'
        });
      }
      orderItems = cart.items.map(item => ({
        meal: item.meal._id,
        name: item.meal.name,
        price: item.price,
        quantity: item.quantity,
        totalPrice: item.totalPrice
      }));
      finalSubtotal = cart.cartTotal;
      console.log(' Cart items found:', orderItems.length);
    } else {
      // Validate custom items array
      if (!items || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Items are required'
        });
      }

      // Validate each item and fetch meal details
      for (const item of items) {
        const meal = await Meal.findById(item.meal);
        if (!meal) {
          return res.status(404).json({ success: false, message: `Meal ${item.meal} not found` });
        };
        if (!meal.canBePurchased()) {
          return res.status(400).json({
            success: false,
            message: `${meal.name} is currently unavailable`
          });
        }
        // Validate stock
        if (!meal.isUnlimitedStock && item.quantity > meal.stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${meal.stock} of ${meal.name} available in stock`,
            availableStock: meal.stock
          });
        }
        orderItems.push({
          meal: meal._id,
          name: meal.name,
          price: item.price || meal.price,
          quantity: item.quantity,
          totalPrice: (item.price || meal.price) * item.quantity
        });
        finalSubtotal += (item.price || meal.price) * item.quantity;
      }
    }

    // Calculate order total
    // 1. Pehle total calculate karo
    const finalTax = tax || finalSubtotal * 0.05;
    const finalDeliveryCharge = deliveryCharge || 40;
    const orderTotal = finalSubtotal + finalTax + finalDeliveryCharge;

    console.log(' Order totals:', { finalSubtotal, finalTax, finalDeliveryCharge, orderTotal });

    // 2. Fir Razorpay order banao
    let razorpayOrder = null;
    if (paymentMethod === "online") {
      const options = {
        amount: orderTotal * 100,
        currency: "INR",
        receipt: `order_${Date.now()}`
      };

      razorpayOrder = await razorpay.orders.create(options);
    }
    // Create order
    const order = new Order({
      user: userId,
      items: orderItems,
      subtotal: finalSubtotal,
      tax: finalTax,
      deliveryCharge: finalDeliveryCharge,
      orderTotal: orderTotal,
      paymentMethod,
      paymentReference: razorpayOrder ? razorpayOrder.id : paymentReference || null,
      deliveryAddress: req.body.deliveryAddress,
      specialRequests: specialRequests.trim() || '',
      orderStatus: 'placed',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending'
    });
    await order.save();
    console.log(' Order saved:', order._id);

    // Cart clear ONLY for COD
    if (useCart && paymentMethod === "cod") {
      await Cart.updateOne(
        { user: userId },
        { items: [], cartTotal: 0, totalItems: 0 }
      );
    }
    // Populate order details
    await order.populate([
      { path: 'user', select: 'name email phone' },
      { path: 'items.meal', select: 'name slug price images' }
    ]);
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order,
        razorpayOrder, //IMPORTANT
        orderNumber: order.orderNumber,
        estimatedDeliveryTime: order.estimatedDeliveryTime
      }
    });
  } catch (error) {
    console.error(' Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
);



router.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET).update(body.toString()).digest("hex");
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment" });
    }
    const order = await Order.findOne({
      paymentReference: razorpay_order_id
    });
    if (order) {
      order.paymentStatus = "paid";
      order.paymentReference = razorpay_payment_id;
      await order.save();
      //  NOW CLEAR CART
      await Cart.updateOne({ user: order.user }, { items: [], cartTotal: 0, totalItems: 0 });
    }
    res.json({ success: true, message: "Payment successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
/**
 * GET USER'S ORDERS
 * GET /api/orders/my-orders
 */
router.get('/my-orders', protect, authorizeRoles('user'),
  async (req, res) => {
    try {
      // FIX: Use both _id and id
      const userId = req.user._id || req.user.id;
      console.log('Fetching orders for user:', userId);

      const { page = 1, limit = 10, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

      const query = { user: userId };

      // Filter by status if provided
      if (status) {
        query.orderStatus = status;
      }

      const skip = (Number(page) - 1) * Number(limit);
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [orders, total] = await Promise.all([
        Order.find(query)
          .populate('items.meal', 'name price images')
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        Order.countDocuments(query)
      ]);

      console.log('Orders found:', orders.length);

      res.status(200).json({
        success: true,
        message: 'Orders retrieved successfully',
        data: {
          orders,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      console.error(' Get orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve orders',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET SINGLE ORDER DETAILS
 * GET /api/orders/:orderId
 */
router.get('/:orderId', protect, authorizeRoles('user', 'admin', 'superadmin'),
  async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId)
        .populate('user', 'name email phone')
        .populate('items.meal', 'name slug price description images');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      //  FIX: Proper user ID comparison
      const requestUserId = (req.user._id || req.user.id).toString();
      const orderUserId = order.user._id.toString();

      console.log('📋 Order details check:');
      console.log('  Request user:', requestUserId);
      console.log('  Order user:', orderUserId);
      console.log('  User role:', req.user.role);

      // User can only view their own orders (unless admin)
      if (req.user.role === 'user' && orderUserId !== requestUserId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this order'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Order retrieved successfully',
        data: order
      });
    } catch (error) {
      console.error('❌ Get order error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve order',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * CANCEL ORDER - User can cancel their own orders
 * PATCH /api/orders/:orderId/cancel
 */
router.patch('/:orderId/cancel', protect, authorizeRoles('user'), async (req, res) => {
  try {
    const { reason = 'Customer requested cancellation' } = req.body;
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    //  FIX: Proper user ID comparison
    const requestUserId = (req.user._id || req.user.id).toString();
    const orderUserId = order.user.toString();
    if (orderUserId !== requestUserId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot cancel this order'
      });
    }
    // Check if order can be cancelled
    const cancellableStatuses = ['placed', 'confirmed'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.orderStatus}`,
        currentStatus: order.orderStatus
      });
    };
    // Cancel order
    order.orderStatus = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = reason;
    order.statusHistory.push({
      status: 'cancelled',
      timestamp: new Date(),
      notes: reason
    });
    // Process refund if payment was made
    if (order.paymentStatus === 'paid') {
      order.refundAmount = order.orderTotal;
      order.refundStatus = 'pending';
      order.paymentStatus = 'refunded';
    }
    await order.save();
    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.orderStatus,
        refundAmount: order.refundAmount || 0
      }
    });
  } catch (error) {
    console.error(' Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
);

/* ======================== ADMIN ROUTES ======================== */

/**
 * GET ALL ORDERS (Admin)
 * GET /api/orders/admin/all-orders
 */
router.get('/admin/all-orders', protect, authorizeRoles('admin', 'superadmin'),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        paymentStatus,
        search,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const query = {};

      // Filters
      if (status) query.orderStatus = status;
      if (paymentStatus) query.paymentStatus = paymentStatus;

      // Search by order number or customer name
      if (search) {
        query.$or = [
          { orderNumber: new RegExp(search, 'i') },
          { 'deliveryAddress.name': new RegExp(search, 'i') },
          { 'deliveryAddress.phone': new RegExp(search, 'i') }
        ];
      }

      // Date range filter
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const skip = (Number(page) - 1) * Number(limit);
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [orders, total] = await Promise.all([
        Order.find(query)
          .populate('user', 'name email phone')
          .populate('items.meal', 'name price')
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        Order.countDocuments(query)
      ]);

      res.status(200).json({
        success: true,
        message: 'Orders retrieved successfully',
        data: {
          orders,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      console.error(' Get all orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve orders',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * UPDATE ORDER STATUS (Admin)
 * PATCH /api/orders/admin/:orderId/status
 */
router.patch('/admin/:orderId/status',
  protect,
  authorizeRoles('admin', 'superadmin'),
  body('newStatus')
    .isIn(['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'])
    .withMessage('Invalid status'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { newStatus, notes = '' } = req.body;
      const order = await Order.findById(req.params.orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Validate status transition
      const validTransitions = {
        placed: ['confirmed', 'cancelled'],
        confirmed: ['preparing', 'cancelled'],
        preparing: ['ready', 'cancelled'],
        ready: ['out_for_delivery'],
        out_for_delivery: ['delivered'],
        delivered: [],
        cancelled: []
      };

      if (!validTransitions[order.orderStatus].includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: `Cannot transition from ${order.orderStatus} to ${newStatus}`,
          currentStatus: order.orderStatus,
          allowedTransitions: validTransitions[order.orderStatus]
        });
      }

      // Update status
      order.orderStatus = newStatus;
      order.statusHistory.push({
        status: newStatus,
        timestamp: new Date(),
        notes: notes || `Order ${newStatus}`
      });

      // Set delivery time if marking as delivered
      if (newStatus === 'delivered') {
        order.actualDeliveryTime = new Date();
      }

      await order.save();

      res.status(200).json({
        success: true,
        message: `Order status updated to ${newStatus}`,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          newStatus: order.orderStatus,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error(' Update order status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update order status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * UPDATE PAYMENT STATUS (Admin)
 * PATCH /api/orders/admin/:orderId/payment
 */
router.patch('/admin/:orderId/payment', protect, authorizeRoles('admin', 'superadmin'), body('paymentStatus').isIn(['pending', 'paid', 'failed', 'refunded'])
  .withMessage('Invalid payment status'),
  body('paymentReference')
    .optional()
    .isString()
    .trim(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { paymentStatus, paymentReference = null } = req.body;
      const order = await Order.findById(req.params.orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      order.paymentStatus = paymentStatus;
      if (paymentReference) {
        order.paymentReference = paymentReference;
      }

      await order.save();

      res.status(200).json({
        success: true,
        message: 'Payment status updated',
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          paymentStatus: order.paymentStatus,
          paymentReference: order.paymentReference
        }
      });
    } catch (error) {
      console.error(' Update payment status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update payment status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * PROCESS REFUND (Admin)
 * PATCH /api/orders/admin/:orderId/refund
 */
router.patch('/admin/:orderId/refund', protect, authorizeRoles('admin', 'superadmin'), body('refundAmount').isFloat({ min: 0 }).withMessage('Valid refund amount is required'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { refundAmount } = req.body;
      const order = await Order.findById(req.params.orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      if (refundAmount > order.orderTotal) {
        return res.status(400).json({
          success: false,
          message: 'Refund amount cannot exceed order total',
          orderTotal: order.orderTotal
        });
      }

      order.refundAmount = refundAmount;
      order.refundStatus = 'processed';
      order.paymentStatus = 'refunded';

      order.statusHistory.push({
        status: order.orderStatus,
        timestamp: new Date(),
        notes: `Refund processed: ₹${refundAmount}`
      });

      await order.save();

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          refundAmount: order.refundAmount,
          refundStatus: order.refundStatus
        }
      });
    } catch (error) {
      console.error(' Process refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process refund',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET ORDER ANALYTICS (Admin)
 * GET /api/orders/admin/analytics/summary
 */
router.get('/admin/analytics/summary', protect, authorizeRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Get statistics
    const [
      totalOrders,
      totalRevenue,
      statusBreakdown,
      paymentBreakdown,
      topCustomers
    ] = await Promise.all([
      Order.countDocuments(query),
      Order.aggregate([{ $match: query }, { $group: { _id: null, total: { $sum: '$orderTotal' } } }]),
      Order.aggregate([{ $match: query }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: query }, { $group: { _id: '$paymentStatus', count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: query }, { $group: { _id: '$user', count: { $sum: 1 }, totalSpent: { $sum: '$orderTotal' } } },
      { $sort: { totalSpent: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } }
      ])
    ]);

    res.status(200).json({
      success: true,
      message: 'Analytics retrieved successfully',
      data: {
        summary: {
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          averageOrderValue: totalOrders > 0 ? (totalRevenue[0]?.total || 0) / totalOrders : 0
        },
        statusBreakdown: Object.fromEntries(
          statusBreakdown.map(item => [item._id, item.count])
        ),
        paymentBreakdown: Object.fromEntries(
          paymentBreakdown.map(item => [item._id, item.count])
        ),
        topCustomers: topCustomers.map(customer => ({
          userId: customer._id,
          customerName: customer.userInfo[0]?.name || 'Unknown',
          orderCount: customer.count,
          totalSpent: customer.totalSpent
        }))
      }
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
);

/**
 * EXPORT ORDERS (Admin) - CSV format
 * GET /api/orders/admin/export
 */
router.get(
  '/admin/export',
  protect,
  authorizeRoles('admin', 'superadmin'),
  async (req, res) => {
    try {
      const { startDate, endDate, status } = req.query;

      const query = {};
      if (status) query.orderStatus = status;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const orders = await Order.find(query)
        .populate('user', 'name email phone')
        .populate('items.meal', 'name price')
        .lean();

      if (orders.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No orders found for export'
        });
      }

      // Convert to CSV
      const headers = [
        'Order Number',
        'Customer Name',
        'Phone',
        'Order Date',
        'Status',
        'Payment Status',
        'Items',
        'Order Total',
        'Delivery Address'
      ];

      const rows = orders.map(order => [
        order.orderNumber,
        order.user.name,
        order.user.phone,
        new Date(order.createdAt).toLocaleDateString(),
        order.orderStatus,
        order.paymentStatus,
        order.items.map(i => `${i.name} x${i.quantity}`).join('; '),
        order.orderTotal,
        `${order.deliveryAddress.address}, ${order.deliveryAddress.city}, ${order.deliveryAddress.pincode}`
      ]);

      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=orders-export.csv');
      res.send(csv);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export orders',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;