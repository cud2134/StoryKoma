// Funciones compartidas por los controladores
const prohibido = (res, mensaje = 'No tienes permiso para realizar esta accion.') =>
  res.status(403).render('errors/error', { title: 'Sin permiso', codigo: 403, mensaje });

const noEncontrado = (res, mensaje = 'No encontramos lo que buscas.') =>
  res.status(404).render('errors/error', { title: 'No encontrado', codigo: 404, mensaje });

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

const lista = (valor) => (valor === undefined ? [] : [].concat(valor));

const entero = (valor, defecto = 0) => {
  const n = parseInt(valor, 10);
  return Number.isNaN(n) ? defecto : n;
};

const fechaEnFormatoLocal = (fecha) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

const fechaHoy = () => fechaEnFormatoLocal(new Date());

const fechaConAnosMenos = (anios) => {
  const hoy = new Date();
  const anio = hoy.getFullYear() - anios;
  const mes = hoy.getMonth();
  const dia = Math.min(hoy.getDate(), new Date(anio, mes + 1, 0).getDate());
  return fechaEnFormatoLocal(new Date(anio, mes, dia));
};

const fechaNacimientoMinima = () => fechaConAnosMenos(120);
const fechaNacimientoMaxima = () => fechaConAnosMenos(2);

// Valida una fecha de nacimiento 'YYYY-MM-DD'. Devuelve un mensaje de error o '' si esta bien.
const validarFechaNacimiento = (valor) => {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return 'La fecha de nacimiento es obligatoria.';
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(0);
  fecha.setUTCHours(0, 0, 0, 0);
  fecha.setUTCFullYear(anio, mes - 1, dia);
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    return 'La fecha de nacimiento no es valida.';
  }

  if (valor > fechaHoy()) return 'La fecha de nacimiento no puede estar en el futuro.';
  if (valor > fechaNacimientoMaxima()) return 'Debes tener al menos 2 anos para registrarte.';
  if (valor < fechaNacimientoMinima()) return 'La fecha no puede superar los 120 anos de antiguedad.';
  return '';
};

const USERNAME_VALIDO = /^[A-Za-z0-9_.-]{4,20}$/;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTRASENA_VALIDA = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{6,}$/;

// Vuelve a la pagina desde la que vino la persona (solo dentro de este sitio)
const volver = (req, res, porDefecto = '/inicio') => {
  const referer = req.get('Referer');
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.host === req.get('host')) return res.redirect(url.pathname + url.search);
    } catch (err) {
      /* referer invalido: usamos la ruta por defecto */
    }
  }
  res.redirect(porDefecto);
};

// Traduce errores de MySQL a mensajes entendibles (devuelve null si no es un error esperable)
const mensajeBD = (err) => {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return 'Ya existe un registro con esos datos.';
    case 'ER_NO_REFERENCED_ROW_2':
      return 'Alguna de las opciones elegidas ya no existe.';
    case 'ER_DATA_TOO_LONG':
      return 'Alguno de los textos es demasiado largo.';
    default:
      return null;
  }
};

module.exports = {
  prohibido,
  noEncontrado,
  texto,
  lista,
  entero,
  fechaHoy,
  fechaNacimientoMinima,
  fechaNacimientoMaxima,
  validarFechaNacimiento,
  USERNAME_VALIDO,
  CORREO_VALIDO,
  CONTRASENA_VALIDA,
  volver,
  mensajeBD,
};
