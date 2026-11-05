USE storykoma;

CREATE TABLE IF NOT EXISTS manga_vista_usuario (
    ID_manga INT NOT NULL,
    ID_usuario INT NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID_manga, ID_usuario),
    CONSTRAINT FK_vista_usuario_manga FOREIGN KEY (ID_manga) REFERENCES manga(ID_manga) ON DELETE CASCADE,
    CONSTRAINT FK_vista_usuario_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE
);
