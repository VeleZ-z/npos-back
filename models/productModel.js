const { pool } = require("../config/mysql");

class ProductDoc {
  constructor(data) {
    this._id = data._id || data.id || null;
    this.name = data.name || data.nombre || "";
    this.price = Number(data.price ?? data.precio ?? 0);
    this.barcode = data.barcode ?? data.codigo_barras ?? null;
    this.quantity = Number(data.quantity ?? data.cantidad ?? 0);
    this.cost = Number(data.cost ?? data.costo ?? 0);
    this.impuestoId = data.impuestoId ?? data.impuesto_id ?? null;
    const taxPercentage = data.taxRate ?? data.impuesto_porcentaje ?? null;
    const taxName = data.taxName ?? data.impuesto_nombre ?? null;
    const taxRegimen = data.taxRegimen ?? data.impuesto_regimen ?? null;
    if (data.tax) {
      this.tax = data.tax;
    } else if (taxName != null || taxPercentage != null || taxRegimen != null) {
      this.tax = {
        _id: this.impuestoId,
        name: taxName,
        percentage: taxPercentage != null ? Number(taxPercentage) : null,
        regimen: taxRegimen || null,
      };
    } else {
      this.tax = null;
    }
    this.taxRate = taxPercentage != null ? Number(taxPercentage) : (this.tax?.percentage ?? null);
    this.estadoId = data.estadoId ?? data.estado_id ?? null; // FK to estados.id (tipo=2 for productos)
    this.estado = data.estado || null; // readable name
    this.categoryId = data.categoryId ?? data.categoria_id ?? null;
    this.category = data.category || null; // { _id, name }
    this.imageUrl = data.imageUrl || null;
    this.alertMinStock = data.alertMinStock ?? data.alerta_min_stock ?? null;
    this.alertaId = data.alertaId ?? data.alerta_id ?? null;
    this.alertMessage = data.alertMessage ?? data.alerta_mensaje ?? null;
  }

