const crypto = require('crypto');
const PremiumModel = require('../models/PremiumModel');
const pagoService = require('../services/pagoService');
const correoService = require('../services/correoService');

const proveedoresDisponibles = () => ({
  mercadopago: Boolean(
    process.env.MERCADOPAGO_ACCESS_TOKEN &&
    process.env.MERCADOPAGO_WEBHOOK_SECRET &&
    process.env.APP_URL
  ),
  paypal: Boolean(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    process.env.PAYPAL_WEBHOOK_ID &&
    process.env.APP_URL
  ),
});

const asegurarCsrf = (req) => {
  if (!req.session.csrfPremium) req.session.csrfPremium = crypto.randomBytes(32).toString('hex');
  return req.session.csrfPremium;
};

const validarCsrf = (req) => {
  const esperado = req.session.csrfPremium;
  const recibido = typeof req.body.csrf === 'string' ? req.body.csrf : '';
  if (!esperado || !recibido) return false;
  const esperadoBuffer = Buffer.from(esperado);
  const recibidoBuffer = Buffer.from(recibido);
  return esperadoBuffer.length === recibidoBuffer.length && crypto.timingSafeEqual(esperadoBuffer, recibidoBuffer);
};

const index = (req, res) => {
  res.render('premium/index', {
    title: 'Plan Premium',
    csrfToken: asegurarCsrf(req),
    proveedores: proveedoresDisponibles(),
    planes: PremiumModel.PLANES,
    correoConfigurado: correoService.estaConfigurado(),
  });
};

const formularioPago = (req, res) => {
  const { plan } = req.params;
  if (!PremiumModel.PLANES[plan] || req.user.esAdmin) return res.redirect('/premium');
  res.render('premium/checkout', {
    title: 'Datos de pago',
    planKey: plan,
    plan: PremiumModel.PLANES[plan],
    csrfToken: asegurarCsrf(req),
    proveedores: proveedoresDisponibles(),
    correoConfigurado: correoService.estaConfigurado(),
    valores: { nombre: '', apellido: '', correo: req.user.correo || '', proveedor: '' },
    error: null,
  });
};

const iniciarPago = async (req, res, next) => {
  let pago;
  try {
    if (!validarCsrf(req)) {
      return res.status(403).render('errors/error', {
        title: 'Solicitud no valida',
        codigo: 403,
        mensaje: 'Actualiza la pagina e intentalo de nuevo.',
      });
    }
    if (req.user.esAdmin) return res.redirect('/premium');

    const { plan } = req.params;
    const { nombre, apellido, correo, proveedor } = req.body;
    const valores = {
      nombre: typeof nombre === 'string' ? nombre.trim() : '',
      apellido: typeof apellido === 'string' ? apellido.trim() : '',
      correo: typeof correo === 'string' ? correo.trim().toLowerCase() : '',
      proveedor: typeof proveedor === 'string' ? proveedor : '',
    };
    const proveedores = proveedoresDisponibles();
    let error = null;
    if (!PremiumModel.PLANES[plan]) error = 'El plan seleccionado no existe.';
    else if (!valores.nombre || valores.nombre.length > 80 || /[\r\n<>]/.test(valores.nombre)) error = 'Escribe un nombre valido (maximo 80 caracteres).';
    else if (!valores.apellido || valores.apellido.length > 80 || /[\r\n<>]/.test(valores.apellido)) error = 'Escribe un apellido valido (maximo 80 caracteres).';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.correo) || valores.correo.length > 100) error = 'Escribe un correo valido.';
    else if (!['paypal', 'mercadopago'].includes(valores.proveedor) || !proveedores[valores.proveedor]) error = 'Elige un medio de pago que este disponible.';
    else if (!correoService.estaConfigurado()) error = 'El envio de comprobantes por correo no esta configurado. No se inicio el pago.';

    if (error) {
      if (!PremiumModel.PLANES[plan]) return res.redirect('/premium');
      return res.status(400).render('premium/checkout', {
        title: 'Datos de pago',
        planKey: plan,
        plan: PremiumModel.PLANES[plan],
        csrfToken: asegurarCsrf(req),
        proveedores,
        correoConfigurado: correoService.estaConfigurado(),
        valores,
        error,
      });
    }

    pago = await PremiumModel.crearPagoPendiente({
      usuarioId: req.user.id,
      plan,
      proveedor: valores.proveedor,
      referenciaExterna: crypto.randomUUID(),
      comprador: valores,
    });
    const url = valores.proveedor === 'mercadopago'
      ? await pagoService.crearOrdenMercadoPago({ pago, plan, comprador: valores })
      : await pagoService.crearOrdenPayPal({ pago, plan, comprador: valores });
    res.redirect(303, url);
  } catch (err) {
    if (pago && err.errorVisible) {
      try {
        await PremiumModel.cancelarPagoPendiente(pago.id);
      } catch (cancelError) {
        console.error('No se pudo cancelar el pago pendiente:', cancelError.message);
      }
    }
    if (err.errorVisible) {
      req.flash('error', err.message);
      return res.redirect('/premium');
    }
    next(err);
  }
};

