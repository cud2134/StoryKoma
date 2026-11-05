// Subida de archivos (multer): portadas, avatares y capitulos
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..', 'public', 'uploads');
const EXT_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const EXT_CAPITULO = [...EXT_IMAGEN, '.zip', '.cbz', '.pdf'];
const MAX_UPLOAD_CAPITULOS_MB = Number(process.env.MAX_UPLOAD_CAPITULOS_MB || 2048);
const MAX_BYTES_CAPITULOS_INICIALES = MAX_UPLOAD_CAPITULOS_MB * 1024 * 1024;
const MAX_BYTES_PORTADA = 100 * 1024 * 1024;

if (
  !Number.isSafeInteger(MAX_UPLOAD_CAPITULOS_MB) ||
  MAX_UPLOAD_CAPITULOS_MB <= 0 ||
  !Number.isSafeInteger(MAX_BYTES_CAPITULOS_INICIALES)
) {
  throw new Error('MAX_UPLOAD_CAPITULOS_MB debe ser un entero positivo.');
}

const limiteCapitulosTexto = `${MAX_BYTES_CAPITULOS_INICIALES / (1024 * 1024 * 1024)} GB`;
const CARPETAS = { portada: 'portadas', avatar: 'avatares', archivos: 'capitulos' };

const crearStorage = (maxBytesCapitulos = null) => ({
  _handleFile: (req, file, cb) => {
    const carpeta = path.join(RAIZ, CARPETAS[file.fieldname] || 'capitulos');
    fs.mkdir(carpeta, { recursive: true }, (error) => {
      if (error) return cb(error);
      const nombre = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(file.originalname).toLowerCase()}`;
      const ruta = path.join(carpeta, nombre);
      const salida = fs.createWriteStream(ruta);
      let bytesArchivo = 0;
      let finalizado = false;
      let limpiezaIniciada = false;

      const limpiarTemporal = (continuar, informarError = true) => {
        if (limpiezaIniciada) return;
        limpiezaIniciada = true;
        const borrar = () => fs.unlink(ruta, (errorBorrado) => {
          if (errorBorrado && errorBorrado.code !== 'ENOENT') {
            if (informarError) return cb(errorBorrado);
            console.error('No se pudo limpiar un archivo temporal de subida:', errorBorrado.message);
            return;
          }
          continuar();
        });
        if (salida.closed) borrar();
        else salida.once('close', borrar);
      };

      const fallar = (error) => {
        if (finalizado) return;
        finalizado = true;
        file.stream.unpipe(salida);
        salida.destroy();
        file.stream.resume();
        limpiarTemporal(() => cb(error));
      };

      file.stream.on('data', (chunk) => {
        if (finalizado) return;
        bytesArchivo += chunk.length;
        if (file.fieldname === 'portada' && bytesArchivo > MAX_BYTES_PORTADA) {
          const error = new Error('La portada no puede superar los 100 MB.');
          error.code = 'LIMIT_COVER_SIZE';
          return fallar(error);
        }
        if (maxBytesCapitulos !== null && file.fieldname !== 'portada') {
          req.bytesCapitulosIniciales = (req.bytesCapitulosIniciales || 0) + chunk.length;
          if (req.bytesCapitulosIniciales > maxBytesCapitulos) {
            const error = new Error(`Los archivos de capítulos superan el límite total de ${limiteCapitulosTexto}.`);
            error.code = 'LIMIT_TOTAL_SIZE';
            return fallar(error);
          }
        }
      });

      file.stream.on('error', fallar);
      salida.on('error', fallar);
      salida.on('finish', () => {
        if (finalizado) return;
        finalizado = true;
        cb(null, { destination: carpeta, filename: nombre, path: ruta, size: bytesArchivo });
      });
      file.stream.pipe(salida);
    });
  },
  _removeFile: (req, file, cb) => {
    const ruta = file.path;
    delete file.destination;
    delete file.filename;
    delete file.path;
    fs.unlink(ruta, cb);
  },
});

const storage = crearStorage();

const filtro = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const esArchivoCapitulo = file.fieldname === 'archivos' || /^archivos_capitulo_\d+$/.test(file.fieldname);
  const esImagen = ['portada', 'avatar'].includes(file.fieldname);
  if (!esArchivoCapitulo && !esImagen) return cb(new Error('Campo de archivo no permitido.'));
  const permitidas = esArchivoCapitulo ? EXT_CAPITULO : EXT_IMAGEN;
  if (permitidas.includes(ext)) return cb(null, true);
  cb(
    new Error(
      esArchivoCapitulo
        ? 'Formato no permitido. Usa imagenes (JPG, PNG, WEBP), un ZIP/CBZ de imagenes o un PDF.'
        : 'La imagen debe ser JPG, PNG, WEBP o GIF.'
    )
  );
};

// Imagenes sueltas (avatar): maximo 5 MB
const imagenes = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: filtro });
// Subida de capitulos existentes: maximo 100 MB por archivo, hasta 202 archivos
const capitulos = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 202 }, fileFilter: filtro });
// Publicacion inicial: hasta 2 GB entre archivos de capitulos y 100 MB para la portada
const capitulosIniciales = multer({
  storage: crearStorage(MAX_BYTES_CAPITULOS_INICIALES),
  limits: { fileSize: MAX_BYTES_CAPITULOS_INICIALES, files: 1001 },
  fileFilter: filtro,
});

// Si multer falla (archivo muy grande, formato no permitido) avisamos y volvemos a la pagina anterior
const envolver = (middleware) => (req, res, next) => {
  middleware(req, res, (err) => {
    if (!err) return next();
    const mensaje = err.code === 'LIMIT_FILE_SIZE'
      ? `Un archivo supera el límite de ${limiteCapitulosTexto} permitido.`
      : err.code === 'LIMIT_COVER_SIZE'
        ? err.message
        : err.code === 'LIMIT_TOTAL_SIZE'
          ? err.message
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'La subida supera el maximo de archivos permitido. En una publicacion inicial puedes subir hasta 1000 archivos de paginas; usa ZIP/CBZ para agrupar paginas.'
            : err.message;
    req.flash('error', mensaje);
    res.redirect(req.get('Referer') || '/inicio');
  });
};

const avatar = envolver(imagenes.single('avatar'));
const portadaYCapitulo = envolver(capitulos.any());
const portadaYCapitulosIniciales = envolver(capitulosIniciales.any());
const soloCapitulo = envolver(capitulos.any());

// Ruta publica (la que se guarda en la base de datos) de un archivo subido
const rutaPublica = (file) => `/uploads/${CARPETAS[file.fieldname] || 'capitulos'}/${file.filename}`;

// Borra un archivo subido (ignora rutas externas, como las portadas de ejemplo de internet)
const borrar = (ruta) => {
  if (!ruta || !ruta.startsWith('/uploads/')) return;
  const completa = path.resolve(RAIZ, ruta.replace('/uploads/', ''));
  if (!completa.startsWith(RAIZ + path.sep)) return;
  fs.unlink(completa, () => {});
};

// Borra todos los archivos que multer alcanzo a guardar (cuando algo sale mal)
const limpiar = (files) => {
  const lista = Array.isArray(files) ? files : Object.values(files || {}).flat();
  lista.forEach((f) => f && f.path && fs.unlink(f.path, () => {}));
};

module.exports = {
  RAIZ,
  MAX_BYTES_CAPITULOS_INICIALES,
  avatar,
  portadaYCapitulo,
  portadaYCapitulosIniciales,
  soloCapitulo,
  rutaPublica,
  borrar,
  limpiar,
};
