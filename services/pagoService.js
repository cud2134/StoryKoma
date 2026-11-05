const crypto = require('crypto');
const PremiumModel = require('../models/PremiumModel');

const appUrl = () => String(process.env.APP_URL || '').replace(/\/+$/, '');
const errorVisible = (message) => Object.assign(new Error(message), { errorVisible: true });

const requestJson = async (url, options, provider) => {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    console.error(`No se pudo conectar con ${provider}:`, err.message);
    throw errorVisible(`No pudimos conectar con ${provider}. Intentalo de nuevo.`);
  }
  if (!response.ok) {
    const detail = await response.text();
    console.error(`Error de ${provider}:`, response.status, detail.slice(0, 1000));
    throw errorVisible(`No pudimos iniciar el pago con ${provider}. Intentalo de nuevo.`);
  }
  try {
    return await response.json();
  } catch (err) {
    console.error(`Respuesta no valida de ${provider}:`, err.message);
    throw errorVisible(`El servicio de pago ${provider} devolvio una respuesta no valida.`);
  }
};

const crearOrdenMercadoPago = async ({ pago, plan, comprador }) => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token || !appUrl()) throw errorVisible('Mercado Pago no esta configurado en el servidor.');
  const base = appUrl();
  const preference = await requestJson('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{
        id: `storykoma-premium-${plan}`,
        title: `StoryKoma Premium ${PremiumModel.PLANES[plan].nombre}`,
        quantity: 1,
        currency_id: 'CLP',
        unit_price: PremiumModel.PLANES[plan].monto,
      }],
      payer: { name: comprador.nombre, surname: comprador.apellido, email: comprador.correo },
      external_reference: pago.referencia_externa,
      notification_url: `${base}/premium/webhooks/mercadopago`,
      back_urls: {
        success: `${base}/premium/mercadopago/retorno`,
        pending: `${base}/premium?estado=pending`,
        failure: `${base}/premium?estado=failure`,
      },
      auto_return: 'approved',
    }),
  }, 'Mercado Pago');
  if (!preference.id || !preference.init_point) {
    throw errorVisible('Mercado Pago no devolvio un enlace de pago valido.');
  }
  await PremiumModel.guardarReferenciaCheckout(pago.id, String(preference.id));
  return preference.init_point;
};

const verificarPagoMercadoPago = async (paymentId) => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw errorVisible('Mercado Pago no esta configurado en el servidor.');
  return requestJson(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, 'Mercado Pago');
};

const tokenPayPal = async () => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw errorVisible('PayPal no esta configurado en el servidor.');
  const base = String(process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com').replace(/\/+$/, '');
  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const response = await requestJson(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }, 'PayPal');
  return { token: response.access_token, base };
};

const crearOrdenPayPal = async ({ pago, plan }) => {
  if (!appUrl()) throw errorVisible('La URL publica APP_URL no esta configurada en el servidor.');
  const { token, base } = await tokenPayPal();
  const order = await requestJson(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: pago.referencia_externa,
        custom_id: pago.referencia_externa,
        description: `StoryKoma Premium ${PremiumModel.PLANES[plan].nombre}`,
        amount: { currency_code: 'CLP', value: String(PremiumModel.PLANES[plan].monto) },
      }],
      application_context: {
        return_url: `${appUrl()}/premium/paypal/retorno`,
        cancel_url: `${appUrl()}/premium/paypal/cancelado`,
        user_action: 'PAY_NOW',
      },
    }),
  }, 'PayPal');
  const approval = order.links && order.links.find((link) => link.rel === 'approve');
  if (!order.id || !approval) throw errorVisible('PayPal no devolvio un enlace de pago valido.');
  await PremiumModel.guardarReferenciaCheckout(pago.id, order.id);
  return approval.href;
};

const capturarOrdenPayPal = async (orderId) => {
  const { token, base } = await tokenPayPal();
  return requestJson(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  }, 'PayPal');
};

const obtenerOrdenPayPal = async (orderId) => {
  const { token, base } = await tokenPayPal();
  return requestJson(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, 'PayPal');
};

const verificarWebhookPayPal = async (req) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw errorVisible('La verificacion de notificaciones de PayPal no esta configurada.');
  const { token, base } = await tokenPayPal();
  const result = await requestJson(`${base}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: req.get('paypal-auth-algo'),
      cert_url: req.get('paypal-cert-url'),
      transmission_id: req.get('paypal-transmission-id'),
      transmission_sig: req.get('paypal-transmission-sig'),
      transmission_time: req.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: req.body,
    }),
  }, 'PayPal');
  return result.verification_status === 'SUCCESS';
};

const validarFirmaMercadoPago = (req) => {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  const id = String(req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || '').toLowerCase();
  const parts = Object.fromEntries(signature.split(',').map((item) => item.trim().split('=')));
  if (!parts.ts || !parts.v1 || !requestId || !id) return false;
  const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const actual = Buffer.from(parts.v1, 'hex');
  const calculated = Buffer.from(expected, 'hex');
  return actual.length === calculated.length && crypto.timingSafeEqual(actual, calculated);
};

module.exports = {
  crearOrdenMercadoPago,
  verificarPagoMercadoPago,
  crearOrdenPayPal,
  capturarOrdenPayPal,
  obtenerOrdenPayPal,
  verificarWebhookPayPal,
  validarFirmaMercadoPago,
};
