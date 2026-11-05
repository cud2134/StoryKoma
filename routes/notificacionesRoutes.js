const express = require('express');
const router = express.Router();
const notificacionController = require('../controllers/notificacionController');

router.get('/', notificacionController.index);
router.post('/leer', notificacionController.marcarLeidas);
router.delete('/:id', notificacionController.destroy);

module.exports = router;
