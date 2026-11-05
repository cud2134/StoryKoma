# StoryKoma

Pagina de **lectura de manga online** y **recomendacion de compra de manga fisico**.
Hecha con Node.js + Express + MVC + EJS + MySQL.

## Estructura (MVC)

```
app.js              Archivo principal (Express, sesiones, rutas)
.env                Variables de entorno (BD, sesion, administrador, Google)
.gitignore
config/             database.js (MySQL) y upload.js (subida de portadas y capitulos)
routes/             Rutas de la aplicacion
controllers/        Logica (reciben la peticion, llaman al Model y eligen la View)
models/             Consultas SQL a MySQL
views/              Vistas EJS (partials/ = barra de navegacion, tarjetas, etc.)
public/             CSS, JS del navegador, imagenes y uploads/ (portadas, capitulos, avatares)
sql/schema.sql      Base de datos completa
```

## Como ejecutarlo

1. Instalar Node.js 18 o superior y MySQL.
2. Ejecutar `sql/schema.sql` en MySQL (crea la base `storykoma` y las tablas, sin mangas de ejemplo). Este script elimina las tablas existentes antes de recrearlas; no lo ejecutes sobre una instalación con datos que quieras conservar.
3. Revisar el `.env` (sobre todo `DB_PASSWORD`).
4. En la carpeta del proyecto:
   ```
   npm install
   npm start
   ```
5. Abrir http://localhost:3000

En instalaciones existentes, ejecuta `sql/migrations/006_eliminar_mangas_de_prueba.sql` para quitar las cuatro obras de prueba originales y sus capitulos, paginas, comentarios, denuncias y relaciones asociadas. La migracion solo afecta esas obras del usuario tecnico `sistema@storykoma.local`; conserva los demas mangas.
En instalaciones existentes, la tabla de vistas únicas se crea automáticamente al abrir el primer capítulo. Si el usuario de MySQL no tiene permiso para crear tablas, ejecuta `sql/migrations/001_manga_vista_usuario.sql` una vez.
Las vistas se cuentan una sola vez por usuario y manga, al abrir cualquier capítulo. En una instalación existente, ejecuta `sql/migrations/003_vistas_unicas_manga.sql` con la base configurada en `DB_NAME` seleccionada en MySQL Workbench para poner todos los contadores en cero y reiniciar los registros de visitas únicas. Esto permite que cada usuario vuelva a sumar una vista por manga después del reinicio. Los mangas nuevos comienzan con cero vistas.
El esquema completo ya incluye los campos de baneos y apelaciones. En instalaciones creadas con una versión anterior, ejecuta `sql/migrations/002_moderacion_apelaciones.sql` **antes de volver a banear**. La migración agrega los campos que falten sin borrar datos; incluye `usuario.estado` y `usuario.motivo_baneo`, que necesita el baneo. En MySQL Workbench, selecciona primero la base configurada en `DB_NAME` como esquema predeterminado y luego ejecuta el archivo. La migración no cambia de base de datos, así que los cambios se aplican al esquema seleccionado.

Puedes confirmar que quedó aplicada ejecutando `SHOW COLUMNS FROM usuario LIKE 'estado';` y `SHOW COLUMNS FROM usuario LIKE 'motivo_baneo';` en esa misma base. Ambas consultas deben devolver una fila.

En instalaciones existentes, el servidor amplía automáticamente el tipo de notificación para incluir comentarios. También puedes ejecutar `sql/migrations/004_mensajes_usuario.sql` con la base configurada en `DB_NAME` seleccionada en MySQL Workbench.
Para habilitar la confirmación de correo en instalaciones existentes, ejecuta una vez `sql/migrations/005_verificacion_correo.sql` y luego `sql/migrations/010_intentos_codigo_verificacion.sql` con esa misma base seleccionada. La primera migración conserva activas las cuentas que ya existían; la segunda agrega el límite de intentos del código.

La primera vez que arranca, el servidor crea la cuenta de **administrador** con los datos del `.env`
(por defecto `admin@storykoma.cl` / `admin1234`; cambiala en el `.env` antes de iniciar).

## Confirmar correo al registrarse

Las cuentas nuevas creadas con correo y contrasena solo pueden iniciar sesion despues de confirmar el correo con el codigo de 6 digitos que envia StoryKoma. El codigo vence en 15 minutos y permite hasta 5 intentos; luego se puede solicitar otro. El registro exige un nombre de usuario de 4 a 20 caracteres, una fecha de nacimiento real de al menos 2 anos y no mas de 120 anos de antiguedad, y una contrasena de al menos 6 caracteres con mayuscula, numero y simbolo.

