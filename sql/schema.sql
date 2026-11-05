-- =========================================================
-- STORYKOMA - BASE DE DATOS COMPLETA
-- Ejecutar completo, de arriba hacia abajo, en MySQL 8 / MariaDB 10.5+
-- =========================================================

CREATE DATABASE IF NOT EXISTS storykoma CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE storykoma;

-- Para poder volver a ejecutar el script desde cero
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS pago_premium, usuario_lectura_capitulo, bloqueo_usuario, denuncia, notificacion, comentario_like,
                     comentario, biblioteca, manga_vista_usuario, pagina, capitulo, manga_genero, manga, genero, usuario, rol;
SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 1. ROLES Y USUARIOS
-- =========================================================
CREATE TABLE rol (
    ID_rol INT AUTO_INCREMENT PRIMARY KEY,
    nombre_rol VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(150) NOT NULL
);

CREATE TABLE usuario (
    ID_usuario INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(40) NOT NULL UNIQUE,
    correo VARCHAR(100) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NULL,          -- NULL si la cuenta se creo con Google
    google_id VARCHAR(100) NULL UNIQUE,
    email_verificado TINYINT(1) NOT NULL DEFAULT 1,
    token_verificacion CHAR(64) NULL UNIQUE,
    token_verificacion_expira DATETIME NULL,
    token_verificacion_intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
    fecha_nacimiento DATE NOT NULL,
    avatar VARCHAR(255) NULL,
    premium_hasta DATETIME NULL,
    estado ENUM('Activo', 'Baneado') NOT NULL DEFAULT 'Activo',
    ID_rol INT NOT NULL,
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_usuario_rol FOREIGN KEY (ID_rol) REFERENCES rol(ID_rol) ON DELETE RESTRICT
);

-- =========================================================
-- 2. baneos de usuarios
-- =========================================================

CREATE TABLE bloqueo_usuario (
    ID_bloqueo INT AUTO_INCREMENT PRIMARY KEY,
    ID_usuario INT NOT NULL,
    ID_administrador INT NULL,
    motivo VARCHAR(255) NOT NULL,
    alertas INT NOT NULL DEFAULT 1,                      -- Contador o nivel de advertencias 
    fecha_baneo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duracion_dias INT NULL,                              
    duracion_horas INT NOT NULL DEFAULT 0,
    fecha_desbloqueo DATETIME NULL,
    apelacion TEXT NULL,
    respuesta_apelacion VARCHAR(500) NULL,
    ID_admin_apelacion INT NULL,
    estado ENUM('Activo', 'Baneado') NOT NULL DEFAULT 'Activo',
    estado_apelacion ENUM('No enviada', 'Pendiente', 'En proceso', 'Aprobada', 'Rechazada') NOT NULL DEFAULT 'No enviada',
    CONSTRAINT FK_bloqueo_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    CONSTRAINT FK_bloqueo_admin FOREIGN KEY (ID_administrador) REFERENCES usuario(ID_usuario) ON DELETE SET NULL,
    CONSTRAINT FK_bloqueo_admin_apelacion FOREIGN KEY (ID_admin_apelacion) REFERENCES usuario(ID_usuario) ON DELETE SET NULL,
    INDEX idx_bloqueo_usuario (ID_usuario),
    INDEX idx_bloqueo_apelacion (estado_apelacion, fecha_baneo)
);

