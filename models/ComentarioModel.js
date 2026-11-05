// Comentarios de obras y capitulos, con likes (tablas comentario y comentario_like)
const pool = require('../config/database');

const SELECT = `
  SELECT c.ID_comentario AS id, c.texto, c.fecha, c.ID_usuario AS idUsuario, c.ID_manga AS idManga, c.ID_capitulo AS idCapitulo,
         u.username, u.avatar,
         (SELECT COUNT(*) FROM comentario_like l WHERE l.ID_comentario = c.ID_comentario) AS likes,
         EXISTS (SELECT 1 FROM comentario_like l WHERE l.ID_comentario = c.ID_comentario AND l.ID_usuario = ?) AS yoLike
  FROM comentario c JOIN usuario u ON u.ID_usuario = c.ID_usuario`;

const deManga = async (idManga, idUsuario) => {
  const [rows] = await pool.query(`${SELECT} WHERE c.ID_manga = ? AND c.ID_capitulo IS NULL ORDER BY c.fecha DESC`, [idUsuario, idManga]);
  return rows.map((r) => ({ ...r, yoLike: !!r.yoLike }));
};

const deCapitulo = async (idCapitulo, idUsuario) => {
  const [rows] = await pool.query(`${SELECT} WHERE c.ID_capitulo = ? ORDER BY c.fecha DESC`, [idUsuario, idCapitulo]);
  return rows.map((r) => ({ ...r, yoLike: !!r.yoLike }));
};

const getById = async (id) => {
  const [rows] = await pool.query(
    'SELECT ID_comentario AS id, ID_usuario AS idUsuario, ID_manga AS idManga, ID_capitulo AS idCapitulo FROM comentario WHERE ID_comentario = ?',
    [id]
  );
  return rows[0] || null;
};

const create = async ({ idUsuario, idManga, idCapitulo, texto }) => {
  const [result] = await pool.query('INSERT INTO comentario (ID_usuario, ID_manga, ID_capitulo, texto) VALUES (?, ?, ?, ?)', [
    idUsuario,
    idManga,
    idCapitulo || null,
    texto,
  ]);
  return result.insertId;
};

// Pone o quita el "me gusta"
const toggleLike = async (idComentario, idUsuario) => {
  const [rows] = await pool.query('SELECT 1 FROM comentario_like WHERE ID_comentario = ? AND ID_usuario = ?', [idComentario, idUsuario]);
  if (rows.length) {
    await pool.query('DELETE FROM comentario_like WHERE ID_comentario = ? AND ID_usuario = ?', [idComentario, idUsuario]);
  } else {
    await pool.query('INSERT INTO comentario_like (ID_comentario, ID_usuario) VALUES (?, ?)', [idComentario, idUsuario]);
  }
};

const remove = async (id) => {
  const [result] = await pool.query('DELETE FROM comentario WHERE ID_comentario = ?', [id]);
  return result;
};

module.exports = { deManga, deCapitulo, getById, create, toggleLike, remove };
