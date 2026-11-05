// Mangas guardados por cada usuario segun su estado de lectura (tabla biblioteca)
const pool = require('../config/database');
const MangaModel = require('./MangaModel');
const GeneroModel = require('./GeneroModel');

const ESTADOS = ['siguiendo', 'pendiente', 'terminado'];

const getEstado = async (idUsuario, idManga) => {
  const [rows] = await pool.query('SELECT estado FROM biblioteca WHERE ID_usuario = ? AND ID_manga = ?', [idUsuario, idManga]);
  return rows.length ? rows[0].estado : null;
};

const guardar = async (idUsuario, idManga, estado) => {
  await pool.query(
    `INSERT INTO biblioteca (ID_usuario, ID_manga, estado) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE estado = VALUES(estado), fecha = NOW()`,
    [idUsuario, idManga, estado]
  );
};

const quitar = async (idUsuario, idManga) => {
  await pool.query('DELETE FROM biblioteca WHERE ID_usuario = ? AND ID_manga = ?', [idUsuario, idManga]);
};

// Los mangas guardados del usuario, separados por estado (solo los que puede ver)
const listar = async (user) => {
  const [rows] = await pool.query(
    `SELECT x.*, b.estado AS estado_lectura,
       (SELECT CONCAT('Cap. ', c.numero, ': ', c.titulo)
        FROM usuario_lectura_capitulo ul
        JOIN capitulo c ON c.ID_capitulo = ul.ID_capitulo AND c.ID_manga = ul.ID_manga
        WHERE ul.ID_usuario = ? AND ul.ID_manga = x.ID_manga
        ORDER BY c.numero DESC LIMIT 1) AS ultimo_capitulo_leido
     FROM (${MangaModel.BASE}) x
     JOIN biblioteca b ON b.ID_manga = x.ID_manga
     WHERE b.ID_usuario = ? AND (x.visibilidad = 'Publicado' OR ${user.esAdmin ? 'TRUE' : 'FALSE'})
       AND ${user.esAdulto ? 'TRUE' : `(x.es_mas18 = FALSE AND ${GeneroModel.sqlSinGenerosAdultos('x')})`}
     ORDER BY b.fecha DESC`,
    [user.id, user.id]
  );
  const grupos = { siguiendo: [], pendiente: [], terminado: [] };
  rows.forEach((r) => {
    if (grupos[r.estado_lectura]) {
      const manga = MangaModel.armar(r);
      manga.ultimoCapituloLeido = r.ultimo_capitulo_leido;
      grupos[r.estado_lectura].push(manga);
    }
  });
  return grupos;
};

module.exports = { ESTADOS, getEstado, guardar, quitar, listar };
