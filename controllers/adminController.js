// Panel de administrador: usuarios, obras y denuncias
const UsuarioModel = require('../models/UsuarioModel');
const MangaModel = require('../models/MangaModel');
const DenunciaModel = require('../models/DenunciaModel');
const NotificacionModel = require('../models/NotificacionModel');
const CapituloModel = require('../models/CapituloModel');
const Upload = require('../config/upload');
const { noEncontrado, texto, entero } = require('./baseController');

const TABS = ['usuarios', 'denuncias', 'apelaciones'];

const index = async (req, res, next) => {
  try {
    const tab = TABS.includes(req.query.tab) ? req.query.tab : 'usuarios';
    const busqueda = texto(req.query.q).slice(0, 80);
    const [usuarios, denuncias, apelaciones] = await Promise.all([
      tab === 'usuarios' ? UsuarioModel.getAll(busqueda) : [],
      tab === 'denuncias' ? DenunciaModel.getAll() : [],
      tab === 'apelaciones' ? UsuarioModel.listarApelaciones() : [],
    ]);
    const usuarioId = entero(req.query.usuario);
    const usuarioSeleccionado = usuarios.find((usuario) => usuario.id === usuarioId) || null;
    const mangasUsuario = usuarioSeleccionado ? await MangaModel.deCreador(usuarioSeleccionado.id) : [];
    res.render('admin/index', {
      title: 'Administrador',
      tab,
      busqueda,
      usuarios,
      usuarioSeleccionado,
      esAdministradorPrincipal: esCuentaAdministradoraPrincipal(req.user),
      baneoSeleccionado: usuarioSeleccionado && usuarioSeleccionado.estado === 'Baneado'
        ? await UsuarioModel.getBanDetails(usuarioSeleccionado.id)
        : null,
      mangasUsuario,
      denuncias,
      apelaciones,
      pendientes: await DenunciaModel.contarPendientes(),
      apelacionesPendientes: await UsuarioModel.contarApelacionesPendientes(),
      estadosDenuncia: DenunciaModel.ESTADOS,
    });
  } catch (err) {
    next(err);
  }
};

// Protege las acciones sobre uno mismo y las cuentas de administrador.
const esCuentaAdministradoraPrincipal = (usuario) =>
  usuario.username === 'admin' && usuario.correo.toLowerCase() === 'admin@storykoma.cl';

const objetivo = async (req, res, permitirAdminPrincipal = false) => {
  const usuario = await UsuarioModel.findById(entero(req.params.id));
  if (!usuario) {
    noEncontrado(res, 'No encontramos ese usuario.');
    return null;
  }
  const puedeModificarAdmin = permitirAdminPrincipal && esCuentaAdministradoraPrincipal(req.user);
  if (usuario.id === req.user.id || (usuario.esAdmin && !puedeModificarAdmin)) {
    req.flash('error', 'No puedes aplicar esta accion sobre administradores (ni sobre ti).');
    res.redirect('/admin?tab=usuarios');
    return null;
  }
  return usuario;
};

// Cambiar el tipo de usuario
const cambiarRol = async (req, res, next) => {
  try {
    const usuario = await objetivo(req, res, true);
    if (!usuario) return;
    const rol = texto(req.body.rol);
    if (!['Administrador', 'Creador', 'Lector'].includes(rol)) return noEncontrado(res, 'Rol no valido.');
    await UsuarioModel.setRol(usuario.id, rol);
    await NotificacionModel.crear(usuario.id, 'sistema', `Un administrador cambio tu tipo de cuenta a ${rol}.`);
    req.flash('success', `${usuario.username} ahora es ${rol}.`);
    res.redirect('/admin?tab=usuarios');
  } catch (err) {
    next(err);
  }
};

