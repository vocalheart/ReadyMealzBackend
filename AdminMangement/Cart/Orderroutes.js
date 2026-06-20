const express = require('express');
const router = express.Router();
const { validationResult, body } = require('express-validator');
const geolib = require('geolib');
const crypto = require('crypto');

const protect = require('../../middleware/FullRoleMiddleware');
const authorizeRoles = require('../../middleware/roleMiddleware');
const Order = require('../models/OrderSchema');
const Cart = require('../models/CartSchema');
const Meal = require('../models/meal');
const razorpay = require('./config/Razorpay');
const Address = require('../../UserMangement/models/Address.schema');

/* ─── Validation helpers ─────────────────────── */
const validateDeliveryAddress = [
  body('deliveryAddress').notEmpty().withMessage('Delivery address ID is required').isMongoId().withMessage('Invalid address ID'),
];
const validatePaymentMethod = body('paymentMethod')
  .isIn(['cod', 'online', 'upi', 'wallet']).withMessage('Invalid payment method');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e => ({ field: e.param, message: e.msg })) });
  next();
};

/* ─── calcPricing ────────────────────────────────
   Returns all charge fields needed to save the order.
   Throws a descriptive Error on business-rule violations
   so the route can catch and return a 400.
   ─────────────────────────────────────────────── */
const calcPricing = (branch, address, subtotal) => {
  // Distance
  const distanceKm = geolib.getDistance(
    { lat: branch.location.lat, lng: branch.location.lng },
    { lat: address.location.lat, lng: address.location.lng }
  ) / 1000;

  // ✅ Delivery radius check
  if (distanceKm > branch.deliveryRadiusKm)
    throw Object.assign(new Error('Delivery not available in your area'), {
      statusCode: 400,
      extra: { yourDistance: Number(distanceKm.toFixed(2)), deliveryRadiusKm: branch.deliveryRadiusKm },
    });

  // Delivery slab (or free)
  let deliveryCharge = 0;
  if (subtotal < branch.freeDeliveryAbove) {
    const slabs = branch.deliveryCharges || [];
    const match = slabs.find(s => distanceKm >= s.minKm && distanceKm <= s.maxKm);
    deliveryCharge = match ? match.charge : (slabs.at(-1)?.charge ?? 0);
  }

  // Surge
  let surgeCharge = 0;
  if (branch.surgePricing?.enabled) {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    if (hour >= 12 && hour <= 15) surgeCharge += branch.surgePricing.lunchExtraCharge || 0;
    if (hour >= 19 && hour <= 23) surgeCharge += branch.surgePricing.dinnerExtraCharge || 0;
    if (day === 0 || day === 6) surgeCharge += branch.surgePricing.weekendExtraCharge || 0;
  }

  const packagingCharge = branch.packagingCharge || 0;
  const gstPercentage = branch.gstPercentage || 0;
  const taxableAmount = subtotal + deliveryCharge + surgeCharge + packagingCharge;
  const tax = Number(((taxableAmount * gstPercentage) / 100).toFixed(2));
  const orderTotal = Number((taxableAmount + tax).toFixed(2));

  return { distanceKm: Number(distanceKm.toFixed(2)), deliveryCharge, surgeCharge, packagingCharge, tax, orderTotal };
};

/* ═══════════════════════════════════════════════
   POST /create
   ═══════════════════════════════════════════════ */
