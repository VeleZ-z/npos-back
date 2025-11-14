const { pool } = require("../config/mysql");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query("SHOW COLUMNS FROM ?? LIKE ?", [table, column]);
  return rows.length > 0;
}

async function up() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/2] Ensuring descuentos.imagen_data column");
    if (!(await columnExists(conn, "descuentos", "imagen_data"))) {
      await conn.query(
        "ALTER TABLE descuentos ADD COLUMN imagen_data LONGBLOB NULL AFTER imagen_path"
      );
    }

    console.log("[2/2] Ensuring descuentos.imagen_mime column");
    if (!(await columnExists(conn, "descuentos", "imagen_mime"))) {
      await conn.query(
        "ALTER TABLE descuentos ADD COLUMN imagen_mime VARCHAR(100) NULL AFTER imagen_data"
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
