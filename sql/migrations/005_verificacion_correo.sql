-- Selecciona previamente la base de datos configurada en DB_NAME.
-- Conserva el acceso de las cuentas existentes; los nuevos registros se crean pendientes.
ALTER TABLE usuario
    ADD COLUMN email_verificado TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN token_verificacion CHAR(64) NULL UNIQUE,
    ADD COLUMN token_verificacion_expira DATETIME NULL;
