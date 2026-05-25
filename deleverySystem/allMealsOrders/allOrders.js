const express = require('express');
const router = express.Router();
const MealsOrder = require('../../AdminMangement/models/OrderSchema');
const PartnerMiddleware = require('../middleware/PartnerMiddleware');

/* ===============================================================
   PARTNER ORDER ROUTES
   Base path (set in app.js): /api/partner/orders
   All routes protected by PartnerMiddleware
   =============================================================== */


/* ---------------------------------------------------------------
   GET /api/partner/orders
   Get ALL orders (optionally filter by status, date, payment)
   Query params:
     - status        : placed | confirmed | preparing | ready |
                       out_for_delivery | delivered | cancelled | returned
     - paymentStatus : pending | paid | failed | refunded
     - page          : page number  (default: 1)
     - limit         : items/page   (default: 10)
     - from          : ISO date string  (createdAt >=)
     - to            : ISO date string  (createdAt <=)
   --------------------------------------------------------------- */
router.get('/orders', PartnerMiddleware, async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      page = 1,
      limit = 10,
      from,
      to,
    } = req.query;

    const filter = {};

    if (status)        filter.orderStatus   = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await MealsOrder.countDocuments(filter);

    const orders = await MealsOrder.find(filter)
      .populate('user',            'name email phone')
      .populate('deliveryAddress')
      .populate('items.meal',      'name image category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    return res.status(200).json({
      success: true,
      message: 'Orders fetched successfully',
      data: {
        orders,
        pagination: {
          total,
          page:       parseInt(page),
          limit:      parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });

  } catch (error) {
    console.error('GET /orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message,
    });
  }
});


/* ---------------------------------------------------------------
   GET /api/partner/orders/:orderId
   Get a SINGLE order by MongoDB _id
   --------------------------------------------------------------- */
router.get('/orders/:orderId', PartnerMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await MealsOrder.findById(orderId)
      .populate('user',            'name email phone')
      .populate('deliveryAddress')
      .populate('items.meal',      'name image category description');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Order fetched successfully',
      data: { order },
    });

  } catch (error) {
    console.error('GET /orders/:orderId error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message,
    });
  }
});


/* ---------------------------------------------------------------
   PATCH /api/partner/orders/:orderId/status
   Update ORDER STATUS only
   Body: { status, notes? }
   Allowed transitions enforced below.
   --------------------------------------------------------------- */
const VALID_STATUSES = ['placed', 'confirmed', 'preparing', 'ready','out_for_delivery', 'delivered', 'cancelled', 'returned'];
// Which statuses a partner is allowed to move TO
const ALLOWED_TRANSITIONS = {
  placed:           ['confirmed', 'cancelled'],
  confirmed:        ['preparing', 'cancelled'],
  preparing:        ['ready',     'cancelled'],
  ready:            ['out_for_delivery'],
  out_for_delivery: ['delivered', 'returned'],
  delivered:        [],   // terminal
  cancelled:        [],   // terminal
  returned:         [],   // terminal
};
router.patch('/orders/:orderId/status', PartnerMiddleware, async (req, res) => {
  try {
    const { orderId }        = req.params;
    const { status, notes }  = req.body;
    // 1. Validate incoming status
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }
    // 2. Fetch order
    const order = await MealsOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }
    const currentStatus = order.orderStatus;
    // 3. Guard: already in that status
    if (currentStatus === status) {
      return res.status(400).json({
        success: false,
        message: `Order is already in '${status}' status`,
      });
    }
    // 4. Guard: invalid transition
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from '${currentStatus}' to '${status}'. Allowed: [${allowed.join(', ') || 'none'}]`,
      });
    }
    // 5. Apply status using instance methods from schema
    if (status === 'delivered') {
      order.markDelivered();
    } else if (status === 'cancelled') {
      order.cancelOrder(notes || 'Cancelled by partner');
    } else {
      order.updateOrderStatus(status, notes || '');
    }
    await order.save();
    return res.status(200).json({
      success: true,
      message: `Order status updated to '${status}'`,
      data: {
        orderId:       order._id,
        orderNumber:   order.orderNumber,
        previousStatus: currentStatus,
        currentStatus: order.orderStatus,
        statusHistory: order.statusHistory,
      },
    });
  } catch (error) {
    console.error('PATCH /orders/:orderId/status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message,
    });
  }
});

/* ---------------------------------------------------------------
   PATCH /api/partner/orders/:orderId/payment
   Update PAYMENT STATUS only
   Body: { paymentStatus, paymentReference? }
   --------------------------------------------------------------- */
router.patch('/orders/:orderId/payment', PartnerMiddleware, async (req, res) => {
  try {
    const { orderId }                        = req.params;
    const { paymentStatus, paymentReference } = req.body;

    const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

    if (!paymentStatus || !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid paymentStatus. Must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}`,
      });
    }
    const updateFields = { paymentStatus };
    if (paymentReference) updateFields.paymentReference = paymentReference;
    const order = await MealsOrder.findByIdAndUpdate(
      orderId,
      { $set: updateFields },
      { new: true, runValidators: true }
    )
      .populate('user',            'name email phone')
      .populate('deliveryAddress');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment status updated successfully',
      data: {
        orderId:          order._id,
        orderNumber:      order.orderNumber,
        paymentStatus:    order.paymentStatus,
        paymentReference: order.paymentReference,
      },
    });

  } catch (error) {
    console.error('PATCH /orders/:orderId/payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update payment status',
      error: error.message,
    });
  }
});


module.exports = router;