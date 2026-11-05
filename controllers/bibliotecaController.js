// Guardar una obra en la biblioteca segun el estado de lectura (siguiendo / pendiente / terminado)
const MangaModel = require('../models/MangaModel');
const BibliotecaModel = require('../models/BibliotecaModel');
const { noEncontrado, texto, volver } = require('./baseController');

const guardar = async (req, res, next) => {
  try {
    const manga = await MangaModel.getById(req.user, req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    const estado = texto(req.body.estado);
    if (!BibliotecaModel.ESTADOS.includes(estado)) return noEncontrado(res, 'Estado de lectura no valido.');
    const estadoActual = await BibliotecaModel.getEstado(req.user.id, manga.id);
    if (estadoActual === estado) {
      await BibliotecaModel.quitar(req.user.id, manga.id);
      req.flash('success', `«${manga.titulo}» quitado de tu biblioteca.`);
      return volver(req, res, `/mangas/${manga.id}`);
    }
    await BibliotecaModel.guardar(req.user.id, manga.id, estado);
    req.flash('success', `«${manga.titulo}» guardado en ${estado}.`);
    volver(req, res, `/mangas/${manga.id}`);
  } catch (err) {
    next(err);
  }
};

const quitar = async (req, res, next) => {
  try {
    await BibliotecaModel.quitar(req.user.id, req.params.id);
    req.flash('success', 'Quitado de tu biblioteca.');
    volver(req, res, `/mangas/${req.params.id}`);
  } catch (err) {
    next(err);
  }
};

module.exports = { guardar, quitar };
