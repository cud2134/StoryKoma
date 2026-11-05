// Apartado de compra fisica: recomienda donde comprar cada tomo y compara precios.
// Los datos de las obras se piden a AniList desde el navegador (public/js/fisico.js).
// Aqui no se vende nada: solo se muestran precios de referencia y enlaces a las tiendas.
const index = (req, res) => {
  res.render('fisico/index', { title: 'Manga fisico' });
};

module.exports = { index };
