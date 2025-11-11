const { pool } = require("../config/mysql");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query("SHOW COLUMNS FROM ?? LIKE ?", [table, column]);
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query("SHOW TABLES LIKE ?", [table]);
  return rows.length > 0;
}

async function up() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/7] Creating table impuestos (if missing)");
    const hasTable = await tableExists(conn, "impuestos");
    if (!hasTable) {
      await conn.query(
        `CREATE TABLE impuestos (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
           nombre VARCHAR(100) NOT NULL,
           regimen VARCHAR(100) NOT NULL,
           porcentaje INT UNSIGNED NOT NULL,
           created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (id),
           UNIQUE KEY uq_impuestos_nombre (nombre)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
    } else {
      if (!(await columnExists(conn, "impuestos", "regimen"))) {
        await conn.query(
          "ALTER TABLE impuestos ADD COLUMN regimen VARCHAR(100) NOT NULL DEFAULT 'REGIMEN_COMUN' AFTER nombre"
        );
      }
    }

    console.log("[2/7] Adding impuesto_id to productos (if missing)");
    if (!(await columnExists(conn, "productos", "impuesto_id"))) {
      await conn.query(
        "ALTER TABLE productos ADD COLUMN impuesto_id BIGINT(20) UNSIGNED NULL AFTER costo"
      );
    }

    console.log("[3/7] Adding foreign key productos.impuesto_id -> impuestos(id)");
    try {
      await conn.query(
        "ALTER TABLE productos ADD CONSTRAINT fk_productos_impuesto FOREIGN KEY (impuesto_id) REFERENCES impuestos(id) ON DELETE SET NULL"
      );
    } catch {
      // constraint may already exist
    }

    console.log("[4/7] Ensuring default INC (8%) tax exists");
    const [[incRow]] = await conn.query(
      "SELECT id FROM impuestos WHERE nombre = 'INC' LIMIT 1"
    );
    let incId = incRow?.id || null;
    if (!incId) {
      const [ins] = await conn.query(
        "INSERT INTO impuestos (nombre, regimen, porcentaje, created_at, updated_at) VALUES ('INC', 'INC', 8, NOW(), NOW())"
      );
      incId = ins.insertId;
    } else {
      await conn.query(
        "UPDATE impuestos SET porcentaje = 8, regimen = COALESCE(regimen, 'INC'), updated_at = NOW() WHERE id = ?",
        [incId]
      );
    }

    console.log("[5/7] Ensuring regimen column defaults on all registros");
    await conn.query("UPDATE impuestos SET regimen = 'INC' WHERE regimen IS NULL OR regimen = ''");

    console.log("[6/7] Assigning default impuesto_id to existing productos");
    await conn.query(
      "UPDATE productos SET impuesto_id = ? WHERE impuesto_id IS NULL",
      [incId]
    );

    console.log("[7/7] Migration completed successfully");
  } finally {
    conn.release();
    process.exit(0);
  }
}

up().catch((err) => {
  console.error(err);
  process.exit(1);
});
