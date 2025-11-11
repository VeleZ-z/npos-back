const { pool } = require("../config/mysql");

const getMyAlerts = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const [rows] = await pool.query(
      `SELECT a.id, a.mensaje_alrt AS message, a.created_at
         FROM alertas_x_usuarios axu
         JOIN alertas a ON a.id = axu.alerta_id
        WHERE axu.usuario_id = ?
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 100`,
      [userId]
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) { next(err); }
};

const ackMyAlert = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;
    await pool.query(
      `DELETE FROM alertas_x_usuarios WHERE usuario_id = ? AND alerta_id = ?`,
      [userId, Number(id)]
    );
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
};

module.exports = { getMyAlerts, ackMyAlert };

