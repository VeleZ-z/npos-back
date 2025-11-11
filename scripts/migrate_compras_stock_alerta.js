#!/usr/bin/env node
/*
 Adds compras.stock (INT UNSIGNED) and compras.alerta_id (FK -> alertas.id),
 and backfills stock = cantidad when null. Safe to run multiple times.
*/
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log('[1/3] Add compras.stock if missing');
    try {
      await conn.query("ALTER TABLE compras ADD COLUMN IF NOT EXISTS stock INT(10) UNSIGNED DEFAULT NULL AFTER cantidad");
    } catch {
      const [cols] = await conn.query("SHOW COLUMNS FROM compras LIKE 'stock'");
      if (cols.length === 0) {
        await conn.query("ALTER TABLE compras ADD COLUMN stock INT(10) UNSIGNED DEFAULT NULL AFTER cantidad");
      }
    }

    console.log('[2/3] Add compras.alerta_id if missing');
    try {
      await conn.query("ALTER TABLE compras ADD COLUMN IF NOT EXISTS alerta_id BIGINT UNSIGNED NULL AFTER alerta_min_stock");
    } catch {
      const [cols2] = await conn.query("SHOW COLUMNS FROM compras LIKE 'alerta_id'");
      if (cols2.length === 0) {
        await conn.query("ALTER TABLE compras ADD COLUMN alerta_id BIGINT UNSIGNED NULL AFTER alerta_min_stock");
      }
    }
    try { await conn.query("ALTER TABLE compras ADD CONSTRAINT compras_alerta_fk FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE SET NULL"); } catch {}

    console.log('[3/3] Backfill stock from cantidad where null');
    await conn.query("UPDATE compras SET stock = cantidad WHERE stock IS NULL");
    console.log('Migration completed');
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