-- =========================================================
-- 3. MANGAS, GENEROS, CAPITULOS Y PAGINAS
-- =========================================================
CREATE TABLE genero (
    ID_genero INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE manga (
    ID_manga INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(120) NOT NULL,
    autor VARCHAR(100) NOT NULL,
    descripcion TEXT NULL,
    portada VARCHAR(255) NOT NULL,
    tipo ENUM('MANGA', 'MANHWA', 'MANHUA', 'NOVELA') NOT NULL DEFAULT 'MANGA',
    demografia ENUM('Shounen', 'Seinen', 'Shoujo', 'Josei') NOT NULL DEFAULT 'Shounen',
    estado ENUM('En proceso', 'En pausa', 'Terminado') NOT NULL DEFAULT 'En proceso',
    es_mas18 BOOLEAN NOT NULL DEFAULT FALSE,
    visibilidad ENUM('Publicado', 'Oculto') NOT NULL DEFAULT 'Publicado',   -- 'Oculto' lo decide el administrador
    vistas INT NOT NULL DEFAULT 0,
    ID_usuario INT NOT NULL,                                                  -- creador de la obra
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_manga_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    INDEX idx_manga_titulo (titulo),
    INDEX idx_manga_filtros (visibilidad, es_mas18, estado, tipo)
);

CREATE TABLE manga_vista_usuario (
    ID_manga INT NOT NULL,
    ID_usuario INT NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID_manga, ID_usuario),
    CONSTRAINT FK_vista_usuario_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
    CONSTRAINT FK_vista_usuario_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE
);

CREATE TABLE manga_genero (
    ID_manga INT NOT NULL,
    ID_genero INT NOT NULL,
    PRIMARY KEY (ID_manga, ID_genero),
    CONSTRAINT FK_mg_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
    CONSTRAINT FK_mg_genero FOREIGN KEY (ID_genero) REFERENCES genero(ID_genero) ON DELETE CASCADE
);

CREATE TABLE capitulo (
    ID_capitulo INT AUTO_INCREMENT PRIMARY KEY,
    ID_manga INT NOT NULL,
    numero INT NOT NULL,
    titulo VARCHAR(120) NOT NULL,
    formato ENUM('imagenes', 'pdf') NOT NULL DEFAULT 'imagenes',
    archivo_nombre VARCHAR(255) NULL,           -- nombre original del archivo subido
    archivo_ruta VARCHAR(255) NULL,             -- solo para formato 'pdf'
    fecha_publicacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_capitulo_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
    CONSTRAINT UQ_capitulo_numero UNIQUE (ID_manga, numero)
);

CREATE TABLE usuario_lectura_capitulo (
    ID_usuario INT NOT NULL,
    ID_manga INT NOT NULL,
    ID_capitulo INT NOT NULL,
    fecha_lectura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID_usuario, ID_capitulo),
    INDEX idx_lectura_usuario_manga (ID_usuario, ID_manga),
    CONSTRAINT FK_lectura_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    CONSTRAINT FK_lectura_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
    CONSTRAINT FK_lectura_capitulo FOREIGN KEY (ID_capitulo) REFERENCES capitulo(ID_capitulo) ON DELETE CASCADE
);

CREATE TABLE pago_premium (
    ID_pago INT AUTO_INCREMENT PRIMARY KEY,
    ID_usuario INT NOT NULL,
    plan ENUM('mensual', 'anual') NOT NULL,
    proveedor ENUM('paypal', 'mercadopago') NOT NULL,
    monto_clp INT NOT NULL,
    referencia_externa CHAR(36) NOT NULL UNIQUE,
    referencia_checkout VARCHAR(100) NULL UNIQUE,
    referencia_pago VARCHAR(100) NULL UNIQUE,
    estado ENUM('pendiente', 'aprobado', 'cancelado') NOT NULL DEFAULT 'pendiente',
    nombre_pagador VARCHAR(80) NOT NULL,
    apellido_pagador VARCHAR(80) NOT NULL,
    correo_pagador VARCHAR(100) NOT NULL,
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_confirmacion DATETIME NULL,
    fecha_vencimiento DATETIME NULL,
    comprobante_estado ENUM('pendiente', 'enviando', 'enviado') NOT NULL DEFAULT 'pendiente',
    comprobante_intento_en DATETIME NULL,
    comprobante_enviado_en DATETIME NULL,
    CONSTRAINT FK_pago_premium_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    INDEX idx_pago_usuario_estado (ID_usuario, estado)
);

