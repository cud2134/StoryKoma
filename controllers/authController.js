// Inicio de sesion, registro (con rol), acceso con Google y cierre de sesion
const crypto = require('crypto');
const UsuarioModel = require('../models/UsuarioModel');
const MangaModel = require('../models/MangaModel');
const correoService = require('../services/correoService');
const { texto, validarFechaNacimiento, USERNAME_VALIDO, CORREO_VALIDO, CONTRASENA_VALIDA, prohibido } = require('./baseController');

const ROLES_REGISTRO = ['Lector', 'Creador'];
const VIGENCIA_CODIGO_VERIFICACION_MS = 15 * 60 * 1000;

const crearCodigoVerificacion = (correo) => {
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const tokenHash = crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(`${correo}:${codigo}`)
    .digest('hex');
  return { codigo, tokenHash };
};

// ---------------------- Middlewares de acceso ----------------------
const requireLogin = (req, res, next) => {
  if (req.user) return next();
  if ((req.headers.accept || '').includes('application/json')) return res.status(401).json({ error: 'No autenticado' });
  res.redirect('/');
};

const soloCreador = (req, res, next) =>
  req.user && req.user.esCreador ? next() : prohibido(res, 'Esta seccion es solo para creadores.');

const soloAdmin = (req, res, next) =>
  req.user && req.user.esAdmin ? next() : prohibido(res, 'Esta seccion es solo para administradores.');

// ---------------------- Pantalla de bienvenida ----------------------
const vista = async (res, datos = {}) =>
  res.render('auth/login', {
    title: 'Bienvenido',
    vista: 'bienvenida', // bienvenida | login | registro | verificar | google
    error: null,
    valores: {},
    portadasFondo: await MangaModel.listarPortadasPublicas(),
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    ...datos,
  });

const showBienvenida = async (req, res, next) => {
  try {
    if (req.user) return res.redirect('/inicio');
    await vista(res);
  } catch (err) {
    next(err);
  }
};

// Guarda la sesion de forma segura (nuevo ID de sesion) y entra al sitio
const iniciarSesion = (req, res, next, usuarioId, destino = '/inicio') => {
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = usuarioId;
    req.session.mostrarAnuncioInicial = true;
    res.redirect(destino);
  });
};

const login = async (req, res, next) => {
  try {
    const identificador = texto(req.body.identificador);
    const contrasena = typeof req.body.contrasena === 'string' ? req.body.contrasena : '';
    const fallo = (error) => vista(res, { vista: 'login', error, valores: { identificador } });
    if (!identificador || !contrasena) return await fallo('Escribe tu usuario o correo y tu contrasena.');

    const usuario = await UsuarioModel.findForLogin(identificador.includes('@') ? identificador.toLowerCase() : identificador);
    if (!usuario || !(await UsuarioModel.checkPassword(usuario, contrasena))) return await fallo('Usuario/correo o contrasena incorrectos.');
    if (!usuario.emailVerificado) {
      req.flash('success', 'Tu correo aun no esta verificado. Ingresa el codigo o solicita uno nuevo.');
      req.session.correoPendienteVerificacion = usuario.correo;
      return res.redirect('/verificar-correo');
    }
    iniciarSesion(req, res, next, usuario.id, usuario.estado === 'Baneado' ? '/ban' : '/inicio');
  } catch (err) {
    next(err);
  }
};