router.post(
  '/create',
  protect, authorizeRoles('user'),
  validateDeliveryAddress, validatePaymentMethod, handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user._id || req.user.id;
      const { paymentMethod = 'cod', paymentReference = null, specialRequests = '', useCart = true, items } = req.body;

      // ── Address ──────────────────────────────────────────────────────
      const address = await Address.findById(req.body.deliveryAddress);
      if (!address)
        return res.status(404).json({ success: false, message: 'Address not found' });
      if (!address.location?.lat || !address.location?.lng)
        return res.status(400).json({ success: false, message: 'Address location missing' });

      // ── Build order items + resolve branch ───────────────────────────
      let orderItems = [];
      let subtotal = 0;
      let branch = null;

      if (useCart) {
        const cart = await Cart.findOne({ user: userId }).populate({
          path: 'items.meal',
          populate: { path: 'branch' },
        });
        if (!cart?.items?.length)
          return res.status(400).json({ success: false, message: 'Cart is empty. Add items before creating order.' });

        const validItems = cart.items.filter(item => item.meal);
        if (!validItems.length)
          return res.status(400).json({ success: false, message: 'All cart meals are invalid or deleted' });

        branch = validItems[0].meal.branch;
        subtotal = cart.cartTotal;
        orderItems = validItems.map(item => ({
          meal: item.meal._id, name: item.meal.name,
          price: item.price, quantity: item.quantity, totalPrice: item.totalPrice,
        }));
      } else {
        if (!items?.length)
          return res.status(400).json({ success: false, message: 'Items are required' });

        for (const item of items) {
          const meal = await Meal.findById(item.meal).populate('branch');
          if (!meal)
            return res.status(404).json({ success: false, message: `Meal ${item.meal} not found` });
          if (!meal.canBePurchased())
            return res.status(400).json({ success: false, message: `${meal.name} is currently unavailable` });
          if (!meal.isUnlimitedStock && item.quantity > meal.stock)
            return res.status(400).json({ success: false, message: `Only ${meal.stock} of ${meal.name} available`, availableStock: meal.stock });

          if (!branch) branch = meal.branch;
          const lineTotal = (item.price || meal.price) * item.quantity;
          subtotal += lineTotal;
          orderItems.push({ meal: meal._id, name: meal.name, price: item.price || meal.price, quantity: item.quantity, totalPrice: lineTotal });
        }
      }

      if (!branch)
        return res.status(400).json({ success: false, message: 'Branch not found' });

      // ── Branch status ─────────────────────────────────────────────────
      if (!branch.isActive) return res.status(400).json({ success: false, message: 'Branch is inactive' });
      if (!branch.isOpen) return res.status(400).json({ success: false, message: 'Branch is currently closed' });

      // ── Minimum order ─────────────────────────────────────────────────
      if (subtotal < branch.minimumOrderAmount)
        return res.status(400).json({ success: false, message: `Minimum order amount is ₹${branch.minimumOrderAmount}`, currentSubtotal: subtotal });

      // ── Pricing (throws 400-style Error on radius violation) ──────────
      let pricing;
      try {
        pricing = calcPricing(branch, address, subtotal);
      } catch (pErr) {
        return res.status(pErr.statusCode || 400).json({ success: false, message: pErr.message, ...pErr.extra });
      }

      // ── Razorpay ──────────────────────────────────────────────────────
      let razorpayOrder = null;
      if (paymentMethod === 'online') {
        razorpayOrder = await razorpay.orders.create({
          amount: pricing.orderTotal * 100,
          currency: 'INR',
          receipt: `order_${Date.now()}`,
        });
      }


      // ── COD FLOW ──────────────────────────────────────

      if (paymentMethod === 'cod') {
        const order = await new Order({
          user: userId,
          items: orderItems,
          subtotal,
          deliveryCharge:pricing.deliveryCharge,
          surgeCharge:pricing.surgeCharge,
          packagingCharge:pricing.packagingCharge,
          tax:pricing.tax,
          distanceKm:pricing.distanceKm,
          orderTotal:pricing.orderTotal,
          paymentMethod,
          paymentReference:paymentReference || null,
          deliveryAddress:address._id,
          specialRequests:specialRequests.trim(),
          orderStatus: 'placed',
          paymentStatus: 'pending',
        }).save();

        // Clear cart
        if (useCart) {

          await Cart.updateOne(
            { user: userId },
            {
              items: [],
              cartTotal: 0,
              totalItems: 0
            }
          );
        }

        return res.status(201).json({

          success: true,

          message:
            'COD Order created successfully',

          data: {
            order
          }
        });
      }
      // ── ONLINE PAYMENT FLOW ───────────────────────────
      return res.status(200).json({success: true,message:'Proceed to payment',
        data: {razorpayOrder,orderData: { items: orderItems, subtotal,pricing,
            deliveryAddress:
              address._id,

            paymentMethod,

            specialRequests
          }
        }
      });

    } catch (err) {
      console.error('[POST /create]', err);
      return res.status(500).json({ success: false, message: 'Failed to create order', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }
  }
);

/* =========================================================
   VERIFY PAYMENT + CREATE ORDER AFTER SUCCESSFUL PAYMENT
========================================================= */

