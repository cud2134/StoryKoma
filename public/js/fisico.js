// StoryKoma — apartado de manga fisico
// Pide los mangas a AniList, muestra el primer tomo con sus precios por tienda y permite desplegar los demas tomos.
// IMPORTANTE: los precios son estimaciones de referencia (no hay conexion con las tiendas) y siempre se
// invita a confirmar en la pagina de la tienda.
(function () {
  'use strict';

  var API = 'https://graphql.anilist.co';
  var POR_PAGINA = 10;
  var form = document.getElementById('fisico-form');
  if (!form) return;
  var esAdulto = form.getAttribute('data-adulto') === '1';

  var lista = document.getElementById('fisico-lista');
  var estado = document.getElementById('fisico-estado');
  var paginacion = document.getElementById('fisico-paginacion');
  var inputQ = document.getElementById('fisico-q');
  var selOrden = document.getElementById('fisico-orden');
  var selContenido = document.getElementById('fisico-contenido');
  var btnReintentar = document.getElementById('fisico-reintentar');
  var btnAnt = document.getElementById('fisico-anterior');
  var btnSig = document.getElementById('fisico-siguiente');
  var numPagina = document.getElementById('fisico-pagina-num');
  var pagina = 1;

  // ---------------- Tiendas ----------------
  var slug = function (t) {
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };
  var TIENDAS = [
    { id: 'ml', nombre: 'MercadoLibre', factor: 1.0, url: function (q) { return 'https://listado.mercadolibre.cl/' + slug(q); } },
    { id: 'bl', nombre: 'BuscaLibre', factor: 1.06, url: function (q) { return 'https://www.buscalibre.cl/libros/search?q=' + encodeURIComponent(q); } },
    { id: 'az', nombre: 'Amazon', factor: 1.18, url: function (q) { return 'https://www.amazon.com/s?k=' + encodeURIComponent(q); } },
  ];

  var hash = function (texto) {
    var h = 0;
    for (var i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
    return h;
  };
  // Precio de referencia (CLP) estable para un tomo en una tienda
  var precio = function (idManga, tomo, tienda) {
    var base = 7990 + (hash(idManga + '-' + tomo) % 7) * 1000; // entre $7.990 y $13.990
    return Math.round((base * tienda.factor) / 100) * 100;
  };
  var clp = function (n) { return '$' + n.toLocaleString('es-CL'); };

  var esc = function (t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  // ---------------- AniList ----------------
  var CONSULTA =
    'query ($page:Int,$perPage:Int,$search:String,$sort:[MediaSort],$isAdult:Boolean){' +
    'Page(page:$page,perPage:$perPage){pageInfo{hasNextPage}' +
    'media(type:MANGA,format_in:[MANGA,ONE_SHOT],search:$search,sort:$sort,isAdult:$isAdult){' +
    'id isAdult title{romaji english} coverImage{large} volumes chapters status averageScore genres startDate{year}}}}';

  function pedir() {
    var variables = {
      page: pagina,
      perPage: POR_PAGINA,
      sort: [selOrden.value],
      isAdult: esAdulto && selContenido && selContenido.value === 'adulto',
    };
    if (inputQ.value.trim()) variables.search = inputQ.value.trim();
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: CONSULTA, variables: variables }),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (j.errors && j.errors.length) throw new Error(j.errors.map(function (e) { return e.message; }).join('; '));
        if (!r.ok) throw new Error('AniList respondio ' + r.status);
        return j;
      });
    }).then(function (j) {
      return j.data.Page;
    });
  }

  // ---------------- Dibujo ----------------
  var ESTADOS = { FINISHED: 'Finalizado', RELEASING: 'En publicacion', NOT_YET_RELEASED: 'Por publicar', CANCELLED: 'Cancelado', HIATUS: 'En pausa' };

  function tomosDe(m) {
    if (m.volumes) return m.volumes;
    if (m.chapters) return Math.max(1, Math.ceil(m.chapters / 9)); // un tomo suele tener ~9 capitulos
    return null;
  }

  function filaTomo(m, titulo, tomo) {
    var consulta = titulo + ' manga tomo ' + tomo;
    var precios = TIENDAS.map(function (t) { return { tienda: t, valor: precio(m.id, tomo, t), url: t.url(consulta) }; });
    var mejor = precios.reduce(function (a, b) { return b.valor < a.valor ? b : a; });
    return { precios: precios, mejor: mejor };
  }

  function htmlPrecios(datos) {
    return '<div class="precios-tiendas">' + datos.precios.map(function (p) {
      var esMejor = p === datos.mejor;
      return '<a class="precio-tienda' + (esMejor ? ' mejor' : '') + '" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="tienda-nombre">' + esc(p.tienda.nombre) + '</span>' +
        '<span class="tienda-precio">' + clp(p.valor) + '</span>' +
        (esMejor ? '<span class="tienda-etiqueta">Mas barato</span>' : '') + '</a>';
    }).join('') + '</div>';
  }

  function htmlManga(m) {
    var titulo = (m.title.english || m.title.romaji || 'Sin titulo');
    var total = tomosDe(m);
    var t1 = filaTomo(m, titulo, 1);
    var portada = m.coverImage && m.coverImage.large ? m.coverImage.large : '';

    var extra = '';
    if (total && total > 1) {
      var filas = '';
      for (var n = 2; n <= total; n++) {
        var d = filaTomo(m, titulo, n);
        filas += '<li class="tomo-fila"><span class="tomo-num">Tomo ' + n + '</span>' + htmlPrecios(d) +
          '<a class="btn-ir-tienda" href="' + esc(d.mejor.url) + '" target="_blank" rel="noopener noreferrer">Ir a ' + esc(d.mejor.tienda.nombre) + '</a></li>';
      }
      extra = '<button type="button" class="btn-obra-opt btn-ver-tomos" aria-expanded="false">Ver los otros ' + (total - 1) + ' tomos ▾</button>' +
        '<ul class="tomos-extra" hidden>' + filas + '</ul>';
    }

    var serie = TIENDAS.map(function (t) {
      return '<a class="enlace-serie" href="' + esc(t.url(titulo + ' manga')) + '" target="_blank" rel="noopener noreferrer">' + esc(t.nombre) + '</a>';
    }).join(' · ');

    return '<article class="fisico-item">' +
      '<div class="fisico-portada" style="background-image:url(\'' + esc(portada) + '\')"></div>' +
      '<div class="fisico-info">' +
        '<h3>' + esc(titulo) + '</h3>' +
        '<p class="fisico-meta">' + esc(ESTADOS[m.status] || m.status || '') + (m.startDate && m.startDate.year ? ' · ' + m.startDate.year : '') +
          (m.averageScore ? ' · ⭐ ' + (m.averageScore / 10).toFixed(1) : '') +
          ' · ' + (total ? total + ' tomos' : 'cantidad de tomos no informada') + '</p>' +
        '<div class="ficha-generos">' + (m.genres || []).slice(0, 4).map(function (g) { return '<span class="chip-genero">' + esc(g) + '</span>'; }).join('') + '</div>' +
        '<div class="tomo-principal"><h4>Tomo 1 · comparar precios</h4>' + htmlPrecios(t1) +
          '<a class="btn-accion-principal btn-ir-tienda" href="' + esc(t1.mejor.url) + '" target="_blank" rel="noopener noreferrer">Ir a la tienda mas barata (' + esc(t1.mejor.tienda.nombre) + ') ↗</a></div>' +
        extra +
        '<p class="fisico-serie">Ver toda la serie en: ' + serie + '</p>' +
        '<a class="enlace-leer" href="/buscar?q=' + encodeURIComponent(titulo) + '">¿Prefieres leerlo online? Buscalo en StoryKoma</a>' +
      '</div></article>';
  }

  function mostrarEstado(texto) {
    estado.textContent = texto;
    estado.hidden = !texto;
  }

  function cargar() {
    mostrarEstado('Cargando mangas...');
    btnReintentar.hidden = true;
    lista.innerHTML = '';
    paginacion.hidden = true;
    pedir().then(function (data) {
      var mangas = esAdulto ? data.media : data.media.filter(function (m) {
        return !m.isAdult && !(m.genres || []).some(function (genero) {
          return /^(18|achi|adult|adulto|adultos|ecchi|erotica|erotico|explicit|gore|hentai|milf|milfs|nsfw|porn|porno|r-?18|smut)$/i.test(slug(genero));
        });
      });
      if (!mangas.length && !data.media.length) {
        mostrarEstado('No encontramos mangas con esa busqueda.');
        return;
      }
      if (mangas.length) {
        mostrarEstado('');
        lista.innerHTML = mangas.map(htmlManga).join('');
      } else {
        mostrarEstado('Los resultados de esta pagina incluyen contenido +18. Avanza a la siguiente pagina para ver otros mangas.');
      }
      numPagina.textContent = 'Pagina ' + pagina;
      btnAnt.disabled = pagina <= 1;
      btnSig.disabled = !data.pageInfo.hasNextPage;
      paginacion.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (error) {
      console.error('Error al cargar mangas fisicos desde AniList:', error);
      mostrarEstado('No pudimos cargar los mangas. Revisa tu conexión a internet e inténtalo de nuevo.');
      btnReintentar.hidden = false;
    });
  }

  // Desplegar / ocultar los otros tomos
  lista.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-ver-tomos');
    if (!btn) return;
    var ul = btn.nextElementSibling;
    var abierto = !ul.hidden;
    ul.hidden = abierto;
    btn.setAttribute('aria-expanded', String(!abierto));
    btn.textContent = abierto ? btn.textContent.replace('▴', '▾') : btn.textContent.replace('▾', '▴');
  });

  form.addEventListener('submit', function (e) { e.preventDefault(); pagina = 1; cargar(); });
  btnReintentar.addEventListener('click', cargar);
  selOrden.addEventListener('change', function () { pagina = 1; cargar(); });
  if (selContenido) selContenido.addEventListener('change', function () { pagina = 1; cargar(); });
  btnAnt.addEventListener('click', function () { if (pagina > 1) { pagina--; cargar(); } });
  btnSig.addEventListener('click', function () { pagina++; cargar(); });

  cargar();
})();
