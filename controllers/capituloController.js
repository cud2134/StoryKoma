// Capitulos: leer (visor), agregar y eliminar
const fs = require('fs');
const path = require('path');
const MangaModel = require('../models/MangaModel');
const CapituloModel = require('../models/CapituloModel');
const ComentarioModel = require('../models/ComentarioModel');
const NotificacionModel = require('../models/NotificacionModel');
const BibliotecaModel = require('../models/BibliotecaModel');
const LecturaModel = require('../models/LecturaModel');
const Upload = require('../config/upload');
const { prohibido, noEncontrado, mensajeBD, texto, entero } = require('./baseController');

// Puede gestionar una obra su creador (si sigue siendo creador) o un administrador
const puedeGestionar = (user, manga) => user.esAdmin || (user.esCreador && manga.creadorId === user.id);

const EXT_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MAX_PAGINAS_ZIP = 300;
const MAX_BYTES_PAGINA = 15 * 1024 * 1024;

const ordenNatural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// Convierte los archivos subidos en las paginas del capitulo.
//   - imagenes sueltas -> una pagina por imagen (ordenadas por nombre)
//   - un ZIP/CBZ      -> se sacan las imagenes de adentro
//   - un PDF          -> se guarda tal cual y se muestra incrustado
// Devuelve { formato, paginas, archivoNombre, archivoRuta } o lanza un Error con el mensaje para la persona.
const procesarArchivos = (files) => {
  if (!files.length) throw new Error('Sube las paginas del capitulo (imagenes), un ZIP/CBZ o un PDF.');
  const ext = (f) => path.extname(f.originalname).toLowerCase();
  const pdfs = files.filter((f) => ext(f) === '.pdf');

  if (pdfs.length) {
    if (files.length > 1) throw new Error('Si subes un PDF, que sea el unico archivo del capitulo.');
    return { formato: 'pdf', paginas: [], archivoNombre: pdfs[0].originalname, archivoRuta: Upload.rutaPublica(pdfs[0]) };
  }

  const paginas = [];
  files
    .filter((f) => EXT_IMAGEN.includes(ext(f)))
    .sort((a, b) => ordenNatural(a.originalname, b.originalname))
    .forEach((f) => paginas.push(Upload.rutaPublica(f)));

  for (const zip of files.filter((f) => ['.zip', '.cbz'].includes(ext(f)))) {
    const AdmZip = require('adm-zip');
    let entradas;
    try {
      entradas = new AdmZip(zip.path)
        .getEntries()
        .filter((e) => !e.isDirectory && EXT_IMAGEN.includes(path.extname(e.entryName).toLowerCase()) && !path.basename(e.entryName).startsWith('.'))
        .sort((a, b) => ordenNatural(a.entryName, b.entryName));
    } catch (err) {
      throw new Error(`No pudimos abrir el archivo ${zip.originalname}. ¿Esta danado?`);
    }
    if (!entradas.length) throw new Error(`El archivo ${zip.originalname} no tiene imagenes (JPG, PNG, WEBP).`);
    if (entradas.length > MAX_PAGINAS_ZIP) throw new Error(`El archivo ${zip.originalname} tiene mas de ${MAX_PAGINAS_ZIP} paginas.`);
    entradas.forEach((e, i) => {
      if (e.header.size > MAX_BYTES_PAGINA) throw new Error(`Una de las paginas de ${zip.originalname} pesa mas de 15 MB.`);
      // El nombre lo generamos nosotros (nunca se usa el nombre de adentro del ZIP): asi no hay rutas peligrosas
      const nombre = `${Date.now()}-${i}-${Math.random().toString(16).slice(2, 8)}${path.extname(e.entryName).toLowerCase()}`;
      fs.writeFileSync(path.join(Upload.RAIZ, 'capitulos', nombre), e.getData());
      paginas.push(`/uploads/capitulos/${nombre}`);
    });
    fs.unlink(zip.path, () => {}); // el ZIP ya no se necesita
  }

  if (!paginas.length) throw new Error('No encontramos imagenes validas en lo que subiste.');
  return {
    formato: 'imagenes',
    paginas,
    archivoNombre: files.length === 1 ? files[0].originalname : `${files.length} archivos`,
    archivoRuta: null,
  };
};

