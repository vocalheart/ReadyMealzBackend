const express = require('express');
const router = express.Router();
const Address = require('../models/Address.schema');
const AuthMiddleware = require('../../middleware/authMiddleware');


// ================= CREATE =================
// api/address/create
router.post('/create', AuthMiddleware, async (req, res) => {
  try {
    const address = new Address({
      ...req.body,
      user: req.user.id //token se user id
    });
    await address.save();
    res.status(201).json({
      success: true,
      message: "Address created successfully",
      data: address
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ================= GET ALL (USER WISE) =================
// api/address
router.get('/', AuthMiddleware, async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user.id });

    res.json({
      success: true,
      count: addresses.length,
      data: addresses
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ================= GET BY ID =================
// api/address/:id
router.get('/:id', AuthMiddleware, async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    res.json({ success: true, data: address });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ================= UPDATE =================
// api/address/update/:id
router.put('/update/:id', AuthMiddleware, async (req, res) => {
  try {
    const updated = await Address.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    res.json({
      success: true,
      message: "Address updated",
      data: updated
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ================= DELETE BY ID =================
// api/address/delete/:id
router.delete('/delete/:id', AuthMiddleware, async (req, res) => {
  try {
    const deleted = await Address.findOneAndDelete({_id: req.params.id,user: req.user.id});
    if (!deleted) {return res.status(404).json({success: false,message: "Address not found"});
    }
    res.json({success: true,message: "Address deleted successfully"});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// ================= SET DEFAULT =================
// api/address/set-default/:id
router.put('/set-default/:id', AuthMiddleware, async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }
    // sabka default false
    await Address.updateMany({ user: req.user.id },{ isDefault: false });
    address.isDefault = true;
    await address.save();
    res.json({
      success: true,
      message: "Default address set"
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


module.exports = router;