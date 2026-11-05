// Usuarios y roles (tablas usuario y rol)
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const SELECT = `
  SELECT u.*, r.nombre_rol AS rol,
    (u.premium_hasta IS NOT NULL AND u.premium_hasta > NOW()) AS premium_activo
  FROM usuario u JOIN rol r ON r.ID_rol = u.ID_rol`;

// Edad en años a partir de 'YYYY-MM-DD'
const calcularEdad = (fecha) => {
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  if (!y) return 0;
  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad -= 1;
  return edad;
};

// Objeto "limpio" que usan los controladores y las vistas (sin el hash de la contraseña)
const armar = (u) =>
  u && {
    id: u.ID_usuario,
    username: u.username,
    correo: u.correo,
    rol: u.rol,
    estado: u.estado,
    motivoBaneo: u.motivo_baneo,
    avatar: u.avatar,
    fechaNacimiento: String(u.fecha_nacimiento).slice(0, 10),
    fechaRegistro: u.fecha_registro,
    premiumHasta: u.premium_hasta,
    premiumActivo: u.rol === 'Administrador' || Boolean(u.premium_activo),
    googleId: u.google_id,
    emailVerificado: Boolean(u.email_verificado),
    esAdulto: calcularEdad(u.fecha_nacimiento) >= 18,
    esAdmin: u.rol === 'Administrador',
    esCreador: u.rol === 'Creador' || u.rol === 'Administrador',
  };

const findById = async (id) => {
  const [rows] = await pool.query(`${SELECT} WHERE u.ID_usuario = ?`, [id]);
  await liberarBaneoExpirado(rows[0]);
  return armar(rows[0]);
};

// Para iniciar sesion: por nombre de usuario o correo. Devuelve tambien el hash
const findForLogin = async (identificador) => {
  const [rows] = await pool.query(
    `${SELECT} WHERE u.username = ? OR LOWER(u.correo) = LOWER(?)`,
    [identificador, identificador]
  );
  await liberarBaneoExpirado(rows[0]);
  return rows[0] ? { ...armar(rows[0]), hash: rows[0].contrasena_hash } : null;
};

const liberarBaneoExpirado = async (usuario) => {
  if (!usuario || usuario.estado !== 'Baneado') return;
  const [rows] = await pool.query(
    `SELECT ID_bloqueo AS id, fecha_desbloqueo <= NOW() AS expirado
     FROM bloqueo_usuario
     WHERE ID_usuario = ? AND estado = 'Baneado'
     ORDER BY fecha_baneo DESC, ID_bloqueo DESC LIMIT 1`,
    [usuario.ID_usuario]
  );
  if (!rows[0] || !rows[0].expirado) return;
  await pool.query("UPDATE bloqueo_usuario SET estado = 'Activo' WHERE ID_bloqueo = ?", [rows[0].id]);
  await pool.query("UPDATE usuario SET estado = 'Activo', motivo_baneo = NULL WHERE ID_usuario = ?", [usuario.ID_usuario]);
  usuario.estado = 'Activo';
  usuario.motivo_baneo = null;
};

const findByEmail = async (correo) => {
  const [rows] = await pool.query(`${SELECT} WHERE u.correo = ?`, [correo]);
  await liberarBaneoExpirado(rows[0]);
  return armar(rows[0]);
};

const findByGoogleId = async (googleId) => {
  const [rows] = await pool.query(`${SELECT} WHERE u.google_id = ?`, [googleId]);
  await liberarBaneoExpirado(rows[0]);
  return armar(rows[0]);
};

const vincularGoogle = async (id, googleId) => {
  await pool.query(
    'UPDATE usuario SET google_id = ?, email_verificado = 1, token_verificacion = NULL, token_verificacion_expira = NULL WHERE ID_usuario = ?',
    [googleId, id]
  );
};

const usernameExiste = async (username, exceptoId = 0) => {
  const [rows] = await pool.query('SELECT 1 FROM usuario WHERE username = ? AND ID_usuario <> ?', [username, exceptoId]);
  return rows.length > 0;
};

const correoExiste = async (correo) => {
  const [rows] = await pool.query('SELECT 1 FROM usuario WHERE correo = ?', [correo]);
  return rows.length > 0;
};

