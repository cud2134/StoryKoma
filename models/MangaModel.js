// Mangas (tablas manga y manga_genero)
const pool = require('../config/database');
const GeneroModel = require('./GeneroModel');

const TIPOS = ['MANGA', 'MANHWA', 'MANHUA', 'NOVELA'];
const DEMOGRAFIAS = ['Shounen', 'Seinen', 'Shoujo', 'Josei'];
const ESTADOS = ['En proceso', 'En pausa', 'Terminado'];
let vistasPreparadas;

const normalizarTitulo = (titulo) => {
  const compacto = String(titulo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return compacto.replace(/\p{N}+$/u, '') || compacto;
};

const titulosSimilares = (primero, segundo) => {
  const a = normalizarTitulo(primero);
  const b = normalizarTitulo(segundo);
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let diferencias = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    diferencias += 1;
    if (diferencias > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < a.length || j < b.length) diferencias += 1;
  return diferencias <= 1;
};

// Consulta base: la obra + quien la subio + datos para la tarjeta
const BASE = `
  SELECT m.*, u.username AS subido_por,
    (SELECT COUNT(*) FROM capitulo c WHERE c.ID_manga = m.ID_manga) AS total_capitulos,
    (SELECT CONCAT('Cap. ', c.numero, ': ', c.titulo) FROM capitulo c WHERE c.ID_manga = m.ID_manga ORDER BY c.numero DESC LIMIT 1) AS ultimo_capitulo,
    (SELECT GROUP_CONCAT(g.nombre ORDER BY g.nombre SEPARATOR '|') FROM manga_genero mg JOIN genero g ON g.ID_genero = mg.ID_genero WHERE mg.ID_manga = m.ID_manga) AS generos
  FROM manga m JOIN usuario u ON u.ID_usuario = m.ID_usuario`;

const BASE_CREADOR = BASE.replace(
  'SELECT m.*, u.username AS subido_por,',
  'SELECT m.*, u.username AS subido_por, (SELECT COUNT(*) FROM comentario c WHERE c.ID_manga = m.ID_manga) AS total_comentarios,'
);

const armar = (m) =>
  m && {
    id: m.ID_manga,
    titulo: m.titulo,
    autor: m.autor,
    descripcion: m.descripcion,
    portada: m.portada,
    tipo: m.tipo,
    demografia: m.demografia,
    estado: m.estado,
    esMas18: !!m.es_mas18,
    visibilidad: m.visibilidad,
    vistas: m.vistas,
    totalComentarios: Number(m.total_comentarios || 0),
    creadorId: m.ID_usuario,
    subidoPor: m.subido_por,
    totalCapitulos: Number(m.total_capitulos),
    ultimoCapitulo: m.ultimo_capitulo || 'Sin capitulos',
    generos: m.generos ? m.generos.split('|') : [],
    fechaCreacion: m.fecha_creacion,
    fechaActualizacion: m.fecha_actualizacion,
  };

// Que obras puede ver cada persona:
//  - Administrador: todas.  - Resto: solo las publicadas, y las +18 solo si es mayor de edad.
const visible = (user) => {
  if (user.esAdmin && user.esAdulto) return '1=1';
  const contenidoPermitido = user.esAdulto ? 'TRUE' : `(m.es_mas18 = FALSE AND ${GeneroModel.sqlSinGenerosAdultos()})`;
  return `m.visibilidad = 'Publicado' AND ${contenidoPermitido}`;
};

const ORDENES = {
  vistas: 'm.vistas DESC',
  actualizados: 'm.fecha_actualizacion DESC',
  recientes: 'm.fecha_creacion DESC',
  azar: 'RAND()',
};

// Filas del inicio: zona 'normal' (sin +18) o 'adulto' (solo +18)
const listar = async (user, { zona = 'normal', orden = 'vistas', genero = null, limite = 20 } = {}) => {
  const where = [visible(user), zona === 'adulto' ? 'm.es_mas18 = TRUE' : 'm.es_mas18 = FALSE'];
  const params = [];
  if (orden === 'actualizados') where.push('EXISTS (SELECT 1 FROM capitulo c WHERE c.ID_manga = m.ID_manga)');
  if (genero) {
    where.push(
      'm.ID_manga IN (SELECT mg.ID_manga FROM manga_genero mg JOIN genero g ON g.ID_genero = mg.ID_genero WHERE g.nombre = ?)'
    );
    params.push(genero);
  }
  const [rows] = await pool.query(
    `${BASE} WHERE ${where.join(' AND ')} ORDER BY ${ORDENES[orden] || ORDENES.vistas} LIMIT ?`,
    [...params, limite]
  );
  return rows.map(armar);
};

const listarPortadasPublicas = async () => {
  const [rows] = await pool.query(
    `SELECT portadas.portada FROM (
       SELECT DISTINCT m.portada FROM manga m
       WHERE m.visibilidad = 'Publicado' AND m.es_mas18 = FALSE
         AND m.portada <> '' AND ${GeneroModel.sqlSinGenerosAdultos('m')}
     ) AS portadas
     ORDER BY RAND()
     LIMIT 50`
  );
  return rows.map((row) => row.portada);
};

// Buscador con filtros (estado, tipo, generos y contenido +18)
const buscar = async (user, { q = '', estados = [], tipos = [], generos = [], contenido = 'todos' }, pagina = 1, porPagina = 24) => {
  const where = [visible(user)];
  const params = [];
  if (q) {
    where.push('m.titulo LIKE ?');
    params.push(`%${q}%`);
  }
  if (estados.length) {
    where.push('m.estado IN (?)');
    params.push(estados);
  }
  if (tipos.length) {
    where.push('m.tipo IN (?)');
    params.push(tipos);
  }
  if (generos.length) {
    // Debe tener TODOS los generos elegidos
    where.push(
      'm.ID_manga IN (SELECT mg.ID_manga FROM manga_genero mg WHERE mg.ID_genero IN (?) GROUP BY mg.ID_manga HAVING COUNT(DISTINCT mg.ID_genero) = ?)'
    );
    params.push(generos, generos.length);
  }
  if (user.esAdulto || user.esAdmin) {
    if (contenido === 'si') where.push('m.es_mas18 = TRUE');
    if (contenido === 'no') where.push('m.es_mas18 = FALSE');
  }
  const condicion = where.join(' AND ');
  const [[conteo]] = await pool.query(`SELECT COUNT(*) AS total FROM manga m WHERE ${condicion}`, params);
  const [rows] = await pool.query(`${BASE} WHERE ${condicion} ORDER BY m.titulo LIMIT ? OFFSET ?`, [
    ...params,
    porPagina,
    (pagina - 1) * porPagina,
  ]);
  return { mangas: rows.map(armar), total: conteo.total };
};

// Una obra para mostrarla (respeta permisos). El propietario puede ver sus obras no adultas aunque esten ocultas.
const getById = async (user, id) => {
  const propietarioPuedeVer = user.esAdulto
    ? 'm.ID_usuario = ?'
    : `(m.ID_usuario = ? AND m.es_mas18 = FALSE AND ${GeneroModel.sqlSinGenerosAdultos()})`;
  const [rows] = await pool.query(`${BASE} WHERE m.ID_manga = ? AND ((${visible(user)}) OR ${propietarioPuedeVer})`, [id, user.id]);
  return armar(rows[0]);
};

const getByIdSinRestriccion = async (id) => {
  const [rows] = await pool.query(`${BASE} WHERE m.ID_manga = ?`, [id]);
  return armar(rows[0]);
};

const tituloSimilarExiste = async (titulo) => {
  const [rows] = await pool.query('SELECT titulo FROM manga');
  return rows.some((row) => titulosSimilares(titulo, row.titulo));
};

const deCreador = async (idUsuario, user = null) => {
  const restriccionEdad = user && !user.esAdulto
    ? 'AND m.es_mas18 = FALSE AND ' + GeneroModel.sqlSinGenerosAdultos()
    : '';
  const [rows] = await pool.query(`${BASE_CREADOR} WHERE m.ID_usuario = ? ${restriccionEdad} ORDER BY m.fecha_creacion DESC`, [idUsuario]);
  return rows.map(armar);
};

const guardarGeneros = async (conn, idManga, generos) => {
  await conn.query('DELETE FROM manga_genero WHERE ID_manga = ?', [idManga]);
  if (generos.length) {
    await conn.query('INSERT INTO manga_genero (ID_manga, ID_genero) VALUES ?', [generos.map((g) => [idManga, g])]);
  }
};

const create = async (d, generos) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO manga (titulo, autor, descripcion, portada, tipo, demografia, estado, es_mas18, vistas, ID_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [d.titulo, d.autor, d.descripcion || null, d.portada, d.tipo, d.demografia, d.estado, d.esMas18, d.creadorId]
    );
    await guardarGeneros(conn, result.insertId, generos);
    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const update = async (id, d, generos) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE manga SET titulo = ?, autor = ?, descripcion = ?, portada = ?, tipo = ?, demografia = ?, estado = ?, es_mas18 = ?,
              fecha_actualizacion = NOW()
       WHERE ID_manga = ?`,
      [d.titulo, d.autor, d.descripcion || null, d.portada, d.tipo, d.demografia, d.estado, d.esMas18, id]
    );
    await guardarGeneros(conn, id, generos);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const setEstado = async (id, estado) => {
  await pool.query('UPDATE manga SET estado = ?, fecha_actualizacion = NOW() WHERE ID_manga = ?', [estado, id]);
};

const setVisibilidad = async (id, visibilidad) => {
  await pool.query('UPDATE manga SET visibilidad = ? WHERE ID_manga = ?', [visibilidad, id]);
};

const prepararRegistroVistas = async () => {
  if (!vistasPreparadas) {
    vistasPreparadas = pool.query(
      `CREATE TABLE IF NOT EXISTS manga_vista_usuario (
        ID_manga INT NOT NULL,
        ID_usuario INT NOT NULL,
        fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ID_manga, ID_usuario),
        CONSTRAINT FK_vista_usuario_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
        CONSTRAINT FK_vista_usuario_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE
      )`
    ).catch((err) => {
      vistasPreparadas = null;
      throw err;
    });
  }
  await vistasPreparadas;
};

const registrarVistaUnica = async (idManga, idUsuario) => {
  await prepararRegistroVistas();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT IGNORE INTO manga_vista_usuario (ID_manga, ID_usuario) VALUES (?, ?)',
      [idManga, idUsuario]
    );
    if (result.affectedRows) {
      await conn.query('UPDATE manga SET vistas = vistas + 1 WHERE ID_manga = ?', [idManga]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const remove = async (id) => {
  const [result] = await pool.query('DELETE FROM manga WHERE ID_manga = ?', [id]);
  return result;
};

module.exports = {
  TIPOS,
  DEMOGRAFIAS,
  ESTADOS,
  armar,
  BASE,
  visible,
  listar,
  listarPortadasPublicas,
  buscar,
  getById,
  getByIdSinRestriccion,
  tituloSimilarExiste,
  deCreador,
  create,
  update,
  setEstado,
  setVisibilidad,
  registrarVistaUnica,
  remove,
};
