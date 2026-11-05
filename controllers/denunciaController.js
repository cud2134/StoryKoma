// Boton de denuncia de una obra
const MangaModel = require('../models/MangaModel');
const DenunciaModel = require('../models/DenunciaModel');
const { noEncontrado, texto } = require('./baseController');

const store = async (req, res, next) => {
  try {
    const manga = await MangaModel.getById(req.user, req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    const motivo = texto(req.body.motivo);
    const detalle = texto(req.body.detalle);
    if (!DenunciaModel.MOTIVOS.includes(motivo)) {
      req.flash('error', 'Elige el motivo de la denuncia.');
      return res.redirect(`/mangas/${manga.id}`);
    }
    if (detalle.length > 500) {
      req.flash('error', 'El detalle admite maximo 500 caracteres.');
      return res.redirect(`/mangas/${manga.id}`);
    }
    await DenunciaModel.create({ idManga: manga.id, idUsuario: req.user.id, motivo, detalle });
    req.flash('success', 'Gracias por avisar. Un administrador revisara la obra.');
    res.redirect(`/mangas/${manga.id}`);
  } catch (err) {
    next(err);
  }
};

module.exports = { store };
