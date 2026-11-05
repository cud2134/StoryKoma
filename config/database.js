// Conexion a MySQL (pool de conexiones) usando las variables del archivo .env
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // fechas como texto 'YYYY-MM-DD HH:MM:SS' (sin desfases de zona horaria)
  charset: 'utf8mb4',
});

module.exports = pool;
