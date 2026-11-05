-- Selecciona previamente la base de datos configurada en DB_NAME.
-- Solo elimina las cuatro obras de ejemplo del usuario tecnico original.
-- Las relaciones asociadas se eliminan mediante las claves foraneas en cascada.
DELETE m
FROM manga m
JOIN usuario u ON u.ID_usuario = m.ID_usuario
WHERE u.username = 'StoryKoma'
  AND u.correo = 'sistema@storykoma.local'
  AND m.titulo IN (
      'Camino del Eclipse',
      'Frieren: Rutas Azules',
      'Latidos de Primavera',
      'Distrito Carmesi'
  );