const enviarComprobante = async (referenciaExterna) => {
  const pago = await PremiumModel.reclamarComprobante(referenciaExterna);
  if (!pago) return;
  try {
    await correoService.enviarComprobantePago(pago);
    await PremiumModel.marcarComprobanteEnviado(pago.ID_pago);
  } catch (err) {
    try {
      await PremiumModel.liberarComprobante(pago.ID_pago);
    } catch (errorLiberacion) {
      console.error('No se pudo liberar el reintento del comprobante:', errorLiberacion.message);
    }
    throw err;
  }
};

const aprobarMercadoPago = async (paymentId, referenciaExterna, usuarioId) => {
  if (!paymentId || !referenciaExterna) return false;
  const pago = await PremiumModel.obtenerPorReferenciaExterna(referenciaExterna);
  if (!pago || pago.proveedor !== 'mercadopago' || Number(pago.ID_usuario) !== Number(usuarioId)) return false;
  const remoto = await pagoService.verificarPagoMercadoPago(paymentId);
  if (
    remoto.status !== 'approved' ||
    remoto.external_reference !== referenciaExterna ||
    remoto.currency_id !== 'CLP' ||
    Number(remoto.transaction_amount) !== Number(pago.monto_clp)
  ) return false;
  const aprobado = await PremiumModel.aprobarPago({
    referenciaExterna,
    referenciaPago: String(remoto.id),
    fechaConfirmacion: remoto.date_approved,
  });
  if (aprobado) await enviarComprobante(referenciaExterna);
  return aprobado;
};

const retornoMercadoPago = async (req, res, next) => {
  try {
    const paymentId = req.query.payment_id || req.query.collection_id;
    const referenciaExterna = req.query.external_reference;
    if (!await aprobarMercadoPago(paymentId, referenciaExterna, req.user.id)) {
      req.flash('error', 'No pudimos confirmar el pago. Si ya fue aprobado, espera unos momentos y vuelve a revisar tu plan.');
      return res.redirect('/premium');
    }
    req.flash('success', 'Pago confirmado. Tu plan Premium ya esta activo. Enviamos el comprobante al correo indicado.');
    res.redirect('/premium');
  } catch (err) {
    if (err.errorVisible) {
      req.flash('error', `El pago puede haberse aprobado, pero no pudimos completar la confirmacion o enviar el comprobante: ${err.message}`);
      return res.redirect('/premium');
    }
    next(err);
  }
};

