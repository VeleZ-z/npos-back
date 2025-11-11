const { pool } = require("../config/mysql");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query("SHOW COLUMNS FROM ?? LIKE ?", [table, column]);
  return rows.length > 0;
}

async function up() {
  const conn = await pool.getConnection();
  try {
    const hasColumn = await columnExists(conn, "productos_x_pedidos", "printed_qty");
    if (!hasColumn) {
      console.log("Adding printed_qty column to productos_x_pedidos...");
      await conn.query(
        "ALTER TABLE productos_x_pedidos ADD COLUMN printed_qty INT UNSIGNED NOT NULL DEFAULT 0 AFTER cantidad"
      );
    } else {
      console.log("printed_qty column already exists.");
    }
    console.log("Migration completed.");
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
