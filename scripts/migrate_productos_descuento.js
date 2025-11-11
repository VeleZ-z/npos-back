"use strict";

const { pool } = require("../config/mysql");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query("SHOW COLUMNS FROM ?? LIKE ?", [
    table,
    column,
  ]);
  return rows.length > 0;
}

async function up() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/6] Ensuring productos_x_pedidos.precio_unitario");
    if (!(await columnExists(conn, "productos_x_pedidos", "precio_unitario"))) {
      await conn.query(
        "ALTER TABLE productos_x_pedidos ADD COLUMN precio_unitario DECIMAL(10,2) NULL AFTER producto_id"
      );
    }

    console.log("[2/6] Ensuring productos_x_pedidos.precio_original");
    if (!(await columnExists(conn, "productos_x_pedidos", "precio_original"))) {
      await conn.query(
        "ALTER TABLE productos_x_pedidos ADD COLUMN precio_original DECIMAL(10,2) NULL AFTER precio_unitario"
      );
    }

    console.log("[3/6] Ensuring productos_x_pedidos.descuento_id");
    if (!(await columnExists(conn, "productos_x_pedidos", "descuento_id"))) {
      await conn.query(
        "ALTER TABLE productos_x_pedidos ADD COLUMN descuento_id BIGINT UNSIGNED NULL AFTER nota"
      );
    }

    console.log("[4/6] Ensuring productos_x_pedidos.descuento_nombre");
    if (
      !(await columnExists(conn, "productos_x_pedidos", "descuento_nombre"))
    ) {
      await conn.query(
        "ALTER TABLE productos_x_pedidos ADD COLUMN descuento_nombre VARCHAR(255) NULL AFTER descuento_id"
      );
    }

    console.log("[5/6] Ensuring productos_x_pedidos.descuento_tipo/valor");
    if (!(await columnExists(conn, "productos_x_pedidos", "descuento_tipo"))) {
      await conn.query(
        "ALTER TABLE productos_x_pedidos ADD COLUMN descuento_tipo VARCHAR(20) NULL AFTER descuento_nombre"
      );
    }
    if (!(await columnExists(conn, "productos_x_pedidos", "descuento_valor"))) {
      await conn.query(
        "ALTER TABLE productos_x_pedidos ADD COLUMN descuento_valor DECIMAL(10,2) NULL AFTER descuento_tipo"
      );
    }

    console.log("[6/6] Adding FK productos_x_pedidos.descuento_id -> descuentos.id");
    try {
      await conn.query(
        "ALTER TABLE productos_x_pedidos ADD CONSTRAINT fk_pxp_descuento FOREIGN KEY (descuento_id) REFERENCES descuentos(id) ON DELETE SET NULL"
      );
    } catch {
      // ignore if already exists
    }

    console.log("Migration completed successfully.");
  } finally {
    conn.release();
    process.exit(0);
  }
}

up().catch((err) => {
  console.error(err);
  process.exit(1);
});
