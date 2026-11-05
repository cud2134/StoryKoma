const express = require('express');
const router = express.Router();
const inicioController = require('../controllers/inicioController');

router.get('/', inicioController.index);

module.exports = router;
