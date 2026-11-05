// Mangas: ver ficha, publicar, editar, cambiar estado y eliminar
const MangaModel = require('../models/MangaModel');
const GeneroModel = require('../models/GeneroModel');
const CapituloModel = require('../models/CapituloModel');
const ComentarioModel = require('../models/ComentarioModel');
const BibliotecaModel = require('../models/BibliotecaModel');
const LecturaModel = require('../models/LecturaModel');
const DenunciaModel = require('../models/DenunciaModel');
const Upload = require('../config/upload');
const { puedeGestionar, crearCapitulo } = require('./capituloController');
const { prohibido, noEncontrado, mensajeBD, texto, lista, entero } = require('./baseController');

const MAX_CAPITULOS_INICIALES = 50;

const esContenidoAdulto = (manga) =>
  manga.esMas18 || manga.generos.some((genero) => GeneroModel.esAdulto(genero));

const show = async (req, res, next) => {
  try {
    const user = req.user;
    const manga = await MangaModel.getById(user, req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra (puede ser +18 o haber sido ocultada).');

    const [capitulos, comentarios, estadoBiblioteca, generos, ultimoCapituloLeido] = await Promise.all([
      CapituloModel.getByManga(manga.id),
      ComentarioModel.deManga(manga.id, user.id),
      BibliotecaModel.getEstado(user.id, manga.id),
      GeneroModel.getAll(),
      LecturaModel.getUltimoCapituloLeido(user.id, manga.id),
    ]);
    res.render('mangas/show', {
      title: manga.titulo,
      manga,
      capitulos,
      ultimoCapituloLeido,
      comentarios,
      estadoBiblioteca,
      generosIds: Object.fromEntries(generos.map((g) => [g.nombre, g.id])),
      puedeGestionar: puedeGestionar(user, manga),
      motivosDenuncia: DenunciaModel.MOTIVOS,
      estados: MangaModel.ESTADOS,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------- Formulario (nuevo / editar) ----------------------
const renderForm = async (res, { user, manga = null, valores = {}, error = null, status = 200 }) => {
  const todosGeneros = await GeneroModel.getAll();
  res.status(status).render('mangas/form', {
    title: manga ? 'Editar obra' : 'Publicar nuevo manga',
    manga,
    valores,
    error,
    generos: (user.esAdulto
      ? todosGeneros
      : todosGeneros.filter((genero) => !GeneroModel.esAdulto(genero.nombre))
    ).map((genero) => ({ ...genero, esAdulto: GeneroModel.esAdulto(genero.nombre) })),
    tipos: MangaModel.TIPOS,
    demografias: MangaModel.DEMOGRAFIAS,
    estados: MangaModel.ESTADOS,
    limiteCapitulosGB: Upload.MAX_BYTES_CAPITULOS_INICIALES / (1024 * 1024 * 1024),
  });
};

const create = async (req, res, next) => {
  try {
    await renderForm(res, {
      user: req.user,
      valores: { tipo: 'MANGA', demografia: 'Shounen', estado: 'En proceso', generosElegidos: [], capitulos: [{ numero: 1, titulo: '' }] },
    });
  } catch (err) {
    next(err);
  }
};

// Lee y valida los datos de la obra. Devuelve { datos, generos, valores, error }
const leerFormulario = async (body, user, mangaActual = null) => {
  const datos = {
    titulo: texto(body.titulo),
    autor: texto(body.autor),
    descripcion: texto(body.descripcion),
    tipo: texto(body.tipo),
    demografia: texto(body.demografia),
    estado: texto(body.estado),
    esMas18: false,
  };
  const elegidos = lista(body.generos).map((g) => entero(g)).filter(Boolean);
  const todosGeneros = await GeneroModel.getAll();
  const validos = todosGeneros.map((g) => g.id);
  const generos = elegidos.filter((g) => validos.includes(g));
  const generosAdultos = new Set(todosGeneros.filter((genero) => GeneroModel.esAdulto(genero.nombre)).map((genero) => genero.id));
  const solicitaContenidoAdulto = body.es_mas18 === '1' || generos.some((genero) => generosAdultos.has(genero));
  datos.esMas18 =
    (user.esAdulto && solicitaContenidoAdulto) ||
    (!user.esAdulto && Boolean(mangaActual && mangaActual.esMas18));
  const valores = { ...datos, generosElegidos: generos, numero: texto(body.numero), tituloCapitulo: texto(body.titulo_capitulo) };

  let error = null;
  if (!user.esAdulto && solicitaContenidoAdulto) error = 'Solo una persona mayor de 18 años puede publicar contenido +18.';
  else if (!datos.titulo || datos.titulo.length > 120) error = 'Escribe el titulo (maximo 120 caracteres).';
  else if (!datos.autor || datos.autor.length > 100) error = 'Escribe el autor (maximo 100 caracteres).';
  else if (datos.descripcion.length > 2000) error = 'La sinopsis admite maximo 2000 caracteres.';
  else if (!MangaModel.TIPOS.includes(datos.tipo) || !MangaModel.DEMOGRAFIAS.includes(datos.demografia) || !MangaModel.ESTADOS.includes(datos.estado)) {
    error = 'Tipo, demografia o estado no validos.';
  } else if (!generos.length) error = 'Elige al menos un genero.';
  return { datos, generos, valores, error };
};

const leerCapitulosIniciales = (body, files) => {
  const cargados = files.filter((file) => file.fieldname === 'archivos' || /^archivos_capitulo_\d+$/.test(file.fieldname));
  const indicesArchivo = cargados
    .map((file) => {
      const match = file.fieldname.match(/^archivos_capitulo_(\d+)$/);
      return match ? match[1] : '0';
    });
  let filas;

  if (body.capitulos && typeof body.capitulos === 'object') {
    filas = Object.keys(body.capitulos)
      .sort((a, b) => Number(a) - Number(b))
      .map((indice) => ({ indice, campos: body.capitulos[indice] || {} }));
  } else if (body.numero !== undefined || body.titulo_capitulo !== undefined || cargados.some((file) => file.fieldname === 'archivos')) {
    filas = [{ indice: '0', campos: { numero: body.numero, titulo: body.titulo_capitulo } }];
  } else {
    filas = [];
  }

  indicesArchivo.forEach((indice) => {
    if (!filas.some((fila) => fila.indice === indice)) filas.push({ indice, campos: {} });
  });

  const capitulos = filas
    .sort((a, b) => Number(a.indice) - Number(b.indice))
    .map(({ indice, campos }) => ({
      indice,
      numero: texto(campos.numero),
      titulo: texto(campos.titulo),
      archivos: cargados.filter((file) => {
        const match = file.fieldname.match(/^archivos_capitulo_(\d+)$/);
        return (match ? match[1] : '0') === indice;
      }),
    }));

  for (const capitulo of capitulos) {
    if (!capitulo.titulo && capitulo.archivos.length && /^\d+$/.test(capitulo.numero)) {
      capitulo.titulo = `Capitulo ${capitulo.numero}`;
    }
    const tieneNumero = Boolean(capitulo.numero);
    const tieneTitulo = Boolean(capitulo.titulo);
    const tieneArchivos = capitulo.archivos.length > 0;
    if (!tieneTitulo && !tieneArchivos) continue;
    if (!tieneNumero || !tieneTitulo || !tieneArchivos) {
      return { capitulos, error: 'Completa numero, titulo y archivos en cada capitulo que quieras publicar.' };
    }
    if (!/^\d+$/.test(capitulo.numero) || Number(capitulo.numero) < 1 || Number(capitulo.numero) > 99999) {
      return { capitulos, error: 'El numero de cada capitulo debe ser un entero entre 1 y 99999.' };
    }
    if (capitulo.titulo.length > 120) return { capitulos, error: 'El titulo del capitulo admite maximo 120 caracteres.' };
  }

  const publicados = capitulos.filter((capitulo) => capitulo.numero && capitulo.titulo && capitulo.archivos.length);
  if (publicados.length > MAX_CAPITULOS_INICIALES) {
    return { capitulos, error: `Puedes publicar hasta ${MAX_CAPITULOS_INICIALES} capitulos iniciales a la vez.` };
  }
  const numeros = publicados.map((capitulo) => Number(capitulo.numero));
  if (new Set(numeros).size !== numeros.length) return { capitulos, error: 'No repitas el numero de un capitulo inicial.' };
  return { capitulos, error: null };
};

const store = async (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const portadas = files.filter((file) => file.fieldname === 'portada');
  const portada = portadas[0];
  let valoresFormulario = req.body;
  try {
    const { datos, generos, valores, error } = await leerFormulario(req.body, req.user);
    const { capitulos, error: errorCapitulos } = leerCapitulosIniciales(req.body, files);
    valoresFormulario = { ...valores, capitulos };
    const fallo = (mensaje) => {
      Upload.limpiar(req.files);
      return renderForm(res, { user: req.user, valores: valoresFormulario, error: mensaje, status: 400 });
    };
    if (error) return await fallo(error);
    if (portadas.length > 1) return await fallo('Sube una sola portada para la obra.');
    if (files.some((file) => file.fieldname !== 'portada' && file.fieldname !== 'archivos' && !/^archivos_capitulo_\d+$/.test(file.fieldname))) {
      return await fallo('Hay un campo de archivo no valido.');
    }
    const bytesCapitulos = files
      .filter((file) => file.fieldname !== 'portada')
      .reduce((total, file) => total + file.size, 0);
    if (bytesCapitulos > Upload.MAX_BYTES_CAPITULOS_INICIALES) {
      return await fallo(`Los archivos de capítulos superan el límite total de ${Upload.MAX_BYTES_CAPITULOS_INICIALES / (1024 * 1024 * 1024)} GB.`);
    }
    if (!portada) return await fallo('Sube la portada de la obra.');
    if (errorCapitulos) return await fallo(errorCapitulos);
    if (await MangaModel.tituloSimilarExiste(datos.titulo)) {
      return await fallo('Ya existe una obra con un nombre igual o muy parecido. Elige otro titulo.');
    }

    const idManga = await MangaModel.create({ ...datos, portada: Upload.rutaPublica(portada), creadorId: req.user.id }, generos);
    const capitulosPublicados = capitulos.filter((capitulo) => capitulo.numero && capitulo.titulo && capitulo.archivos.length);
    if (capitulosPublicados.length) {
      const manga = await MangaModel.getByIdSinRestriccion(idManga);
      for (let i = 0; i < capitulosPublicados.length; i++) {
        const capitulo = capitulosPublicados[i];
        try {
          await crearCapitulo(req.user, manga, { numero: capitulo.numero, titulo: capitulo.titulo }, capitulo.archivos);
        } catch (err) {
          const pendientes = capitulosPublicados.slice(i).flatMap((pendiente) => pendiente.archivos);
          Upload.limpiar(pendientes);
          req.flash('error', `La obra se publicó, pero no se pudieron subir todos los capítulos. Revisa los archivos del capítulo ${capitulo.numero} e inténtalo de nuevo.`);
          return res.redirect(`/mangas/${idManga}`);
        }
      }
    }
    req.flash('success', 'Obra publicada.');
    res.redirect(`/mangas/${idManga}`);
  } catch (err) {
    Upload.limpiar(req.files);
    const mensaje = mensajeBD(err);
    if (!mensaje) return next(err);
    renderForm(res, { user: req.user, valores: valoresFormulario, error: mensaje, status: 400 }).catch(next);
  }
};

const edit = async (req, res, next) => {
  try {
    const manga = await MangaModel.getByIdSinRestriccion(req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    if (esContenidoAdulto(manga) && !req.user.esAdulto) return noEncontrado(res, 'No encontramos esa obra.');
    if (!puedeGestionar(req.user, manga)) return prohibido(res);
    const generos = await GeneroModel.getAll();
    const elegidos = generos.filter((g) => manga.generos.includes(g.nombre)).map((g) => g.id);
    await renderForm(res, { user: req.user, manga, valores: { ...manga, generosElegidos: elegidos } });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const portadas = files.filter((file) => file.fieldname === 'portada');
  const portada = portadas[0];
  try {
    const manga = await MangaModel.getByIdSinRestriccion(req.params.id);
    if (!manga) {
      Upload.limpiar(req.files);
      return noEncontrado(res, 'No encontramos esa obra.');
    }
    if (!puedeGestionar(req.user, manga)) {
      Upload.limpiar(req.files);
      return prohibido(res);
    }
    if (esContenidoAdulto(manga) && !req.user.esAdulto) {
      Upload.limpiar(req.files);
      return noEncontrado(res, 'No encontramos esa obra.');
    }
    if (portadas.length > 1 || files.length !== portadas.length) {
      Upload.limpiar(req.files);
      req.flash('error', 'Sube solo una portada para reemplazarla.');
      return res.redirect(`/mangas/${manga.id}/editar`);
    }
    const { datos, generos, valores, error } = await leerFormulario(req.body, req.user, manga);
    if (error) {
      Upload.limpiar(req.files);
      return await renderForm(res, { user: req.user, manga, valores, error, status: 400 });
    }
    await MangaModel.update(manga.id, { ...datos, portada: portada ? Upload.rutaPublica(portada) : manga.portada }, generos);
    if (portada) Upload.borrar(manga.portada); // la portada anterior ya no se usa
    req.flash('success', 'Obra actualizada.');
    res.redirect(`/mangas/${manga.id}`);
  } catch (err) {
    Upload.limpiar(req.files);
    next(err);
  }
};

// POST /mangas/:id/estado  (En proceso / En pausa / Terminado)
const cambiarEstado = async (req, res, next) => {
  try {
    const manga = await MangaModel.getByIdSinRestriccion(req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    if (!puedeGestionar(req.user, manga)) return prohibido(res);
    const estado = texto(req.body.estado);
    if (!MangaModel.ESTADOS.includes(estado)) return noEncontrado(res, 'Estado no valido.');
    await MangaModel.setEstado(manga.id, estado);
    req.flash('success', `«${manga.titulo}» ahora esta: ${estado}.`);
    res.redirect(req.body.volver === 'perfil' ? '/perfil/creador' : `/mangas/${manga.id}`);
  } catch (err) {
    next(err);
  }
};

const destroy = async (req, res, next) => {
  try {
    const manga = await MangaModel.getByIdSinRestriccion(req.params.id);
    if (!manga) return noEncontrado(res, 'No encontramos esa obra.');
    if (!puedeGestionar(req.user, manga)) return prohibido(res);
    const archivos = [manga.portada, ...(await CapituloModel.archivosDeManga(manga.id))];
    await MangaModel.remove(manga.id);
    archivos.forEach(Upload.borrar);
    req.flash('success', `«${manga.titulo}» fue eliminada.`);
    res.redirect(req.user.esAdmin && manga.creadorId !== req.user.id
      ? `/admin?tab=usuarios&usuario=${manga.creadorId}`
      : '/perfil/creador');
  } catch (err) {
    next(err);
  }
};

module.exports = { show, create, store, edit, update, cambiarEstado, destroy };
