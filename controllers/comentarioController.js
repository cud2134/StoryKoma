// Comentarios (de obras y de capitulos) y "me gusta"
const MangaModel = require('../models/MangaModel');
const CapituloModel = require('../models/CapituloModel');
const ComentarioModel = require('../models/ComentarioModel');
const NotificacionModel = require('../models/NotificacionModel');
const { noEncontrado, prohibido, texto, entero, volver } = require('./baseController');

// POST /mangas/:id/comentarios  (con capitulo_id si es de un capitulo)
const store = async (req, res, next) => {
  try {
    const manga = await MangaModel.getById(req.user, req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');

    const mensaje = texto(req.body.texto);
    if (!mensaje) {
      req.flash('error', 'Escribe algo antes de publicar tu comentario.');
      return volver(req, res, `/mangas/${manga.id}`);
    }
    if (mensaje.length > 1000) {
      req.flash('error', 'El comentario admite maximo 1000 caracteres.');
      return volver(req, res, `/mangas/${manga.id}`);
    }

    let idCapitulo = null;
    let capituloComentado = null;
    if (req.body.capitulo_id) {
      capituloComentado = await CapituloModel.getById(entero(req.body.capitulo_id));
      if (!capituloComentado || capituloComentado.idManga !== manga.id) return noEncontrado(res, 'No encontramos ese capitulo.');
      idCapitulo = capituloComentado.id;
    }
    await ComentarioModel.create({ idUsuario: req.user.id, idManga: manga.id, idCapitulo, texto: mensaje });
    if (manga.creadorId !== req.user.id) {
      const destino = capituloComentado
        ? `/mangas/${manga.id}/capitulos/${capituloComentado.numero}`
        : `/mangas/${manga.id}`;
      await NotificacionModel.crear(
        manga.creadorId,
        'comentario',
        capituloComentado
          ? `Comentaron el capitulo ${capituloComentado.numero} de «${manga.titulo}».`
          : `Comentaron tu manga «${manga.titulo}».`,
        destino
      );
    }
    req.flash('success', 'Comentario publicado.');
    volver(req, res, `/mangas/${manga.id}`);
  } catch (err) {
    next(err);
  }
};

const like = async (req, res, next) => {
  try {
    const comentario = await ComentarioModel.getById(req.params.id);
    if (!comentario) return noEncontrado(res, 'No encontramos ese comentario.');
    await ComentarioModel.toggleLike(comentario.id, req.user.id);
    volver(req, res, `/mangas/${comentario.idManga}`);
  } catch (err) {
    next(err);
  }
};

// Puede borrarlo su autor o un administrador
const destroy = async (req, res, next) => {
  try {
    const comentario = await ComentarioModel.getById(req.params.id);
    if (!comentario) return noEncontrado(res, 'No encontramos ese comentario.');
    if (comentario.idUsuario !== req.user.id && !req.user.esAdmin) return prohibido(res);
    await ComentarioModel.remove(comentario.id);
    req.flash('success', 'Comentario eliminado.');
    volver(req, res, `/mangas/${comentario.idManga}`);
  } catch (err) {
    next(err);
  }
};

module.exports = { store, like, destroy };
