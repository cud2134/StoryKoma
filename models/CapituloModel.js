// Capitulos y sus paginas (tablas capitulo y pagina)
const pool = require('../config/database');

const getByManga = async (idManga) => {
  const [rows] = await pool.query(
    `SELECT ID_capitulo AS id, numero, titulo, formato, archivo_nombre AS archivoNombre, fecha_publicacion AS fecha
     FROM capitulo WHERE ID_manga = ? ORDER BY numero`,
    [idManga]
  );
  return rows;
};

// Un capitulo con sus paginas
const getByNumero = async (idManga, numero) => {
  const [rows] = await pool.query(
    `SELECT ID_capitulo AS id, numero, titulo, formato, archivo_nombre AS archivoNombre, archivo_ruta AS archivoRuta
     FROM capitulo WHERE ID_manga = ? AND numero = ?`,
    [idManga, numero]
  );
  if (!rows.length) return null;
  const [paginas] = await pool.query('SELECT ruta FROM pagina WHERE ID_capitulo = ? ORDER BY orden', [rows[0].id]);
  return { ...rows[0], paginas: paginas.map((p) => p.ruta) };
};

const getById = async (id) => {
  const [rows] = await pool.query(
    'SELECT ID_capitulo AS id, ID_manga AS idManga, numero, titulo FROM capitulo WHERE ID_capitulo = ?',
    [id]
  );
  return rows[0] || null;
};

const numeroExiste = async (idManga, numero) => {
  const [rows] = await pool.query('SELECT 1 FROM capitulo WHERE ID_manga = ? AND numero = ?', [idManga, numero]);
  return rows.length > 0;
};

// Crea el capitulo con sus paginas y marca la obra como actualizada
const create = async ({ idManga, numero, titulo, formato, archivoNombre, archivoRuta }, paginas) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO capitulo (ID_manga, numero, titulo, formato, archivo_nombre, archivo_ruta) VALUES (?, ?, ?, ?, ?, ?)`,
      [idManga, numero, titulo, formato, archivoNombre || null, archivoRuta || null]
    );
    if (paginas.length) {
      await conn.query('INSERT INTO pagina (ID_capitulo, orden, ruta) VALUES ?', [
        paginas.map((ruta, i) => [result.insertId, i + 1, ruta]),
      ]);
    }
    await conn.query('UPDATE manga SET fecha_actualizacion = NOW() WHERE ID_manga = ?', [idManga]);
    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// Rutas de archivos de un capitulo (para borrarlos del disco al eliminarlo)
const archivosDe = async (id) => {
  const [paginas] = await pool.query('SELECT ruta FROM pagina WHERE ID_capitulo = ?', [id]);
  const [cap] = await pool.query('SELECT archivo_ruta FROM capitulo WHERE ID_capitulo = ?', [id]);
  return [...paginas.map((p) => p.ruta), ...(cap[0] && cap[0].archivo_ruta ? [cap[0].archivo_ruta] : [])];
};

// Todos los archivos de todos los capitulos de una obra (para borrarlos del disco)
const archivosDeManga = async (idManga) => {
  const [paginas] = await pool.query(
    'SELECT p.ruta FROM pagina p JOIN capitulo c ON c.ID_capitulo = p.ID_capitulo WHERE c.ID_manga = ?',
    [idManga]
  );
  const [pdfs] = await pool.query('SELECT archivo_ruta FROM capitulo WHERE ID_manga = ? AND archivo_ruta IS NOT NULL', [idManga]);
  return [...paginas.map((p) => p.ruta), ...pdfs.map((c) => c.archivo_ruta)];
};

const remove = async (id) => {
  const [result] = await pool.query('DELETE FROM capitulo WHERE ID_capitulo = ?', [id]);
  return result;
};

module.exports = { getByManga, getByNumero, getById, numeroExiste, create, archivosDe, archivosDeManga, remove };
