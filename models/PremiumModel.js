const pool = require('../config/database');

const PLANES = {
  mensual: { monto: 10000, intervalo: 'MONTH', nombre: 'Mensual' },
  anual: { monto: 30000, intervalo: 'YEAR', nombre: 'Anual' },
};

const crearPagoPendiente = async ({ usuarioId, plan, proveedor, referenciaExterna, comprador }) => {
  const datosPlan = PLANES[plan];
  if (!datosPlan) throw new Error('El plan seleccionado no existe.');
  const [result] = await pool.query(
    `INSERT INTO pago_premium
       (ID_usuario, plan, proveedor, monto_clp, referencia_externa, nombre_pagador, apellido_pagador, correo_pagador)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [usuarioId, plan, proveedor, datosPlan.monto, referenciaExterna, comprador.nombre, comprador.apellido, comprador.correo]
  );
  return { id: result.insertId, referencia_externa: referenciaExterna };
};

const guardarReferenciaCheckout = async (id, referencia) => {
  await pool.query('UPDATE pago_premium SET referencia_checkout = ? WHERE ID_pago = ?', [referencia, id]);
};

const cancelarPagoPendiente = async (id) => {
  await pool.query(
    "UPDATE pago_premium SET estado = 'cancelado' WHERE ID_pago = ? AND estado = 'pendiente'",
    [id]
  );
};

const obtenerPorReferenciaExterna = async (referenciaExterna) => {
  const [rows] = await pool.query('SELECT * FROM pago_premium WHERE referencia_externa = ? LIMIT 1', [referenciaExterna]);
  return rows[0] || null;
};

const obtenerPorReferenciaCheckout = async (referenciaCheckout) => {
  const [rows] = await pool.query('SELECT * FROM pago_premium WHERE referencia_checkout = ? LIMIT 1', [referenciaCheckout]);
  return rows[0] || null;
};

const aprobarPago = async ({ referenciaExterna, referenciaPago, fechaConfirmacion }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT * FROM pago_premium WHERE referencia_externa = ? FOR UPDATE',
      [referenciaExterna]
    );
    const pago = rows[0];
    if (!pago) {
      await conn.rollback();
      return false;
    }
    if (pago.estado === 'aprobado') {
      await conn.commit();
      return true;
    }
    if (pago.estado !== 'pendiente') {
      await conn.rollback();
      return false;
    }

    await conn.query(
      `UPDATE usuario
       SET premium_hasta = DATE_ADD(
         GREATEST(COALESCE(premium_hasta, NOW()), NOW()),
         INTERVAL 1 ${PLANES[pago.plan].intervalo}
       )
       WHERE ID_usuario = ?`,
      [pago.ID_usuario]
    );
    const [[usuario]] = await conn.query('SELECT premium_hasta FROM usuario WHERE ID_usuario = ?', [pago.ID_usuario]);
    const parsedFecha = fechaConfirmacion ? new Date(fechaConfirmacion) : null;
    const fechaValida = parsedFecha && Number.isFinite(parsedFecha.getTime()) ? parsedFecha : null;
    await conn.query(
      `UPDATE pago_premium
       SET estado = 'aprobado', referencia_pago = ?, fecha_confirmacion = COALESCE(?, NOW()), fecha_vencimiento = ?
       WHERE ID_pago = ?`,
      [referenciaPago, fechaValida, usuario.premium_hasta, pago.ID_pago]
    );
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const reclamarComprobante = async (referenciaExterna) => {
  const [result] = await pool.query(
    `UPDATE pago_premium
     SET comprobante_estado = 'enviando', comprobante_intento_en = NOW()
     WHERE referencia_externa = ? AND estado = 'aprobado'
       AND (comprobante_estado = 'pendiente'
         OR (comprobante_estado = 'enviando' AND comprobante_intento_en < DATE_SUB(NOW(), INTERVAL 10 MINUTE)))`,
    [referenciaExterna]
  );
  if (!result.affectedRows) return null;
  return obtenerPorReferenciaExterna(referenciaExterna);
};

const marcarComprobanteEnviado = async (id) => {
  await pool.query(
    `UPDATE pago_premium SET comprobante_estado = 'enviado', comprobante_enviado_en = NOW()
     WHERE ID_pago = ? AND comprobante_estado = 'enviando'`,
    [id]
  );
};

const liberarComprobante = async (id) => {
  await pool.query(
    `UPDATE pago_premium SET comprobante_estado = 'pendiente'
     WHERE ID_pago = ? AND comprobante_estado = 'enviando'`,
    [id]
  );
};

module.exports = {
  PLANES,
  crearPagoPendiente,
  guardarReferenciaCheckout,
  cancelarPagoPendiente,
  obtenerPorReferenciaExterna,
  obtenerPorReferenciaCheckout,
  aprobarPago,
  reclamarComprobante,
  marcarComprobanteEnviado,
  liberarComprobante,
};
