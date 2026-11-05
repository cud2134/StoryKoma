// Notificaciones: capitulos nuevos de obras guardadas y advertencias del administrador
const NotificacionModel = require('../models/NotificacionModel');
const DenunciaModel = require('../models/DenunciaModel');
const UsuarioModel = require('../models/UsuarioModel');
const { volver, entero } = require('./baseController');

const index = async (req, res, next) => {
  try {
    const tabSolicitada = req.query.tab;
    const tab = req.user.esAdmin && tabSolicitada === 'moderacion'
      ? 'moderacion'
      : tabSolicitada === 'admin' ? 'admin' : 'comunes';
    const [notificaciones, denunciasPendientes, apelacionesPendientes] = await Promise.all([
      NotificacionModel.listar(req.user.id, 60, tab === 'moderacion' ? 'todas' : tab, req.user),
      req.user.esAdmin ? DenunciaModel.getAll() : [],
      req.user.esAdmin ? UsuarioModel.listarApelaciones() : [],
    ]);
    res.render('notificaciones/index', {
      title: 'Notificaciones',
      notificaciones: tab === 'moderacion' ? [] : notificaciones,
      denunciasPendientes: denunciasPendientes.filter((denuncia) => denuncia.estado === 'Pendiente'),
      apelacionesPendientes: apelacionesPendientes.filter((apelacion) => ['Pendiente', 'En proceso'].includes(apelacion.estado)),
      tab,
    });
  } catch (err) {
    next(err);
  }
};

const marcarLeidas = async (req, res, next) => {
  try {
    await NotificacionModel.marcarTodasLeidas(req.user.id);
    volver(req, res, '/notificaciones');
  } catch (err) {
    next(err);
  }
};

const destroy = async (req, res, next) => {
  try {
    await NotificacionModel.remove(entero(req.params.id), req.user.id);
    volver(req, res, '/notificaciones');
  } catch (err) {
    next(err);
  }
};

module.exports = { index, marcarLeidas, destroy };