const banear = async (req, res, next) => {
  try {
    const usuario = await objetivo(req, res);
    if (!usuario) return;
    const motivo = texto(req.body.motivo);
    const diasTexto = texto(req.body.dias);
    const horasTexto = texto(req.body.horas);
    if (!motivo || motivo.length > 255 || !/^\d+$/.test(diasTexto) || !/^\d+$/.test(horasTexto)) {
      req.flash('error', 'Completa el motivo y una duracion valida en dias y horas.');
      return res.redirect('/admin?tab=usuarios');
    }
    const dias = Number(diasTexto);
    const horas = Number(horasTexto);
    if (dias > 3650 || horas > 23 || dias + horas === 0) {
      req.flash('error', 'La duracion debe ser mayor que cero, con hasta 3650 dias y 23 horas.');
      return res.redirect('/admin?tab=usuarios');
    }
    await UsuarioModel.banear(usuario.id, req.user.id, motivo, dias, horas);
    await NotificacionModel.crear(usuario.id, 'advertencia', `Tu cuenta fue baneada. Motivo: ${motivo}`);
    req.flash('success', `${usuario.username} fue baneado.`);
    res.redirect('/admin?tab=usuarios');
  } catch (err) {
    next(err);
  }
};

const desbanear = async (req, res, next) => {
  try {
    const usuario = await objetivo(req, res);
    if (!usuario) return;
    await UsuarioModel.desbanear(usuario.id);
    req.flash('success', `${usuario.username} fue desbaneado.`);
    res.redirect('/admin?tab=usuarios');
  } catch (err) {
    next(err);
  }
};

// Notificacion de advertencia
const advertir = async (req, res, next) => {
  try {
    const usuario = await objetivo(req, res);
    if (!usuario) return;
    const mensaje = texto(req.body.mensaje);
    if (!mensaje || mensaje.length > 250) {
      req.flash('error', 'Escribe la advertencia (maximo 250 caracteres).');
      return res.redirect('/admin?tab=usuarios');
    }
    await NotificacionModel.crear(usuario.id, 'advertencia', `Advertencia del administrador: ${mensaje}`);
    req.flash('success', `Advertencia enviada a ${usuario.username}.`);
    res.redirect('/admin?tab=usuarios');
  } catch (err) {
    next(err);
  }
};

const eliminarUsuario = async (req, res, next) => {
  try {
    const usuario = await objetivo(req, res);
    if (!usuario) return;
    // Borrar al usuario borra sus obras: limpiamos tambien sus archivos del disco
    const obras = await MangaModel.deCreador(usuario.id);
    const archivos = [usuario.avatar];
    for (const obra of obras) archivos.push(obra.portada, ...(await CapituloModel.archivosDeManga(obra.id)));
    await UsuarioModel.remove(usuario.id);
    archivos.forEach(Upload.borrar);
    req.flash('success', `${usuario.username} y sus obras fueron eliminados.`);
    res.redirect('/admin?tab=usuarios');
  } catch (err) {
    next(err);
  }
};

// Ocultar o volver a publicar una obra
const visibilidadManga = async (req, res, next) => {
  try {
    const manga = await MangaModel.getByIdSinRestriccion(entero(req.params.id));
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    const visibilidad = texto(req.body.visibilidad) === 'Oculto' ? 'Oculto' : 'Publicado';
    await MangaModel.setVisibilidad(manga.id, visibilidad);
    if (visibilidad === 'Oculto') {
      await NotificacionModel.crear(manga.creadorId, 'advertencia', `Un administrador oculto tu obra «${manga.titulo}». Revisa que cumpla las reglas.`, `/mangas/${manga.id}`);
    }
    req.flash('success', `«${manga.titulo}» ahora esta ${visibilidad === 'Oculto' ? 'oculta' : 'publicada'}.`);
    if (req.body.volver === 'denuncias') return res.redirect('/admin?tab=denuncias');
    if (req.body.volver === 'usuarios') {
      return res.redirect(`/admin?tab=usuarios&usuario=${entero(req.body.usuario)}`);
    }
    res.redirect('/admin?tab=usuarios');
  } catch (err) {
    next(err);
  }
};

