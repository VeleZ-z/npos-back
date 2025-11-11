
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/6] Ensure estados tipo=3 (POR_APROBAR, PENDIENTE, LISTO, CERRADO)");
    const estados = ["POR_APROBAR", "PENDIENTE", "LISTO", "CERRADO"];
    for (const nombre of estados) {
      await conn.query(
        "INSERT INTO estados (nombre, tipo, created_at, updated_at) SELECT ?, 3, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre = ? AND tipo = 3)",
        [nombre, nombre]
      );
    }

    console.log("[2/6] Add estado_id column to pedidos (if missing)");
    try {
      await conn.query(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS estado_id BIGINT UNSIGNED NULL AFTER mesa_id"
      );
    } catch {
      try {
        const [cols] = await conn.query("SHOW COLUMNS FROM pedidos LIKE 'estado_id'");
        if (cols.length === 0) {
          await conn.query(
            "ALTER TABLE pedidos ADD COLUMN estado_id BIGINT UNSIGNED NULL AFTER mesa_id"
          );
        }
      } catch {}
    }

    console.log("[3/6] Add FK and index (if missing)");
    try {
      await conn.query(
        "ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_id_fk FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE SET NULL"
      );
    } catch {}
    try {
      await conn.query("CREATE INDEX idx_pedidos_estado_id ON pedidos(estado_id)");
    } catch {}

    console.log("[4/6] Backfill estado_id from orders_json.orderStatus where null");
    try {
      await conn.query(
        `UPDATE pedidos p
           JOIN orders_json oj ON oj.pedido_id = p.id
           JOIN estados e ON UPPER(JSON_UNQUOTE(JSON_EXTRACT(oj.json, '$.orderStatus'))) = e.nombre AND e.tipo = 3
           SET p.estado_id = e.id, p.updated_at = NOW()
         WHERE p.estado_id IS NULL`
      );
    } catch {}

    console.log("[5/6] Default any remaining nulls to PENDIENTE");
    try {
      await conn.query(
        `UPDATE pedidos p
           JOIN estados e ON e.nombre = 'PENDIENTE' AND e.tipo = 3
           SET p.estado_id = e.id, p.updated_at = NOW()
         WHERE p.estado_id IS NULL`
      );
    } catch {}

    console.log("[6/6] Migration completed");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

