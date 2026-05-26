const express = require("express");
const router = express.Router();

const BulkOrderQuote = require("../../AdminMangement/models/BulkOrderQuoteSchema");
const PartnerMiddleware = require("../middleware/PartnerMiddleware");

// ======================================================
// GET ALL BULK ORDERS
// ======================================================
router.get("/bulk-orders",PartnerMiddleware,async (req, res) => {
        try {
            const orders = await BulkOrderQuote.find().populate("bulkOrder").sort({ createdAt: -1 });
            res.status(200).json({success: true, totalOrders: orders.length,orders});
        } catch (error) {
            console.log(error);
            res.status(500).json({success: false,message: "Failed to fetch bulk orders",
            });
        }
    }
);

// ======================================================
// GET SINGLE BULK ORDER
// ======================================================
router.get(
    "/bulk-orders/:id",
    PartnerMiddleware,
    async (req, res) => {
        try {
            const order = await BulkOrderQuote.findById(req.params.id)
                .populate("bulkOrder");

            if (!order) {
                return res.status(404).json({success: false,message: "Order not found"})}
            res.status(200).json({
                success: true,
                order,
            });
        } catch (error) {
            console.log(error);

            res.status(500).json({
                success: false,
                message: "Failed to fetch order",
            });
        }
    }
);

// ======================================================
// UPDATE DELIVERY STATUS
// ======================================================
router.put("/bulk-orders/update-status/:id",PartnerMiddleware,async (req, res) => {
        try {
            const { status } = req.body;
            const validStatuses = [
                "pending",
                "contacted",
                "confirmed",
                "cancelled",
            ];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid status",
                });
            }
            const updatedOrder = await BulkOrderQuote.findByIdAndUpdate(req.params.id,{status},{new: true});
            if (!updatedOrder) {return res.status(404).json({ success: false,message: "Order not found"})}
            res.status(200).json({success: true,message: "Order status updated successfully",order: updatedOrder});
        } catch (error) {
            console.log(error);
            res.status(500).json({ success: false,message: "Failed to update order status"});
        }
    }
);

// ======================================================
// UPDATE PAYMENT STATUS
// ======================================================
router.put("/bulk-orders/update-payment/:id",PartnerMiddleware,async (req, res) => {
        try {
            const { paymentStatus,razorpayOrderId,razorpayPaymentId,} = req.body;
            const validPaymentStatuses = ["pending","paid","failed",];
            if (!validPaymentStatuses.includes(paymentStatus)) {
                return res.status(400).json({success: false,message: "Invalid payment status",
                });
            }
            const updatedOrder = await BulkOrderQuote.findByIdAndUpdate(req.params.id, { paymentStatus, razorpayOrderId, razorpayPaymentId },
                {
                    new: true,
                }
            );
            if (!updatedOrder) { return res.status(404).json({ success: false, message: "Order not found" }) }
            res.status(200).json({ success: true, message: "Payment status updated successfully", order: updatedOrder });
        } catch (error) {
            console.log(error);
            res.status(500).json({ success: false, message: "Failed to update payment status" });
        }
    }
);

// ======================================================
// DELETE BULK ORDER
// ======================================================
router.delete("/bulk-orders/:id", PartnerMiddleware, async (req, res) => {
    try {
        const deletedOrder = await BulkOrderQuote.findByIdAndDelete(req.params.id);
        if (!deletedOrder) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        res.status(200).json({ success: true, message: "Bulk order deleted successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Failed to delete order" });
    }
}
);

module.exports = router;