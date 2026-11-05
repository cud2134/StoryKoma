-- Agrega comentarios al tipo de notificacion para instalaciones existentes.
ALTER TABLE notificacion
    MODIFY COLUMN tipo ENUM('capitulo', 'comentario', 'advertencia', 'sistema') NOT NULL;
