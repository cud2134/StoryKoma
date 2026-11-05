const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const premiumController = require('../controllers/premiumController');

router.post('/webhooks/mercadopago', premiumController.webhookMercadoPago);
router.post('/webhooks/paypal', premiumController.webhookPayPal);
router.use(authController.requireLogin);
router.get('/', premiumController.index);
router.get('/checkout/:plan', premiumController.formularioPago);
router.post('/checkout/:plan', premiumController.iniciarPago);
router.get('/mercadopago/retorno', premiumController.retornoMercadoPago);
router.get('/paypal/retorno', premiumController.retornoPayPal);
router.get('/paypal/cancelado', premiumController.cancelarPayPal);

module.exports = router;
