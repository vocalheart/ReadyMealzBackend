
const express = require('express');
const router = express.Router();
const Controller = require('./Controller/contoller');
const OrderHistory = require('../deleverySystem/allMealsOrders/allOrders.js');

router.use('/app' , Controller);
router.use('/meals' , OrderHistory);

module.exports = router;