// Valida y crea un capitulo (lo usan "crear manga" y "agregar capitulo"). Lanza Error con mensaje si algo falla.
const crearCapitulo = async (user, manga, { numero, titulo }, files) => {
  const n = entero(numero, -1);
  if (n < 1 || n > 99999) throw new Error('El numero del capitulo debe ser 1 o mayor.');
  const tituloFinal = texto(titulo) || `Capitulo ${n}`;
  if (tituloFinal.length > 120) throw new Error('El titulo del capitulo admite maximo 120 caracteres.');
  if (await CapituloModel.numeroExiste(manga.id, n)) throw new Error(`Ya existe el capitulo ${n} en esta obra.`);

  const datos = procesarArchivos(files);
  await CapituloModel.create({ idManga: manga.id, numero: n, titulo: tituloFinal, ...datos }, datos.paginas);
  await NotificacionModel.crearParaSeguidores(
    manga.id,
    `Nuevo capitulo en «${manga.titulo}»: Cap. ${n}: ${tituloFinal}`,
    `/mangas/${manga.id}/capitulos/${n}`,
    user.id
  );
  return n;
};

// ---------------------- Leer ----------------------
const leer = async (req, res, next) => {
  try {
    const user = req.user;
    const manga = await MangaModel.getById(user, req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    const numero = entero(req.params.numero, -1);
    const [capitulo, todos] = await Promise.all([CapituloModel.getByNumero(manga.id, numero), CapituloModel.getByManga(manga.id)]);
    if (!capitulo) return noEncontrado(res, 'No encontramos ese capitulo.');
    await MangaModel.registrarVistaUnica(manga.id, user.id);
    const llegoAMilestone = await LecturaModel.registrarLecturaCapitulo(user.id, manga.id, capitulo.id);
    const mostrarAnuncios = llegoAMilestone && !user.esAdmin && !user.premiumActivo;

    const posicion = todos.findIndex((c) => c.numero === numero);
    res.render('capitulos/leer', {
      title: `${manga.titulo} · Cap. ${capitulo.numero}`,
      manga,
      capitulo,
      anterior: posicion > 0 ? todos[posicion - 1].numero : null,
      siguiente: posicion < todos.length - 1 ? todos[posicion + 1].numero : null,
      comentarios: await ComentarioModel.deCapitulo(capitulo.id, user.id),
      estadoBiblioteca: await BibliotecaModel.getEstado(user.id, manga.id),
      mostrarAnuncioInicial: mostrarAnuncios,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------- Agregar ----------------------
const create = async (req, res, next) => {
  try {
    const manga = await MangaModel.getByIdSinRestriccion(req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    if (!puedeGestionar(req.user, manga)) return prohibido(res);
    const capitulos = await CapituloModel.getByManga(manga.id);
    const siguienteNumero = capitulos.length ? Math.max(...capitulos.map((c) => c.numero)) + 1 : 1;
    res.render('capitulos/form', {
      title: 'Nuevo capitulo',
      manga,
      valores: { capitulos: [{ numero: siguienteNumero, titulo: '' }] },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

const leerCapitulos = (body, files) => {
  const capitulosBody = body.capitulos && typeof body.capitulos === 'object' ? body.capitulos : {};
  const indices = Object.keys(capitulosBody);
  files.forEach((file) => {
    const match = file.fieldname.match(/^archivos_capitulo_(\d+)$/);
    if (match && !indices.includes(match[1])) indices.push(match[1]);
    if (file.fieldname === 'archivos' && !indices.includes('0')) indices.push('0');
  });
  if (!indices.length && (body.numero !== undefined || body.titulo !== undefined)) indices.push('0');

  const capitulos = indices
    .sort((a, b) => Number(a) - Number(b))
    .map((indice) => {
      const datos = capitulosBody[indice] || (indice === '0' ? { numero: body.numero, titulo: body.titulo } : {});
      return {
        numero: texto(datos.numero),
        titulo: texto(datos.titulo),
        archivos: files.filter((file) => {
          const match = file.fieldname.match(/^archivos_capitulo_(\d+)$/);
          return match ? match[1] === indice : file.fieldname === 'archivos' && indice === '0';
        }),
      };
    });

  if (!capitulos.length || capitulos.length > 10) {
    return { capitulos, error: 'Agrega entre 1 y 10 capitulos por publicacion.' };
  }
  for (const capitulo of capitulos) {
    if (!/^\d+$/.test(capitulo.numero) || Number(capitulo.numero) < 1 || Number(capitulo.numero) > 99999) {
      return { capitulos, error: 'El numero de cada capitulo debe ser un entero entre 1 y 99999.' };
    }
    if (capitulo.titulo.length > 120) {
      return { capitulos, error: 'El titulo del capitulo admite maximo 120 caracteres.' };
    }
    if (!capitulo.archivos.length) {
      return { capitulos, error: 'Sube imagenes, un ZIP/CBZ o un PDF para cada capitulo.' };
    }
  }
  const numeros = capitulos.map((capitulo) => Number(capitulo.numero));
  if (new Set(numeros).size !== numeros.length) {
    return { capitulos, error: 'No repitas el numero de un capitulo en la misma publicacion.' };
  }
  return { capitulos, error: null };
};

const store = async (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    const manga = await MangaModel.getByIdSinRestriccion(req.params.id);
    if (!manga) {
      Upload.limpiar(files);
      return noEncontrado(res, 'No encontramos esa obra.');
    }
    if (!puedeGestionar(req.user, manga)) {
      Upload.limpiar(files);
      return prohibido(res);
    }
    const { capitulos, error } = leerCapitulos(req.body, files);
    const valores = {
      capitulos: capitulos.map(({ numero, titulo }) => ({ numero, titulo })),
    };
    const fallo = (mensaje) => {
      Upload.limpiar(files);
      res.status(400).render('capitulos/form', { title: 'Nuevo capitulo', manga, valores, error: mensaje });
    };
    if (error) return fallo(error);
    for (const capitulo of capitulos) {
      if (await CapituloModel.numeroExiste(manga.id, Number(capitulo.numero))) {
        return fallo(`Ya existe el capitulo ${capitulo.numero} en esta obra.`);
      }
    }

    let publicados = 0;
    for (let i = 0; i < capitulos.length; i += 1) {
      const capitulo = capitulos[i];
      try {
        await crearCapitulo(req.user, manga, capitulo, capitulo.archivos);
        publicados += 1;
      } catch (err) {
        const creado = await CapituloModel.numeroExiste(manga.id, Number(capitulo.numero));
        const archivosPendientes = capitulos.slice(i + (creado ? 1 : 0)).flatMap((pendiente) => pendiente.archivos);
        Upload.limpiar(archivosPendientes);
        if (publicados || creado) {
          const totalPublicados = publicados + (creado ? 1 : 0);
          req.flash('error', `Se publicaron ${totalPublicados} capítulos, pero no se pudo completar el capítulo ${capitulo.numero}. Revisa sus archivos e inténtalo de nuevo.`);
          return res.redirect(`/mangas/${manga.id}`);
        }
        const mensaje = err.code ? mensajeBD(err) : err.message;
        if (!mensaje) throw err;
        return fallo(mensaje);
      }
    }
    req.flash('success', `${publicados} ${publicados === 1 ? 'capitulo publicado' : 'capitulos publicados'}. Avisamos a quienes siguen la obra.`);
    res.redirect(`/mangas/${manga.id}`);
  } catch (err) {
    Upload.limpiar(req.files);
    next(err);
  }
};

const destroy = async (req, res, next) => {
  try {
    const manga = await MangaModel.getByIdSinRestriccion(req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    if (!puedeGestionar(req.user, manga)) return prohibido(res);
    const capitulo = await CapituloModel.getById(req.params.capId);
    if (!capitulo || capitulo.idManga !== manga.id) return noEncontrado(res, 'No encontramos ese capitulo.');

    const archivos = await CapituloModel.archivosDe(capitulo.id);
    await CapituloModel.remove(capitulo.id);
    archivos.forEach(Upload.borrar);
    req.flash('success', 'Capitulo eliminado.');
    res.redirect(`/mangas/${manga.id}`);
  } catch (err) {
    next(err);
  }
};

module.exports = { puedeGestionar, crearCapitulo, leer, create, store, destroy };
