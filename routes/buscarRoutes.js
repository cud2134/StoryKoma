const express = require('express');
const router = express.Router();
const buscarController = require('../controllers/buscarController');

router.get('/', buscarController.index);

module.exports = router;