El envio usa la Gmail API. En Google Cloud habilita **Gmail API**, configura la pantalla de consentimiento y crea credenciales OAuth 2.0. Genera un token de actualizacion para la cuenta emisora con el alcance `https://www.googleapis.com/auth/gmail.send` (por ejemplo, desde OAuth 2.0 Playground usando tus propias credenciales). Configura estas variables en `.env` y reinicia el servidor:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=cuenta-emisora@gmail.com
APP_URL=http://localhost:3000
```

El remitente visible es **StoryKoma**. Usar un nombre reconocible no garantiza que Gmail lo deje en la bandeja de entrada: en produccion configura SPF, DKIM y DMARC para el dominio de la cuenta emisora y mantén una buena reputacion de envio. No compartas ni subas el secreto OAuth ni el token de actualizacion al repositorio. El `GOOGLE_CLIENT_ID` puede ser el mismo que se usa para iniciar sesion con Google. Si la configuracion de Gmail falta o no es valida, el registro informa del problema y no deja creada una cuenta sin posibilidad de confirmacion.

## Roles

| Rol | Que puede hacer |
| --- | --- |
| Lector | Leer, comentar, buscar, guardar mangas por estado (siguiendo / pendiente / terminado), denunciar |
| Creador | Todo lo del lector + publicar mangas, subir capitulos y cambiar el estado (en proceso / en pausa / terminado) |
| Administrador | Todo lo anterior + editar o eliminar obras de otros, ocultarlas, buscar y gestionar usuarios, asignar roles, enviar advertencias, aplicar baneos temporales, revisar denuncias y resolver apelaciones |

## Capitulos

Se pueden subir imagenes sueltas (JPG, PNG, WEBP), un **ZIP/CBZ** con imagenes, o un **PDF**. Al publicar una obra, los archivos de los capitulos pueden sumar hasta el limite de `MAX_UPLOAD_CAPITULOS_MB` en `.env` (2048 MB por defecto); la portada tiene un maximo de 100 MB. Reinicia el servidor despues de cambiar ese valor.
(RAR, 7Z y CBR no estan soportados.)

## Iniciar con Google (opcional)

1. En https://console.cloud.google.com crea un "ID de cliente de OAuth" tipo *Aplicacion web*.
2. En "Origenes autorizados de JavaScript" agrega el origen exacto de la aplicacion (por ejemplo, `http://localhost:3000` en desarrollo y el dominio HTTPS en produccion).
3. Copia el ID en `GOOGLE_CLIENT_ID` del `.env` y reinicia el servidor.

El inicio con Google verifica en el servidor el token y que el correo este verificado. Si ya existe una cuenta con ese correo, se vincula para permitir futuros accesos con Google; para una cuenta nueva, se pide nombre de usuario, fecha de nacimiento y rol. Para iniciar con contrasena, usa el nombre de usuario o el correo de la cuenta (sin distinguir mayusculas en el correo) junto con su contrasena. Las cuentas creadas unicamente con Google no tienen contrasena hasta que se les configure una.

Sin `GOOGLE_CLIENT_ID` o sin el origen de la aplicacion configurado en Google Cloud, el acceso con Google no funcionara; el inicio con nombre de usuario/correo y contrasena sigue disponible.

## Manga fisico

Muestra el primer tomo con precios por tienda (MercadoLibre, BuscaLibre, Amazon) y permite desplegar los demas tomos.
Los datos de las obras vienen de AniList y los **precios son referenciales** (no hay conexion con las tiendas):
siempre hay que confirmar precio y stock en la pagina de la tienda. Necesita internet.

## Publicidad y Premium

Las cuentas lectoras y creadoras ven espacios publicitarios de muestra en el acceso/registro, inicio, busqueda y perfil. Las cuentas gratuitas tambien pueden ver espacios publicitarios al leer. Son solo marcadores hasta conectar un proveedor de anuncios; Premium y las cuentas de administrador no muestran anuncios.

El apartado de manga fisico es gratuito para todas las cuentas. Premium ofrece lectura sin publicidad; hay dos planes de pago unico con renovacion manual: mensual por $10.000 CLP y anual por $30.000 CLP.

El flujo solicita nombre, apellido y correo, crea el checkout con Mercado Pago o PayPal y activa Premium solo tras verificar el pago directamente con el proveedor. Los datos de tarjeta y CVV se ingresan en el checkout alojado del proveedor; StoryKoma no los solicita ni almacena. Tras confirmar el pago, se envia un comprobante no tributario al correo indicado. No se simulan aprobaciones si el proveedor no esta configurado.

Configura en `.env` las credenciales de uno o ambos proveedores y la URL publica HTTPS. Para Mercado Pago:

```env
APP_URL=https://tu-dominio.example
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
```

Configura el webhook de Mercado Pago en `https://tu-dominio.example/premium/webhooks/mercadopago`. Para PayPal:

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
PAYPAL_API_BASE=https://api-m.paypal.com
```

Configura el webhook de PayPal en `https://tu-dominio.example/premium/webhooks/paypal` para el evento `PAYMENT.CAPTURE.COMPLETED`. Para sandbox usa `PAYPAL_API_BASE=https://api-m.sandbox.paypal.com` y credenciales sandbox. No uses credenciales de prueba en produccion. Para enviar comprobantes tambien deben estar configuradas las credenciales de Gmail indicadas en «Confirmar correo al registrarse». No compartas ni subas claves o tokens al repositorio.

En instalaciones existentes, ejecuta `sql/migrations/007_planes_premium_publicidad.sql` si aun no se aplico y luego `sql/migrations/009_pagos_premium.sql` con la base configurada en `DB_NAME` seleccionada en MySQL Workbench. En una base nueva, `sql/schema.sql` incluye las tablas de Premium y lecturas. La migration 009 crea la tabla de pagos sin borrar historiales existentes.
