const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/', adminController.index);

// Usuarios: tipo de cuenta, baneo, advertencias
router.post('/usuarios/:id/rol', adminController.cambiarRol);
router.post('/usuarios/:id/ban', adminController.banear);
router.post('/usuarios/:id/desban', adminController.desbanear);
router.post('/usuarios/:id/advertir', adminController.advertir);
router.delete('/usuarios/:id', adminController.eliminarUsuario);

// Obras y denuncias
router.post('/mangas/:id/visibilidad', adminController.visibilidadManga);
router.post('/denuncias/:id/estado', adminController.estadoDenuncia);
router.delete('/denuncias/:id', adminController.eliminarDenuncia);
router.post('/apelaciones/:id/proceso', adminController.tomarApelacion);
router.post('/apelaciones/:id/resolver', adminController.resolverApelacion);
router.delete('/apelaciones/:id', adminController.eliminarApelacion);

module.exports = router;
