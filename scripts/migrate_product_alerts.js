const { pool } = require("../config/mysql");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query("SHOW COLUMNS FROM ?? LIKE ?", [table, column]);
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/4] Adding alerta_min_stock to productos (if missing)");
    if (!(await columnExists(conn, "productos", "alerta_min_stock"))) {
      try {
        await conn.query(
          "ALTER TABLE productos ADD COLUMN alerta_min_stock INT(10) UNSIGNED NULL AFTER cantidad"
        );
      } catch (err) {
        console.error("  - alerta_min_stock not added:", err.message);
      }
    }

    console.log("[2/4] Adding alerta_id to productos (if missing)");
    if (!(await columnExists(conn, "productos", "alerta_id"))) {
      try {
        await conn.query(
          "ALTER TABLE productos ADD COLUMN alerta_id BIGINT(20) UNSIGNED NULL AFTER alerta_min_stock"
        );
      } catch (err) {
        console.error("  - alerta_id not added:", err.message);
      }
    }

    console.log("[3/4] Creating foreign key to alertas (if not present)");
    try {
      await conn.query(
        "ALTER TABLE productos ADD CONSTRAINT fk_productos_alerta FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE SET NULL"
      );
    } catch {}

    console.log("[4/4] Migration completed");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
