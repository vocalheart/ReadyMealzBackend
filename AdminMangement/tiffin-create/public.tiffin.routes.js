const express = require("express");
const router = express.Router();
const Tiffin = require("../models/tiffin.schema");

/* ===========================
   GET ALL TIFFINS
=========================== */

router.get("/tiffins", async (req, res) => {
  try {

    const tiffins = await Tiffin.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      tiffins,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
});

/* ===========================
   GET SINGLE TIFFIN
=========================== */

router.get("/tiffin/:id", async (req, res) => {
  try {

    const tiffin = await Tiffin.findById(req.params.id);

    if (!tiffin) {
      return res.status(404).json({
        success: false,
        message: "Tiffin not found",
      });
    }

    res.json({
      success: true,
      tiffin,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Invalid ID",
    });

  }
});

module.exports = router;