const express = require('express');
const router = express.Router();
const Branch = require('../models/branchSchema.js');
const protect = require('../../middleware/FullRoleMiddleware.js');
const authorizeRoles = require('../../middleware/roleMiddleware');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build GeoJSON + location from lat/lng
// ─────────────────────────────────────────────────────────────────────────────
const buildGeoFields = (lat, lng) => ({
  location:    { lat, lng },
  geoLocation: { type: 'Point', coordinates: [lng, lat] },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generate branchCode  →  BR-MUM-X4F2A
// ─────────────────────────────────────────────────────────────────────────────
const generateBranchCode = (city = 'XX') => {
  const prefix = city.slice(0, 3).toUpperCase();
  const suffix = Date.now().toString(36).toUpperCase().slice(-5);
  return `BR-${prefix}-${suffix}`;
};

// ═════════════════════════════════════════════════════════════════════════════
// POST  /branch  — Create a new branch
// ═════════════════════════════════════════════════════════════════════════════
router.post('/branch', protect, authorizeRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const {
      name, address, city, state, pincode, landmark, phone, email,
      location,
      isActive, isOpen,
      deliveryRadiusKm, minimumOrderAmount, freeDeliveryAbove,
      estimatedDeliveryTime, deliveryCharges, surgePricing,
      packagingCharge, gstPercentage,
      openingTime, closingTime,
      branchImage, rating,
    } = req.body;

    // Required fields
    if (!name || !address || !location?.lat || !location?.lng) {
      return res.status(400).json({
        success: false,
        message: 'name, address, and location (lat & lng) are required.',
      });
    }

    const adminId = req.user?._id || req.user?.id;
    if (!adminId) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const branch = await Branch.create({
      Admin: adminId,
      name, address, city, state, pincode, landmark, phone, email,
      ...buildGeoFields(location.lat, location.lng),
      branchCode: generateBranchCode(city),

      ...(isActive            !== undefined && { isActive }),
      ...(isOpen              !== undefined && { isOpen }),
      ...(deliveryRadiusKm    !== undefined && { deliveryRadiusKm }),
      ...(minimumOrderAmount  !== undefined && { minimumOrderAmount }),
      ...(freeDeliveryAbove   !== undefined && { freeDeliveryAbove }),
      ...(estimatedDeliveryTime             && { estimatedDeliveryTime }),
      ...(deliveryCharges?.length           && { deliveryCharges }),
      ...(surgePricing                      && { surgePricing }),
      ...(packagingCharge     !== undefined && { packagingCharge }),
      ...(gstPercentage       !== undefined && { gstPercentage }),
      ...(openingTime                       && { openingTime }),
      ...(closingTime                       && { closingTime }),
      ...(branchImage                       && { branchImage }),
      ...(rating              !== undefined && { rating }),
    });

    return res.status(201).json({
      success: true,
      message: 'Branch created successfully.',
      data: branch,
    });

  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({ success: false, message: 'Branch code conflict. Please retry.' });
    if (error.name === 'ValidationError')
      return res.status(400).json({ success: false, message: Object.values(error.errors).map(e => e.message).join(', ') });
    console.error('[POST /branch]', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET  /branch  — List all branches (with optional filters)
// ═════════════════════════════════════════════════════════════════════════════
router.get('/branch', protect, authorizeRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const {
      page     = 1,
      limit    = 10,
      isActive,
      isOpen,
      city,
      search,
      sortBy   = 'createdAt',
      order    = 'desc',
    } = req.query;

    // Build filter
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (isOpen   !== undefined) filter.isOpen   = isOpen   === 'true';
    if (city)                   filter.city     = { $regex: city, $options: 'i' };
    if (search) {
      filter.$or = [
        { name:       { $regex: search, $options: 'i' } },
        { branchCode: { $regex: search, $options: 'i' } },
        { address:    { $regex: search, $options: 'i' } },
      ];
    }

    const skip      = (Number(page) - 1) * Number(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [branches, total] = await Promise.all([
      Branch.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(Number(limit))
        .select('-__v'),
      Branch.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: branches,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });

  } catch (error) {
    console.error('[GET /branch]', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET  /branch/:id  — Get single branch by ID
// ═════════════════════════════════════════════════════════════════════════════
router.get('/branch/:id', protect, authorizeRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id).select('-__v');

    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    return res.status(200).json({ success: true, data: branch });

  } catch (error) {
    if (error.name === 'CastError')
      return res.status(400).json({ success: false, message: 'Invalid branch ID.' });
    console.error('[GET /branch/:id]', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT  /branch/:id  — Update branch by ID
// ═════════════════════════════════════════════════════════════════════════════
router.put('/branch/:id', protect, authorizeRoles('admin', 'superadmin'), async (req, res) => {
  try {
    // Prevent overwriting immutable fields
    const { branchCode, Admin, _id, ...updateData } = req.body;

    // If location is being updated, keep geoLocation in sync
    if (updateData.location?.lat && updateData.location?.lng) {
      const { lat, lng } = updateData.location;
      Object.assign(updateData, buildGeoFields(lat, lng));
    }

    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-__v');
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Branch updated successfully.',
      data: branch,
    });

  } catch (error) {
    if (error.name === 'CastError')
      return res.status(400).json({ success: false, message: 'Invalid branch ID.' });
    if (error.name === 'ValidationError')
      return res.status(400).json({ success: false, message: Object.values(error.errors).map(e => e.message).join(', ') });
    console.error('[PUT /branch/:id]', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;