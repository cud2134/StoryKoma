const express = require('express');
const router = express.Router();
const fisicoController = require('../controllers/fisicoController');

router.get('/', fisicoController.index);

module.exports = router;
