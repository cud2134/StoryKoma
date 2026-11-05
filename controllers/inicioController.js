// Pantalla principal: banner destacado y filas de mangas (zona normal o zona +18)
const MangaModel = require('../models/MangaModel');

const index = async (req, res, next) => {
  try {
    const user = req.user;
    const zona = req.query.zona === 'adulto' && user.esAdulto ? 'adulto' : 'normal';
    const sufijo = zona === 'adulto' ? ' +18' : '';

    const [mejores, tendencias, recientes, accion, aventura, romance] = await Promise.all([
      MangaModel.listar(user, { zona, orden: 'vistas', limite: 5 }),
      MangaModel.listar(user, { zona, orden: 'actualizados' }),
      MangaModel.listar(user, { zona, orden: 'recientes' }),
      MangaModel.listar(user, { zona, orden: 'azar', genero: 'Accion' }),
      MangaModel.listar(user, { zona, orden: 'azar', genero: 'Aventura' }),
      MangaModel.listar(user, { zona, orden: 'azar', genero: 'Romance' }),
    ]);

    const filas = [
      { titulo: `Tendencias${sufijo}`, mangas: tendencias },
      { titulo: `Recien agregados${sufijo}`, mangas: recientes },
      { titulo: `Accion${sufijo}`, mangas: accion },
      { titulo: `Aventura${sufijo}`, mangas: aventura },
      { titulo: `Romance${sufijo}`, mangas: romance },
    ];
    res.render('inicio/index', { title: zona === 'adulto' ? 'Zona +18' : 'Inicio', zona, banners: mejores, mejores, filas });
  } catch (err) {
    next(err);
  }
};

module.exports = { index };