const checkPassword = async (usuario, plano) => (usuario.hash ? bcrypt.compare(plano, usuario.hash) : false);

// Crea un usuario. rol: 'Lector' | 'Creador' | 'Administrador'
const create = async ({
  username,
  correo,
  contrasena = null,
  googleId = null,
  fechaNacimiento,
  rol,
  emailVerificado = Boolean(googleId),
  tokenVerificacion = null,
  tokenVerificacionExpira = null,
}) => {
  const hash = contrasena ? await bcrypt.hash(contrasena, 10) : null;
  const [result] = await pool.query(
    `INSERT INTO usuario
       (username, correo, contrasena_hash, google_id, fecha_nacimiento, ID_rol,
        email_verificado, token_verificacion, token_verificacion_expira)
     VALUES (?, ?, ?, ?, ?, (SELECT ID_rol FROM rol WHERE nombre_rol = ?), ?, ?, ?)`,
    [username, correo, hash, googleId, fechaNacimiento, rol, emailVerificado, tokenVerificacion, tokenVerificacionExpira]
  );
  return result.insertId;
};

const verificarCorreo = async (token) => {
  const [result] = await pool.query(
    `UPDATE usuario
     SET email_verificado = 1, token_verificacion = NULL, token_verificacion_expira = NULL
     WHERE token_verificacion = ? AND email_verificado = 0 AND token_verificacion_expira > NOW()`,
    [token]
  );
  return result.affectedRows > 0;
};

const verificarCorreoConCodigo = async (correo, token) => {
  const [result] = await pool.query(
    `UPDATE usuario
     SET email_verificado = 1, token_verificacion = NULL, token_verificacion_expira = NULL,
         token_verificacion_intentos = 0
     WHERE LOWER(correo) = LOWER(?) AND token_verificacion = ?
       AND email_verificado = 0 AND token_verificacion_expira > NOW()
       AND token_verificacion_intentos < 5`,
    [correo, token]
  );
  if (result.affectedRows > 0) return true;

  await pool.query(
    `UPDATE usuario SET token_verificacion_intentos = token_verificacion_intentos + 1
     WHERE LOWER(correo) = LOWER(?) AND email_verificado = 0
       AND token_verificacion_expira > NOW() AND token_verificacion_intentos < 5`,
    [correo]
  );
  return false;
};

const renovarTokenVerificacion = async (correo, token, expira) => {
  const [result] = await pool.query(
    `UPDATE usuario SET token_verificacion = ?, token_verificacion_expira = ?,
       token_verificacion_intentos = 0
     WHERE LOWER(correo) = LOWER(?) AND email_verificado = 0`,
    [token, expira, correo]
  );
  return result.affectedRows > 0;
};

const eliminarCuentaSinVerificar = async (id) => {
  await pool.query('DELETE FROM usuario WHERE ID_usuario = ? AND email_verificado = 0', [id]);
};

// Crea la cuenta de administrador (datos del .env) si todavia no existe ninguna
const asegurarAdmin = async () => {
  const [rows] = await pool.query(
    `SELECT 1 FROM usuario u JOIN rol r ON r.ID_rol = u.ID_rol WHERE r.nombre_rol = 'Administrador' LIMIT 1`
  );
  if (rows.length) return false;
  const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) return false;
  await create({
    username: ADMIN_USERNAME,
    correo: ADMIN_EMAIL.toLowerCase(),
    contrasena: ADMIN_PASSWORD,
    fechaNacimiento: '1990-01-01',
    rol: 'Administrador',
    emailVerificado: true,
  });
  return true;
};

const updatePerfil = async (id, { username, fechaNacimiento, avatar }) => {
  if (avatar) {
    await pool.query('UPDATE usuario SET username = ?, fecha_nacimiento = ?, avatar = ? WHERE ID_usuario = ?', [username, fechaNacimiento, avatar, id]);
  } else {
    await pool.query('UPDATE usuario SET username = ?, fecha_nacimiento = ? WHERE ID_usuario = ?', [username, fechaNacimiento, id]);
  }
};

