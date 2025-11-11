const { pool } = require("../config/mysql");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    "SHOW COLUMNS FROM ?? LIKE ?",
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [table]
  );
  return rows[0]?.total > 0;
}

async function ensureEstado(conn, nombre) {
  const upper = String(nombre || "").toUpperCase();
  const [[row]] = await conn.query(
    "SELECT id FROM estados WHERE nombre = ? AND tipo = 7 LIMIT 1",
    [upper]
  );
  if (row?.id) return row.id;
  const [res] = await conn.query(
    "INSERT INTO estados (nombre, tipo, created_at, updated_at) VALUES (?, 7, NOW(), NOW())",
    [upper]
  );
  return res.insertId;
}

async function up() {
  const conn = await pool.getConnection();
  try {
    console.log("[1/5] Ensuring estados for cuadres (ABIERTO, CERRADO, ANULADO)");
    const estados = {};
    for (const nombre of ["ABIERTO", "CERRADO", "ANULADO"]) {
      estados[nombre] = await ensureEstado(conn, nombre);
    }

    console.log("[2/5] Creating table cuadres (if missing)");
    if (!(await tableExists(conn, "cuadres"))) {
      await conn.query(`
        CREATE TABLE cuadres (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          usuario_apertura_id BIGINT UNSIGNED NOT NULL,
          usuario_cierre_id BIGINT UNSIGNED NULL,
          fecha_apertura DATETIME NOT NULL,
          fecha_cierre DATETIME NULL,
          saldo_inicial DECIMAL(10,2) NOT NULL DEFAULT 0,
          saldo_teorico DECIMAL(10,2) NOT NULL DEFAULT 0,
          saldo_real DECIMAL(10,2) NOT NULL DEFAULT 0,
          diferencia DECIMAL(10,2) NOT NULL DEFAULT 0,
          gastos DECIMAL(10,2) NOT NULL DEFAULT 0,
          estado_id BIGINT UNSIGNED NOT NULL,
          observaciones TEXT NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_cuadres_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE RESTRICT,
          CONSTRAINT fk_cuadres_usuario_apertura FOREIGN KEY (usuario_apertura_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
          CONSTRAINT fk_cuadres_usuario_cierre FOREIGN KEY (usuario_cierre_id) REFERENCES usuarios(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    } else {
      // ensure columns exist / alter if necessary
      const addColumn = async (name, definition) => {
        if (!(await columnExists(conn, "cuadres", name))) {
          await conn.query(`ALTER TABLE cuadres ADD COLUMN ${definition}`);
        }
      };
      await addColumn("usuario_apertura_id", "usuario_apertura_id BIGINT UNSIGNED NOT NULL");
      await addColumn("usuario_cierre_id", "usuario_cierre_id BIGINT UNSIGNED NULL");
      await addColumn("fecha_apertura", "fecha_apertura DATETIME NOT NULL");
      await addColumn("fecha_cierre", "fecha_cierre DATETIME NULL");
      await addColumn("saldo_inicial", "saldo_inicial DECIMAL(10,2) NOT NULL DEFAULT 0");
      await addColumn("saldo_teorico", "saldo_teorico DECIMAL(10,2) NOT NULL DEFAULT 0");
      await addColumn("saldo_real", "saldo_real DECIMAL(10,2) NOT NULL DEFAULT 0");
      await addColumn("diferencia", "diferencia DECIMAL(10,2) NOT NULL DEFAULT 0");
      await addColumn("gastos", "gastos DECIMAL(10,2) NOT NULL DEFAULT 0");
      await addColumn("estado_id", "estado_id BIGINT UNSIGNED NOT NULL DEFAULT " + estados.ABIERTO);
      await addColumn("observaciones", "observaciones TEXT NULL");
      await addColumn("created_at", "created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
      await addColumn("updated_at", "updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    }

    console.log("[3/5] Updating cuadres default estado to ABIERTO when null");
    await conn.query(
      "UPDATE cuadres SET estado_id = ? WHERE estado_id IS NULL",
      [estados.ABIERTO]
    );

    console.log("[4/5] Adding column cuadre_id to facturas (if missing)");
    if (!(await columnExists(conn, "facturas", "cuadre_id"))) {
      await conn.query(
        "ALTER TABLE facturas ADD COLUMN cuadre_id BIGINT UNSIGNED NULL AFTER pedido_id"
      );
    }

    console.log("[5/5] Adding foreign key facturas.cuadre_id -> cuadres.id");
    try {
      await conn.query(
        "ALTER TABLE facturas ADD CONSTRAINT fk_facturas_cuadre FOREIGN KEY (cuadre_id) REFERENCES cuadres(id) ON DELETE SET NULL"
      );
    } catch {
      // constraint may already exist
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
