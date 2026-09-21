import { pool, ping } from "../config/mysql";
import { spawnSync } from "node:child_process";

let dbAvailable = null;

export async function isDbAvailable() {
  if (dbAvailable !== null) return dbAvailable;
  try {
    await ping();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}

// Runs the standalone schema migration CLI (idempotent: CREATE TABLE IF NOT
// EXISTS) against the test database resolved from env. Executed as a child
// process so it uses the same entry point as production operators.
export function runMigrations() {
  const result = spawnSync("node", ["scripts/migrate_full_schema.js"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `migrate_full_schema failed (exit ${result.status}): ${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

// Lookup/seed tables (static reference data from migrate_full_schema.js):
// NOT truncated so seeded estados/roles/impuestos/metodos_pagos survive.
const LOOKUP_TABLES = new Set([
  "estados",
  "roles",
  "documentos",
  "impuestos",
  "metodos_pagos",
]);

const TABLES_IN_FK_SAFE_ORDER = [
  "alertas_x_usuarios",
  "alertas_compras",
  "alertas",
  "roles_x_usuarios",
  "descuentos_x_productos",
  "productos_x_pedidos",
  "productos_imagenes",
  "descuentos",
  "productos",
  "pedidos",
  "orders_json",
  "cuadres",
  "facturas",
  "compras",
  "proveedores",
  "mesas",
  "cache",
  "usuarios",
];

export async function truncateAll() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query("SHOW TABLES");
    const existing = new Set(rows.map((r) => Object.values(r)[0]));
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of TABLES_IN_FK_SAFE_ORDER) {
      if (!LOOKUP_TABLES.has(table) && existing.has(table)) {
        await conn.query(`TRUNCATE TABLE ${table}`);
      }
    }
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    conn.release();
  }
}
