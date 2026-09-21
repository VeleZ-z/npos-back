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

const TABLES_IN_FK_SAFE_ORDER = [
  "alertas_x_usuarios",
  "alertas_compras",
  "alertas",
  "roles_x_usuarios",
  "descuentos_x_productos",
  "productos_x_pedidos",
  "productos_imagenes",
  "productos",
  "descuentos",
  "impuestos",
  "pedidos",
  "cuadres",
  "facturas",
  "metodos_pagos",
  "compras",
  "proveedores",
  "categorias",
  "mesas",
  "usuarios",
  "orders_json",
  "cache",
  "estados",
];

export async function truncateAll() {
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of TABLES_IN_FK_SAFE_ORDER) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    conn.release();
  }
}
