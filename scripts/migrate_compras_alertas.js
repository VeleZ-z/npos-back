
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/2] Add alerta_min_stock to compras (if missing)");
    try {
      await conn.query("ALTER TABLE compras ADD COLUMN IF NOT EXISTS alerta_min_stock INT(10) UNSIGNED DEFAULT NULL AFTER costo");
    } catch {
      const [cols] = await conn.query("SHOW COLUMNS FROM compras LIKE 'alerta_min_stock'");
      if (cols.length === 0) {
        await conn.query("ALTER TABLE compras ADD COLUMN alerta_min_stock INT(10) UNSIGNED DEFAULT NULL AFTER costo");
      }
    }

    console.log("[2/2] Add alerta_mensaje to compras (if missing)");
    try {
      await conn.query("ALTER TABLE compras ADD COLUMN IF NOT EXISTS alerta_mensaje VARCHAR(255) DEFAULT NULL AFTER alerta_min_stock");
    } catch {
      const [cols2] = await conn.query("SHOW COLUMNS FROM compras LIKE 'alerta_mensaje'");
      if (cols2.length === 0) {
        await conn.query("ALTER TABLE compras ADD COLUMN alerta_mensaje VARCHAR(255) DEFAULT NULL AFTER alerta_min_stock");
      }
    }
    console.log("Migration completed");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

