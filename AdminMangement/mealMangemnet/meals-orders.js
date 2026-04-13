const express = require('express');
const router = express.Router();

const Order = require('../models/OrderSchema');
const AdminAuthMiddleware = require('../../middleware/adminMiddleware');

/* =========================================
   GET ALL ORDERS (ADMIN) with filters
   GET /admin/meals/orders?status=placed&payment=paid&from=2024-01-01&to=2024-12-31&page=1&limit=20
========================================= */
router.get('/meals/orders', AdminAuthMiddleware, async (req, res) => {
  try {
    const { status, payment, from, to, page = 1, limit = 50, search } = req.query;

    const filter = {};
    if (status && status !== 'all')  filter.orderStatus  = status;
    if (payment && payment !== 'all') filter.paymentStatus = payment;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = Order.find(filter)
      .populate('user', 'name email mobile')
      .populate('deliveryAddress')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const [orders, total] = await Promise.all([
      query,
      Order.countDocuments(filter)
    ]);

    // Stats for dashboard
    const stats = await Order.aggregate([
      { $group: {
        _id: null,
        totalRevenue:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$orderTotal', 0] } },
        totalOrders:    { $sum: 1 },
        placedCount:    { $sum: { $cond: [{ $eq: ['$orderStatus', 'placed'] }, 1, 0] } },
        confirmedCount: { $sum: { $cond: [{ $eq: ['$orderStatus', 'confirmed'] }, 1, 0] } },
        preparingCount: { $sum: { $cond: [{ $eq: ['$orderStatus', 'preparing'] }, 1, 0] } },
        deliveredCount: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] } },
        cancelledCount: { $sum: { $cond: [{ $eq: ['$orderStatus', 'cancelled'] }, 1, 0] } },
        pendingPayment: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$orderTotal', 0] } },
        refundedAmount: { $sum: '$refundAmount' },
      }}
    ]);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      stats: stats[0] || {},
      data: orders
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching orders', error: error.message });
  }
});

/* =========================================
   GET SINGLE ORDER BY ID
   GET /admin/order/:id
========================================= */
router.get('/order/:id', AdminAuthMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email mobile')
      .populate('deliveryAddress')
      .populate('items.meal', 'name price image');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching order', error: error.message });
  }
});

/* =========================================
   GET ORDERS BY USER ID
   GET /admin/user-orders/:userId
========================================= */
router.get('/user-orders/:userId', AdminAuthMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.params.userId })
      .populate('deliveryAddress')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user orders', error: error.message });
  }
});

