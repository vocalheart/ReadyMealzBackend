const express = require('express');
const router  = express.Router();
const MealsOrder     = require('../../AdminMangement/models/OrderSchema');
const PartnerMiddleware = require('../middleware/PartnerMiddleware');

/* ================================================================
   PARTNER ORDER ROUTES
   Mount in app.js as:  app.use('/api/partner', partnerOrderRoutes)
   All routes: /api/partner/orders/...
   All routes protected by PartnerMiddleware
   ================================================================ */

const VALID_STATUSES = [
  'placed', 'confirmed', 'preparing', 'ready',
  'out_for_delivery', 'delivered', 'cancelled', 'returned',
];

const ALLOWED_TRANSITIONS = {
  placed:           ['confirmed', 'cancelled'],
  confirmed:        ['preparing', 'cancelled'],
  preparing:        ['ready',     'cancelled'],
  ready:            ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'returned'],
  delivered:        [],
  cancelled:        [],
  returned:         [],
};


/* ----------------------------------------------------------------
   GET /api/partner/orders/stats
   Quick counts + earnings summary (for dashboard cards)
   ---------------------------------------------------------------- */
router.get('/orders/stats', PartnerMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateFilter = {};
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from);
      if (to)   dateFilter.createdAt.$lte = new Date(to);
    }

    const [statusAgg, earningsAgg, paymentAgg] = await Promise.all([
      // Count per orderStatus
      MealsOrder.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
      ]),
      // Total earnings from delivered orders
      MealsOrder.aggregate([
        { $match: { ...dateFilter, orderStatus: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$orderTotal' }, count: { $sum: 1 } } },
      ]),
      // Payment status breakdown
      MealsOrder.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
      ]),
    ]);

    // Shape status counts into { placed: 2, confirmed: 5, ... }
    const statusCounts = VALID_STATUSES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    statusAgg.forEach(({ _id, count }) => { if (_id) statusCounts[_id] = count; });

    const paymentCounts = { pending: 0, paid: 0, failed: 0, refunded: 0 };
    paymentAgg.forEach(({ _id, count }) => { if (_id) paymentCounts[_id] = count; });

    const earnings = earningsAgg[0] ?? { total: 0, count: 0 };
    const totalOrders = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    return res.status(200).json({
      success: true,
      data: {
        totalOrders,
        statusCounts,
        paymentCounts,
        earnings: {
          total:         earnings.total,
          deliveredCount: earnings.count,
        },
        activeOrders: (statusCounts.placed || 0)
          + (statusCounts.confirmed || 0)
          + (statusCounts.preparing || 0)
          + (statusCounts.ready     || 0)
          + (statusCounts.out_for_delivery || 0),
      },
    });

  } catch (error) {
    console.error('GET /orders/stats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
  }
});


/* ----------------------------------------------------------------
   GET /api/partner/orders
   List all orders with filters, search, pagination
   Query params:
     status         — orderStatus value
     paymentStatus  — paymentStatus value
     paymentMethod  — cod | online | upi | wallet
     search         — order number OR customer name (case-insensitive)
     page           — default 1
     limit          — default 10 (max 50)
     from / to      — ISO date range on createdAt
     sort           — field name (default: createdAt)
     order          — asc | desc (default: desc)
   ---------------------------------------------------------------- */
