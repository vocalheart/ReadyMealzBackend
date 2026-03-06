const express = require("express");
const router  = express.Router();

const BulkOrderQuote = require("../models/bulkOrderQuoteSchema");
const BulkOrder      = require("../models/bulkorderSchema");
const protect        = require("../../middleware/FullRoleMiddleware");
const authorizeRoles = require("../../middleware/roleMiddleware");

/* ══════════════════════════════════════════════
   PUBLIC — Submit Quote Request
   POST /bulk-quotes/submit
══════════════════════════════════════════════ */
router.post("/submit", async (req, res) => {
  try {
    const {
      bulkOrderId,
      name,
      email,
      phone,
      company,
      eventType,
      eventDate,
      quantity,
      requirements,
    } = req.body;

    /* ── Validations ── */
    if (!bulkOrderId)
      return res.status(400).json({ success: false, message: "Bulk order ID is required" });
    if (!name?.trim())
      return res.status(400).json({ success: false, message: "Name is required" });
    if (!email?.trim())
      return res.status(400).json({ success: false, message: "Email is required" });
    if (!phone?.trim())
      return res.status(400).json({ success: false, message: "Phone is required" });
    if (!eventType)
      return res.status(400).json({ success: false, message: "Event type is required" });
    if (!eventDate)
      return res.status(400).json({ success: false, message: "Event date is required" });
    if (!quantity || isNaN(quantity) || Number(quantity) < 1)
      return res.status(400).json({ success: false, message: "Valid quantity is required" });

    /* ── Check bulk order exists and is available ── */
    const bulkOrder = await BulkOrder.findById(bulkOrderId);
    if (!bulkOrder)
      return res.status(404).json({ success: false, message: "Bulk order not found" });
    if (bulkOrder.isAvailable === false)
      return res.status(400).json({ success: false, message: "This bulk order is currently unavailable" });

    /* ── Validate quantity range ── */
    if (bulkOrder.minQuantity && Number(quantity) < bulkOrder.minQuantity) {
      return res.status(400).json({
        success: false,
        message: `Minimum quantity for this pack is ${bulkOrder.minQuantity}`,
      });
    }
    if (bulkOrder.maxQuantity && Number(quantity) > bulkOrder.maxQuantity) {
      return res.status(400).json({
        success: false,
        message: `Maximum quantity for this pack is ${bulkOrder.maxQuantity}`,
      });
    }

    /* ── Calculate estimated total ── */
    const estimatedTotal = bulkOrder.price * Number(quantity);

    /* ── Save quote ── */
    const quote = await BulkOrderQuote.create({
      bulkOrder:      bulkOrderId,
      name:           name.trim(),
      email:          email.trim().toLowerCase(),
      phone:          phone.trim(),
      company:        company?.trim() || "",
      eventType,
      eventDate:      new Date(eventDate),
      quantity:       Number(quantity),
      requirements:   requirements?.trim() || "",
      estimatedTotal,
      status:         "pending",
    });

    const populated = await quote.populate("bulkOrder", "name price category");

    res.status(201).json({
      success: true,
      message: "Quote request submitted successfully! We'll contact you within 2 hours.",
      data: populated,
    });
  } catch (err) {
    console.error("[BULK-QUOTE SUBMIT]", err);
    res.status(500).json({ success: false, message: err.message || "Failed to submit quote" });
  }
});

/* ══════════════════════════════════════════════
   ADMIN — Get All Quotes
   GET /bulk-quotes/
   Query: status, page, limit, search
══════════════════════════════════════════════ */
router.get(
  "/",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { status, page = 1, limit = 15, search } = req.query;

      const query = {};
      if (status) query.status = status;
      if (search?.trim()) {
        query.$or = [
          { name:  { $regex: search.trim(), $options: "i" } },
          { email: { $regex: search.trim(), $options: "i" } },
          { phone: { $regex: search.trim(), $options: "i" } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [quotes, total] = await Promise.all([
        BulkOrderQuote.find(query)
          .populate("bulkOrder", "name price category imageUrl")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        BulkOrderQuote.countDocuments(query),
      ]);

      res.json({
        success: true,
        quotes,
        page:       Number(page),
        limit:      Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      });
    } catch (err) {
      console.error("[BULK-QUOTES GET-ALL]", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ══════════════════════════════════════════════
   ADMIN — Get Single Quote
   GET /bulk-quotes/:id
══════════════════════════════════════════════ */
router.get(
  "/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const quote = await BulkOrderQuote.findById(req.params.id)
        .populate("bulkOrder", "name price category imageUrl minQuantity maxQuantity");
      if (!quote)
        return res.status(404).json({ success: false, message: "Quote not found" });
      res.json({ success: true, data: quote });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ══════════════════════════════════════════════
   ADMIN — Update Quote Status
   PATCH /bulk-quotes/:id/status
══════════════════════════════════════════════ */
router.patch(
  "/:id/status",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { status } = req.body;
      const allowed = ["pending", "contacted", "confirmed", "cancelled"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const quote = await BulkOrderQuote.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).populate("bulkOrder", "name price");

      if (!quote)
        return res.status(404).json({ success: false, message: "Quote not found" });

      res.json({ success: true, message: "Status updated", data: quote });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ══════════════════════════════════════════════
   ADMIN — Delete Quote
   DELETE /bulk-quotes/:id
══════════════════════════════════════════════ */
router.delete(
  "/:id",
  protect,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const quote = await BulkOrderQuote.findByIdAndDelete(req.params.id);
      if (!quote)
        return res.status(404).json({ success: false, message: "Quote not found" });
      res.json({ success: true, message: "Quote deleted" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

module.exports = router;