// Notificaciones de cada usuario (tabla notificacion)
const pool = require('../config/database');
const GeneroModel = require('./GeneroModel');
let tiposPreparados;

const prepararTipos = async () => {
  if (!tiposPreparados) {
    tiposPreparados = pool.query(
      "ALTER TABLE notificacion MODIFY COLUMN tipo ENUM('capitulo', 'comentario', 'advertencia', 'sistema') NOT NULL"
    ).catch((err) => {
      tiposPreparados = null;
      throw err;
    });
  }
  await tiposPreparados;
};

const crear = async (idUsuario, tipo, mensaje, enlace = null) => {
  await prepararTipos();
  await pool.query('INSERT INTO notificacion (ID_usuario, tipo, mensaje, enlace) VALUES (?, ?, ?, ?)', [
    idUsuario,
    tipo,
    mensaje,
    enlace,
  ]);
};

// Avisa a quienes tienen la obra guardada (siguiendo o pendiente) que hay un capitulo nuevo
const crearParaSeguidores = async (idManga, mensaje, enlace, excluirUsuario) => {
  await prepararTipos();
  await pool.query(
    `INSERT INTO notificacion (ID_usuario, tipo, mensaje, enlace)
     SELECT b.ID_usuario, 'capitulo', ?, ? FROM biblioteca b
     WHERE b.ID_manga = ? AND b.estado IN ('siguiendo', 'pendiente') AND b.ID_usuario <> ?`,
    [mensaje, enlace, idManga, excluirUsuario]
  );
};

const filtroEdad = (user, alias = 'n') => user && !user.esAdulto
  ? ` AND (
       ${alias}.tipo NOT IN ('capitulo', 'comentario')
       OR EXISTS (
         SELECT 1 FROM manga m
         WHERE m.ID_manga = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(${alias}.enlace, '/', 3), '/', -1) AS UNSIGNED)
           AND m.es_mas18 = FALSE
           AND ${GeneroModel.sqlSinGenerosAdultos('m')}
       )
     )`
  : '';

const listar = async (idUsuario, limite = 60, categoria = 'todas', user = null) => {
  const filtros = {
    comunes: ['capitulo', 'comentario'],
    admin: ['advertencia', 'sistema'],
  };
  const tipos = filtros[categoria];
  const filtroTipo = tipos ? ' AND tipo IN (?)' : '';
  const [rows] = await pool.query(
    `SELECT n.ID_notificacion AS id, n.tipo, n.mensaje, n.enlace, n.leida, n.fecha
     FROM notificacion n
     WHERE n.ID_usuario = ?${filtroTipo}${filtroEdad(user)}
     ORDER BY n.fecha DESC, n.ID_notificacion DESC LIMIT ?`,
    tipos ? [idUsuario, tipos, limite] : [idUsuario, limite]
  );
  return rows.map((n) => ({ ...n, leida: !!n.leida }));
};

const contarNoLeidas = async (idUsuario, user = null) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM notificacion n
     WHERE n.ID_usuario = ? AND n.leida = FALSE${filtroEdad(user)}`,
    [idUsuario]
  );
  return rows[0].total;
};

const marcarTodasLeidas = async (idUsuario) => {
  await pool.query('UPDATE notificacion SET leida = TRUE WHERE ID_usuario = ?', [idUsuario]);
};

const remove = async (id, idUsuario) => {
  await pool.query('DELETE FROM notificacion WHERE ID_notificacion = ? AND ID_usuario = ?', [id, idUsuario]);
};

module.exports = { crear, crearParaSeguidores, listar, contarNoLeidas, marcarTodasLeidas, remove };
