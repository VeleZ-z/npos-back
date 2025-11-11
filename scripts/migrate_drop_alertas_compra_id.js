#!/usr/bin/env node
/*
 Drops alertas.compra_id and its FK if present.
*/
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM alertas LIKE 'compra_id'");
    if (cols.length) {
      console.log('Dropping FK and column alertas.compra_id');
      try { await conn.query("ALTER TABLE alertas DROP FOREIGN KEY alertas_compra_fk"); } catch {}
      try { await conn.query("ALTER TABLE alertas DROP COLUMN compra_id"); } catch {}
    } else {
      console.log('alertas.compra_id not present');
    }
    process.exit(0);
  } catch (e) {
    console.error(e); process.exit(1);
  } finally { conn.release(); }
}

run();

