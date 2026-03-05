const express = require('express');
const router = express.Router();
const BulkOrder = require('../models/bulkorderSchema');


/* ================================
   PUBLIC - GET ALL BULK ORDERS
================================ */

router.get('/public', async (req, res) => {
  try {
    const data = await BulkOrder.find({ isAvailable: true });
    res.status(200).json({success: true,data});
  } catch (error) {
    res.status(500).json({success: false,message: error.message});
  }
});


/* ================================
   PUBLIC - GET BULK ORDER BY ID
================================ */

router.get('/public/:id', async (req, res) => {
  try {

    const data = await BulkOrder.findById(req.params.id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Bulk order not found"
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


module.exports = router;