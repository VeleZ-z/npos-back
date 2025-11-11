#!/usr/bin/env node
/*
 Migration: Add usuarios.cumpleanos (DATE) if missing.
*/
const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/1] Add cumpleanos (DATE) to usuarios if missing");
    try {
      await conn.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cumpleanos DATE NULL AFTER telefono");
    } catch (e) {
      const [cols] = await conn.query("SHOW COLUMNS FROM usuarios LIKE 'cumpleanos'");
      if (cols.length === 0) {
        await conn.query("ALTER TABLE usuarios ADD COLUMN cumpleanos DATE NULL AFTER telefono");
      }
    }
    console.log("Migration completed");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

