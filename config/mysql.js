const mysql = require("mysql2/promise");
const config = require("./config");
const fs = require("fs");
const path = require("path");
const caPath = process.env.MYSQL_CA || path.resolve(__dirname, "..", "certs", "aiven-ca.pem");

const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  ssl: { ca: fs.readFileSync(caPath), rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

async function ensureAuxTables() {
  // Auxiliary tables to bridge current app data model to MySQL
  // orders_json: snapshot of order payload for reconstruction
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS orders_json (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      pedido_id BIGINT UNSIGNED NOT NULL,
      json LONGTEXT NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_orders_json_pedido (pedido_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.query("ALTER TABLE orders_json CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  } finally {
    conn.release();
  }
}

module.exports = { pool, ping, ensureAuxTables };
