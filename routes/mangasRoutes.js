const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const mangaController = require('../controllers/mangaController');
const capituloController = require('../controllers/capituloController');
const comentarioController = require('../controllers/comentarioController');
const bibliotecaController = require('../controllers/bibliotecaController');
const denunciaController = require('../controllers/denunciaController');
const Upload = require('../config/upload');

// Publicar una obra (creadores y administradores)
router.get('/nuevo', authController.soloCreador, mangaController.create);
router.post('/', authController.soloCreador, Upload.portadaYCapitulosIniciales, mangaController.store);

// Ver, editar, cambiar estado y eliminar
router.get('/:id', mangaController.show);
router.get('/:id/editar', mangaController.edit);
router.post('/:id/editar', Upload.portadaYCapitulo, mangaController.update);
router.post('/:id/estado', mangaController.cambiarEstado);
router.delete('/:id', mangaController.destroy);

// Capitulos (la ruta "nuevo" va antes que ":numero")
router.get('/:id/capitulos/nuevo', capituloController.create);
router.post('/:id/capitulos', Upload.soloCapitulo, capituloController.store);
router.get('/:id/capitulos/:numero', capituloController.leer);
router.delete('/:id/capitulos/:capId', capituloController.destroy);

// Comentarios, biblioteca y denuncia
router.post('/:id/comentarios', comentarioController.store);
router.post('/:id/biblioteca', bibliotecaController.guardar);
router.delete('/:id/biblioteca', bibliotecaController.quitar);
router.post('/:id/denunciar', denunciaController.store);

module.exports = router;
