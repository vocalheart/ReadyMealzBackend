const express = require('express');
const router =  express.Router();
const AuthController = require('../authController/Auth.js');
const categoryRoutes = require('../category/category.routes.js')
const userMangement = require('../userManagement/userManagement.js');
const MealMangement = require('../mealMangemnet/meal.js');
const Tags = require('../tag//tags');
const FoodTypes = require('../foodTypes/foodType.js');
const bulkOrder = require('../bulk-order/bulkorder.js')
const PublicBulkOrders = require('../bulk-order/publicBulk.js');
const Bulkorderquoteroutes = require('../bulk-order/Bulkorderquoteroutes');
const CreateTiffin = require('../tiffin-create/tiffin.js')
const publicTiffin = require('../tiffin-create/public.tiffin.routes');
const Cart = require('../Cart/Cart.js');
const Order = require('../Cart/Orderroutes')
router.use('/admin', FoodTypes)
router.use('/admin' , MealMangement)
router.use('/admin', AuthController);
// Category Routes (FIXED)
router.use('/category', categoryRoutes);
router.use('/admin/users' , userMangement);
router.use('/admin', Tags);

//tiffin
router.use('/admin', CreateTiffin)
router.use('/public',  publicTiffin)
//bulk---Order
router.use('/bulk' , bulkOrder);
router.use('/bulk' , PublicBulkOrders);
router.use('/bulk-quotes', Bulkorderquoteroutes);


//cart
router.use('/cart', Cart);

//orders
router.use('/orders', Order)
//
module.exports = router;



