const { pool } = require("../config/mysql");

const mapRow = (r) => ({
  _id: r.id,
  name: r.nombre,
  value: r.valor,
  percent: r.porciento,
  active: !!r.is_activo,
  message: r.mensaje || null,
  imageUrl: r.imagen_path || null,
  createdAt: r.created_at || null,
  updatedAt: r.updated_at || null,
  products: r.products || [],
});

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
  const [rows] = await pool.query(
    `SELECT id, nombre, valor, porciento, is_activo, mensaje, imagen_path, created_at, updated_at
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
  const [rows] = await pool.query(
    `SELECT id, nombre, valor, porciento, is_activo, mensaje, imagen_path, created_at, updated_at
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
  const [rows] = await pool.query(
    `SELECT id, nombre, valor, porciento, is_activo, mensaje, imagen_path, created_at, updated_at
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
  productIds,
}) {
  const [res] = await pool.query(
    `INSERT INTO descuentos
      (nombre, valor, porciento, is_activo, mensaje, imagen_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      name,
      value != null ? Number(value) : null,
      percent != null ? Number(percent) : null,
      active ? 1 : 0,
      message || null,
      imageUrl || null,
    ]
  );
  await attachProducts(res.insertId, productIds);
  return await Discount.findById(res.insertId);
};

Discount.updateById = async function (id, data) {
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
    imageUrl: data.imageUrl !== undefined ? data.imageUrl : current.imageUrl,
  };
  await pool.query(
    `UPDATE descuentos
        SET nombre = ?, valor = ?, porciento = ?, is_activo = ?, mensaje = ?, imagen_path = ?, updated_at = NOW()
      WHERE id = ?`,
    [
      next.name,
      next.value,
      next.percent,
      next.active ? 1 : 0,
      next.message || null,
      next.imageUrl || null,
      id,
    ]
  );
  if (data.productIds) {
    await attachProducts(id, data.productIds);
  }
  return await Discount.findById(id);
};

module.exports = Discount;
