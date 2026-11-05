// Generos de los mangas (tabla genero)
const pool = require('../config/database');

const NOMBRES_ADULTOS = [
  'achi',
  '18',
  'adult',
  'adulto',
  'adultos',
  'ecchi',
  'erotica',
  'erotico',
  'girl love',
  "girl's love",
  "girls' love",
  'girls love',
  'girlslove',
  'gore',
  'harem',
  'hentai',
  'milf',
  'milfs',
  'nsfw',
  'explicit',
  'porn',
  'porno',
  'r18',
  'r-18',
  'smut',
];

const normalizar = (nombre) =>
  String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const esAdulto = (nombre) => NOMBRES_ADULTOS.includes(normalizar(nombre));

const SQL_NOMBRES_ADULTOS = [
  ...NOMBRES_ADULTOS,
  'erótica',
  'erótico',
].map((nombre) => `'${nombre.replace(/'/g, "''")}'`).join(', ');

const sqlSinGenerosAdultos = (alias = 'm') => `NOT EXISTS (
  SELECT 1 FROM manga_genero mg
  JOIN genero g ON g.ID_genero = mg.ID_genero
  WHERE mg.ID_manga = ${alias}.ID_manga AND LOWER(g.nombre) IN (${SQL_NOMBRES_ADULTOS})
)`;

const getAll = async () => {
  const [rows] = await pool.query('SELECT ID_genero AS id, nombre FROM genero ORDER BY nombre');
  return rows;
};

module.exports = { getAll, esAdulto, sqlSinGenerosAdultos };
