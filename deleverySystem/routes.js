
const express = require('express');
const router = express.Router();
const Controller = require('./Controller/contoller');

router.use('/app' , Controller);

module.exports = router;

