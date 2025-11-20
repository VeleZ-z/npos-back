const { pool } = require("../config/mysql");

const computeChangePct = (current, previous) => {
  const prev = Number(previous || 0);
  const curr = Number(current || 0);
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
};

const sumFacturasBetween = async (start, end) => {
  const [[row]] = await pool.query(
    "SELECT COALESCE(SUM(total + COALESCE(propina,0)),0) AS total FROM facturas WHERE created_at >= ? AND created_at <= ?",
    [start, end]
  );
  return Number(row?.total || 0);
};

const countActiveOrdersBetween = async (start, end) => {
  const sql = `
    SELECT COUNT(*) AS total
      FROM pedidos p
      LEFT JOIN estados e ON e.id = p.estado_id
     WHERE p.created_at >= ?
       AND p.created_at <= ?
       AND (e.id IS NULL OR UPPER(e.nombre) NOT IN ('CERRADO','PAGADO'))
  `;
  const [[row]] = await pool.query(sql, [start, end]);
  return Number(row?.total || 0);
};

const getCounts = async () => {
  const [[categoriesRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM categorias"
  );
  const [[productsRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM productos"
  );
  const [[tablesRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM mesas"
  );
  return {
    categories: Number(categoriesRow?.total || 0),
    products: Number(productsRow?.total || 0),
    tables: Number(tablesRow?.total || 0),
  };
};

const getDailyMetrics = async () => {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);

  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const endYesterday = new Date(startToday.getTime() - 1);

  const [salesToday, salesYesterday, activeToday, activeYesterday] = await Promise.all([
    sumFacturasBetween(startToday, endToday),
    sumFacturasBetween(startYesterday, endYesterday),
    countActiveOrdersBetween(startToday, endToday),
    countActiveOrdersBetween(startYesterday, endYesterday),
  ]);

  return {
    salesToday,
    salesYesterday,
    salesChangePct: computeChangePct(salesToday, salesYesterday),
    activeToday,
    activeYesterday,
    activeChangePct: computeChangePct(activeToday, activeYesterday),
  };
};

const getMonthlyMetrics = async () => {
  const now = new Date();
  const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
  const endCurrent = new Date(startNext.getTime() - 1);
  const startPrevious = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
    0,
    0,
    0
  );
  const endPrevious = new Date(startCurrent.getTime() - 1);

  const [salesMonth, salesPrevMonth, activeMonth, activePrevMonth] = await Promise.all([
    sumFacturasBetween(startCurrent, endCurrent),
    sumFacturasBetween(startPrevious, endPrevious),
    countActiveOrdersBetween(startCurrent, endCurrent),
    countActiveOrdersBetween(startPrevious, endPrevious),
  ]);

  return {
    salesMonth,
    salesPrevMonth,
    salesMonthChangePct: computeChangePct(salesMonth, salesPrevMonth),
    activeMonth,
    activePrevMonth,
    activeMonthChangePct: computeChangePct(activeMonth, activePrevMonth),
  };
};

const getDashboardMetrics = async () => {
  const [daily, monthly, counts] = await Promise.all([
    getDailyMetrics(),
    getMonthlyMetrics(),
    getCounts(),
  ]);
  return {
    ...daily,
    ...monthly,
    counts,
  };
};

module.exports = {
  getDashboardMetrics,
};
