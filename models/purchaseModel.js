const { pool } = require("../config/mysql");

class PurchaseDoc {
  constructor(data) {
    this._id = data._id || data.id || null;
    this.name = data.name || data.nombre || "";
    this.quantity = Number(data.quantity ?? data.cantidad ?? 0);
    this.stock = data.stock != null ? Number(data.stock) : (data.cantidad != null ? Number(data.cantidad) : null);
    this.deliveryDate = data.deliveryDate || data.entrega || null;
    this.expirationDate = data.expirationDate || data.vencimiento || null;
    this.cost = Number(data.cost ?? data.costo ?? 0);
    this.estadoCompraId = data.estadoCompraId ?? data.estado_compra_id ?? null;
    this.providerId = data.providerId ?? data.proveedore_id ?? null;
    this.alertMinStock = data.alertMinStock ?? data.alerta_min_stock ?? null;
    this.alertaId = data.alertaId ?? data.alerta_id ?? null;
    this.unit = data.unit || data.unidadMedida || data.unidad_medida || null;
    this.provider = data.provider || null; // { _id, name }
  }

  async save() {
    let res;
    try {
      [res] = await pool.query(
        `INSERT INTO compras (nombre, cantidad, stock, entrega, vencimiento, costo, unidad_medida, estado_compra_id, proveedore_id, alerta_min_stock, alerta_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [this.name, this.quantity, this.quantity, this.deliveryDate, this.expirationDate, this.cost, this.unit, this.estadoCompraId, this.providerId, this.alertMinStock, this.alertaId]
      );
    } catch (e) {
      // fallback if alerta_* columns don't exist yet
      [res] = await pool.query(
        `INSERT INTO compras (nombre, cantidad, stock, entrega, vencimiento, costo, unidad_medida, estado_compra_id, proveedore_id, alerta_min_stock, alerta_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [this.name, this.quantity, this.quantity, this.deliveryDate, this.expirationDate, this.cost, this.unit, this.estadoCompraId, this.providerId, this.alertMinStock, this.alertaId]
      );
    }
    this._id = res.insertId;
    return this;
  }
}

const Purchase = function PurchaseFactory(data) {
  return new PurchaseDoc(data || {});
};

Purchase.find = async function () {
  const [rows] = await pool.query(
    `SELECT c.id, c.nombre, c.cantidad, c.stock, c.entrega, c.vencimiento, c.costo, c.unidad_medida,
            c.estado_compra_id, c.proveedore_id, c.alerta_min_stock, c.alerta_id,
            a.mensaje_alrt AS alerta_mensaje,
            p.nombre AS proveedor
       FROM compras c
  LEFT JOIN proveedores p ON p.id = c.proveedore_id
  LEFT JOIN alertas a ON a.id = c.alerta_id
   ORDER BY c.updated_at DESC, c.id DESC`
  );
  return rows.map(r => new PurchaseDoc({
    id: r.id,
    nombre: r.nombre,
    cantidad: r.cantidad,
    stock: r.stock,
    entrega: r.entrega,
    vencimiento: r.vencimiento,
    costo: r.costo,
    estado_compra_id: r.estado_compra_id,
    proveedore_id: r.proveedore_id,
    alerta_min_stock: r.alerta_min_stock,
    alerta_id: r.alerta_id,
    alertMessage: r.alerta_mensaje,
    unidad_medida: r.unidad_medida,
    provider: r.proveedor ? { _id: r.proveedore_id, name: r.proveedor } : null
  }));
};

Purchase.findById = async function (id) {
  const [rows] = await pool.query(
    `SELECT c.id, c.nombre, c.cantidad, c.stock, c.entrega, c.vencimiento, c.costo, c.unidad_medida,
            c.estado_compra_id, c.proveedore_id, c.alerta_min_stock, c.alerta_id,
            a.mensaje_alrt AS alerta_mensaje,
            p.nombre AS proveedor
       FROM compras c
  LEFT JOIN proveedores p ON p.id = c.proveedore_id
  LEFT JOIN alertas a ON a.id = c.alerta_id
      WHERE c.id = ?
      LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return new PurchaseDoc({
    id: r.id,
    nombre: r.nombre,
    cantidad: r.cantidad,
    stock: r.stock,
    entrega: r.entrega,
    vencimiento: r.vencimiento,
    costo: r.costo,
    estado_compra_id: r.estado_compra_id,
    proveedore_id: r.proveedore_id,
    alerta_min_stock: r.alerta_min_stock,
    alerta_id: r.alerta_id,
    alertMessage: r.alerta_mensaje,
    unidad_medida: r.unidad_medida,
    provider: r.proveedor ? { _id: r.proveedore_id, name: r.proveedor } : null
  });
};

Purchase.updateById = async function (id, update = {}) {
  const p = await Purchase.findById(id);
  if (!p) return null;
  const name = update.name ?? p.name;
  const quantity = update.quantity != null ? Number(update.quantity) : p.quantity;
  const deliveryDate = update.deliveryDate ?? p.deliveryDate;
  const expirationDate = update.expirationDate ?? p.expirationDate;
  const cost = update.cost != null ? Number(update.cost) : p.cost;
  const estadoCompraId = update.estadoCompraId ?? p.estadoCompraId;
  const providerId = update.providerId ?? p.providerId;
  const alertMinStock = update.alertMinStock ?? p.alertMinStock;
  const alertaId = update.alertaId ?? p.alertaId ?? null;
  const unit = update.unit ?? update.unidadMedida ?? update.unidad_medida ?? p.unit;
  try {
    await pool.query(
      `UPDATE compras
          SET nombre = ?, cantidad = ?, stock = ?, entrega = ?, vencimiento = ?, costo = ?, unidad_medida = ?,
              estado_compra_id = ?, proveedore_id = ?, alerta_min_stock = ?, alerta_id = ?, updated_at = NOW()
        WHERE id = ?`,
      [name, quantity, quantity, deliveryDate, expirationDate, cost, unit, estadoCompraId, providerId, alertMinStock, alertaId, id]
    );
  } catch (e) {
    await pool.query(
      `UPDATE compras
          SET nombre = ?, cantidad = ?, stock = ?, entrega = ?, vencimiento = ?, costo = ?,
              estado_compra_id = ?, proveedore_id = ?, updated_at = NOW()
        WHERE id = ?`,
      [name, quantity, quantity, deliveryDate, expirationDate, cost, estadoCompraId, providerId, id]
    );
  }
  return await Purchase.findById(id);
};

Purchase.updateQuantity = async function (id, quantity) {
  await pool.query(
    `UPDATE compras SET stock = ?, updated_at = NOW() WHERE id = ?`,
    [Number(quantity), id]
  );
  return await Purchase.findById(id);
};

Purchase.deleteById = async function (id) {
  await pool.query("DELETE FROM compras WHERE id = ?", [id]);
  return true;
};

module.exports = Purchase;