// ---------------------- Registro ----------------------
const register = async (req, res, next) => {
  try {
    const username = texto(req.body.username);
    const correo = texto(req.body.correo).toLowerCase();
    const fechaNacimiento = texto(req.body.fecha_nacimiento);
    const contrasena = typeof req.body.contrasena === 'string' ? req.body.contrasena : '';
    const confirmar = typeof req.body.confirmar === 'string' ? req.body.confirmar : '';
    const rol = ROLES_REGISTRO.includes(req.body.rol) ? req.body.rol : 'Lector';
    const valores = { username, correo, fecha_nacimiento: fechaNacimiento, rol };
    const fallo = (error) => vista(res, { vista: 'registro', error, valores });

    if (!USERNAME_VALIDO.test(username)) return await fallo('El usuario debe tener entre 4 y 20 caracteres: letras, numeros, punto, guion o guion bajo.');
    if (!CORREO_VALIDO.test(correo) || correo.length > 100) return await fallo('Escribe un correo valido.');
    const errorFecha = validarFechaNacimiento(fechaNacimiento);
    if (errorFecha) return await fallo(errorFecha);
    if (!CONTRASENA_VALIDA.test(contrasena)) {
      return await fallo('La contrasena debe tener al menos 6 caracteres, una mayuscula, un numero y un simbolo especial.');
    }
    if (contrasena !== confirmar) return await fallo('Las contrasenas no coinciden.');
    if (await UsuarioModel.usernameExiste(username)) return await fallo('Ese nombre de usuario ya esta en uso.');
    if (await UsuarioModel.correoExiste(correo)) return await fallo('Ese correo ya esta registrado.');

    const { codigo, tokenHash } = crearCodigoVerificacion(correo);
    const expira = new Date(Date.now() + VIGENCIA_CODIGO_VERIFICACION_MS);
    const id = await UsuarioModel.create({
      username,
      correo,
      contrasena,
      fechaNacimiento,
      rol,
      emailVerificado: false,
      tokenVerificacion: tokenHash,
      tokenVerificacionExpira: expira,
    });
    try {
      await correoService.enviarCodigoVerificacion(correo, codigo);
    } catch (err) {
      await UsuarioModel.eliminarCuentaSinVerificar(id);
      console.error('No se pudo enviar el correo de confirmacion:', err.message);
      return await fallo('No pudimos enviar el correo de confirmacion. Revisa la configuracion de Gmail e intentalo de nuevo.');
    }
    req.flash('success', 'Te enviamos un codigo de verificacion a tu correo.');
    req.session.correoPendienteVerificacion = correo;
    res.redirect('/verificar-correo');
  } catch (err) {
    next(err);
  }
};

const verificarCorreo = async (req, res, next) => {
  try {
    if (req.method === 'GET' && req.query.token) {
      const token = texto(req.query.token);
      if (!/^[a-f0-9]{64}$/.test(token) || !(await UsuarioModel.verificarCorreo(crypto.createHash('sha256').update(token).digest('hex')))) {
        req.flash('error', 'El enlace de confirmacion no es valido o ya vencio. Inicia sesion con tu correo y contrasena para solicitar otro codigo.');
      } else {
        req.flash('success', 'Correo confirmado. Ya puedes iniciar sesion.');
      }
      return res.redirect('/');
    }

    const correo = texto(req.body.correo || req.query.correo || req.session.correoPendienteVerificacion).toLowerCase();
    if (req.method === 'GET') {
      if (!CORREO_VALIDO.test(correo) || correo.length > 100) return res.redirect('/');
      return await vista(res, { vista: 'verificar', valores: { correo } });
    }

    const codigo = texto(req.body.codigo);
    if (!CORREO_VALIDO.test(correo) || correo.length > 100 || !/^\d{6}$/.test(codigo)) {
      return await vista(res, {
        vista: 'verificar',
        error: 'El codigo no es valido o ya vencio. Solicita uno nuevo e intentalo otra vez.',
        valores: { correo },
      });
    }
    const tokenHash = crypto
      .createHmac('sha256', process.env.SESSION_SECRET)
      .update(`${correo}:${codigo}`)
      .digest('hex');
    if (!(await UsuarioModel.verificarCorreoConCodigo(correo, tokenHash))) {
      return await vista(res, {
        vista: 'verificar',
        error: 'El codigo no es valido o ya vencio. Solicita uno nuevo e intentalo otra vez.',
        valores: { correo },
      });
    }
    delete req.session.correoPendienteVerificacion;
    req.flash('success', 'Correo confirmado. Ya puedes iniciar sesion.');
    res.redirect('/');
  } catch (err) {
    next(err);
  }
};

const reenviarVerificacion = async (req, res, next) => {
  try {
    const correo = texto(req.body.correo).toLowerCase();
    if (CORREO_VALIDO.test(correo) && correo.length <= 100) {
      req.session.correoPendienteVerificacion = correo;
      const { codigo, tokenHash } = crearCodigoVerificacion(correo);
      const expira = new Date(Date.now() + VIGENCIA_CODIGO_VERIFICACION_MS);
      if (await UsuarioModel.renovarTokenVerificacion(correo, tokenHash, expira)) {
        try {
          await correoService.enviarCodigoVerificacion(correo, codigo);
        } catch (err) {
          console.error('No se pudo reenviar el correo de confirmacion:', err.message);
          req.flash('error', 'No pudimos enviar el correo. Revisa la configuracion de Gmail e intentalo de nuevo.');
          return res.redirect('/verificar-correo');
        }
      }
    }
    req.flash('success', 'Si hay una cuenta pendiente para ese correo, enviaremos un nuevo codigo de verificacion.');
    if (CORREO_VALIDO.test(correo) && correo.length <= 100) {
      return res.redirect('/verificar-correo');
    }
    res.redirect('/');
  } catch (err) {
    next(err);
  }
};

