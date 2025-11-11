#!/usr/bin/env node
/*
 Migration: Drop compras.codigo_lote if it exists.
*/
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM compras LIKE 'codigo_lote'");
    if (cols.length) {
      console.log("Dropping compras.codigo_lote ...");
      await conn.query("ALTER TABLE compras DROP COLUMN codigo_lote");
      console.log("Dropped.");
    } else {
      console.log("compras.codigo_lote not present; nothing to do.");
    }
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

