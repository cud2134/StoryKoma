const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/', authController.showBienvenida);
router.post('/login', authController.login);
router.post('/registro', authController.register);
router.get('/verificar-correo', authController.verificarCorreo);
router.post('/verificar-correo', authController.verificarCorreo);
router.post('/verificar-correo/reenviar', authController.reenviarVerificacion);
router.post('/auth/google', authController.googleLogin);
router.get('/auth/google/completar', authController.googleCompletarForm);
router.post('/auth/google/completar', authController.googleCompletar);
router.post('/logout', authController.logout);

module.exports = router;