// ---------------------- Google ----------------------
// El navegador manda el "credential" (token firmado por Google); el servidor lo verifica.
const googleLogin = async (req, res, next) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return await vista(res, { vista: 'google', error: 'El acceso con Google todavia no esta configurado (falta GOOGLE_CLIENT_ID en el archivo .env).' });
    }
    const credential = texto(req.body.credential);
    if (!credential) {
      return await vista(res, { vista: 'google', error: 'Google no envio las credenciales. Intentalo de nuevo.' });
    }

    const { OAuth2Client } = require('google-auth-library');
    let ticket;
    try {
      ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
    } catch (err) {
      console.error('No se pudo verificar la credencial de Google:', err.message);
      return await vista(res, { vista: 'google', error: 'No pudimos verificar tu cuenta de Google. Intentalo de nuevo.' });
    }
    const datos = ticket.getPayload();
    if (!datos || !datos.email || !datos.email_verified || !datos.sub) {
      return await vista(res, { vista: 'google', error: 'Tu correo de Google no esta verificado o faltan datos de la cuenta.' });
    }

    const correo = datos.email.toLowerCase();
    let usuario = await UsuarioModel.findByGoogleId(datos.sub);
    if (!usuario) {
      // Si ya existe una cuenta con ese correo, la vinculamos (Google verifico que el correo es suyo)
      const porCorreo = await UsuarioModel.findByEmail(correo);
      if (porCorreo) {
        await UsuarioModel.vincularGoogle(porCorreo.id, datos.sub);
        usuario = porCorreo;
      }
    }
    if (usuario) {
      return iniciarSesion(req, res, next, usuario.id, usuario.estado === 'Baneado' ? '/ban' : '/inicio');
    }

    // Cuenta nueva: falta la fecha de nacimiento y el rol
    req.session.googlePendiente = { googleId: datos.sub, correo, nombre: datos.name || correo.split('@')[0] };
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect('/auth/google/completar');
    });
  } catch (err) {
    next(err);
  }
};

const sugerirUsername = async (nombre) => {
  const base = (nombre.replace(/[^A-Za-z0-9_.-]/g, '') || 'usuario').slice(0, 20);
  const inicial = base.length >= 4 ? base : 'user';
  let candidato = inicial;
  let n = 1;
  while (await UsuarioModel.usernameExiste(candidato)) {
    const sufijo = String(n++);
    candidato = `${inicial.slice(0, 20 - sufijo.length)}${sufijo}`;
  }
  return candidato;
};

const googleCompletarForm = async (req, res, next) => {
  try {
    const pendiente = req.session.googlePendiente;
    if (!pendiente) return res.redirect('/');
    res.render('auth/google-completar', {
      title: 'Completa tu cuenta',
      error: null,
      correo: pendiente.correo,
      portadasFondo: await MangaModel.listarPortadasPublicas(),
      valores: { username: await sugerirUsername(pendiente.nombre), fecha_nacimiento: '', rol: 'Lector' },
    });
  } catch (err) {
    next(err);
  }
};

const googleCompletar = async (req, res, next) => {
  try {
    const pendiente = req.session.googlePendiente;
    if (!pendiente) return res.redirect('/');
    const username = texto(req.body.username);
    const fechaNacimiento = texto(req.body.fecha_nacimiento);
    const rol = ROLES_REGISTRO.includes(req.body.rol) ? req.body.rol : 'Lector';
    const fallo = async (error) =>
      res.render('auth/google-completar', {
        title: 'Completa tu cuenta',
        error,
        correo: pendiente.correo,
        portadasFondo: await MangaModel.listarPortadasPublicas(),
        valores: { username, fecha_nacimiento: fechaNacimiento, rol },
      });

    if (!USERNAME_VALIDO.test(username)) return await fallo('El usuario debe tener entre 4 y 20 caracteres: letras, numeros, punto, guion o guion bajo.');
    const errorFecha = validarFechaNacimiento(fechaNacimiento);
    if (errorFecha) return await fallo(errorFecha);
    if (await UsuarioModel.usernameExiste(username)) return await fallo('Ese nombre de usuario ya esta en uso.');

    const id = await UsuarioModel.create({ username, correo: pendiente.correo, googleId: pendiente.googleId, fechaNacimiento, rol });
    iniciarSesion(req, res, next, id);
  } catch (err) {
    next(err);
  }
};

const logout = (req, res) => {
  req.session.destroy(() => res.redirect('/'));
};

module.exports = {
  requireLogin,
  soloCreador,
  soloAdmin,
  showBienvenida,
  login,
  register,
  verificarCorreo,
  reenviarVerificacion,
  googleLogin,
  googleCompletarForm,
  googleCompletar,
  logout,
};
