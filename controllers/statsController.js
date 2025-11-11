const { pool } = require("../config/mysql");

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const computeChangePct = (current, previous) => {
  const prev = Number(previous || 0);
  const curr = Number(current || 0);
  if (prev === 0) {
    if (curr === 0) return 0;
    return 100;
  }
  return ((curr - prev) / prev) * 100;
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
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);

    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);
    const endYesterday = new Date(startToday.getTime() - 1);

    const [[salesTodayRow]] = await pool.query(
      "SELECT COALESCE(SUM(total + COALESCE(propina,0)),0) AS total FROM facturas WHERE created_at BETWEEN ? AND ?",
      [startToday, endToday]
    );
    const [[salesYesterdayRow]] = await pool.query(
      "SELECT COALESCE(SUM(total + COALESCE(propina,0)),0) AS total FROM facturas WHERE created_at BETWEEN ? AND ?",
      [startYesterday, endYesterday]
    );

    const salesToday = Number(salesTodayRow?.total || 0);
    const salesYesterday = Number(salesYesterdayRow?.total || 0);

    const activeSql = `
      SELECT COUNT(*) AS total
        FROM pedidos p
        LEFT JOIN estados e ON e.id = p.estado_id
       WHERE p.created_at BETWEEN ? AND ?
         AND (e.id IS NULL OR UPPER(e.nombre) NOT IN ('CERRADO','PAGADO'))
    `;
    const [[activeTodayRow]] = await pool.query(activeSql, [
      startToday,
      endToday,
    ]);
    const [[activeYesterdayRow]] = await pool.query(activeSql, [
      startYesterday,
      endYesterday,
    ]);
    const activeToday = Number(activeTodayRow?.total || 0);
    const activeYesterday = Number(activeYesterdayRow?.total || 0);

    const [[categoriesRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM categorias"
    );
    const [[productsRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM productos"
    );
    const [[tablesRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM mesas"
    );

    res.json({
      success: true,
      data: {
        salesToday,
        salesYesterday,
        salesChangePct: computeChangePct(salesToday, salesYesterday),
        activeToday,
        activeYesterday,
        activeChangePct: computeChangePct(activeToday, activeYesterday),
        counts: {
          categories: Number(categoriesRow?.total || 0),
          products: Number(productsRow?.total || 0),
          tables: Number(tablesRow?.total || 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPopularProducts,
  getTodaySummary,
};
