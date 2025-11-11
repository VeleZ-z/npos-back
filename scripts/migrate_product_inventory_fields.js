const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/4] Add columns to productos (if missing): codigo_barras, cantidad, costo");
    // codigo_barras
    try { await conn.query("ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(64) NULL AFTER nombre"); } catch {}
    // cantidad
    try { await conn.query("ALTER TABLE productos ADD COLUMN IF NOT EXISTS cantidad INT(10) UNSIGNED NOT NULL DEFAULT 0 AFTER precio"); } catch {
      try {
        const [cols] = await conn.query("SHOW COLUMNS FROM productos LIKE 'cantidad'");
        if (cols.length === 0) await conn.query("ALTER TABLE productos ADD COLUMN cantidad INT(10) UNSIGNED NOT NULL DEFAULT 0 AFTER precio");
      } catch {}
    }
    // costo
    try { await conn.query("ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo INT(10) UNSIGNED NOT NULL DEFAULT 0 AFTER cantidad"); } catch {
      try {
        const [cols] = await conn.query("SHOW COLUMNS FROM productos LIKE 'costo'");
        if (cols.length === 0) await conn.query("ALTER TABLE productos ADD COLUMN costo INT(10) UNSIGNED NOT NULL DEFAULT 0 AFTER cantidad");
      } catch {}
    }

    console.log("[2/4] Index/uniqueness for codigo_barras (optional unique)");
    try { await conn.query("CREATE INDEX idx_productos_codigo_barras ON productos(codigo_barras)"); } catch {}

    console.log("[3/4] Backfill defaults where null");
    await conn.query("UPDATE productos SET cantidad = COALESCE(cantidad, 0), costo = COALESCE(costo, 0)");

    console.log("[4/4] Done");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

