const pool = require('../config/database');

const registrarLecturaCapitulo = async (usuarioId, mangaId, capituloId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [capitulos] = await conn.query(
      'SELECT numero FROM capitulo WHERE ID_capitulo = ? AND ID_manga = ?',
      [capituloId, mangaId]
    );
    if (!capitulos.length) throw new Error('No encontramos el capitulo para registrar el progreso.');

    const numero = Number(capitulos[0].numero);
    const [antes] = await conn.query(
      `SELECT COUNT(*) AS total FROM usuario_lectura_capitulo
       WHERE ID_usuario = ? AND ID_manga = ?`,
      [usuarioId, mangaId]
    );
    const [result] = await conn.query(
      `INSERT IGNORE INTO usuario_lectura_capitulo (ID_usuario, ID_manga, ID_capitulo)
       SELECT ?, ID_manga, ID_capitulo FROM capitulo
       WHERE ID_manga = ? AND numero <= ?`,
      [usuarioId, mangaId, numero]
    );
    await conn.commit();
    const totalAnterior = Number(antes[0].total);
    return Math.floor((totalAnterior + result.affectedRows) / 10) > Math.floor(totalAnterior / 10);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const getUltimoCapituloLeido = async (usuarioId, mangaId) => {
  const [rows] = await pool.query(
    `SELECT MAX(c.numero) AS numero
     FROM usuario_lectura_capitulo ul
     JOIN capitulo c ON c.ID_capitulo = ul.ID_capitulo AND c.ID_manga = ul.ID_manga
     WHERE ul.ID_usuario = ? AND ul.ID_manga = ?`,
    [usuarioId, mangaId]
  );
  return rows[0].numero === null ? null : Number(rows[0].numero);
};

module.exports = { registrarLecturaCapitulo, getUltimoCapituloLeido };
