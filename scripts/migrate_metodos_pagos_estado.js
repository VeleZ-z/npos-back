const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/5] Ensure estados tipo=5 (ACTIVO/INACTIVO)");
    await conn.query("INSERT INTO estados (nombre, tipo, created_at, updated_at) SELECT 'ACTIVO', 5, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre='ACTIVO' AND tipo=5)");
    await conn.query("INSERT INTO estados (nombre, tipo, created_at, updated_at) SELECT 'INACTIVO', 5, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre='INACTIVO' AND tipo=5)");

    console.log("[2/5] Add estado_id column to metodos_pagos (if missing)");
    try {
      await conn.query("ALTER TABLE metodos_pagos ADD COLUMN IF NOT EXISTS estado_id BIGINT UNSIGNED NULL AFTER nombre");
    } catch {
      try {
        const [cols] = await conn.query("SHOW COLUMNS FROM metodos_pagos LIKE 'estado_id'");
        if (cols.length === 0) {
          await conn.query("ALTER TABLE metodos_pagos ADD COLUMN estado_id BIGINT UNSIGNED NULL AFTER nombre");
        }
      } catch {}
    }

    console.log("[3/5] Backfill estado_id to ACTIVO where null");
    await conn.query("UPDATE metodos_pagos mp JOIN estados e ON e.nombre='ACTIVO' AND e.tipo=5 SET mp.estado_id = e.id WHERE mp.estado_id IS NULL");

    console.log("[4/5] Add FK and index (if missing)");
    try { await conn.query("ALTER TABLE metodos_pagos ADD CONSTRAINT metodos_pagos_estado_id_fk FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE SET NULL"); } catch {}
    try { await conn.query("CREATE INDEX idx_metodos_pagos_estado_id ON metodos_pagos(estado_id)"); } catch {}

    console.log("[5/5] Done");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

