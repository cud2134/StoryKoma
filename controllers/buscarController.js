// Buscador con filtros desplegables: estado, tipo y generos
const MangaModel = require('../models/MangaModel');
const GeneroModel = require('../models/GeneroModel');
const { texto, lista, entero } = require('./baseController');

const index = async (req, res, next) => {
  try {
    const q = texto(req.query.q);
    const estados = lista(req.query.estado).filter((e) => MangaModel.ESTADOS.includes(e));
    const tipos = lista(req.query.tipo).filter((t) => MangaModel.TIPOS.includes(t));
    const generos = lista(req.query.genero).map((g) => entero(g)).filter(Boolean);
    const contenido = ['si', 'no'].includes(req.query.contenido) ? req.query.contenido : 'todos';
    const pagina = Math.max(1, entero(req.query.pagina, 1));

    const [todosGeneros, { mangas, total }] = await Promise.all([
      GeneroModel.getAll(),
      MangaModel.buscar(req.user, { q, estados, tipos, generos, contenido }, pagina),
    ]);
    const generosVisibles = req.user.esAdulto
      ? todosGeneros
      : todosGeneros.filter((genero) => !GeneroModel.esAdulto(genero.nombre));

    res.render('buscar/index', {
      title: 'Buscar',
      filtros: { q, estados, tipos, generos, contenido },
      opciones: { estados: MangaModel.ESTADOS, tipos: MangaModel.TIPOS, generos: generosVisibles },
      mangas,
      total,
      pagina,
      paginas: Math.max(1, Math.ceil(total / 24)),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { index };