// ---- Administracion ----
const getAll = async (busqueda = '') => {
  const termino = `%${busqueda}%`;
  const [rows] = await pool.query(
    `SELECT u.*, r.nombre_rol AS rol,
            (SELECT COUNT(*) FROM manga m WHERE m.ID_usuario = u.ID_usuario) AS total_mangas
     FROM usuario u JOIN rol r ON r.ID_rol = u.ID_rol
     WHERE ? = '' OR CAST(u.ID_usuario AS CHAR) LIKE ? OR u.username LIKE ? OR u.correo LIKE ?
     ORDER BY u.ID_usuario`,
    [busqueda, termino, termino, termino]
  );
  return rows.map((r) => ({ ...armar(r), totalMangas: r.total_mangas }));
};

const setRol = async (id, rol) => {
  await pool.query('UPDATE usuario SET ID_rol = (SELECT ID_rol FROM rol WHERE nombre_rol = ?) WHERE ID_usuario = ?', [rol, id]);
};

const getBanDetails = async (id) => {
  const [rows] = await pool.query(
    `SELECT b.ID_bloqueo AS id, b.ID_usuario AS usuarioId, b.motivo, b.fecha_baneo AS fechaBaneo,
            b.duracion_dias AS duracionDias, b.duracion_horas AS duracionHoras,
            b.fecha_desbloqueo AS fechaDesbloqueo, b.apelacion, b.estado_apelacion AS estadoApelacion,
            b.respuesta_apelacion AS respuestaApelacion, b.ID_admin_apelacion AS adminApelacionId,
            admin.username AS administrador, responsable.username AS responsableApelacion
     FROM bloqueo_usuario b
     LEFT JOIN usuario admin ON admin.ID_usuario = b.ID_administrador
     LEFT JOIN usuario responsable ON responsable.ID_usuario = b.ID_admin_apelacion
     WHERE b.ID_usuario = ? AND b.estado = 'Baneado'
     ORDER BY b.fecha_baneo DESC, b.ID_bloqueo DESC LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

const banear = async (id, adminId, motivo, dias, horas) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("UPDATE bloqueo_usuario SET estado = 'Activo' WHERE ID_usuario = ? AND estado = 'Baneado'", [id]);
    await connection.query(
      `INSERT INTO bloqueo_usuario
         (ID_usuario, ID_administrador, motivo, duracion_dias, duracion_horas, fecha_desbloqueo, estado)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 'Baneado')`,
      [id, adminId, motivo, dias, horas, dias * 1440 + horas * 60]
    );
    await connection.query("UPDATE usuario SET estado = 'Baneado', motivo_baneo = ? WHERE ID_usuario = ?", [motivo, id]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const desbanear = async (id) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "UPDATE bloqueo_usuario SET estado = 'Activo' WHERE ID_usuario = ? AND estado = 'Baneado'",
      [id]
    );
    await connection.query("UPDATE usuario SET estado = 'Activo', motivo_baneo = NULL WHERE ID_usuario = ?", [id]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const listarApelaciones = async () => {
  const [rows] = await pool.query(
    `SELECT b.ID_bloqueo AS id, b.ID_usuario AS usuarioId, u.username AS usuario,
            b.fecha_baneo AS fechaBaneo, b.fecha_desbloqueo AS fechaDesbloqueo,
            b.estado_apelacion AS estado, b.apelacion AS mensaje, b.respuesta_apelacion AS respuesta,
            responsable.username AS administrador
     FROM bloqueo_usuario b
     JOIN usuario u ON u.ID_usuario = b.ID_usuario
     LEFT JOIN usuario responsable ON responsable.ID_usuario = b.ID_admin_apelacion
     WHERE b.estado_apelacion <> 'No enviada'
       AND (
         b.estado_apelacion IN ('Aprobada', 'Rechazada')
         OR (b.estado = 'Baneado' AND (b.fecha_desbloqueo IS NULL OR b.fecha_desbloqueo > NOW()))
       )
     ORDER BY FIELD(b.estado_apelacion, 'Pendiente', 'En proceso', 'Aprobada', 'Rechazada'), b.fecha_baneo DESC`
  );
  return rows;
};

const contarApelacionesPendientes = async () => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM bloqueo_usuario
     WHERE estado_apelacion = 'Pendiente' AND estado = 'Baneado'
       AND (fecha_desbloqueo IS NULL OR fecha_desbloqueo > NOW())`
  );
  return rows[0].total;
};

