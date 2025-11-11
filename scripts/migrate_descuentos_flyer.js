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
    console.log("[1/2] Adding mensaje column to descuentos (if missing)");
    if (!(await columnExists(conn, "descuentos", "mensaje"))) {
      await conn.query(
        "ALTER TABLE descuentos ADD COLUMN mensaje TEXT NULL AFTER porciento"
      );
    }

    console.log("[2/2] Adding imagen_path column to descuentos (if missing)");
    if (!(await columnExists(conn, "descuentos", "imagen_path"))) {
      await conn.query(
        "ALTER TABLE descuentos ADD COLUMN imagen_path VARCHAR(255) NULL AFTER mensaje"
      );
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
