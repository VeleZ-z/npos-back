#!/usr/bin/env node
/*
 Migration: Drop compras.alerta_mensaje if it exists. Keep alerta_min_stock.
*/
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM compras LIKE 'alerta_mensaje'");
    if (cols.length) {
      console.log("Dropping compras.alerta_mensaje ...");
      await conn.query("ALTER TABLE compras DROP COLUMN alerta_mensaje");
      console.log("Dropped.");
    } else {
      console.log("compras.alerta_mensaje not present; nothing to do.");
    }
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

