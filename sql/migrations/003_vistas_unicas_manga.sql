-- Selecciona previamente la base de datos configurada en DB_NAME.
-- Reinicia los contadores y las visitas unicas para empezar a contar desde cero.
CREATE TABLE IF NOT EXISTS manga_vista_usuario (
    ID_manga INT NOT NULL,
    ID_usuario INT NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID_manga, ID_usuario),
    CONSTRAINT FK_vista_usuario_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
    CONSTRAINT FK_vista_usuario_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE
);

DELETE FROM manga_vista_usuario;
UPDATE manga SET vistas = 0;
