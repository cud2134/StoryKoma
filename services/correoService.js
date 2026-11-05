const { OAuth2Client } = require('google-auth-library');

const configuracion = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  senderEmail: process.env.GMAIL_SENDER_EMAIL,
});

const estaConfigurado = () => {
  const { clientId, clientSecret, refreshToken, senderEmail } = configuracion();
  return Boolean(
    clientId &&
    clientSecret &&
    refreshToken &&
    senderEmail &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)
  );
};

const enviarMensaje = async (destinatario, asunto, contenido, tipoContenido) => {
  const { clientId, clientSecret, refreshToken, senderEmail } = configuracion();
  if (!estaConfigurado()) {
    throw new Error('Faltan credenciales validas de Gmail para enviar correos.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
    throw new Error('La direccion de destino no es valida.');
  }

  const oauth = new OAuth2Client(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  const accessToken = await oauth.getAccessToken();
  if (!accessToken.token) throw new Error('Google no entrego un token de acceso para Gmail.');

  const mensaje = [
    `From: StoryKoma <${senderEmail}>`,
    `To: ${destinatario}`,
    `Subject: ${asunto}`,
    'MIME-Version: 1.0',
    `Content-Type: ${tipoContenido}; charset="UTF-8"`,
    '',
    contenido,
  ].join('\r\n');
  const raw = Buffer.from(mensaje, 'utf8').toString('base64url');
  const respuesta = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Gmail API respondio ${respuesta.status}: ${detalle}`);
  }
};

const enviarCodigoVerificacion = async (destinatario, codigo) => {
  const contenido = [
    'StoryKoma te envia este codigo para verificar tu correo y activar tu cuenta:',
    '',
    codigo,
    '',
    'Este codigo vence en 15 minutos. Si no solicitaste esta cuenta, puedes ignorar este mensaje.',
  ].join('\r\n');
  await enviarMensaje(destinatario, 'Codigo de verificacion de StoryKoma', contenido, 'text/plain');
};

const escaparHtml = (valor) => String(valor || '').replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[caracter]));

const fechaChile = (valor) => new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Santiago',
}).format(new Date(valor));

const enviarComprobantePago = async (pago) => {
  const monto = new Intl.NumberFormat('es-CL').format(Number(pago.monto_clp));
  const numero = `SK-${String(pago.ID_pago).padStart(8, '0')}`;
  const comprador = escaparHtml(`${pago.nombre_pagador} ${pago.apellido_pagador}`.trim());
  const plan = escaparHtml(pago.plan === 'anual' ? 'Premium Anual' : 'Premium Mensual');
  const contenido = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f4f1ed;font-family:Arial,sans-serif;color:#211d1a">
  <table role="presentation" style="width:100%;max-width:620px;margin:auto;background:#fff;border:1px solid #ded8d2;border-radius:10px">
    <tr><td style="padding:28px">
      <p style="margin:0;color:#7454c8;font-weight:bold;letter-spacing:2px">STORYKOMA PREMIUM</p>
      <h1 style="margin:12px 0 4px;font-size:24px">Comprobante de pago</h1>
      <p style="margin:0 0 24px;color:#625b55">Numero ${escaparHtml(numero)} · Estado: Pagado</p>
      <p>Hola ${comprador}, recibimos correctamente tu pago.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse">
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee">Correo del comprador</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escaparHtml(pago.correo_pagador)}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee">Plan</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${plan}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee">Monto pagado</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right"><strong>$${monto} CLP</strong></td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee">Fecha y hora de pago</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escaparHtml(fechaChile(pago.fecha_confirmacion))}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee">Vigencia hasta</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escaparHtml(fechaChile(pago.fecha_vencimiento))}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee">Medio de pago</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escaparHtml(pago.proveedor === 'mercadopago' ? 'Mercado Pago' : 'PayPal')}</td></tr>
        <tr><td style="padding:10px 0">Referencia</td><td style="padding:10px 0;text-align:right">${escaparHtml(pago.referencia_pago || pago.referencia_externa)}</td></tr>
      </table>
      <p style="margin:24px 0 0;color:#625b55;font-size:13px">Este comprobante acredita el pago de una suscripcion digital. No es una factura tributaria.</p>
      <p style="margin:12px 0 0;color:#625b55;font-size:13px">La renovacion es manual. Conserva este correo como respaldo de tu compra.</p>
    </td></tr>
  </table>
</body>
</html>`;
  await enviarMensaje(pago.correo_pagador, 'Comprobante de pago - StoryKoma Premium', contenido, 'text/html');
};

module.exports = { estaConfigurado, enviarCodigoVerificacion, enviarComprobantePago };