const crearApelacion = async (idUsuario, mensaje) => {
  const [result] = await pool.query(
    `UPDATE bloqueo_usuario
     SET apelacion = ?, estado_apelacion = 'Pendiente'
     WHERE ID_bloqueo = (
       SELECT id FROM (
         SELECT ID_bloqueo AS id FROM bloqueo_usuario
         WHERE ID_usuario = ? AND estado = 'Baneado' AND estado_apelacion = 'No enviada'
           AND (fecha_desbloqueo IS NULL OR fecha_desbloqueo > NOW())
         ORDER BY fecha_baneo DESC, ID_bloqueo DESC LIMIT 1
       ) actual
     )`,
    [mensaje, idUsuario]
  );
  return result.affectedRows > 0;
};

const tomarApelacion = async (id, adminId, mensaje) => {
  const [result] = await pool.query(
    `UPDATE bloqueo_usuario
     SET estado_apelacion = 'En proceso', ID_admin_apelacion = ?, respuesta_apelacion = ?
    WHERE ID_bloqueo = ? AND estado = 'Baneado' AND estado_apelacion = 'Pendiente'
      AND (fecha_desbloqueo IS NULL OR fecha_desbloqueo > NOW())`,
    [adminId, mensaje, id]
  );
  if (!result.affectedRows) return null;
  const [rows] = await pool.query('SELECT ID_usuario AS usuarioId FROM bloqueo_usuario WHERE ID_bloqueo = ?', [id]);
  return rows[0] ? rows[0].usuarioId : null;
};

const resolverApelacion = async (id, adminId, estado, mensaje) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT ID_usuario AS usuarioId FROM bloqueo_usuario
       WHERE ID_bloqueo = ? AND estado = 'Baneado' AND estado_apelacion = 'En proceso'
         AND ID_admin_apelacion = ? AND (fecha_desbloqueo IS NULL OR fecha_desbloqueo > NOW()) FOR UPDATE`,
      [id, adminId]
    );
    if (!rows[0]) {
      await connection.rollback();
      return null;
    }
    await connection.query(
      'UPDATE bloqueo_usuario SET estado_apelacion = ?, respuesta_apelacion = ? WHERE ID_bloqueo = ?',
      [estado, mensaje, id]
    );
    if (estado === 'Aprobada') {
      await connection.query("UPDATE bloqueo_usuario SET estado = 'Activo' WHERE ID_bloqueo = ?", [id]);
      await connection.query(
        "UPDATE usuario SET estado = 'Activo', motivo_baneo = NULL WHERE ID_usuario = ?",
        [rows[0].usuarioId]
      );
    }
    await connection.commit();
    return rows[0].usuarioId;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const remove = async (id) => {
  const [result] = await pool.query('DELETE FROM usuario WHERE ID_usuario = ?', [id]);
  return result;
};

const eliminarApelacion = async (id) => {
  const [result] = await pool.query(
    `UPDATE bloqueo_usuario
     SET apelacion = NULL, estado_apelacion = 'No enviada',
         respuesta_apelacion = NULL, ID_admin_apelacion = NULL
     WHERE ID_bloqueo = ? AND estado_apelacion <> 'No enviada'`,
    [id]
  );
  return result.affectedRows > 0;
};

module.exports = {
  calcularEdad,
  findById,
  findForLogin,
  findByEmail,
  findByGoogleId,
  vincularGoogle,
  usernameExiste,
  correoExiste,
  checkPassword,
  create,
  verificarCorreo,
  verificarCorreoConCodigo,
  renovarTokenVerificacion,
  eliminarCuentaSinVerificar,
  asegurarAdmin,
  updatePerfil,
  getAll,
  setRol,
  getBanDetails,
  banear,
  desbanear,
  listarApelaciones,
  contarApelacionesPendientes,
  crearApelacion,
  tomarApelacion,
  resolverApelacion,
  eliminarApelacion,
  remove,
};
