-- The full schema already contains some of these fields. Add only missing ones
-- so this migration also works on databases created from sql/schema.sql.
SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuario' AND column_name = 'estado') = 0,
    'ALTER TABLE usuario ADD COLUMN estado ENUM(''Activo'', ''Baneado'') NOT NULL DEFAULT ''Activo''',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuario' AND column_name = 'motivo_baneo') = 0,
    'ALTER TABLE usuario ADD COLUMN motivo_baneo VARCHAR(255) NULL',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'bloqueo_usuario' AND column_name = 'ID_administrador') = 0,
    'ALTER TABLE bloqueo_usuario ADD COLUMN ID_administrador INT NULL',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'bloqueo_usuario' AND column_name = 'duracion_horas') = 0,
    'ALTER TABLE bloqueo_usuario ADD COLUMN duracion_horas INT NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'bloqueo_usuario' AND column_name = 'fecha_desbloqueo') = 0,
    'ALTER TABLE bloqueo_usuario ADD COLUMN fecha_desbloqueo DATETIME NULL',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'bloqueo_usuario' AND column_name = 'respuesta_apelacion') = 0,
    'ALTER TABLE bloqueo_usuario ADD COLUMN respuesta_apelacion VARCHAR(500) NULL',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'bloqueo_usuario' AND column_name = 'ID_admin_apelacion') = 0,
    'ALTER TABLE bloqueo_usuario ADD COLUMN ID_admin_apelacion INT NULL',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

ALTER TABLE bloqueo_usuario
    MODIFY COLUMN estado_apelacion ENUM('No enviada', 'Pendiente', 'En proceso', 'Aprobada', 'Rechazada') NOT NULL DEFAULT 'No enviada';

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'bloqueo_usuario' AND constraint_name = 'FK_bloqueo_admin') = 0,
    'ALTER TABLE bloqueo_usuario ADD CONSTRAINT FK_bloqueo_admin FOREIGN KEY (ID_administrador) REFERENCES usuario(ID_usuario) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'bloqueo_usuario' AND constraint_name = 'FK_bloqueo_admin_apelacion') = 0,
    'ALTER TABLE bloqueo_usuario ADD CONSTRAINT FK_bloqueo_admin_apelacion FOREIGN KEY (ID_admin_apelacion) REFERENCES usuario(ID_usuario) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

SET @storykoma_sql = IF(
    (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'bloqueo_usuario' AND index_name = 'idx_bloqueo_apelacion') = 0,
    'ALTER TABLE bloqueo_usuario ADD INDEX idx_bloqueo_apelacion (estado_apelacion, fecha_baneo)',
    'SELECT 1'
);
PREPARE storykoma_stmt FROM @storykoma_sql;
EXECUTE storykoma_stmt;
DEALLOCATE PREPARE storykoma_stmt;

UPDATE bloqueo_usuario
SET fecha_desbloqueo = DATE_ADD(
    DATE_ADD(fecha_baneo, INTERVAL duracion_dias DAY),
    INTERVAL duracion_horas HOUR
)
WHERE duracion_dias IS NOT NULL AND fecha_desbloqueo IS NULL;

UPDATE usuario u
JOIN bloqueo_usuario b ON b.ID_usuario = u.ID_usuario
SET u.estado = b.estado, u.motivo_baneo = IF(b.estado = 'Baneado', b.motivo, NULL)
WHERE b.ID_bloqueo = (
    SELECT ultimo.ID_bloqueo
    FROM (
        SELECT ID_usuario, MAX(ID_bloqueo) AS ID_bloqueo
        FROM bloqueo_usuario
        GROUP BY ID_usuario
    ) ultimo
    WHERE ultimo.ID_usuario = u.ID_usuario
);
