const { pool } = require("../config/mysql");

function normalizeUserId(value) {
  if (value == null) return null;
  if (typeof value === "object") {
    if (value._id != null) return normalizeUserId(value._id);
    if (value.id != null) return normalizeUserId(value.id);
    if (value.userId != null) return normalizeUserId(value.userId);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

class OrderDoc {
  constructor(data) {
    this.customer = data.customer; // include { userId, name, ... }
    this.orderStatus = data.orderStatus || "PENDIENTE";
    this.orderDate = data.orderDate ? new Date(data.orderDate) : new Date();
    this.items = data.items || [];
    this.bills = data.bills || { subtotal: 0, tax: 0, total: 0 };
    this.table = data.table; // mesa id
    this.estadoId = data.estadoId || data.estado_id || null; // FK a estados (tipo=3: pedidos)
    this.paymentStatus = data.paymentStatus || "PENDIENTE";
    this.invoice = data.invoice || null;
    this.waiter = data.waiter || null;
    this.notes = data.notes || null;
    this._id = data._id || null;
    this.customerUserId = normalizeUserId(
      data.customerUserId ?? data.usuario_cliente_id ?? data.customer_user_id ?? data.customer?.user ?? data.customer?.userId
    );
    this.cashierUserId = normalizeUserId(
      data.cashierUserId ?? data.usuario_cajero_id ?? data.cashier_user_id ?? data.processedBy
    );
  }

  async save() {
    if (!this.estadoId) {
      this.estadoId = await getOrCreatePedidoEstadoId(this.orderStatus || 'PENDIENTE');
    }
    let res;
    try {
      [res] = await pool.query(
        "INSERT INTO pedidos (mesa_id, estado_id, usuario_cliente_id, usuario_cajero_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
        [this.table || null, this.estadoId, this.customerUserId || null, this.cashierUserId || null]
      );
    } catch (e) {
      // Fallback si columna no existe (compatibilidad antigua)
      [res] = await pool.query(
        "INSERT INTO pedidos (mesa_id, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [this.table || null]
      );
      if (this.customerUserId || this.cashierUserId) {
        try {
          await pool.query(
            "UPDATE pedidos SET usuario_cliente_id = ?, usuario_cajero_id = ? WHERE id = ?",
            [this.customerUserId || null, this.cashierUserId || null, res.insertId]
          );
        } catch {}
      }
    }
    this._id = res.insertId;

    const customerPayload = this.customer ? { ...this.customer } : null;
    if (customerPayload) {
      if (this.customerUserId && customerPayload.user == null && customerPayload.userId == null) {
        customerPayload.userId = this.customerUserId;
        customerPayload.user = { _id: this.customerUserId };
      } else if (customerPayload.user && typeof customerPayload.user === "object") {
        if (this.customerUserId && customerPayload.user._id == null) {
          customerPayload.user._id = this.customerUserId;
        }
      }
    }

    await pool.query(
      "INSERT INTO orders_json (pedido_id, json, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
      [this._id, JSON.stringify({
        customer: customerPayload || this.customer,
        orderStatus: this.orderStatus,
        items: this.items,
        bills: this.bills,
        table: this.table,
        paymentStatus: this.paymentStatus,
        invoice: this.invoice,
        waiter: this.waiter,
        notes: this.notes,
        customerUserId: this.customerUserId || null,
        cashierUserId: this.cashierUserId || null
      })]
    );

    // Persist line items into productos_x_pedidos for kitchen and invoicing
    try {
      const items = Array.isArray(this.items) ? this.items : [];
      for (const it of items) {
        const productoId = Number(it.productId || it.product_id);
        const cantidad = Number(it.quantity || it.cantidad || 0);
        const nota = it.note || it.nota || null;
        if (!productoId || !cantidad || cantidad <= 0) continue;

        const unitPrice =
          Number(it.pricePerQuantity || it.price || it.unitPrice || 0) || 0;
        const originalPrice =
          Number(it.originalPrice || it.pricePerQuantity || unitPrice) || unitPrice;
        const descuento = it.discount || {};
        const descuentoId = descuento.id || descuento.descuento_id || null;
        const descuentoNombre = descuento.name || descuento.descuento_nombre || null;
        const descuentoTipo = descuento.type || descuento.descuento_tipo || null;
        const descuentoValor =
          descuento.value != null ? Number(descuento.value) : null;

        await pool.query(
          `INSERT INTO productos_x_pedidos (
              cantidad,
              printed_qty,
              nota,
              producto_id,
              pedido_id,
              precio_unitario,
              precio_original,
              descuento_id,
              descuento_nombre,
              descuento_tipo,
              descuento_valor,
              created_at,
              updated_at
            )
            VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            cantidad,
            nota,
            productoId,
            this._id,
            unitPrice,
            originalPrice,
            descuentoId ? Number(descuentoId) : null,
            descuentoNombre || null,
            descuentoTipo || null,
            descuentoValor,
          ]
        );
      }
    } catch {}
    return this;
  }
}

function shapeOrderFromRow(row, parsed) {
  const shaped = new OrderDoc({
    ...parsed,
    _id: row.pedido_id,
    usuario_cliente_id: row.usuario_cliente_id,
    usuario_cajero_id: row.usuario_cajero_id
  });
  shaped.orderDate = new Date(row.created_at || Date.now());
  if (row.mesa_numero != null) {
    shaped.table = { number: row.mesa_numero };
  } else {
    shaped.table = shaped.table || null;
  }
  if (row.estado_id != null) {
    shaped.estadoId = row.estado_id;
  }
  if (shaped.customer && shaped.customerUserId) {
    if (!shaped.customer.user) {
      shaped.customer.user = { _id: shaped.customerUserId };
    } else if (shaped.customer.user && shaped.customer.user._id == null) {
      shaped.customer.user._id = shaped.customerUserId;
    }
    if (!shaped.customer.userId) {
      shaped.customer.userId = shaped.customerUserId;
    }
  }
  return shaped;
}

async function normalizeMesaIdValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  const [[byId]] = await pool.query("SELECT id FROM mesas WHERE id = ? LIMIT 1", [num]);
  if (byId?.id) return byId.id;
  const [[byNumber]] = await pool.query("SELECT id FROM mesas WHERE numero = ? LIMIT 1", [num]);
  return byNumber?.id || null;
}

async function getOrderJsonById(id) {
  const [rows] = await pool.query(
    `SELECT oj.pedido_id, oj.json, p.created_at, p.estado_id, p.usuario_cliente_id, p.usuario_cajero_id, m.numero AS mesa_numero
       FROM orders_json oj
       JOIN pedidos p ON p.id = oj.pedido_id
       LEFT JOIN mesas m ON m.id = p.mesa_id
      WHERE oj.pedido_id = ?
      LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const parsed = JSON.parse(rows[0].json);
  return shapeOrderFromRow(rows[0], parsed);
}

const Order = function OrderFactory(data) {
  return new OrderDoc(data || {});
};

Order.findById = async function (id) {
  return await getOrderJsonById(id);
};

Order.find = function () {
  return {
    populate: async () => {
      const [rows] = await pool.query(
        `SELECT oj.pedido_id, oj.json, p.created_at, p.estado_id, p.usuario_cliente_id, p.usuario_cajero_id, m.numero AS mesa_numero
           FROM orders_json oj
           JOIN pedidos p ON p.id = oj.pedido_id
           LEFT JOIN mesas m ON m.id = p.mesa_id
         ORDER BY p.created_at DESC`
      );
      return rows.map(r => shapeOrderFromRow(r, JSON.parse(r.json)));
    }
  };
};

Order.findByIdAndUpdate = async function (id, update = {}, options = {}) {
  const current = await getOrderJsonById(id);
  if (!current) return null;
  const next = { ...current, ...update };
  const toPersist = {
    customer: next.customer,
    orderStatus: next.orderStatus,
    items: next.items,
    bills: next.bills,
    table: next.table,
    paymentStatus: next.paymentStatus,
    invoice: next.invoice,
    waiter: next.waiter,
    notes: next.notes,
    customerUserId: next.customerUserId || null,
    cashierUserId: next.cashierUserId || null
  };
  await pool.query(
    "UPDATE orders_json SET json = ?, updated_at = NOW() WHERE pedido_id = ?",
    [JSON.stringify(toPersist), id]
  );
  if (update.orderStatus) {
    try {
      const estadoId = await getOrCreatePedidoEstadoId(update.orderStatus);
      await pool.query("UPDATE pedidos SET estado_id = ?, updated_at = NOW() WHERE id = ?", [estadoId, id]);
    } catch {}
  }
  // Mesa binding
  try {
    let mesaId = null;
    const t = update.table != null ? update.table : next.table;
    if (t != null) {
      if (typeof t === 'object') {
        const candidates = [t.tableId, t.id, t._id, t.number, t.tableNo];
        for (const candidate of candidates) {
          mesaId = await normalizeMesaIdValue(candidate);
          if (mesaId) break;
        }
      } else {
        mesaId = await normalizeMesaIdValue(t);
      }
    }
    if (mesaId) {
      await pool.query("UPDATE pedidos SET mesa_id = ?, updated_at = NOW() WHERE id = ?", [mesaId, id]);
    }
  } catch {}
  // Usuario cliente / cajero binding
  try {
    if (Object.prototype.hasOwnProperty.call(update, "customerUserId") || Object.prototype.hasOwnProperty.call(update, "usuario_cliente_id") || (update.customer && (update.customer.userId != null || (update.customer.user && update.customer.user._id != null)))) {
      const customerId = normalizeUserId(
        update.customerUserId ?? update.usuario_cliente_id ?? (update.customer ? (update.customer.userId ?? update.customer.user) : undefined)
      );
      next.customerUserId = customerId || null;
      await pool.query("UPDATE pedidos SET usuario_cliente_id = ?, updated_at = NOW() WHERE id = ?", [customerId || null, id]);
    }
    if (Object.prototype.hasOwnProperty.call(update, "cashierUserId") || Object.prototype.hasOwnProperty.call(update, "usuario_cajero_id") || update.processedBy != null) {
      const cashierId = normalizeUserId(
        update.cashierUserId ?? update.usuario_cajero_id ?? update.processedBy
      );
      next.cashierUserId = cashierId || null;
      await pool.query("UPDATE pedidos SET usuario_cajero_id = ?, updated_at = NOW() WHERE id = ?", [cashierId || null, id]);
    }
  } catch {}
  return await getOrderJsonById(id);
};

module.exports = Order;

// Helpers para estados de pedidos (tipo = 3)
async function getOrCreatePedidoEstadoId(nombre) {
  const upper = String(nombre || '').toUpperCase();
  let id = await findPedidoEstadoId(upper);
  if (id) return id;
  await pool.query(
    "INSERT INTO estados (nombre, tipo, created_at, updated_at) VALUES (?, 3, NOW(), NOW())",
    [upper]
  );
  id = await findPedidoEstadoId(upper);
  return id;
}

async function findPedidoEstadoId(nombre) {
  const [[row]] = await pool.query(
    "SELECT id FROM estados WHERE nombre = ? AND tipo = 3 LIMIT 1",
    [nombre]
  );
  return row?.id || null;
}
