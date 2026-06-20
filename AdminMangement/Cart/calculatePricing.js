const express = require('express');
const router = express.Router();
const geolib = require('geolib');

const Cart = require('../models/CartSchema');
const Address = require('../../UserMangement/models/Address.schema');
const AuthMiddleware = require('../../middleware/authMiddleware');

/**
 * POST /calculate-delivery
 * Auth: required
 *
 * Body:  { addressId: string }
 *
 * Flow:
 *  1. Validate address exists + has lat/lng
 *  2. Load cart → get branch from first item
 *  3. Ensure all items are from the same branch
 *  4. Check branch is active + open
 *  5. Check distance ≤ delivery radius
 *  6. Check subtotal ≥ minimum order amount
 *  7. Calculate: delivery slab + surge + packaging + GST → finalAmount
 */
router.post('/calculate-delivery', AuthMiddleware, async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { addressId } = req.body;

        // ── 1. Validate address ──────────────────────────────────────────────
        if (!addressId)
            return res.status(400).json({ success: false, message: 'Address ID is required' });

        const address = await Address.findById(addressId);
        if (!address)
            return res.status(404).json({ success: false, message: 'Address not found' });

        if (!address.location?.lat || !address.location?.lng)
            return res.status(400).json({ success: false, message: 'Address location missing' });

        // ── 2. Load cart + branch ────────────────────────────────────────────
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.meal',
            populate: { path: 'branch' },
        });

        if (!cart?.items?.length)
            return res.status(400).json({ success: false, message: 'Cart is empty' });

        const branch = cart.items[0].meal?.branch;
        if (!branch)
            return res.status(400).json({ success: false, message: 'Restaurent not found' });

        // ── 3. All items must belong to the same branch ──────────────────────
        const mixedBranch = cart.items.some(
            item => item.meal.branch._id.toString() !== branch._id.toString()
        );
        if (mixedBranch)
            return res.status(400).json({ success: false, message: 'All cart items must belong to same Restaurent' });

        // ── 4. Branch status ─────────────────────────────────────────────────
        if (!branch.isActive)
            return res.status(400).json({ success: false, message: 'Restaurent is inactive' });
        if (!branch.isOpen)
            return res.status(400).json({ success: false, message: 'Restaurent is currently closed' });  //Branch is currently closed

        // ── 5. Distance check ────────────────────────────────────────────────
        const distanceKm = geolib.getDistance(
            { lat: branch.location.lat, lng: branch.location.lng },
            { lat: address.location.lat, lng: address.location.lng }
        ) / 1000;

        if (distanceKm > branch.deliveryRadiusKm)
            return res.status(400).json({
                success: false,
                message: 'Delivery not available in your area',
                yourDistance: Number(distanceKm.toFixed(2)),
                deliveryRadiusKm: branch.deliveryRadiusKm,
            });

        // ── 6. Minimum order check ───────────────────────────────────────────
        const subtotal = cart.cartTotal;
        if (subtotal < branch.minimumOrderAmount)
            return res.status(400).json({
                success: false,
                message: `Minimum order amount is ₹${branch.minimumOrderAmount}`,
                currentSubtotal: subtotal,
            });

        // ── 7a. Delivery charge (slab or free) ───────────────────────────────
        let deliveryCharge = 0;

        if (subtotal < branch.freeDeliveryAbove) {
            const slabs = branch.deliveryCharges || [];
            const match = slabs.find(s => distanceKm >= s.minKm && distanceKm <= s.maxKm);
            // use matched slab; fallback to last slab if none matched
            deliveryCharge = match
                ? match.charge
                : (slabs.at(-1)?.charge ?? 0);
        }

        // ── 7b. Surge charge ─────────────────────────────────────────────────
        let surgeCharge = 0;

        if (branch.surgePricing?.enabled) {
            const hour = new Date().getHours();
            const day = new Date().getDay();

            if (hour >= 12 && hour <= 15) surgeCharge += branch.surgePricing.lunchExtraCharge || 0; // lunch
            if (hour >= 19 && hour <= 23) surgeCharge += branch.surgePricing.dinnerExtraCharge || 0; // dinner
            if (day === 0 || day === 6) surgeCharge += branch.surgePricing.weekendExtraCharge || 0; // weekend
            // rain surge: reserved for future weather API integration
        }

        // ── 7c. Packaging + GST + Final ──────────────────────────────────────

        // Total quantity in cart
        const totalQuantity =
            cart.items.reduce(
                (acc, item) =>
                    acc + item.quantity,
                0
            );

        // Packaging charge per item
        const packagingCharge =totalQuantity * (branch.packagingCharge || 0);
        const gstPercentage = branch.gstPercentage || 0;
        const taxableAmount = subtotal + deliveryCharge + surgeCharge + packagingCharge;
        const gstAmount = (taxableAmount * gstPercentage) / 100;
        const finalAmount = taxableAmount + gstAmount;

        // ── Response ─────────────────────────────────────────────────────────
        return res.status(200).json({
            success: true,
            pricing: {
                subtotal,
                distanceKm: Number(distanceKm.toFixed(2)),
                minimumOrderAmount: branch.minimumOrderAmount,
                freeDeliveryAbove: branch.freeDeliveryAbove,
                deliveryCharge,
                surgeCharge,
                packagingCharge,
                gstPercentage,
                gstAmount: Number(gstAmount.toFixed(2)),
                finalAmount: Number(finalAmount.toFixed(2)),
            },
            branch: {
                _id: branch._id,
                name: branch.name,
                city: branch.city,
                address: branch.address,
                phone: branch.phone,
                estimatedDeliveryTime: branch.estimatedDeliveryTime,
            },
        });

    } catch (err) {
        console.error('[calculate-delivery]', err);
        return res.status(500).json({ success: false, message: err.message || 'Failed to calculate pricing' });
    }
});

module.exports = router;