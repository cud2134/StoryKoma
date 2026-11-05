// Perfil: datos de la cuenta, biblioteca (lector) y panel de obras (creador)
const UsuarioModel = require('../models/UsuarioModel');
const BibliotecaModel = require('../models/BibliotecaModel');
const MangaModel = require('../models/MangaModel');
const Upload = require('../config/upload');
const { texto, validarFechaNacimiento, USERNAME_VALIDO } = require('./baseController');

const TABS = ['siguiendo', 'pendiente', 'terminado'];

const valoresPerfil = (user) => ({ username: user.username, fecha_nacimiento: user.fechaNacimiento });

const index = async (req, res, next) => {
  try {
    const grupos = await BibliotecaModel.listar(req.user);
    const tab = TABS.includes(req.query.tab) ? req.query.tab : 'siguiendo';
    res.render('perfil/lector', { title: 'Mi perfil', error: null, valores: valoresPerfil(req.user), grupos, tab });
  } catch (err) {
    next(err);
  }
};

const creador = async (req, res, next) => {
  try {
    const obras = await MangaModel.deCreador(req.user.id, req.user);
    res.render('perfil/creador', { title: 'Panel creador', error: null, valores: valoresPerfil(req.user), obras, estados: MangaModel.ESTADOS });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  const avatar = req.file;
  try {
    const username = texto(req.body.username);
    const fechaNacimiento = texto(req.body.fecha_nacimiento);
    const fallo = async (error) => {
      if (avatar) Upload.limpiar([avatar]);
      const grupos = await BibliotecaModel.listar(req.user);
      return res.status(400).render('perfil/lector', {
        title: 'Mi perfil', error, valores: { username, fecha_nacimiento: fechaNacimiento }, grupos, tab: 'siguiendo',
      });
    };

    if (!USERNAME_VALIDO.test(username)) return await fallo('El usuario debe tener entre 4 y 20 caracteres: letras, numeros, punto, guion o guion bajo.');
    const errorFecha = validarFechaNacimiento(fechaNacimiento);
    if (errorFecha) return await fallo(errorFecha);
    if (await UsuarioModel.usernameExiste(username, req.user.id)) return await fallo('Ese nombre de usuario ya esta en uso.');

    await UsuarioModel.updatePerfil(req.user.id, { username, fechaNacimiento, avatar: avatar ? Upload.rutaPublica(avatar) : null });
    if (avatar) Upload.borrar(req.user.avatar);
    req.flash('success', 'Perfil guardado.');
    res.redirect('/perfil');
  } catch (err) {
    if (avatar) Upload.limpiar([avatar]);
    next(err);
  }
};

module.exports = { index, creador, update };
