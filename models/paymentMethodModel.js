const { pool } = require("../config/mysql");

class PaymentMethodDoc {
  constructor(data) {
    this._id = data._id || data.id || null;
    this.name = data.name || data.nombre || "";
    this.estadoId = data.estadoId ?? data.estado_id ?? null;
    this.estado = data.estado || data.estado_nombre || null;
  }

  async save() {
    const [rowEstado] = await pool.query(
      "SELECT id FROM estados WHERE id = ? AND tipo = 5",
      [this.estadoId]
    );
    let estadoId = this.estadoId;
    if (!estadoId || rowEstado.length === 0) {
      const [rowsAct] = await pool.query(
        "SELECT id FROM estados WHERE nombre='ACTIVO' AND tipo=5 LIMIT 1"
      );
      estadoId = rowsAct[0]?.id || null;
    }
    const [res] = await pool.query(
      `INSERT INTO metodos_pagos (nombre, estado_id, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [this.name, estadoId]
    );
    this._id = res.insertId;
    this.estadoId = estadoId;
    return this;
  }
}

const PaymentMethod = function (data) { return new PaymentMethodDoc(data || {}); };

PaymentMethod.find = async function () {
  const [rows] = await pool.query(
    `SELECT mp.id, mp.nombre, mp.estado_id, e.nombre AS estado_nombre
       FROM metodos_pagos mp
       LEFT JOIN estados e ON e.id = mp.estado_id
      ORDER BY mp.updated_at DESC, mp.id DESC`
  );
  return rows.map(r => new PaymentMethodDoc({ id: r.id, nombre: r.nombre, estado_id: r.estado_id, estado_nombre: r.estado_nombre }));
};

PaymentMethod.findById = async function (id) {
  const [rows] = await pool.query(
    `SELECT mp.id, mp.nombre, mp.estado_id, e.nombre AS estado_nombre
       FROM metodos_pagos mp
       LEFT JOIN estados e ON e.id = mp.estado_id
      WHERE mp.id = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return new PaymentMethodDoc({ id: r.id, nombre: r.nombre, estado_id: r.estado_id, estado_nombre: r.estado_nombre });
};

PaymentMethod.updateById = async function (id, update = {}) {
  const pm = await PaymentMethod.findById(id);
  if (!pm) return null;
  const name = update.name ?? pm.name;
  const estadoId = update.estado_id ?? update.estadoId ?? pm.estadoId ?? null;
  await pool.query(
    `UPDATE metodos_pagos SET nombre = ?, estado_id = ?, updated_at = NOW() WHERE id = ?`,
    [name, estadoId, id]
  );
  return await PaymentMethod.findById(id);
};

PaymentMethod.updateEstado = async function (id, estadoId) {
  await pool.query(`UPDATE metodos_pagos SET estado_id = ?, updated_at = NOW() WHERE id = ?`, [estadoId, id]);
  return await PaymentMethod.findById(id);
};

PaymentMethod.deleteById = async function (id) {
  await pool.query(`DELETE FROM metodos_pagos WHERE id = ?`, [id]);
  return true;
};

module.exports = PaymentMethod;

