
const express = require('express');
const router = express.Router();
const Controller = require('./Controller/contoller');
const OrderHistory = require('../deleverySystem/allMealsOrders/allOrders.js');
const BulkOrders = require('./allMealsOrders/allBulkOrder.js');

router.use('/app' , Controller);
router.use('/meals' , OrderHistory);
router.use('/bulk', BulkOrders);

module.exports = router;