const webhookMercadoPago = async (req, res, next) => {
  try {
    if (!process.env.MERCADOPAGO_WEBHOOK_SECRET || !pagoService.validarFirmaMercadoPago(req)) {
      return res.status(401).json({ error: 'Firma de webhook no valida.' });
    }
    const paymentId = req.query['data.id'] || (req.body && req.body.data && req.body.data.id);
    if (!paymentId) return res.status(400).json({ error: 'Falta el identificador de pago.' });
    const remoto = await pagoService.verificarPagoMercadoPago(paymentId);
    if (remoto.status !== 'approved') return res.sendStatus(200);
    const pago = await PremiumModel.obtenerPorReferenciaExterna(remoto.external_reference);
    if (
      !pago ||
      pago.proveedor !== 'mercadopago' ||
      remoto.currency_id !== 'CLP' ||
      Number(remoto.transaction_amount) !== Number(pago.monto_clp)
    ) return res.sendStatus(200);
    await PremiumModel.aprobarPago({
      referenciaExterna: pago.referencia_externa,
      referenciaPago: String(remoto.id),
      fechaConfirmacion: remoto.date_approved,
    });
    await enviarComprobante(pago.referencia_externa);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};

const webhookPayPal = async (req, res, next) => {
  try {
    if (!await pagoService.verificarWebhookPayPal(req)) return res.status(401).json({ error: 'Firma de webhook no valida.' });
    const evento = req.body;
    if (evento.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return res.sendStatus(200);
    const captura = evento.resource;
    const ordenId = captura && captura.supplementary_data &&
      captura.supplementary_data.related_ids && captura.supplementary_data.related_ids.order_id;
    if (!ordenId || !captura.id) return res.sendStatus(200);
    const orden = await pagoService.obtenerOrdenPayPal(ordenId);
    const unidad = orden.purchase_units && orden.purchase_units[0];
    const pago = unidad && await PremiumModel.obtenerPorReferenciaExterna(unidad.custom_id);
    if (
      !pago ||
      pago.proveedor !== 'paypal' ||
      orden.status !== 'COMPLETED' ||
      captura.status !== 'COMPLETED' ||
      !captura.amount ||
      captura.amount.currency_code !== 'CLP' ||
      Number(captura.amount.value) !== Number(pago.monto_clp)
    ) return res.sendStatus(200);
    await PremiumModel.aprobarPago({
      referenciaExterna: pago.referencia_externa,
      referenciaPago: String(captura.id),
      fechaConfirmacion: captura.create_time,
    });
    await enviarComprobante(pago.referencia_externa);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};

const retornoPayPal = async (req, res, next) => {
  try {
    const orderId = typeof req.query.token === 'string' ? req.query.token : '';
    const pago = await PremiumModel.obtenerPorReferenciaCheckout(orderId);
    if (!pago || pago.proveedor !== 'paypal' || Number(pago.ID_usuario) !== Number(req.user.id)) {
      req.flash('error', 'No encontramos un pago de PayPal pendiente para esta cuenta.');
      return res.redirect('/premium');
    }
    if (pago.estado !== 'aprobado') {
      const resultado = await pagoService.capturarOrdenPayPal(orderId);
      const unidad = resultado.purchase_units && resultado.purchase_units[0];
      const captura = unidad && unidad.payments && unidad.payments.captures && unidad.payments.captures[0];
      if (
        resultado.status !== 'COMPLETED' ||
        !unidad ||
        unidad.custom_id !== pago.referencia_externa ||
        !captura ||
        captura.status !== 'COMPLETED' ||
        !captura.amount ||
        captura.amount.currency_code !== 'CLP' ||
        Number(captura.amount.value) !== Number(pago.monto_clp)
      ) {
        req.flash('error', 'PayPal no confirmo el pago. Puedes revisar el estado y volver a intentarlo.');
        return res.redirect('/premium');
      }
      await PremiumModel.aprobarPago({
        referenciaExterna: pago.referencia_externa,
        referenciaPago: String(captura.id),
        fechaConfirmacion: captura.create_time,
      });
    }
    await enviarComprobante(pago.referencia_externa);
    req.flash('success', 'Pago confirmado. Tu plan Premium ya esta activo. Enviamos el comprobante al correo indicado.');
    res.redirect('/premium');
  } catch (err) {
    if (err.errorVisible) {
      req.flash('error', `El pago puede haberse aprobado, pero no pudimos completar la confirmacion o enviar el comprobante: ${err.message}`);
      return res.redirect('/premium');
    }
    next(err);
  }
};

const cancelarPayPal = (req, res) => {
  req.flash('error', 'El pago fue cancelado. No se realizaron cargos.');
  res.redirect('/premium');
};

module.exports = {
  index,
  formularioPago,
  iniciarPago,
  retornoMercadoPago,
  webhookMercadoPago,
  webhookPayPal,
  retornoPayPal,
  cancelarPayPal,
};
