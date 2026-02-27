const express = require('express');
const router =  express.Router();
const AuthController = require('../authController/Auth.js');

router.use('/admin', AuthController);


module.exports = router;



