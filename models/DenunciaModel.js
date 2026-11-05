// Denuncias de obras con problemas (tabla denuncia)
const pool = require('../config/database');

const MOTIVOS = ['Las imagenes no cargan', 'Contenido inapropiado', 'Informacion incorrecta', 'Otro'];
const ESTADOS = ['Pendiente', 'Revisada', 'Descartada'];

const create = async ({ idManga, idUsuario, motivo, detalle }) => {
  await pool.query('INSERT INTO denuncia (ID_manga, ID_usuario, motivo, detalle) VALUES (?, ?, ?, ?)', [
    idManga,
    idUsuario,
    motivo,
    detalle || null,
  ]);
};

const getAll = async () => {
  const [rows] = await pool.query(
    `SELECT d.ID_denuncia AS id, d.motivo, d.detalle, d.estado, d.fecha, d.ID_manga AS idManga,
            m.titulo AS manga, m.visibilidad, m.ID_usuario AS idCreador, cu.username AS creador, u.username AS denunciante
     FROM denuncia d
     JOIN manga m ON m.ID_manga = d.ID_manga
     JOIN usuario cu ON cu.ID_usuario = m.ID_usuario
     JOIN usuario u ON u.ID_usuario = d.ID_usuario
     ORDER BY (d.estado = 'Pendiente') DESC, d.fecha DESC`
  );
  return rows;
};

const getById = async (id) => {
  const [rows] = await pool.query('SELECT ID_denuncia AS id, ID_manga AS idManga FROM denuncia WHERE ID_denuncia = ?', [id]);
  return rows[0] || null;
};

const setEstado = async (id, estado) => {
  await pool.query('UPDATE denuncia SET estado = ? WHERE ID_denuncia = ?', [estado, id]);
};

const remove = async (id) => {
  await pool.query('DELETE FROM denuncia WHERE ID_denuncia = ?', [id]);
};

const contarPendientes = async () => {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM denuncia WHERE estado = 'Pendiente'");
  return rows[0].total;
};

module.exports = { MOTIVOS, ESTADOS, create, getAll, getById, setEstado, remove, contarPendientes };