router.post(
  "/verify-payment",
  protect,
  authorizeRoles("user"),

  async (req, res) => {

    try {

      const {

        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        orderData

      } = req.body;

      /* =========================================================
         VALIDATION
      ========================================================= */

      if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Payment details missing"
        });
      }

      if (!orderData) {

        return res.status(400).json({

          success: false,

          message:
            "Order data missing"
        });
      }

      /* =========================================================
         VERIFY RAZORPAY SIGNATURE
      ========================================================= */

      const expectedSignature = crypto

        .createHmac(
          "sha256",
          process.env.RAZORPAY_SECRET
        )

        .update(
          `${razorpay_order_id}|${razorpay_payment_id}`
        )

        .digest("hex");

      /* =========================================================
         INVALID SIGNATURE
      ========================================================= */

      if (
        expectedSignature !==
        razorpay_signature
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid payment signature"
        });
      }

      /* =========================================================
         PREVENT DUPLICATE ORDERS
      ========================================================= */

      const existingOrder =
        await Order.findOne({

          paymentReference:
            razorpay_payment_id
        });

      if (existingOrder) {

        return res.status(400).json({

          success: false,

          message:
            "Order already exists"
        });
      }

      /* =========================================================
         CREATE ORDER
      ========================================================= */

      const order = new Order({

        user:
          req.user._id ||
          req.user.id,

        items:
          orderData.items,

        subtotal:
          orderData.subtotal,

        deliveryCharge:
          orderData.pricing
            .deliveryCharge || 0,

        surgeCharge:
          orderData.pricing
            .surgeCharge || 0,

        packagingCharge:
          orderData.pricing
            .packagingCharge || 0,

        tax:
          orderData.pricing
            .gstAmount || 0,

        distanceKm:
          orderData.pricing
            .distanceKm || 0,

        orderTotal:
          orderData.pricing
            .finalAmount || 0,

        paymentMethod:
          "online",

        paymentReference:
          razorpay_payment_id,

        deliveryAddress:
          orderData.deliveryAddress,

        specialRequests:
          orderData.specialRequests || "",

        orderStatus:
          "placed",

        paymentStatus:
          "paid"
      });

      /* =========================================================
         SAVE ORDER
      ========================================================= */

      await order.save();

      /* =========================================================
         CLEAR USER CART
      ========================================================= */

      await Cart.updateOne(

        {
          user:
            req.user._id ||
            req.user.id
        },

        {
          items: [],
          cartTotal: 0,
          totalItems: 0
        }
      );

      /* =========================================================
         POPULATE ORDER
      ========================================================= */

      await order.populate([

        {

          path: "user",

          select:
            "name email phone"
        },

        {

          path: "items.meal",

          select:
            "name slug price images"
        },

        {

          path:
            "deliveryAddress"
        }
      ]);

      /* =========================================================
         SUCCESS RESPONSE
      ========================================================= */

      return res.status(200).json({

        success: true,

        message:
          "Payment verified & order created successfully",

        data: {

          order,

          orderNumber:
            order.orderNumber,

          estimatedDeliveryTime:
            order.estimatedDeliveryTime
        }
      });

    } catch (err) {

      console.error(
        "[verify-payment]",
        err
      );

      return res.status(500).json({

        success: false,

        message:
          err.message ||
          "Payment verification failed"
      });
    }
  }
);

/**
 * GET USER'S ORDERS
 * GET /api/orders/my-orders
 **/

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
      };
      const skip = (Number(page) - 1) * Number(limit);
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
      const [orders, total] = await Promise.all([
        Order.find(query).populate('items.meal', 'name price images').populate('deliveryAddress').sort(sort).skip(skip).limit(Number(limit)).lean(),
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
 **/

router.get('/:orderId', protect, authorizeRoles('user', 'admin', 'superadmin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('user', 'name email phone')
      .populate('items.meal', 'name slug price description images').populate(
        'deliveryAddress',
        'recipientName phoneNumber fullAddress city pincode state'
      );
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    const requestUserId = (req.user._id || req.user.id).toString();
    const orderUserId = order.user._id.toString();
    console.log('Order details check:');
    console.log('Request user:', requestUserId);
    console.log('Order user:', orderUserId);
    console.log('User role:', req.user.role);
    if (req.user.role === 'user' && orderUserId !== requestUserId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this order'
      });
    }
    res.status(200).json({ success: true, message: 'Order retrieved successfully', data: order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false, message: 'Failed to retrieve order', error: process.env.NODE_ENV === 'development'
        ? error.message
        : undefined
    });
  }
}
);

/**
 * CANCEL ORDER - User can cancel their own orders
 * PATCH /api/orders/:orderId/cancel
 **/
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


      // Date range filter--------------
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
          .populate('items.meal', 'name price').populate('deliveryAddress')
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
router.patch('/admin/:orderId/status', protect, authorizeRoles('admin', 'superadmin'), body('newStatus').isIn(['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled']).withMessage('Invalid status'),
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
    console.error(' Analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve analytics', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
}
);

/**
 * EXPORT ORDERS (Admin) - CSV format
 * GET /api/orders/admin/export
 */
router.get('/admin/export', protect, authorizeRoles('admin', 'superadmin'), async (req, res) => {
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
      .populate('items.meal', 'name price').populate('deliveryAddress')
      .lean();

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No orders found for export'
      });
    };

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
      `${order.deliveryAddress?.fullAddress}, ${order.deliveryAddress?.city}, ${order.deliveryAddress?.pincode}`
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
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