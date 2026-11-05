const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const perfilController = require('../controllers/perfilController');
const Upload = require('../config/upload');

router.get('/', perfilController.index);
router.get('/creador', authController.soloCreador, perfilController.creador);
router.post('/', Upload.avatar, perfilController.update);

module.exports = router;
