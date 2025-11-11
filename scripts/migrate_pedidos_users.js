const { pool } = require("../config/mysql");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query("SHOW COLUMNS FROM ?? LIKE ?", [table, column]);
  return rows.length > 0;
}

async function addColumnIfMissing(conn, sql) {
  try {
    await conn.query(sql);
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") return;
    if (err.sqlState === "HY000") return; // some MySQL versions ignore IF NOT EXISTS
    throw err;
  }
}

async function dropForeignKeyIfExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, column]
  );
  for (const row of rows) {
    try {
      await conn.query(`ALTER TABLE ?? DROP FOREIGN KEY ??`, [table, row.CONSTRAINT_NAME]);
    } catch {}
  }
}

async function dropColumnIfExists(conn, table, column) {
  if (await columnExists(conn, table, column)) {
    await conn.query(`ALTER TABLE ?? DROP COLUMN ??`, [table, column]);
  }
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/6] Añadir columnas usuario_cliente_id y usuario_cajero_id a pedidos (si no existen)");
    if (!(await columnExists(conn, "pedidos", "usuario_cliente_id"))) {
      await addColumnIfMissing(
        conn,
        "ALTER TABLE pedidos ADD COLUMN usuario_cliente_id BIGINT(20) UNSIGNED NULL AFTER estado_id"
      );
    }
    if (!(await columnExists(conn, "pedidos", "usuario_cajero_id"))) {
      await addColumnIfMissing(
        conn,
        "ALTER TABLE pedidos ADD COLUMN usuario_cajero_id BIGINT(20) UNSIGNED NULL AFTER usuario_cliente_id"
      );
    }

    console.log("[2/6] Crear índices y llaves foráneas hacia usuarios");
    try {
      await conn.query(
        "ALTER TABLE pedidos ADD CONSTRAINT fk_pedidos_usuario_cliente FOREIGN KEY (usuario_cliente_id) REFERENCES usuarios(id) ON DELETE SET NULL"
      );
    } catch {}
    try {
      await conn.query(
        "ALTER TABLE pedidos ADD CONSTRAINT fk_pedidos_usuario_cajero FOREIGN KEY (usuario_cajero_id) REFERENCES usuarios(id) ON DELETE SET NULL"
      );
    } catch {}

    console.log("[3/6] Copiar datos existentes desde facturas hacia pedidos");
    await conn.query(
      `UPDATE pedidos p
        JOIN facturas f ON f.pedido_id = p.id
        SET p.usuario_cliente_id = COALESCE(p.usuario_cliente_id, f.usuario_cliente_id),
            p.usuario_cajero_id = COALESCE(p.usuario_cajero_id, f.usuario_cajero_id)`
    );

    console.log("[4/6] Actualizar pedidos con información almacenada en orders_json (por si es necesario)");
    try {
      await conn.query(
        `UPDATE pedidos p
           JOIN orders_json oj ON oj.pedido_id = p.id
           LEFT JOIN usuarios u ON u.id = p.usuario_cliente_id
          SET p.usuario_cliente_id = JSON_UNQUOTE(JSON_EXTRACT(oj.json, '$.customer.user._id'))
          WHERE (p.usuario_cliente_id IS NULL OR p.usuario_cliente_id = 0)
            AND JSON_EXTRACT(oj.json, '$.customer.user._id') IS NOT NULL`
      );
    } catch {}

    console.log("[5/6] Eliminar llaves foráneas y columnas de facturas");
    await dropForeignKeyIfExists(conn, "facturas", "usuario_cliente_id");
    await dropForeignKeyIfExists(conn, "facturas", "usuario_cajero_id");
    await dropColumnIfExists(conn, "facturas", "usuario_cliente_id");
    await dropColumnIfExists(conn, "facturas", "usuario_cajero_id");

    console.log("[6/6] Listo");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
