
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    const values = ["PENDIENTE", "RECIBIDA", "CANCELADA", "SALIO"];
    for (const nombre of values) {
      console.log(`Ensuring estado '${nombre}' (tipo=4)`);
      await conn.query(
        "INSERT INTO estados (nombre, tipo, created_at, updated_at) SELECT ?, 4, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre = ? AND tipo = 4)",
        [nombre, nombre]
      );
    }
    console.log("Estados tipo=4 ensured.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();

