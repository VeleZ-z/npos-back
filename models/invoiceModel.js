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

class InvoiceDoc {
  constructor(data) {
    this.invoiceNumber = data.invoiceNumber;
    this.issuer = data.issuer || {};
    this.customer = data.customer || {};
    this.invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date();
    this.paymentType = data.paymentType || "CONTADO";
    this.paymentMethod = data.paymentMethod;
    this.paymentMethodId = data.paymentMethodId || null;
    this.items = data.items || [];
    this.totals = data.totals || { subtotal: 0, totalTax: 0, total: 0 };
    this.tip = Number(data.tip || 0);
    this.cashAmount = Number(
      data.cashAmount != null ? data.cashAmount : this.totals.total || 0
    );
    this.change = Number(data.change || 0);
    this.electronic = data.electronic || { isElectronic: false };
    this.order = data.order; // pedido_id
    this.processedBy = normalizeUserId(data.processedBy);
    this.customerUserId = normalizeUserId(
      data.customerUserId ?? data.customer?.user ?? data.customer?.userId
    );
    this.status = data.status || "EMITIDA";
    this.invoiceStateId = data.invoiceStateId || null;
    this.notes = data.notes || null;
    this._id = data._id || null;
    this.createdAt = data.createdAt ? new Date(data.createdAt) : null;
    this.cuadreId = normalizeUserId(data.cuadreId ?? data.cuadre_id);
  }

  async save() {
    const [res] = await pool.query(
      `INSERT INTO facturas (
        numero_factura, subTotal, impuestos, propina, total, monto, cambio,
        pedido_id, cuadre_id, estado_factura_id, metodos_pago_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        this.invoiceNumber,
        this.totals.subtotal || 0,
        this.totals.totalTax || 0,
        this.tip,
        this.totals.total || 0,
        this.cashAmount,
        this.change,
        this.order,
        this.cuadreId || null,
        this.invoiceStateId || null,
        this.paymentMethodId || null
      ]
    );
    this._id = res.insertId;
    this.createdAt = new Date();

    if (this.order) {
      try {
        await pool.query(
          `UPDATE pedidos
              SET usuario_cajero_id = COALESCE(usuario_cajero_id, ?),
                  usuario_cliente_id = COALESCE(usuario_cliente_id, ?),
                  updated_at = NOW()
            WHERE id = ?`,
          [this.processedBy || null, this.customerUserId || null, this.order]
        );
      } catch {}
    }

    return this;
  }
}

function shapeInvoiceFromRow(row) {
  const processedBy = row.pedido_usuario_cajero_id || row.usuario_cajero_id || null;
  const customerUserId = row.pedido_usuario_cliente_id || row.usuario_cliente_id || null;
  const doc = new InvoiceDoc({
    _id: row.id,
    invoiceNumber: row.numero_factura,
    invoiceDate: row.created_at,
    paymentMethod: null,
    paymentMethodId: row.metodos_pago_id || null,
    invoiceStateId: row.estado_factura_id || null,
    order: row.pedido_id,
    processedBy,
    customerUserId,
    status: null,
    tip: row.propina,
    cashAmount: row.monto,
    change: row.cambio,
    createdAt: row.created_at,
    totals: {
      subtotal: row.subTotal,
      totalTax: row.impuestos,
      total: row.total
    },
    cuadreId: row.cuadre_id || null
  });
  return doc;
}

const Invoice = function InvoiceFactory(data) {
  return new InvoiceDoc(data || {});
};

Invoice.findOne = function () {
  return {
    sort: async () => {
      const [rows] = await pool.query(`
        SELECT f.*, p.usuario_cliente_id AS pedido_usuario_cliente_id, p.usuario_cajero_id AS pedido_usuario_cajero_id
          FROM facturas f
          LEFT JOIN pedidos p ON p.id = f.pedido_id
         ORDER BY f.created_at DESC
         LIMIT 1`);
      if (rows.length === 0) return null;
      return shapeInvoiceFromRow(rows[0]);
    }
  };
};

Invoice.findById = function (id) {
  return {
    populate: function () { return this; },
    async exec() {
      const [rows] = await pool.query(
        `SELECT f.*, p.usuario_cliente_id AS pedido_usuario_cliente_id, p.usuario_cajero_id AS pedido_usuario_cajero_id
           FROM facturas f
           LEFT JOIN pedidos p ON p.id = f.pedido_id
          WHERE f.id = ?`,
        [id]
      );
      if (rows.length === 0) return null;
      return shapeInvoiceFromRow(rows[0]);
    }
  };
};

Invoice.find = function (filter = {}) {
  return {
    populate: function () { return this; },
    sort: function () { return this; },
    limit: async function (n) {
      let sql =
        "SELECT f.*, p.usuario_cliente_id AS pedido_usuario_cliente_id, p.usuario_cajero_id AS pedido_usuario_cajero_id FROM facturas f LEFT JOIN pedidos p ON p.id = f.pedido_id";
      const params = [];
      if (filter.invoiceDate && filter.invoiceDate.$gte && filter.invoiceDate.$lte) {
        sql += " WHERE f.created_at BETWEEN ? AND ?";
        params.push(new Date(filter.invoiceDate.$gte), new Date(filter.invoiceDate.$lte));
      }
      sql += " ORDER BY f.created_at DESC LIMIT ?";
      params.push(Number(n) || 50);
      const [rows] = await pool.query(sql, params);
      return rows.map(shapeInvoiceFromRow);
    }
  };
};

module.exports = Invoice;

