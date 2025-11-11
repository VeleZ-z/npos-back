
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/2] Add compra_id column to alertas if missing");
    try {
      await conn.query("ALTER TABLE alertas ADD COLUMN IF NOT EXISTS compra_id BIGINT UNSIGNED NULL AFTER mensaje_alrt");
    } catch {
      const [cols] = await conn.query("SHOW COLUMNS FROM alertas LIKE 'compra_id'");
      if (cols.length === 0) {
        await conn.query("ALTER TABLE alertas ADD COLUMN compra_id BIGINT UNSIGNED NULL AFTER mensaje_alrt");
      }
    }
    console.log("[2/2] Add FK to compras (if missing)");
    try {
      await conn.query("ALTER TABLE alertas ADD CONSTRAINT alertas_compra_fk FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE SET NULL");
    } catch {}
    console.log("Migration completed");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