/* =========================================
   UPDATE ORDER STATUS
   PUT /admin/order-status/:id
   Body: { status, notes }
========================================= */
router.put('/order-status/:id', AdminAuthMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const validStatuses = ['placed','confirmed','preparing','ready','out_for_delivery','delivered','cancelled','returned'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Prevent updating already-final orders
    if (['delivered', 'cancelled', 'returned'].includes(order.orderStatus)) {
      return res.status(400).json({ success: false, message: `Order is already ${order.orderStatus}. Cannot update.` });
    }

    order.updateOrderStatus(status, notes || '');

    // Auto-set delivery time
    if (status === 'delivered') order.actualDeliveryTime = new Date();
    if (status === 'cancelled') {
      order.cancelledAt  = new Date();
      order.cancelReason = notes || 'Admin cancelled';
    }

    await order.save();

    res.status(200).json({ success: true, message: 'Order status updated', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating order status', error: error.message });
  }
});

/* =========================================
   UPDATE PAYMENT STATUS
   PUT /admin/payment-status/:id
   Body: { paymentStatus, paymentReference }
========================================= */
router.put('/payment-status/:id', AdminAuthMiddleware, async (req, res) => {
  try {
    const { paymentStatus, paymentReference } = req.body;

    const validPayStatuses = ['pending', 'paid', 'failed', 'refunded'];
    if (!paymentStatus || !validPayStatuses.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: `Invalid payment status. Must be one of: ${validPayStatuses.join(', ')}` });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.paymentStatus = paymentStatus;
    if (paymentReference) order.paymentReference = paymentReference;

    // Add to status history
    order.statusHistory.push({
      status: `payment_${paymentStatus}`,
      timestamp: new Date(),
      notes: `Payment marked as ${paymentStatus}${paymentReference ? ` (Ref: ${paymentReference})` : ''}`
    });

    await order.save();

    res.status(200).json({ success: true, message: 'Payment status updated', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating payment status', error: error.message });
  }
});

/* =========================================
   PROCESS REFUND
   PUT /admin/refund/:id
   Body: { refundAmount, refundStatus, notes }
========================================= */
router.put('/refund/:id', AdminAuthMiddleware, async (req, res) => {
  try {
    const { refundAmount, refundStatus = 'processed', notes } = req.body;

    const validRefundStatuses = ['pending', 'processed', 'rejected'];
    if (!validRefundStatuses.includes(refundStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid refund status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (refundAmount !== undefined) {
      if (refundAmount > order.orderTotal) {
        return res.status(400).json({ success: false, message: 'Refund amount cannot exceed order total' });
      }
      order.refundAmount = refundAmount;
    }

    order.refundStatus    = refundStatus;
    order.paymentStatus   = refundStatus === 'processed' ? 'refunded' : order.paymentStatus;

    order.statusHistory.push({
      status: `refund_${refundStatus}`,
      timestamp: new Date(),
      notes: notes || `Refund ${refundStatus} — ₹${order.refundAmount}`
    });

    await order.save();

    res.status(200).json({ success: true, message: 'Refund updated', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error processing refund', error: error.message });
  }
});

/* =========================================
   SET ESTIMATED DELIVERY TIME
   PUT /admin/delivery-time/:id
   Body: { estimatedDeliveryTime }  (ISO string)
========================================= */
router.put('/delivery-time/:id', AdminAuthMiddleware, async (req, res) => {
  try {
    const { estimatedDeliveryTime } = req.body;
    if (!estimatedDeliveryTime) {
      return res.status(400).json({ success: false, message: 'estimatedDeliveryTime is required' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { estimatedDeliveryTime: new Date(estimatedDeliveryTime) },
      { new: true }
    ).populate('user', 'name email').populate('deliveryAddress');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.status(200).json({ success: true, message: 'Delivery time set', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error setting delivery time', error: error.message });
  }
});

/* =========================================
   BULK STATUS UPDATE
   PUT /admin/bulk-status
   Body: { orderIds: [], status, notes }
========================================= */
router.put('/bulk-status', AdminAuthMiddleware, async (req, res) => {
  try {
    const { orderIds, status, notes } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderIds array required' });
    }

    const results = await Promise.allSettled(
      orderIds.map(async (id) => {
        const order = await Order.findById(id);
        if (!order) throw new Error(`Order ${id} not found`);
        order.updateOrderStatus(status, notes || '');
        await order.save();
        return order.orderNumber;
      })
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').map(r => (r ).value);
    const failed    = results.filter(r => r.status === 'rejected').map(r => (r ).reason?.message);

    res.status(200).json({ success: true, message: `Updated ${succeeded.length} orders`, succeeded, failed });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Bulk update failed', error: error.message });
  }
});

/* =========================================
   ORDER STATS SUMMARY
   GET /admin/orders/stats
========================================= */
router.get('/orders/stats', AdminAuthMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [overall, todayStats] = await Promise.all([
      Order.aggregate([
        { $group: {
          _id: null,
          total: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus','paid'] }, '$orderTotal', 0] } },
          avgOrder: { $avg: '$orderTotal' },
          refunded: { $sum: '$refundAmount' },
          byStatus: { $push: '$orderStatus' },
        }}
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus','paid'] }, '$orderTotal', 0] } },
        }}
      ])
    ]);

    res.status(200).json({ success: true, data: { overall: overall[0] || {}, today: todayStats[0] || {} } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching stats', error: error.message });
  }
});

module.exports = router;