router.get('/orders', PartnerMiddleware, async (req, res) => {
  try {
    const {
      status, paymentStatus, paymentMethod,
      search,
      page  = 1,
      limit = 10,
      from,  to,
      sort  = 'createdAt',
      order = 'desc',
    } = req.query;

    const safeLimit = Math.min(parseInt(limit), 50);
    const filter    = {};

    if (status)        filter.orderStatus   = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    // Text search: orderNumber or customer name via lookup
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { orderNumber: regex },
        // We also match after populate via aggregation below — or keep simple:
        { 'items.name': regex },
      ];
    }

    const skip  = (parseInt(page) - 1) * safeLimit;
    const total = await MealsOrder.countDocuments(filter);
    const sortDir = order === 'asc' ? 1 : -1;

    const orders = await MealsOrder.find(filter)
      .populate('user',           'name email phone')
      .populate('deliveryAddress')
      .populate('items.meal',     'name image category')
      .sort({ [sort]: sortDir })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Orders fetched successfully',
      data: {
        orders,
        pagination: {
          total,
          page:       parseInt(page),
          limit:      safeLimit,
          totalPages: Math.ceil(total / safeLimit),
          hasNext:    parseInt(page) < Math.ceil(total / safeLimit),
          hasPrev:    parseInt(page) > 1,
        },
      },
    });

  } catch (error) {
    console.error('GET /orders error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders', error: error.message });
  }
});


/* ----------------------------------------------------------------
   GET /api/partner/orders/:orderId
   Single order (fully populated + allowed next transitions)
   ---------------------------------------------------------------- */
router.get('/orders/:orderId', PartnerMiddleware, async (req, res) => {
  try {
    const order = await MealsOrder.findById(req.params.orderId)
      .populate('user',           'name email phone')
      .populate('deliveryAddress')
      .populate('items.meal',     'name image category description')
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Attach allowed transitions for frontend button rendering
    order.allowedTransitions = ALLOWED_TRANSITIONS[order.orderStatus] ?? [];

    return res.status(200).json({
      success: true,
      message: 'Order fetched successfully',
      data: { order },
    });

  } catch (error) {
    console.error('GET /orders/:orderId error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch order', error: error.message });
  }
});


/* ----------------------------------------------------------------
   PATCH /api/partner/orders/:orderId/status
   Update order status with transition guard
   Body: { status, notes? }
   ---------------------------------------------------------------- */
router.patch('/orders/:orderId/status', PartnerMiddleware, async (req, res) => {
  try {
    const { orderId }       = req.params;
    const { status, notes } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const order = await MealsOrder.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const currentStatus = order.orderStatus;

    if (currentStatus === status) {
      return res.status(400).json({ success: false, message: `Order already '${status}'` });
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot move from '${currentStatus}' → '${status}'. Allowed: [${allowed.join(', ') || 'none'}]`,
      });
    }

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
        orderId:            order._id,
        orderNumber:        order.orderNumber,
        previousStatus:     currentStatus,
        currentStatus:      order.orderStatus,
        allowedTransitions: ALLOWED_TRANSITIONS[order.orderStatus] ?? [],
        statusHistory:      order.statusHistory,
      },
    });

  } catch (error) {
    console.error('PATCH /orders/:orderId/status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
});


/* ----------------------------------------------------------------
   PATCH /api/partner/orders/:orderId/cancel
   Cancel with mandatory reason
   Body: { reason }
   ---------------------------------------------------------------- */
router.patch('/orders/:orderId/cancel', PartnerMiddleware, async (req, res) => {
  try {
    const { orderId }  = req.params;
    const { reason }   = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Cancel reason is required' });
    }

    const order = await MealsOrder.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const cancellable = ['placed', 'confirmed', 'preparing', 'ready'];
    if (!cancellable.includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order in '${order.orderStatus}' status`,
      });
    }

    order.cancelOrder(reason.trim());
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        orderId:       order._id,
        orderNumber:   order.orderNumber,
        cancelledAt:   order.cancelledAt,
        cancelReason:  order.cancelReason,
        currentStatus: order.orderStatus,
        statusHistory: order.statusHistory,
      },
    });

  } catch (error) {
    console.error('PATCH /orders/:orderId/cancel error:', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel order', error: error.message });
  }
});


/* ----------------------------------------------------------------
   PATCH /api/partner/orders/:orderId/payment
   Update payment status + optional reference
   Body: { paymentStatus, paymentReference? }
   ---------------------------------------------------------------- */
