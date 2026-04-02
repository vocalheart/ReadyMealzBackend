const express = require("express");
const router = express.Router();
const razorpay = require("../config/razorpay");
const crypto = require("crypto");

const BulkOrderQuote = require("../../models/Bulkorderquoteschema");

const orderId = "order_SYcKteHWQSp6Em";
const paymentId = "pay_test123";

const signature = crypto
  .createHmac("sha256", "kfi1coMGeo3UYYZFdE9pd3oh")
  .update(orderId + "|" + paymentId)
  .digest("hex");

console.log(signature);

// =====================================
//  CREATE ORDER (SAFE + DB SAVE)
// =====================================
router.post("/create-order", async (req, res) => {
  try {
    const { quoteId } = req.body;
    // quote fetch karo
    const quote = await BulkOrderQuote.findById(quoteId).populate("bulkOrder");
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }
    // price calculate (secure way)
    const productPrice = quote.bulkOrder.price;
    const totalAmount = productPrice * quote.quantity;
    // Razorpay order create
    const options = {
      amount: totalAmount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };
    const razorpayOrder = await razorpay.orders.create(options);
    // DB update
    quote.estimatedTotal = totalAmount;
    quote.razorpayOrderId = razorpayOrder.id;
    quote.paymentStatus = "pending";
    await quote.save();
    res.json({success: true,razorpayOrder,quote});
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});


// =====================================
//  VERIFY PAYMENT + UPDATE DB
// =====================================
router.post("/verify-payment", async (req, res) => {
  try {
    const {razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto.createHmac("sha256", "kfi1coMGeo3UYYZFdE9pd3oh").update(body).digest("hex");
    if (expectedSignature === razorpay_signature) {
      // DB update
      const quote = await BulkOrderQuote.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          razorpayPaymentId: razorpay_payment_id,
          paymentStatus: "paid",
          status: "confirmed", // optional
        },
        { new: true }
      );
      return res.json({
        success: true,
        message: "Payment verified & order confirmed",
        quote,
      });
    } else {
      await BulkOrderQuote.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { paymentStatus: "failed" }
      );
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;