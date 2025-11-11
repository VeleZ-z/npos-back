const { pool } = require("../config/mysql");

class ProviderDoc {
  constructor(data) {
    this._id = data._id || data.id || null;
    this.name = data.name || data.nombre || "";
    this.phone = data.phone ?? data.telefono ?? null;
    this.email = data.email ?? data.correo ?? null;
    this.contact = data.contact || data.contacto || "";
  }

  async save() {
    const [res] = await pool.query(
      `INSERT INTO proveedores (nombre, telefono, correo, contacto, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [this.name, this.phone, this.email, this.contact]
    );
    this._id = res.insertId;
    return this;
  }
}

const Provider = function ProviderFactory(data) {
  return new ProviderDoc(data || {});
};

Provider.find = async function () {
  const [rows] = await pool.query(
    `SELECT id, nombre, telefono, correo, contacto FROM proveedores ORDER BY updated_at DESC, id DESC`
  );
  return rows.map(r => new ProviderDoc({
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    correo: r.correo,
    contacto: r.contacto
  }));
};

Provider.findById = async function (id) {
  const [rows] = await pool.query(
    `SELECT id, nombre, telefono, correo, contacto FROM proveedores WHERE id = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return new ProviderDoc({
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    correo: r.correo,
    contacto: r.contacto
  });
};

Provider.updateById = async function (id, update = {}) {
  const p = await Provider.findById(id);
  if (!p) return null;
  const name = update.name ?? p.name;
  const phone = update.phone ?? p.phone;
  const email = update.email ?? p.email;
  const contact = update.contact ?? p.contact;
  await pool.query(
    `UPDATE proveedores
        SET nombre = ?, telefono = ?, correo = ?, contacto = ?, updated_at = NOW()
      WHERE id = ?`,
    [name, phone, email, contact, id]
  );
  return await Provider.findById(id);
};

Provider.deleteById = async function (id) {
  await pool.query(`DELETE FROM proveedores WHERE id = ?`, [id]);
  return true;
};

module.exports = Provider;

