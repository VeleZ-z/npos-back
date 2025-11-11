
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/1] Add unidad_medida to compras (if missing)");
    try {
      await conn.query("ALTER TABLE compras ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(100) DEFAULT NULL AFTER costo");
    } catch {
      const [cols] = await conn.query("SHOW COLUMNS FROM compras LIKE 'unidad_medida'");
      if (cols.length === 0) {
        await conn.query("ALTER TABLE compras ADD COLUMN unidad_medida VARCHAR(100) DEFAULT NULL AFTER costo");
      }
    }
    console.log("Migration completed");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

