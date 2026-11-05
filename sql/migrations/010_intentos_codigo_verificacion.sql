-- Selecciona previamente la base de datos configurada en DB_NAME.
ALTER TABLE usuario
    ADD COLUMN token_verificacion_intentos TINYINT UNSIGNED NOT NULL DEFAULT 0;
