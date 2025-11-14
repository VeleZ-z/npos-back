const { pool } = require("../config/mysql");

async function columnExists(conn, table, column) {
  const [rows] = await conn.query("SHOW COLUMNS FROM ?? LIKE ?", [table, column]);
  return rows.length > 0;
}

let imageColumnsEnsured = false;
async function ensureImageColumns() {
  if (imageColumnsEnsured) return;
  const conn = await pool.getConnection();
  try {
    const hasData = await columnExists(conn, "descuentos", "imagen_data");
    if (!hasData) {
      await conn.query(
        "ALTER TABLE descuentos ADD COLUMN imagen_data LONGBLOB NULL AFTER imagen_path"
      );
    }
    const hasMime = await columnExists(conn, "descuentos", "imagen_mime");
    if (!hasMime) {
      await conn.query(
        "ALTER TABLE descuentos ADD COLUMN imagen_mime VARCHAR(100) NULL AFTER imagen_data"
      );
    }
    imageColumnsEnsured = true;
  } finally {
    conn.release();
  }
}

const bufferToDataUri = (buffer, mime) => {
  if (!buffer) return null;
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const type = mime || "image/png";
  return `data:${type};base64,${data.toString("base64")}`;
};

const mapRow = (r) => {
  const inline = bufferToDataUri(r.imagen_data, r.imagen_mime);
  return {
    _id: r.id,
    name: r.nombre,
    value: r.valor,
    percent: r.porciento,
    active: !!r.is_activo,
    message: r.mensaje || null,
    imageUrl: inline || r.imagen_path || null,
    imageInline: inline,
    imageMime: r.imagen_mime || null,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
    products: r.products || [],
  };
};

const Discount = {};

async function attachProducts(discountId, productIds) {
  await pool.query(
    "DELETE FROM descuentos_x_productos WHERE descuento_id = ?",
    [discountId]
  );
  if (!Array.isArray(productIds) || !productIds.length) return;
  const first = Number(productIds[0]);
  if (!first) return;
  await pool.query(
    `INSERT INTO descuentos_x_productos (producto_id, descuento_id, created_at, updated_at)
     VALUES (?, ?, NOW(), NOW())`,
    [first, discountId]
  );
}

async function fetchProducts(discountId) {
  const [rows] = await pool.query(
    `SELECT dp.producto_id AS productId, p.nombre AS name
       FROM descuentos_x_productos dp
  LEFT JOIN productos p ON p.id = dp.producto_id
      WHERE dp.descuento_id = ?`,
    [discountId]
  );
  return rows.map((r) => ({
    productId: r.productId,
    name: r.name,
  }));
}

Discount.findActive = async function () {
  await ensureImageColumns();
  const [rows] = await pool.query(
    `SELECT id, nombre, valor, porciento, is_activo, mensaje, imagen_path, imagen_data, imagen_mime, created_at, updated_at
       FROM descuentos
      WHERE is_activo = 1
      ORDER BY updated_at DESC, id DESC`
  );
  const mapped = rows.map(mapRow);
  for (const row of mapped) {
    row.products = await fetchProducts(row._id);
  }
  return mapped;
};

Discount.findAll = async function () {
  await ensureImageColumns();
  const [rows] = await pool.query(
    `SELECT id, nombre, valor, porciento, is_activo, mensaje, imagen_path, imagen_data, imagen_mime, created_at, updated_at
       FROM descuentos
      ORDER BY updated_at DESC, id DESC`
  );
  const mapped = rows.map(mapRow);
  for (const row of mapped) {
    row.products = await fetchProducts(row._id);
  }
  return mapped;
};

Discount.findById = async function (id) {
  await ensureImageColumns();
  const [rows] = await pool.query(
    `SELECT id, nombre, valor, porciento, is_activo, mensaje, imagen_path, imagen_data, imagen_mime, created_at, updated_at
       FROM descuentos
      WHERE id = ?
      LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  const mapped = mapRow(rows[0]);
  mapped.products = await fetchProducts(mapped._id);
  return mapped;
};

Discount.create = async function ({
  name,
  value,
  percent,
  active,
  message,
  imageUrl,
  imageData,
  imageMime,
  productIds,
}) {
  await ensureImageColumns();
  const [res] = await pool.query(
    `INSERT INTO descuentos
      (nombre, valor, porciento, is_activo, mensaje, imagen_path, imagen_data, imagen_mime, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      name,
      value != null ? Number(value) : null,
      percent != null ? Number(percent) : null,
      active ? 1 : 0,
      message || null,
      imageUrl || null,
      imageData || null,
      imageMime || null,
    ]
  );
  await attachProducts(res.insertId, productIds);
  return await Discount.findById(res.insertId);
};

Discount.updateById = async function (id, data) {
  await ensureImageColumns();
  const current = await Discount.findById(id);
  if (!current) return null;
  const next = {
    name: data.name ?? current.name,
    value:
      data.value !== undefined ? Number(data.value) : Number(current.value),
    percent:
      data.percent !== undefined
        ? Number(data.percent)
        : Number(current.percent),
    active: data.active !== undefined ? !!data.active : current.active,
    message: data.message !== undefined ? data.message : current.message,
    imageUrl: data.imageUrl,
    imageData: data.imageData,
    imageMime: data.imageMime,
  };

  const fields = [
    { sql: "nombre = ?", value: next.name },
    { sql: "valor = ?", value: next.value },
    { sql: "porciento = ?", value: next.percent },
    { sql: "is_activo = ?", value: next.active ? 1 : 0 },
    { sql: "mensaje = ?", value: next.message || null },
  ];

  if (next.imageUrl !== undefined) {
    fields.push({ sql: "imagen_path = ?", value: next.imageUrl || null });
  }
  if (next.imageData !== undefined) {
    fields.push({ sql: "imagen_data = ?", value: next.imageData || null });
  }
  if (next.imageMime !== undefined) {
    fields.push({ sql: "imagen_mime = ?", value: next.imageMime || null });
  }

  const setClause = fields.map((f) => f.sql).join(", ") + ", updated_at = NOW()";
  const params = fields.map((f) => f.value);
  params.push(id);

  await pool.query(`UPDATE descuentos SET ${setClause} WHERE id = ?`, params);

  if (data.productIds) {
    await attachProducts(id, data.productIds);
  }
  return await Discount.findById(id);
};

module.exports = Discount;
