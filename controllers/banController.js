const UsuarioModel = require('../models/UsuarioModel');
const { texto } = require('./baseController');

const index = async (req, res, next) => {
  try {
    if (req.user.estado !== 'Baneado') return res.redirect('/inicio');
    const baneo = await UsuarioModel.getBanDetails(req.user.id);
    if (!baneo) return next(new Error(`No se encontro el registro de baneo activo del usuario ${req.user.id}.`));
    res.render('ban/index', { title: 'Cuenta bloqueada', baneo });
  } catch (err) {
    next(err);
  }
};

const apelar = async (req, res, next) => {
  try {
    const mensaje = texto(req.body.mensaje);
    if (!mensaje || mensaje.length > 1000) {
      req.flash('error', 'Escribe tu apelacion (maximo 1000 caracteres).');
      return res.redirect('/ban');
    }
    const creada = await UsuarioModel.crearApelacion(req.user.id, mensaje);
    if (!creada) {
      req.flash('error', 'Ya existe una apelacion para este baneo o el baneo ya no esta activo.');
      return res.redirect('/ban');
    }
    req.flash('success', 'Tu apelacion fue enviada al equipo de administracion.');
    res.redirect('/ban');
  } catch (err) {
    next(err);
  }
};

module.exports = { index, apelar };
