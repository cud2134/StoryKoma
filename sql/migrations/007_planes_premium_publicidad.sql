ALTER TABLE usuario
    ADD COLUMN premium_hasta DATETIME NULL;

CREATE TABLE IF NOT EXISTS usuario_lectura_capitulo (
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
