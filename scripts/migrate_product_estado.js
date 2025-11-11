
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/6] Ensure estados tipo=2 (ACTIVO/INACTIVO)");
    await conn.query(
      "INSERT INTO estados (nombre, tipo, created_at, updated_at) SELECT 'ACTIVO', 2, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre='ACTIVO' AND tipo=2)"
    );
    await conn.query(
      "INSERT INTO estados (nombre, tipo, created_at, updated_at) SELECT 'INACTIVO', 2, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre='INACTIVO' AND tipo=2)"
    );

    console.log("[2/6] Add estado_id column to productos (if missing)");
    try {
      await conn.query(
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS estado_id BIGINT UNSIGNED NULL AFTER categoria_id"
      );
    } catch {
      try {
        // Older MySQL
        const [cols] = await conn.query("SHOW COLUMNS FROM productos LIKE 'estado_id'");
        if (cols.length === 0) {
          await conn.query(
            "ALTER TABLE productos ADD COLUMN estado_id BIGINT UNSIGNED NULL AFTER categoria_id"
          );
        }
      } catch {}
    }

    console.log("[3/6] Backfill estado_id from activo");
    await conn.query(
      "UPDATE productos p JOIN estados e ON e.nombre='ACTIVO' AND e.tipo=2 SET p.estado_id = e.id WHERE (p.estado_id IS NULL) AND (p.activo = 1)"
    );
    await conn.query(
      "UPDATE productos p JOIN estados e ON e.nombre='INACTIVO' AND e.tipo=2 SET p.estado_id = e.id WHERE (p.estado_id IS NULL) AND (p.activo = 0 OR p.activo IS NULL)"
    );

    console.log("[4/6] Add FK and index (if missing)");
    try {
      await conn.query(
        "ALTER TABLE productos ADD CONSTRAINT productos_estado_id_fk FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE SET NULL"
      );
    } catch {}
    try {
      await conn.query("CREATE INDEX idx_productos_estado_id ON productos(estado_id)");
    } catch {}

    console.log("[5/6] Drop legacy column activo (if exists)");
    try {
      await conn.query("ALTER TABLE productos DROP COLUMN activo");
    } catch {}

    console.log("[6/6] Migration completed");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

