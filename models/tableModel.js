const { pool } = require("../config/mysql");

// Mongoose-like wrapper for Tables using MySQL `mesas`
// Exposes: new Table({ tableNo, seats }).save(),
//          Table.findOne({ tableNo }), Table.find(), Table.findByIdAndUpdate(id, update)

class TableDoc {
  constructor(data) {
    this.tableNo = data.tableNo ?? data.number;
    this.seats = data.seats ?? data.capacity;
    this.status = data.status ?? "Available";
    this.currentOrder = data.currentOrder ?? null;
  }

  async save() {
    const [rows] = await pool.query(
      "SELECT id FROM mesas WHERE numero = ?",
      [this.tableNo]
    );
    if (rows.length > 0) {
      // Already exists -> return shaped record
      const id = rows[0].id;
      return shapeTable({ id, numero: this.tableNo, capacidad: this.seats });
    }
    const [res] = await pool.query(
      "INSERT INTO mesas (numero, capacidad, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
      [this.tableNo, this.seats]
    );
    return shapeTable({ id: res.insertId, numero: this.tableNo, capacidad: this.seats });
  }
}

function shapeTable(row, extra = {}) {
  return {
    _id: row.id,
    number: row.numero,
    capacity: row.capacidad,
    status: extra.status ?? "Available",
    currentOrder: extra.currentOrder ?? null
  };
}

async function computeStatusForTable(tableId) {
  const [rows] = await pool.query(
    `SELECT
         SUM(CASE WHEN e.id IS NULL OR UPPER(e.nombre) NOT IN ('CERRADO','POR_APROBAR') THEN 1 ELSE 0 END) AS booked_count,
         SUM(
           CASE
             WHEN UPPER(e.nombre) = 'POR_APROBAR' AND EXISTS (
               SELECT 1 FROM productos_x_pedidos px WHERE px.pedido_id = p.id
             )
             THEN 1 ELSE 0
           END
         ) AS pending_with_items
       FROM pedidos p
       LEFT JOIN estados e ON e.id = p.estado_id
       LEFT JOIN facturas f ON f.pedido_id = p.id
      WHERE p.mesa_id = ?
        AND f.id IS NULL`,
    [tableId]
  );
  const bookedCount = Number(rows[0]?.booked_count || 0);
  const pendingCount = Number(rows[0]?.pending_with_items || 0);
  if (bookedCount > 0) return 'Booked';
  if (pendingCount > 0) return 'PendingApproval';
  return 'Available';
}

async function fetchAllTablesShaped() {
  const [rows] = await pool.query("SELECT id, numero, capacidad FROM mesas ORDER BY numero ASC");
  const results = [];
  for (const r of rows) {
    const status = await computeStatusForTable(r.id);
    results.push(shapeTable(r, { status }));
  }
  return results;
}

const Table = function TableFactory(data) {
  return new TableDoc(data || {});
};

Table.findOne = async function (filter) {
  if (filter?.tableNo == null && filter?.number == null) return null;
  const tableNo = filter.tableNo ?? filter.number;
  const [rows] = await pool.query("SELECT id, numero, capacidad FROM mesas WHERE numero = ? LIMIT 1", [tableNo]);
  if (rows.length === 0) return null;
  const status = await computeStatusForTable(rows[0].id);
  return shapeTable(rows[0], { status });
};

// Return a chainable object with populate() to mimic Mongoose usage in controllers
Table.find = function () {
  return {
    populate: async () => {
      return await fetchAllTablesShaped();
    }
  };
};

Table.findByIdAndUpdate = async function (id, update = {}, options = {}) {
  // If an orderId provided, associate the pedido to this mesa
  if (update.currentOrder) {
    await pool.query("UPDATE pedidos SET mesa_id = ? WHERE id = ?", [id, update.currentOrder]);
  }
  // We don't persist status in mesas; compute it dynamically.
  const [rows] = await pool.query("SELECT id, numero, capacidad FROM mesas WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  const status = update.status ?? (await computeStatusForTable(id));
  return shapeTable(rows[0], { status });
};

module.exports = Table;

