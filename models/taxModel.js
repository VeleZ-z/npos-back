const { pool } = require("../config/mysql");

class TaxDoc {
  constructor(data) {
    this._id = data._id || data.id || null;
    this.name = data.name || data.nombre || "";
    this.regimen = data.regimen || data.regimen_nombre || "";
    this.percentage = Number(data.percentage ?? data.porcentaje ?? 0);
  }
}

const Tax = function TaxFactory(data) {
  return new TaxDoc(data || {});
};

Tax.findAll = async function () {
  const [rows] = await pool.query(
    "SELECT id, nombre, regimen, porcentaje FROM impuestos ORDER BY nombre ASC"
  );
  return rows.map((row) =>
    Tax({
      id: row.id,
      nombre: row.nombre,
      regimen: row.regimen,
      porcentaje: row.porcentaje,
    })
  );
};

Tax.findById = async function (id) {
  const [rows] = await pool.query(
    "SELECT id, nombre, regimen, porcentaje FROM impuestos WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return null;
  return Tax({
    id: rows[0].id,
    nombre: rows[0].nombre,
    regimen: rows[0].regimen,
    porcentaje: rows[0].porcentaje,
  });
};

module.exports = Tax;
