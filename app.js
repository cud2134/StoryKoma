// StoryKoma - archivo principal: configura Express, sesiones, vistas EJS y conecta las rutas
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const methodOverride = require('method-override');
const pool = require('./config/database');

const authController = require('./controllers/authController');
const { fechaHoy, fechaNacimientoMinima, fechaNacimientoMaxima } = require('./controllers/baseController');
const DenunciaModel = require('./models/DenunciaModel');
const GeneroModel = require('./models/GeneroModel');
const UsuarioModel = require('./models/UsuarioModel');
const NotificacionModel = require('./models/NotificacionModel');

const authRoutes = require('./routes/authRoutes');
const premiumRoutes = require('./routes/premiumRoutes');
const inicioRoutes = require('./routes/inicioRoutes');
const buscarRoutes = require('./routes/buscarRoutes');
const mangasRoutes = require('./routes/mangasRoutes');
const comentariosRoutes = require('./routes/comentariosRoutes');
const perfilRoutes = require('./routes/perfilRoutes');
const notificacionesRoutes = require('./routes/notificacionesRoutes');
const fisicoRoutes = require('./routes/fisicoRoutes');
const adminRoutes = require('./routes/adminRoutes');
const banRoutes = require('./routes/banRoutes');

const app = express();

// Motor de vistas: EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true })); // formularios HTML
app.use(express.json());
app.use(methodOverride('_method')); // permite DELETE desde formularios: action="/mangas/3?_method=DELETE"
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);
app.use('/vendor/remixicon', express.static(path.join(__dirname, 'node_modules', 'remixicon', 'fonts')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

// Carga a la persona que inicio sesion en cada peticion (asi un baneo o un cambio de rol se aplica al instante)
app.use(async (req, res, next) => {
  try {
    req.user = null;
    if (req.session.userId) {
      const usuario = await UsuarioModel.findById(req.session.userId);
      if (!usuario) {
        return req.session.destroy(() => res.redirect('/'));
      }
      req.user = usuario;
      if (!/^\/uploads\/(portadas|capitulos)\//.test(req.path)) {
        const noLeidas = await NotificacionModel.contarNoLeidas(usuario.id, usuario);
        if (usuario.esAdmin) {
          const [denunciasPendientes, apelacionesPendientes] = await Promise.all([
            DenunciaModel.contarPendientes(),
            UsuarioModel.contarApelacionesPendientes(),
          ]);
          res.locals.notificacionesSinLeer = noLeidas + denunciasPendientes + apelacionesPendientes;
        } else {
          res.locals.notificacionesSinLeer = noLeidas;
        }
      }
    }
    res.locals.user = req.user;
    res.locals.mostrarAnuncioInicial =
      req.method === 'GET' && req.path === '/inicio' && Boolean(req.session.mostrarAnuncioInicial);
    if (res.locals.mostrarAnuncioInicial) delete req.session.mostrarAnuncioInicial;
    next();
  } catch (err) {
    next(err);
  }
});

app.use(async (req, res, next) => {
  const ruta = req.path;
  if ((req.user && req.user.esAdulto) || !/^\/uploads\/(portadas|capitulos)\//.test(ruta)) return next();
  try {
    const [restringidas] = await pool.query(
      `SELECT 1 FROM manga m
       WHERE (
         m.portada = ?
         OR EXISTS (SELECT 1 FROM pagina p WHERE p.ruta = ?)
         OR EXISTS (SELECT 1 FROM capitulo c WHERE c.archivo_ruta = ?)
       )
       AND (m.es_mas18 = TRUE OR NOT (${GeneroModel.sqlSinGenerosAdultos('m')}))
       LIMIT 1`,
      [ruta, ruta, ruta]
    );
    if (restringidas.length) return res.sendStatus(404);
    next();
  } catch (err) {
    next(err);
  }
});
app.use(express.static(path.join(__dirname, 'public')));

// Mensajes "flash" (se muestran una sola vez despues de redirigir)
app.use((req, res, next) => {
  req.flash = (tipo, texto) => {
    req.session.flash = { tipo, texto };
  };
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.rutaActual = req.path;
  next();
});

// Funciones de ayuda disponibles en todas las vistas
app.locals.fecha = (valor) => {
  if (!valor) return '—';
  const [y, m, d] = String(valor).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};
app.locals.fechaHoy = fechaHoy;
app.locals.fechaNacimientoMinima = fechaNacimientoMinima;
app.locals.fechaNacimientoMaxima = fechaNacimientoMaxima;
app.locals.fechaHora = (valor) => (valor ? `${app.locals.fecha(valor)} ${String(valor).slice(11, 16)}` : '—');
app.locals.hace = (valor) => {
  if (!valor) return '—';
  const minutos = Math.max(0, Math.round((Date.now() - new Date(String(valor).replace(' ', 'T')).getTime()) / 60000));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 60 * 24) return `hace ${Math.round(minutos / 60)} h`;
  return `hace ${Math.round(minutos / (60 * 24))} dias`;
};
app.locals.avatarDe = (usuario) =>
  usuario && usuario.avatar ? usuario.avatar : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=160';
// Texto seguro para usar dentro de url('...') en estilos
app.locals.urlCss = (ruta) => String(ruta || '').replace(/['"()\\\s]/g, (c) => encodeURIComponent(c));

// JSON seguro para incrustar dentro de <script type="application/json">
app.locals.json = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

// Rutas publicas (login / registro)
app.use('/', authRoutes);
app.use('/premium', premiumRoutes);
// A partir de aqui hay que haber iniciado sesion
app.use(authController.requireLogin);

app.use('/ban', banRoutes);
app.use((req, res, next) => {
  if (req.user && req.user.estado === 'Baneado') return res.redirect('/ban');
  next();
});

app.use('/inicio', inicioRoutes);
app.use('/buscar', buscarRoutes);
app.use('/mangas', mangasRoutes);
app.use('/comentarios', comentariosRoutes);
app.use('/perfil', perfilRoutes);
app.use('/notificaciones', notificacionesRoutes);
app.use('/fisico', fisicoRoutes);
app.use('/admin', authController.soloAdmin, adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('errors/error', { title: 'No encontrado', codigo: 404, mensaje: 'La pagina que buscas no existe o fue movida.' });
});

// Errores no controlados
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('errors/error', {
    title: 'Error',
    codigo: 500,
    mensaje: 'Algo salio mal de nuestro lado. Revisa que MySQL este encendido y que el archivo .env tenga los datos correctos.',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
  // Crea la cuenta de administrador la primera vez (datos del .env)
  UsuarioModel.asegurarAdmin()
    .then((creado) => creado && console.log(`Cuenta de administrador creada: ${process.env.ADMIN_EMAIL}`))
    .catch((err) => console.error('No pude revisar/crear el administrador (¿importaste sql/schema.sql?):', err.message));
});