const estadoDenuncia = async (req, res, next) => {
  try {
    const denuncia = await DenunciaModel.getById(entero(req.params.id));
    if (!denuncia) return noEncontrado(res, 'No encontramos esa denuncia.');
    const estado = texto(req.body.estado);
    if (!DenunciaModel.ESTADOS.includes(estado)) return noEncontrado(res, 'Estado no valido.');
    await DenunciaModel.setEstado(denuncia.id, estado);
    req.flash('success', 'Denuncia actualizada.');
    res.redirect('/admin?tab=denuncias');
  } catch (err) {
    next(err);
  }
};

const eliminarDenuncia = async (req, res, next) => {
  try {
    const denuncia = await DenunciaModel.getById(entero(req.params.id));
    if (!denuncia) return noEncontrado(res, 'No encontramos esa denuncia.');
    await DenunciaModel.remove(denuncia.id);
    req.flash('success', 'Denuncia eliminada.');
    res.redirect('/admin?tab=denuncias');
  } catch (err) {
    next(err);
  }
};

const mensajeApelacion = (valor) => {
  const mensaje = texto(valor);
  return mensaje.length > 0 && mensaje.length <= 200 ? mensaje : null;
};

const tomarApelacion = async (req, res, next) => {
  try {
    const mensaje = mensajeApelacion(req.body.mensaje);
    if (!mensaje) {
      req.flash('error', 'Escribe un mensaje de hasta 200 caracteres para el usuario.');
      return res.redirect('/admin?tab=apelaciones');
    }
    const usuarioId = await UsuarioModel.tomarApelacion(entero(req.params.id), req.user.id, mensaje);
    if (!usuarioId) {
      req.flash('error', 'La apelacion ya fue tomada o no esta disponible.');
      return res.redirect('/admin?tab=apelaciones');
    }
    await NotificacionModel.crear(usuarioId, 'sistema', `Tu apelacion esta en proceso: ${mensaje}`);
    req.flash('success', 'La apelacion quedo a tu cargo y se notifico al usuario.');
    res.redirect('/admin?tab=apelaciones');
  } catch (err) {
    next(err);
  }
};

const resolverApelacion = async (req, res, next) => {
  try {
    const estado = texto(req.body.estado);
    const mensaje = mensajeApelacion(req.body.mensaje);
    if (!['Aprobada', 'Rechazada'].includes(estado) || !mensaje) {
      req.flash('error', 'Elige una resolucion y escribe el motivo (maximo 200 caracteres).');
      return res.redirect('/admin?tab=apelaciones');
    }
    const usuarioId = await UsuarioModel.resolverApelacion(entero(req.params.id), req.user.id, estado, mensaje);
    if (!usuarioId) {
      req.flash('error', 'Solo el administrador responsable puede resolver una apelacion en proceso.');
      return res.redirect('/admin?tab=apelaciones');
    }
    const textoEstado = estado === 'Aprobada' ? 'aprobada' : 'rechazada';
    await NotificacionModel.crear(usuarioId, 'sistema', `Tu apelacion fue ${textoEstado}. Motivo: ${mensaje}`);
    req.flash('success', `La apelacion fue ${textoEstado} y se notifico al usuario.`);
    res.redirect('/admin?tab=apelaciones');
  } catch (err) {
    next(err);
  }
};

const eliminarApelacion = async (req, res, next) => {
  try {
    const eliminada = await UsuarioModel.eliminarApelacion(entero(req.params.id));
    if (!eliminada) {
      req.flash('error', 'La apelacion ya no esta disponible.');
      return res.redirect('/admin?tab=apelaciones');
    }
    req.flash('success', 'Apelacion eliminada. El baneo del usuario se mantiene.');
    res.redirect('/admin?tab=apelaciones');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  index,
  cambiarRol,
  banear,
  desbanear,
  advertir,
  eliminarUsuario,
  visibilidadManga,
  estadoDenuncia,
  eliminarDenuncia,
  tomarApelacion,
  resolverApelacion,
  eliminarApelacion,
};
