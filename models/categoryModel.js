const { pool } = require("../config/mysql");

class CategoryDoc {
  constructor(data) {
    this._id = data._id || data.id || null;
    this.name = data.name || data.nombre || "";
  }

  async save() {
    const [res] = await pool.query(
      "INSERT INTO categorias (nombre, created_at, updated_at) VALUES (?, NOW(), NOW())",
      [this.name]
    );
    this._id = res.insertId;
    return this;
  }
}

const Category = function CategoryFactory(data) {
  return new CategoryDoc(data || {});
};

Category.find = async function () {
  const [rows] = await pool.query(
    "SELECT id, nombre FROM categorias ORDER BY nombre ASC"
  );
  return rows.map(r => ({ _id: r.id, name: r.nombre }));
};

Category.findById = async function (id) {
  const [rows] = await pool.query(
    "SELECT id, nombre FROM categorias WHERE id = ? LIMIT 1",
    [id]
  );
  if (rows.length === 0) return null;
  return { _id: rows[0].id, name: rows[0].nombre };
};

Category.updateById = async function (id, update = {}) {
  const name = update.name || update.nombre;
  if (!name) return await Category.findById(id);
  await pool.query(
    "UPDATE categorias SET nombre = ?, updated_at = NOW() WHERE id = ?",
    [name, id]
  );
  return await Category.findById(id);
};

Category.deleteById = async function (id) {
  await pool.query("DELETE FROM categorias WHERE id = ?", [id]);
  return true;
};

module.exports = Category;

