const { pool } = require("../config/mysql");
const { getDashboardMetrics } = require("../services/metricsService");

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getPopularProducts = async (req, res, next) => {
  try {
    const { limit, startDate, endDate } = req.query;
    const whereParts = [];
    const params = [];

    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (start) {
      whereParts.push("f.created_at >= ?");
      params.push(start);
    }
    if (end) {
      whereParts.push("f.created_at <= ?");
      params.push(end);
    }
    const whereClause = whereParts.length
      ? `AND ${whereParts.join(" AND ")}`
      : "";

    const limitNumber = Number(limit);
    const applyLimit = Number.isFinite(limitNumber) && limitNumber > 0;

    const sql = `
      SELECT
        pr.id AS productId,
        pr.nombre AS name,
        pr.precio AS currentPrice,
        COALESCE(SUM(pxp.cantidad), 0) AS totalQuantity,
        COALESCE(SUM(pxp.cantidad * pr.precio), 0) AS totalAmount,
        CASE WHEN pi.producto_id IS NULL THEN NULL ELSE CONCAT('/api/product/', pr.id, '/image') END AS imageUrl
      FROM productos_x_pedidos pxp
      JOIN facturas f ON f.pedido_id = pxp.pedido_id
      JOIN productos pr ON pr.id = pxp.producto_id
 LEFT JOIN (SELECT DISTINCT producto_id FROM productos_imagenes) pi ON pi.producto_id = pr.id
     WHERE pr.id IS NOT NULL
       ${whereClause}
  GROUP BY pr.id, pr.nombre, pr.precio, imageUrl
  ORDER BY totalQuantity DESC, totalAmount DESC, pr.nombre ASC
    `;
    const finalSql = applyLimit ? `${sql} LIMIT ?` : sql;
    const finalParams = applyLimit ? [...params, limitNumber] : params;

    const [rows] = await pool.query(finalSql, finalParams);
    const data = rows.map((row, index) => ({
      rank: index + 1,
      productId: row.productId,
      name: row.name,
      unitPrice: Number(row.currentPrice || 0),
      totalQuantity: Number(row.totalQuantity || 0),
      totalAmount: Number(row.totalAmount || 0),
      imageUrl: row.imageUrl || null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getTodaySummary = async (req, res, next) => {
  try {
    const data = await getDashboardMetrics();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPopularProducts,
  getTodaySummary,
};
