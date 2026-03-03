const express = require('express');
const router =  express.Router();
const AuthController = require('../authController/Auth.js');
const categoryRoutes = require('../category/category.routes.js')
const userMangement = require('../userManagement/userManagement.js');
const MealMangement = require('../mealMangemnet/meal.js');
const Tags = require('../tag//tags');
const FoodTypes = require('../foodTypes/foodType.js');


router.use('/admin', FoodTypes)
router.use('/admin' , MealMangement)
router.use('/admin', AuthController);
// Category Routes (FIXED)
router.use('/category', categoryRoutes);
router.use('/admin/users' , userMangement);
router.use('/admin', Tags);

module.exports = router;



