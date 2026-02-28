const express = require('express');
const router =  express.Router();
const AuthController = require('../authController/Auth.js');
const categoryRoutes = require('../category/category.routes.js')

router.use('/admin', AuthController);
// Category Routes (FIXED)
router.use('/category', categoryRoutes);

module.exports = router;



