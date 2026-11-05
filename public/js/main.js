// StoryKoma — comportamiento del navegador (tema, login, banner, filtros, avisos)
(function () {
  'use strict';

  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  var $$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  /* ---------- Anuncio emergente antes de acciones seleccionadas ---------- */
  var modalAnuncio = $('#modal-anuncio');
  var continuarDespuesDelAnuncio = null;
  var cerrarAnuncio = function () {
    if (!modalAnuncio || modalAnuncio.hidden) return;
    modalAnuncio.hidden = true;
    var continuar = continuarDespuesDelAnuncio;
    continuarDespuesDelAnuncio = null;
    if (continuar) continuar();
  };
  var mostrarAnuncio = function (continuar) {
    if (!modalAnuncio) {
      if (continuar) continuar();
      return;
    }
    continuarDespuesDelAnuncio = continuar || null;
    modalAnuncio.hidden = false;
    $('[data-cerrar-anuncio]', modalAnuncio).focus();
  };

  if (modalAnuncio) {
    $('[data-cerrar-anuncio]', modalAnuncio).addEventListener('click', cerrarAnuncio);
    modalAnuncio.addEventListener('click', function (e) {
      if (e.target === modalAnuncio) cerrarAnuncio();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modalAnuncio.hidden) cerrarAnuncio();
    });
    if (document.body.getAttribute('data-anuncio-inicial') === 'true') mostrarAnuncio();

    document.addEventListener('click', function (e) {
      var enlace = e.target.closest('a[href="/buscar"], a.btn-nav-fisico, a.btn-adulto-nav[href*="zona=adulto"]');
      if (enlace) {
        e.preventDefault();
        mostrarAnuncio(function () { window.location.assign(enlace.href); });
        return;
      }

      var botonBuscar = e.target.closest('#form-buscar button[type="submit"]');
      if (botonBuscar) {
        e.preventDefault();
        mostrarAnuncio(function () { botonBuscar.form.submit(); });
      }
    });
  }

  /* ---------- Fondo animado de acceso y registro ---------- */
  var fondoMangas = $('.fondo-animado-mangas');
  if (fondoMangas) {
    var portadasFondo = $$('.manga-card', fondoMangas);
    var datosPortadasFondo = $('#datos-portadas-fondo');
    var todasLasPortadas = datosPortadasFondo ? JSON.parse(datosPortadasFondo.textContent) : [];
    if (!todasLasPortadas.length) {
      todasLasPortadas = portadasFondo.map(function (tarjeta) {
        var imagen = $('img', tarjeta);
        return imagen ? imagen.getAttribute('src') : '';
      }).filter(Boolean);
    }
    var mezclar = function (lista) {
      var copia = lista.slice();
      for (var i = copia.length - 1; i > 0; i--) {
        var indice = Math.floor(Math.random() * (i + 1));
        var temporal = copia[i];
        copia[i] = copia[indice];
        copia[indice] = temporal;
      }
      return copia;
    };
    var columnasFondo = function () { return window.matchMedia('(max-width: 620px)').matches ? 3 : 5; };
    var filasFondo = function () { return window.matchMedia('(max-width: 620px)').matches ? 6 : 4; };
    var portadasActivas = portadasFondo;
    var posicionesActuales = [];
    var aleatorizarPosiciones = function () {
      var columnas = columnasFondo();
      var filas = filasFondo();
      posicionesActuales = mezclar(Array.from({ length: columnas * filas }, function (_, indice) { return indice; }))
        .slice(0, portadasActivas.length);
    };
    var posicionarPortadas = function () {
      var columnas = columnasFondo();
      var filas = filasFondo();
      var anchoCelda = window.innerWidth / columnas;
      var altoCelda = window.innerHeight / filas;

      portadasActivas.forEach(function (tarjeta, indice) {
        var posicion = posicionesActuales[indice];
        if (posicion === undefined) return;
        var ancho = anchoCelda * 0.56;
        var alto = altoCelda * 0.76;
        tarjeta.style.width = ancho + 'px';
        tarjeta.style.height = alto + 'px';
        tarjeta.style.left = (posicion % columnas * anchoCelda + (anchoCelda - ancho) / 2) + 'px';
        tarjeta.style.top = (Math.floor(posicion / columnas) * altoCelda + (altoCelda - alto) / 2) + 'px';
      });
    };
    if (portadasFondo.length && todasLasPortadas.length) {
      todasLasPortadas = Array.from(new Set(todasLasPortadas));
      portadasActivas = portadasFondo.slice(0, Math.min(portadasFondo.length, todasLasPortadas.length));
      portadasFondo.slice(portadasActivas.length).forEach(function (tarjeta) { tarjeta.hidden = true; });
      var obtenerPortadaAleatoria = function (indice) {
        var imagenActual = $('img', portadasActivas[indice]);
        var actual = imagenActual ? imagenActual.getAttribute('src') : '';
        var ocupadas = portadasActivas.filter(function (_, otroIndice) { return otroIndice !== indice; })
          .map(function (tarjeta) {
            var imagen = $('img', tarjeta);
            return imagen ? imagen.getAttribute('src') : '';
          });
        var disponibles = todasLasPortadas.filter(function (portada) {
          return ocupadas.indexOf(portada) === -1 && portada !== actual;
        });
        if (!disponibles.length) {
          disponibles = todasLasPortadas.filter(function (portada) { return ocupadas.indexOf(portada) === -1; });
        }
        var portadas = disponibles.length ? disponibles : todasLasPortadas;
        return portadas[Math.floor(Math.random() * portadas.length)];
      };
      var moverAPosicionAleatoria = function (indice) {
        var columnas = columnasFondo();
        var filas = filasFondo();
        var ocupadas = posicionesActuales.filter(function (_, otroIndice) { return otroIndice !== indice; });
        var disponibles = Array.from({ length: columnas * filas }, function (_, posicion) { return posicion; })
          .filter(function (posicion) { return ocupadas.indexOf(posicion) === -1; });
        posicionesActuales[indice] = disponibles[Math.floor(Math.random() * disponibles.length)];
      };
      var iniciarRotacion = function (tarjeta, indice, demoraInicial) {
        var imagen = $('img', tarjeta);
        if (!imagen) return;

        var rotar = function () {
          tarjeta.classList.remove('glitch-enter');
          tarjeta.classList.add('glitch-exit');
          window.setTimeout(function () {
            imagen.src = obtenerPortadaAleatoria(indice);
            moverAPosicionAleatoria(indice);
            tarjeta.classList.remove('glitch-exit');
            tarjeta.classList.add('glitch-enter');
            window.setTimeout(rotar, 4000);
            posicionarPortadas();
          }, 500);
        };

        window.setTimeout(function () {
          imagen.src = obtenerPortadaAleatoria(indice);
          tarjeta.classList.add('glitch-enter');
          window.setTimeout(rotar, 4000);
        }, demoraInicial);
      };

      aleatorizarPosiciones();
      var portadasIniciales = mezclar(todasLasPortadas);
      portadasActivas.forEach(function (tarjeta, indice) {
        var imagen = $('img', tarjeta);
        if (imagen) imagen.src = portadasIniciales[indice];
      });
      posicionarPortadas();
      portadasActivas.forEach(function (tarjeta, indice) {
        iniciarRotacion(tarjeta, indice, indice * 250);
      });
      window.addEventListener('resize', function () {
        aleatorizarPosiciones();
        posicionarPortadas();
      });
    } else {
      aleatorizarPosiciones();
      portadasFondo.forEach(function (tarjeta) {
        tarjeta.classList.add('glitch-enter');
      });
      posicionarPortadas();
      window.addEventListener('resize', function () {
        aleatorizarPosiciones();
        posicionarPortadas();
      });
    }
  }

  /* ---------- Mensajes de validacion en espanol ---------- */
  function mensajeValidacion(campo) {
    var estado = campo.validity;
    if (estado.valueMissing) return 'Completa este campo.';
    if (estado.typeMismatch) return campo.type === 'email' ? 'Escribe un correo electrónico válido.' : 'Ingresa un valor válido.';
    if (estado.tooShort) return 'Ingresa al menos ' + campo.minLength + ' caracteres.';
    if (estado.patternMismatch) return campo.title || 'El formato ingresado no es valido.';
    if (estado.rangeOverflow) return campo.type === 'date' ? 'Debes tener al menos 2 años. La fecha máxima permitida es ' + campo.max + '.' : 'El valor supera el máximo permitido.';
    if (estado.rangeUnderflow) return campo.type === 'date' ? 'La fecha no puede ser anterior a ' + campo.min + ' (límite de 120 años).' : 'El valor es menor al mínimo permitido.';
    if (estado.stepMismatch) return 'Ingresa un valor que respete el intervalo permitido.';
    if (estado.badInput) return 'Ingresa un valor válido.';
    return '';
  }

  function actualizarMensajeValidacion(campo) {
    campo.setCustomValidity('');
    var mensaje = mensajeValidacion(campo);
    if (mensaje) campo.setCustomValidity(mensaje);
  }

  $$('input, select, textarea').forEach(function (campo) {
    actualizarMensajeValidacion(campo);
    campo.addEventListener('input', function () { actualizarMensajeValidacion(campo); });
    campo.addEventListener('change', function () { actualizarMensajeValidacion(campo); });
  });

  /* ---------- Mostrar u ocultar contrasenas ---------- */
  $$('[data-toggle-password]').forEach(function (boton) {
    var campo = $('input', boton.parentElement);
    var icono = $('i', boton);
    if (!campo || !icono) return;
    boton.addEventListener('click', function () {
      var mostrar = campo.type === 'password';
      campo.type = mostrar ? 'text' : 'password';
      icono.className = mostrar ? 'ri-eye-off-line' : 'ri-eye-line';
      boton.setAttribute('aria-label', mostrar ? 'Ocultar contrasena' : 'Mostrar contrasena');
      boton.setAttribute('aria-pressed', mostrar ? 'true' : 'false');
    });
  });

  /* ---------- Tema claro / oscuro ---------- */
  function actualizarIconoTema() {
    var temaOscuro = document.documentElement.getAttribute('data-tema') !== 'claro';
    $$('[data-tema-toggle]').forEach(function (boton) {
      var icono = $('i', boton);
      if (!icono) return;
      icono.className = temaOscuro ? 'ri-sun-line icono-remix' : 'ri-moon-line icono-remix';
      boton.setAttribute('aria-label', temaOscuro ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro');
      boton.setAttribute('title', temaOscuro ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro');
    });
  }

  actualizarIconoTema();
  $$('[data-tema-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cambiarTema = function () {
        var html = document.documentElement;
        var nuevo = html.getAttribute('data-tema') === 'claro' ? 'oscuro' : 'claro';
        html.setAttribute('data-tema', nuevo);
        try { localStorage.setItem('storykoma.tema', nuevo); } catch (e) {}
        actualizarIconoTema();
      };
      if (modalAnuncio) {
        btn.blur();
        mostrarAnuncio(cambiarTema);
      } else {
        cambiarTema();
      }
    });
  });

  /* ---------- Confirmar antes de eliminar ---------- */
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  /* ---------- Avisos: se ocultan solos ---------- */
  $$('.aviso-ok').forEach(function (a) { setTimeout(function () { a.style.display = 'none'; }, 6000); });

  /* ---------- Login: cambio de vistas y registro en dos pasos ---------- */
  var vistas = $$('.seccion[data-vista]');
  function irA(nombre) {
    vistas.forEach(function (v) { v.classList.toggle('activa', v.getAttribute('data-vista') === nombre); });
    var primero = $('.seccion.activa input:not([type=radio])');
    if (primero) primero.focus();
  }
  $$('[data-ir]').forEach(function (btn) {
    btn.addEventListener('click', function () { irA(btn.getAttribute('data-ir')); });
  });

  var formRegistro = $('#form-registro');
  if (formRegistro) {
    var pasoDatos = $('[data-paso=datos]', formRegistro);
    var pasoRol = $('[data-paso=rol]', formRegistro);
    $('#btn-continuar-registro').addEventListener('click', function () {
      var campos = $$('input', pasoDatos);
      for (var i = 0; i < campos.length; i++) {
        if (!campos[i].reportValidity()) return;
      }
      if ($('#pass1').value !== $('#pass2').value) {
        $('#pass2').setCustomValidity('Las contrasenas no coinciden');
        $('#pass2').reportValidity();
        return;
      }
      pasoDatos.hidden = true;
      pasoRol.hidden = false;
    });
    $('#pass2').addEventListener('input', function () { this.setCustomValidity(''); });
    $('#btn-volver-datos').addEventListener('click', function () { pasoRol.hidden = true; pasoDatos.hidden = false; });
  }

  // Respuesta del boton oficial de Google: enviamos el "credential" al servidor, que lo verifica
  window.alRecibirGoogle = function (respuesta) {
    $('#google-credential').value = respuesta.credential;
    $('#form-google').submit();
  };

  /* ---------- Inicio: el banner va rotando entre los mas vistos ---------- */
  var datos = $('#datos-banners');
  var banner = $('#banner-dinamico');
  if (datos && banner) {
    var lista = JSON.parse(datos.textContent);
    if (lista.length > 1) {
      var i = 0;
      setInterval(function () {
        i = (i + 1) % lista.length;
        var m = lista[i];
        banner.style.backgroundImage = "linear-gradient(to right, rgba(8,8,8,.95) 30%, rgba(8,8,8,.25)), url('" + encodeURI(m.portada).replace(/'/g, '%27') + "')";
        $('#banner-titulo').textContent = m.titulo;
        $('#banner-sinopsis').textContent = m.descripcion || 'Sin sinopsis disponible.';
        $('#banner-boton').href = '/mangas/' + m.id;
        $('#banner-info').href = '/mangas/' + m.id;
      }, 7000);
    }
  }

  /* ---------- Buscador: los filtros se aplican al marcarlos ---------- */
  var formBuscar = $('#form-buscar');
  if (formBuscar) {
    $$('input[type=checkbox], input[type=radio]', formBuscar).forEach(function (el) {
      el.addEventListener('change', function () { formBuscar.submit(); });
    });
    // Solo un desplegable abierto a la vez
    var desplegables = $$('.filtro-desplegable', formBuscar);
    desplegables.forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open) desplegables.forEach(function (o) { if (o !== d) o.open = false; });
      });
    });
    document.addEventListener('click', function (e) {
      desplegables.forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
    });
  }

  /* ---------- Ficha: el boton "Comentar" abre el formulario ---------- */
  var botonComentar = $('[data-abrir-comentario]');
  if (botonComentar) {
    botonComentar.addEventListener('click', function () {
      var detalle = $('#comentarios details');
      if (detalle) detalle.open = true;
    });
  }

  /* ---------- Formulario de obra: portada y capitulos iniciales ---------- */
  var inputPortada = $('#portada');
  var zonaPortada = $('#zona-portada');
  if (inputPortada && zonaPortada) {
    var previewPortada = $('#preview-portada-manga');
    var textoPortada = $('#texto-portada');
    var estadoPortada = $('#estado-archivo-portada');
    var urlPortadaTemporal = null;

    function mostrarPortada(archivo) {
      if (!archivo) return;
      if (urlPortadaTemporal) URL.revokeObjectURL(urlPortadaTemporal);
      urlPortadaTemporal = URL.createObjectURL(archivo);
      previewPortada.src = urlPortadaTemporal;
      previewPortada.classList.remove('oculto');
      textoPortada.classList.add('oculto');
      estadoPortada.textContent = archivo.name;
    }

    inputPortada.addEventListener('change', function () {
      mostrarPortada(inputPortada.files[0]);
    });
    zonaPortada.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        inputPortada.click();
      }
    });
    ['dragenter', 'dragover'].forEach(function (evento) {
      zonaPortada.addEventListener(evento, function (e) {
        e.preventDefault();
        zonaPortada.classList.add('arrastrando');
      });
    });
    ['dragleave', 'drop'].forEach(function (evento) {
      zonaPortada.addEventListener(evento, function (e) {
        e.preventDefault();
        zonaPortada.classList.remove('arrastrando');
      });
    });
    zonaPortada.addEventListener('drop', function (e) {
      if (!e.dataTransfer.files.length) return;
      var transferencia = new DataTransfer();
      Array.prototype.forEach.call(e.dataTransfer.files, function (archivo) { transferencia.items.add(archivo); });
      inputPortada.files = transferencia.files;
      mostrarPortada(inputPortada.files[0]);
    });
  }

  var formularioManga = $('#formulario-manga');
  if (formularioManga) {
    var inputContenidoAdulto = $('input[name="es_mas18"]', formularioManga);
    var ayudaClasificacionAdulto = $('#ayuda-clasificacion-adulto', formularioManga);
    var generosAdultos = $$('input[name="generos"][data-genero-adulto="true"]', formularioManga);
    if (inputContenidoAdulto && generosAdultos.length) {
      function actualizarClasificacionAdulto() {
        var tieneGeneroAdulto = generosAdultos.some(function (genero) { return genero.checked; });
        if (tieneGeneroAdulto) {
          inputContenidoAdulto.checked = true;
          inputContenidoAdulto.disabled = true;
          if (ayudaClasificacionAdulto) {
            ayudaClasificacionAdulto.textContent = 'Hay un genero adulto seleccionado: +18 es obligatorio. Desmarca ese genero para poder quitar la clasificacion.';
          }
        } else {
          inputContenidoAdulto.disabled = false;
          if (ayudaClasificacionAdulto) {
            ayudaClasificacionAdulto.textContent = 'Los generos adultos, como Ecchi, obligan a mantener la clasificacion +18.';
          }
        }
      }

      generosAdultos.forEach(function (genero) {
        genero.addEventListener('change', actualizarClasificacionAdulto);
      });
      actualizarClasificacionAdulto();
    }
  }

  var listaCapitulosIniciales = $('#lista-capitulos-iniciales');
  var botonAgregarCapitulo = $('#btn-agregar-capitulo-inicial');
  var plantillaCapitulo = $('#plantilla-capitulo-inicial');
  if (listaCapitulosIniciales && botonAgregarCapitulo && plantillaCapitulo) {
    var maxCapitulos = Number(botonAgregarCapitulo.dataset.maxCapitulos);
    var siguienteIndiceCapitulo = listaCapitulosIniciales.querySelectorAll('[data-capitulo-inicial]').length;

    function actualizarBotonAgregarCapitulo() {
      botonAgregarCapitulo.disabled = listaCapitulosIniciales.querySelectorAll('[data-capitulo-inicial]').length >= maxCapitulos;
    }

    function actualizarNombreArchivos(input) {
      var ayuda = input.parentNode.querySelector('[data-nombre-archivos]');
      if (ayuda && input.files.length) {
        ayuda.textContent = Array.prototype.map.call(input.files, function (archivo) { return archivo.name; }).join(', ');
      }
    }

    listaCapitulosIniciales.addEventListener('change', function (e) {
      if (e.target.matches('[data-input-archivo], .cap-archivo')) actualizarNombreArchivos(e.target);
    });
    listaCapitulosIniciales.addEventListener('click', function (e) {
      var botonQuitar = e.target.closest('.btn-quitar-capitulo');
      if (botonQuitar) {
        botonQuitar.closest('[data-capitulo-inicial]').remove();
        actualizarBotonAgregarCapitulo();
      }
    });
    botonAgregarCapitulo.addEventListener('click', function () {
      if (listaCapitulosIniciales.querySelectorAll('[data-capitulo-inicial]').length >= maxCapitulos) return;
      var fragmento = plantillaCapitulo.content.cloneNode(true);
      var fila = fragmento.querySelector('[data-capitulo-inicial]');
      var inputNumero = fila.querySelector('[data-input-numero]');
      var inputTitulo = fila.querySelector('[data-input-titulo]');
      var inputArchivo = fila.querySelector('[data-input-archivo]');
      var id = siguienteIndiceCapitulo++;

      inputNumero.id = 'numero-capitulo-' + id;
      inputNumero.name = 'capitulos[' + id + '][numero]';
      inputTitulo.id = 'titulo-capitulo-' + id;
      inputTitulo.name = 'capitulos[' + id + '][titulo]';
      inputArchivo.id = 'archivos-capitulo-' + id;
      inputArchivo.name = 'archivos_capitulo_' + id;
      fila.querySelector('[data-label-numero]').htmlFor = inputNumero.id;
      fila.querySelector('[data-label-titulo]').htmlFor = inputTitulo.id;
      fila.querySelector('[data-label-archivo]').htmlFor = inputArchivo.id;

      var maximo = 0;
      $$('.capitulo-form-item input[type=number]', listaCapitulosIniciales).forEach(function (input) {
        maximo = Math.max(maximo, Number(input.value) || 0);
      });
      inputNumero.value = maximo + 1;
      listaCapitulosIniciales.appendChild(fragmento);
      actualizarBotonAgregarCapitulo();
      inputNumero.focus({ preventScroll: true });
    });
    actualizarBotonAgregarCapitulo();
  }
})();