router.patch('/orders/:orderId/payment', PartnerMiddleware, async (req, res) => {
  try {
    const { orderId }                         = req.params;
    const { paymentStatus, paymentReference } = req.body;

    const VALID_PAYMENT = ['pending', 'paid', 'failed', 'refunded'];
    if (!paymentStatus || !VALID_PAYMENT.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid paymentStatus. Must be one of: ${VALID_PAYMENT.join(', ')}`,
      });
    }

    const updateFields = { paymentStatus };
    if (paymentReference !== undefined) updateFields.paymentReference = paymentReference;

    const order = await MealsOrder.findByIdAndUpdate(
      orderId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate('user', 'name email phone').populate('deliveryAddress');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    return res.status(200).json({
      success: true,
      message: 'Payment status updated',
      data: {
        orderId:          order._id,
        orderNumber:      order.orderNumber,
        paymentStatus:    order.paymentStatus,
        paymentReference: order.paymentReference,
      },
    });

  } catch (error) {
    console.error('PATCH /orders/:orderId/payment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update payment', error: error.message });
  }
});


/* ----------------------------------------------------------------
   PATCH /api/partner/orders/:orderId/notes
   Update delivery notes / special requests
   Body: { notes?, specialRequests?, estimatedDeliveryTime? }
   ---------------------------------------------------------------- */
router.patch('/orders/:orderId/notes', PartnerMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notes, specialRequests, estimatedDeliveryTime } = req.body;

    const updateFields = {};
    if (notes              !== undefined) updateFields.notes              = notes;
    if (specialRequests    !== undefined) updateFields.specialRequests    = specialRequests;
    if (estimatedDeliveryTime)            updateFields.estimatedDeliveryTime = new Date(estimatedDeliveryTime);

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const order = await MealsOrder.findByIdAndUpdate(
      orderId,
      { $set: updateFields },
      { new: true, runValidators: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    return res.status(200).json({
      success: true,
      message: 'Order notes updated',
      data: {
        orderId:               order._id,
        notes:                 order.notes,
        specialRequests:       order.specialRequests,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
      },
    });

  } catch (error) {
    console.error('PATCH /orders/:orderId/notes error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update notes', error: error.message });
  }
});


/* ----------------------------------------------------------------
   POST /api/partner/orders/bulk-status
   Update status for multiple orders at once
   Body: { orderIds: string[], status: string, notes?: string }
   ---------------------------------------------------------------- */
router.post('/orders/bulk-status', PartnerMiddleware, async (req, res) => {
  try {
    const { orderIds, status, notes } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderIds array is required' });
    }
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
    }
    if (orderIds.length > 50) {
      return res.status(400).json({ success: false, message: 'Max 50 orders per bulk update' });
    }

    const results = { success: [], failed: [] };

    const orders = await MealsOrder.find({ _id: { $in: orderIds } });

    await Promise.all(orders.map(async (order) => {
      try {
        const allowed = ALLOWED_TRANSITIONS[order.orderStatus] ?? [];
        if (!allowed.includes(status)) {
          results.failed.push({ id: order._id, reason: `Cannot move from '${order.orderStatus}' → '${status}'` });
          return;
        }
        if (status === 'delivered') order.markDelivered();
        else if (status === 'cancelled') order.cancelOrder(notes || 'Bulk cancelled by partner');
        else order.updateOrderStatus(status, notes || 'Bulk update');
        await order.save();
        results.success.push(order._id);
      } catch (err) {
        results.failed.push({ id: order._id, reason: err.message });
      }
    }));

    return res.status(200).json({
      success: true,
      message: `Bulk update done: ${results.success.length} updated, ${results.failed.length} failed`,
      data: results,
    });

  } catch (error) {
    console.error('POST /orders/bulk-status error:', error);
    return res.status(500).json({ success: false, message: 'Bulk update failed', error: error.message });
  }
});


module.exports = router;