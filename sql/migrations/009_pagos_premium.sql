CREATE TABLE IF NOT EXISTS pago_premium (
    ID_pago INT AUTO_INCREMENT PRIMARY KEY,
    ID_usuario INT NOT NULL,
    plan ENUM('mensual', 'anual') NOT NULL,
    proveedor ENUM('paypal', 'mercadopago') NOT NULL,
    monto_clp INT NOT NULL,
    referencia_externa CHAR(36) NOT NULL UNIQUE,
    referencia_checkout VARCHAR(100) NULL UNIQUE,
    referencia_pago VARCHAR(100) NULL UNIQUE,
    estado ENUM('pendiente', 'aprobado', 'cancelado') NOT NULL DEFAULT 'pendiente',
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_confirmacion DATETIME NULL,
    CONSTRAINT FK_pago_premium_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    INDEX idx_pago_usuario_estado (ID_usuario, estado)
);

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago_premium' AND COLUMN_NAME = 'nombre_pagador') = 0,
    'ALTER TABLE pago_premium ADD COLUMN nombre_pagador VARCHAR(80) NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago_premium' AND COLUMN_NAME = 'apellido_pagador') = 0,
    'ALTER TABLE pago_premium ADD COLUMN apellido_pagador VARCHAR(80) NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago_premium' AND COLUMN_NAME = 'correo_pagador') = 0,
    'ALTER TABLE pago_premium ADD COLUMN correo_pagador VARCHAR(100) NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago_premium' AND COLUMN_NAME = 'fecha_vencimiento') = 0,
    'ALTER TABLE pago_premium ADD COLUMN fecha_vencimiento DATETIME NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago_premium' AND COLUMN_NAME = 'comprobante_estado') = 0,
    'ALTER TABLE pago_premium ADD COLUMN comprobante_estado ENUM(''pendiente'', ''enviando'', ''enviado'') NOT NULL DEFAULT ''pendiente''',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago_premium' AND COLUMN_NAME = 'comprobante_intento_en') = 0,
    'ALTER TABLE pago_premium ADD COLUMN comprobante_intento_en DATETIME NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago_premium' AND COLUMN_NAME = 'comprobante_enviado_en') = 0,
    'ALTER TABLE pago_premium ADD COLUMN comprobante_enviado_en DATETIME NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
