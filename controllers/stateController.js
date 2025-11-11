const { pool } = require("../config/mysql");
const createHttpError = require("http-errors");

const getStates = async (req, res, next) => {
  try {
    const type = Number(req.query.type || 0);
    if (!type) return next(createHttpError(400, "Missing or invalid type"));
    const [rows] = await pool.query(
      "SELECT id, nombre FROM estados WHERE tipo = ? ORDER BY nombre ASC",
      [type]
    );
    res.status(200).json({ success: true, data: rows.map(r => ({ _id: r.id, name: r.nombre })) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStates };

