const express = require('express');
const router =  express.Router();
const AuthController = require('../authController/Auth.js');
const categoryRoutes = require('../category/category.routes.js')
const userMangement = require('../userManagement/userManagement.js')
router.use('/admin', AuthController);
// Category Routes (FIXED)
router.use('/category', categoryRoutes);
router.use('/admin/users' , userMangement)
module.exports = router;