CREATE TABLE pagina (
    ID_pagina INT AUTO_INCREMENT PRIMARY KEY,
    ID_capitulo INT NOT NULL,
    orden INT NOT NULL,
    ruta VARCHAR(255) NOT NULL,
    CONSTRAINT FK_pagina_capitulo FOREIGN KEY (ID_capitulo) REFERENCES capitulo(ID_capitulo) ON DELETE CASCADE,
    INDEX idx_pagina_orden (ID_capitulo, orden)
);

-- =========================================================
-- 4. BIBLIOTECA (guardados por estado de lectura) Y COMENTARIOS
-- =========================================================
CREATE TABLE biblioteca (
    ID_usuario INT NOT NULL,
    ID_manga INT NOT NULL,
    estado ENUM('siguiendo', 'pendiente', 'terminado') NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID_usuario, ID_manga),
    CONSTRAINT FK_bib_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    CONSTRAINT FK_bib_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE
);

CREATE TABLE comentario (
    ID_comentario INT AUTO_INCREMENT PRIMARY KEY,
    ID_usuario INT NOT NULL,
    ID_manga INT NOT NULL,
    ID_capitulo INT NULL,                       -- NULL = comentario de la obra, con valor = de un capitulo
    texto VARCHAR(1000) NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_com_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    CONSTRAINT FK_com_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
    CONSTRAINT FK_com_capitulo FOREIGN KEY (ID_capitulo) REFERENCES capitulo(ID_capitulo) ON DELETE CASCADE
);

CREATE TABLE comentario_like (
    ID_comentario INT NOT NULL,
    ID_usuario INT NOT NULL,
    PRIMARY KEY (ID_comentario, ID_usuario),
    CONSTRAINT FK_like_comentario FOREIGN KEY (ID_comentario) REFERENCES comentario(ID_comentario) ON DELETE CASCADE,
    CONSTRAINT FK_like_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE
);

-- =========================================================
-- 5. NOTIFICACIONES Y DENUNCIAS
-- =========================================================
CREATE TABLE notificacion (
    ID_notificacion INT AUTO_INCREMENT PRIMARY KEY,
    ID_usuario INT NOT NULL,
    tipo ENUM('capitulo', 'comentario', 'advertencia', 'sistema') NOT NULL,
    mensaje VARCHAR(300) NOT NULL,
    enlace VARCHAR(200) NULL,
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_notif_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    INDEX idx_notif_usuario (ID_usuario, leida)
);

CREATE TABLE denuncia (
    ID_denuncia INT AUTO_INCREMENT PRIMARY KEY,
    ID_manga INT NOT NULL,
    ID_usuario INT NOT NULL,                    -- quien denuncia
    motivo ENUM('Las imagenes no cargan', 'Contenido inapropiado', 'Informacion incorrecta', 'Otro') NOT NULL,
    detalle VARCHAR(500) NULL,
    estado ENUM('Pendiente', 'Revisada', 'Descartada') NOT NULL DEFAULT 'Pendiente',
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_den_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
    CONSTRAINT FK_den_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE
);

-- =========================================================
-- DATOS INICIALES
-- (La cuenta de administrador la crea el servidor al iniciar, con los datos del archivo .env)
-- =========================================================
INSERT INTO rol (nombre_rol, descripcion) VALUES
('Lector', 'Lee, comenta y guarda mangas en su biblioteca'),
('Creador', 'Ademas de leer, publica mangas y les agrega capitulos'),
('Administrador', 'Modera usuarios, mangas, comentarios y denuncias');

INSERT INTO genero (nombre) VALUES
('Accion'), ('Aventura'), ('Comedia'), ('Drama'), ('Recuentos de la vida'), ('Romance'), ('Venganza'),
('Harem'), ('Fantasia'), ('Sobrenatural'), ('Tragedia'), ('Psicologico'), ('Horror'), ('Thriller'),
('Historias cortas'), ('Ecchi'), ('Gore'), ('Girls love'), ('Boys love'), ('Reencarnacion'),
('Sistema de niveles'), ('Ciencia ficcion'), ('Apocaliptico'), ('Artes marciales'), ('Superpoderes'),
('Cultivacion (cultivo)'), ('Milf');
