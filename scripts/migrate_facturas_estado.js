const { pool } = require("../config/mysql");

async function findEstadoId(nombre, tipo) {
  const upper = String(nombre || "").toUpperCase();
  const [rows] = await pool.query(
    "SELECT id FROM estados WHERE UPPER(nombre) = ? AND tipo = ? LIMIT 1",
    [upper, tipo]
  );
  return rows[0]?.id || null;
}

async function ensureEstado(nombre, tipo) {
  let id = await findEstadoId(nombre, tipo);
  if (id) return id;
  const [res] = await pool.query(
    "INSERT INTO estados (nombre, tipo, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
    [String(nombre || "").toUpperCase(), tipo]
  );
  return res.insertId;
}

async function fkExists(conn) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'facturas'
        AND COLUMN_NAME = 'estado_factura_id'
        AND REFERENCED_TABLE_NAME = 'estados'
        LIMIT 1`
  );
  return rows.length > 0;
}

async function columnAllowsNull(conn) {
  const [rows] = await conn.query(
    "SHOW COLUMNS FROM facturas LIKE 'estado_factura_id'"
  );
  if (!rows.length) return true;
  return rows[0].Null === "YES";
}

async function up() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/4] Ensuring estado FACTURADO (tipo=6)");
    const facturadoId = await ensureEstado("FACTURADO", 6);

    console.log("[2/4] Updating facturas sin estado");
    await conn.query(
      "UPDATE facturas SET estado_factura_id = ? WHERE estado_factura_id IS NULL",
      [facturadoId]
    );

    if (await columnAllowsNull(conn)) {
      console.log("[3/4] Ajustando columna estado_factura_id para que no permita NULL");
      await conn.query(
        "ALTER TABLE facturas MODIFY estado_factura_id BIGINT(20) UNSIGNED NOT NULL"
      );
    } else {
      console.log("[3/4] Columna estado_factura_id ya es NOT NULL");
    }

    if (!(await fkExists(conn))) {
      console.log("[4/4] Creando FK facturas.estado_factura_id -> estados.id");
      await conn.query(
        "ALTER TABLE facturas ADD CONSTRAINT fk_facturas_estado FOREIGN KEY (estado_factura_id) REFERENCES estados(id) ON DELETE RESTRICT"
      );
    } else {
      console.log("[4/4] FK ya registrada");
    }

    console.log("Migración completada.");
  } finally {
    conn.release();
  }
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