  async save() {
    // Insert compatible con transicion de columnas
    // Ensure estado for productos
    if (!this.estadoId) {
      this.estadoId = await getOrCreateProductoEstadoId('ACTIVO');
    }
    const impuestoId = this.impuestoId != null ? this.impuestoId : null;
    let res;
    try {
      [res] = await pool.query(
        `INSERT INTO productos (nombre, codigo_barras, precio, cantidad, alerta_min_stock, alerta_id, costo, impuesto_id, estado_id, categoria_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          this.name,
          this.barcode,
          this.price,
          this.quantity,
          this.alertMinStock,
          this.alertaId,
          this.cost,
          impuestoId,
          this.estadoId,
          this.categoryId,
        ]
      );
    } catch (e) {
      // Si aun existen columnas antiguas, inserta con defaults de transicion
      [res] = await pool.query(
        `INSERT INTO productos (nombre, precio, costo, cantidad, alerta_min_stock, alerta_id, activo, estado_id, categoria_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
        [this.name, this.price, this.cost || 0, this.quantity || 0, this.alertMinStock, this.alertaId, this.estadoId, this.categoryId]
      );
    }
    this._id = res.insertId;
    return this;
  }
}

const Product = function ProductFactory(data) {
  return new ProductDoc(data || {});
};

Product.find = async function () {
  const [rows] = await pool.query(
    `SELECT p.id, p.nombre, p.codigo_barras, p.precio, p.cantidad, p.costo, p.estado_id, p.categoria_id,
            p.alerta_min_stock, p.alerta_id, p.impuesto_id,
            c.nombre AS categoria, e.nombre AS estado,
            a.mensaje_alrt AS alerta_mensaje,
            imp.nombre AS impuesto_nombre, imp.porcentaje AS impuesto_porcentaje, imp.regimen AS impuesto_regimen,
            CASE WHEN pi.producto_id IS NULL THEN 0 ELSE 1 END AS has_image
       FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN estados e ON e.id = p.estado_id
  LEFT JOIN alertas a ON a.id = p.alerta_id
  LEFT JOIN impuestos imp ON imp.id = p.impuesto_id
  LEFT JOIN productos_imagenes pi ON pi.producto_id = p.id
   ORDER BY p.updated_at DESC, p.id DESC`
  );
  return rows.map(r => new ProductDoc({
    id: r.id,
    nombre: r.nombre,
    codigo_barras: r.codigo_barras,
    precio: r.precio,
    cantidad: r.cantidad,
    costo: r.costo,
    estado_id: r.estado_id,
    estado: r.estado || null,
    categoria_id: r.categoria_id,
    category: r.categoria ? { _id: r.categoria_id, name: r.categoria } : null,
    imageUrl: r.has_image ? `/api/product/${r.id}/image` : null,
    alerta_min_stock: r.alerta_min_stock,
    alerta_id: r.alerta_id,
    alerta_mensaje: r.alerta_mensaje,
    impuesto_id: r.impuesto_id,
    impuesto_nombre: r.impuesto_nombre,
    impuesto_porcentaje: r.impuesto_porcentaje,
    impuesto_regimen: r.impuesto_regimen
  }));
};

Product.findById = async function (id) {
  const [rows] = await pool.query(
    `SELECT p.id, p.nombre, p.codigo_barras, p.precio, p.cantidad, p.costo, p.estado_id, p.categoria_id,
            p.alerta_min_stock, p.alerta_id, p.impuesto_id,
            c.nombre AS categoria, e.nombre AS estado,
            a.mensaje_alrt AS alerta_mensaje,
            imp.nombre AS impuesto_nombre, imp.porcentaje AS impuesto_porcentaje, imp.regimen AS impuesto_regimen,
            CASE WHEN pi.producto_id IS NULL THEN 0 ELSE 1 END AS has_image
       FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN estados e ON e.id = p.estado_id
  LEFT JOIN alertas a ON a.id = p.alerta_id
  LEFT JOIN impuestos imp ON imp.id = p.impuesto_id
  LEFT JOIN productos_imagenes pi ON pi.producto_id = p.id
      WHERE p.id = ?
      LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return new ProductDoc({
    id: r.id,
    nombre: r.nombre,
    codigo_barras: r.codigo_barras,
    precio: r.precio,
    cantidad: r.cantidad,
    costo: r.costo,
    estado_id: r.estado_id,
    estado: r.estado || null,
    categoria_id: r.categoria_id,
    category: r.categoria ? { _id: r.categoria_id, name: r.categoria } : null,
    imageUrl: r.has_image ? `/api/product/${r.id}/image` : null,
    alerta_min_stock: r.alerta_min_stock,
    alerta_id: r.alerta_id,
    alerta_mensaje: r.alerta_mensaje,
    impuesto_id: r.impuesto_id,
    impuesto_nombre: r.impuesto_nombre,
    impuesto_porcentaje: r.impuesto_porcentaje,
    impuesto_regimen: r.impuesto_regimen
  });
};

Product.updateById = async function (id, update = {}) {
  const p = await Product.findById(id);
  if (!p) return null;
  const name = update.name ?? p.name;
  const price = update.price != null ? Number(update.price) : p.price;
  const barcode = update.barcode ?? update.codigo_barras ?? p.barcode ?? null;
  const quantity = update.quantity != null ? Number(update.quantity) : p.quantity;
  const cost = update.cost != null ? Number(update.cost) : p.cost;
  const alertMinStock =
    update.alertMinStock !== undefined
      ? (update.alertMinStock === null || update.alertMinStock === '' ? null : Number(update.alertMinStock))
      : (update.alerta_min_stock !== undefined
          ? (update.alerta_min_stock === null || update.alerta_min_stock === '' ? null : Number(update.alerta_min_stock))
          : (p.alertMinStock != null ? Number(p.alertMinStock) : null));
  const alertaId = update.alertaId !== undefined ? update.alertaId : p.alertaId ?? null;
  // Determine estado_id: prefer 'estadoId' from payload; else map boolean 'active'
  let estadoId = update.estadoId ?? p.estadoId;
  if (estadoId == null && typeof update.active === 'boolean') {
    estadoId = await getOrCreateProductoEstadoId(update.active ? 'ACTIVO' : 'INACTIVO');
  }
  const categoryId = update.categoryId ?? p.categoryId;
  const impuestoId = update.impuestoId ?? update.impuesto_id ?? p.impuestoId ?? null;
  await pool.query(
    `UPDATE productos
        SET nombre = ?, codigo_barras = ?, precio = ?, cantidad = ?, costo = ?, impuesto_id = ?, estado_id = ?, categoria_id = ?, alerta_min_stock = ?, alerta_id = ?, updated_at = NOW()
      WHERE id = ?`,
    [name, barcode, price, quantity, cost, impuestoId, estadoId, categoryId, alertMinStock, alertaId, id]
  );
  return await Product.findById(id);
};

// Helpers for estados (tipo=2 => productos)
async function getOrCreateProductoEstadoId(nombre) {
  const upper = String(nombre || '').toUpperCase();
  let id = await findProductoEstadoId(upper);
  if (id) return id;
  await pool.query(
    "INSERT INTO estados (nombre, tipo, created_at, updated_at) VALUES (?, 2, NOW(), NOW())",
    [upper]
  );
  id = await findProductoEstadoId(upper);
  return id;
}

async function findProductoEstadoId(nombre) {
  const [[row]] = await pool.query(
    "SELECT id FROM estados WHERE nombre = ? AND tipo = 2 LIMIT 1",
    [nombre]
  );
  return row?.id || null;
}

Product.deleteById = async function (id) {
  await pool.query("DELETE FROM productos WHERE id = ?", [id]);
  return true;
};

module.exports = Product;

