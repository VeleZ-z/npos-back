const createHttpError = require("http-errors");
const ExcelJS = require("exceljs");
const { pool } = require("../config/mysql");
const { sendEmail, getLogoDataUri } = require("../services/emailService");

const normalizeId = (value) => {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const estadoCache = {};
async function getEstadoId(nombre) {
  const key = String(nombre || "").toUpperCase();
  if (estadoCache[key]) return estadoCache[key];
  const [[row]] = await pool.query(
    "SELECT id FROM estados WHERE UPPER(nombre) = ? AND tipo = 7 LIMIT 1",
    [key]
  );
  if (!row?.id) {
    throw createHttpError(
      500,
      `Estado ${key} (tipo=7) no encontrado, ejecuta la migración de cuadres`
    );
  }
  estadoCache[key] = row.id;
  return row.id;
}

const categorizeMovements = (movements) =>
  movements.reduce(
    (acc, movement) => {
      const amount =
        Number(movement.total || 0) + Number(movement.propina || 0);
      const method = String(movement.metodo_pago || "").toLowerCase();
      if (method.includes("efect")) acc.cash += amount;
      else if (method.includes("datafon") || method.includes("datáfon"))
        acc.card += amount;
      else acc.transfer += amount;
      return acc;
    },
    { cash: 0, card: 0, transfer: 0 }
  );

async function fetchActiveCuadre() {
  const estadoId = await getEstadoId("ABIERTO");
  const [rows] = await pool.query(
    `SELECT c.*,
            ua.nombre AS usuario_apertura_nombre,
            uc.nombre AS usuario_cierre_nombre,
            e.nombre  AS estado_nombre
       FROM cuadres c
  LEFT JOIN usuarios ua ON ua.id = c.usuario_apertura_id
  LEFT JOIN usuarios uc ON uc.id = c.usuario_cierre_id
  LEFT JOIN estados e  ON e.id = c.estado_id
      WHERE c.estado_id = ?
      ORDER BY c.fecha_apertura DESC
      LIMIT 1`,
    [estadoId]
  );
  return rows[0] || null;
}

async function fetchCuadreById(id) {
  const [rows] = await pool.query(
    `SELECT c.*,
            ua.nombre AS usuario_apertura_nombre,
            uc.nombre AS usuario_cierre_nombre,
            e.nombre  AS estado_nombre
       FROM cuadres c
  LEFT JOIN usuarios ua ON ua.id = c.usuario_apertura_id
  LEFT JOIN usuarios uc ON uc.id = c.usuario_cierre_id
  LEFT JOIN estados e  ON e.id = c.estado_id
      WHERE c.id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function fetchMovements(cuadreId) {
  const [rows] = await pool.query(
    `SELECT f.id,
            f.numero_factura,
            f.total,
            f.propina,
            f.created_at,
            mp.nombre AS metodo_pago,
            f.pedido_id
       FROM facturas f
  LEFT JOIN metodos_pagos mp ON mp.id = f.metodos_pago_id
      WHERE f.cuadre_id = ?
      ORDER BY f.created_at ASC`,
    [cuadreId]
  );
  return rows;
}

const mapCuadreResponse = (cuadre, totals) => {
  const expenses = Number(cuadre.gastos || 0);
  const cashTotal = totals.cash || 0;
  const totalCaja =
    Number(cuadre.saldo_inicial || 0) + cashTotal - expenses;
  return {
    id: cuadre.id,
    openedAt: cuadre.fecha_apertura,
    closedAt: cuadre.fecha_cierre,
    openingUser: {
      id: cuadre.usuario_apertura_id,
      name: cuadre.usuario_apertura_nombre || null,
    },
    closingUser: cuadre.usuario_cierre_id
      ? {
          id: cuadre.usuario_cierre_id,
          name: cuadre.usuario_cierre_nombre || null,
        }
      : null,
    estado: cuadre.estado_nombre,
    saldoInicial: Number(cuadre.saldo_inicial || 0),
    saldoReal: Number(cuadre.saldo_real || 0),
    saldoTeorico: Number(cuadre.saldo_teorico || 0),
    diferencia: Number(cuadre.diferencia || 0),
    gastos: expenses,
    observaciones: cuadre.observaciones,
    totals: {
      cash: cashTotal,
      card: totals.card || 0,
      transfer: totals.transfer || 0,
      totalCaja,
    },
  };
};

const mapHistoryRow = (row) => {
  const totals = {
    cash: Number(row.total_cash || 0),
    card: Number(row.total_card || 0),
    transfer: Number(row.total_transfer || 0),
  };
  const totalCaja =
    Number(row.saldo_inicial || 0) + totals.cash - Number(row.gastos || 0);
  return {
    id: row.id,
    openedAt: row.fecha_apertura,
    closedAt: row.fecha_cierre,
    openingUser: {
      id: row.usuario_apertura_id,
      name: row.usuario_apertura_nombre || null,
    },
    closingUser: row.usuario_cierre_id
      ? {
          id: row.usuario_cierre_id,
          name: row.usuario_cierre_nombre || null,
        }
      : null,
    estado: row.estado_nombre,
    saldoInicial: Number(row.saldo_inicial || 0),
    saldoReal: Number(row.saldo_real || 0),
    saldoTeorico: Number(row.saldo_teorico || 0),
    diferencia: Number(row.diferencia || 0),
    gastos: Number(row.gastos || 0),
    totals: { ...totals, totalCaja },
    invoicesCount: Number(row.facturas_count || 0),
  };
};

const getCurrentCashDesk = async (req, res, next) => {
  try {
    const cuadre = await fetchActiveCuadre();
    if (!cuadre) {
      return res.json({ success: true, data: null });
    }
    const movements = await fetchMovements(cuadre.id);
    const totals = categorizeMovements(movements);
    res.json({
      success: true,
      data: {
        cuadre: mapCuadreResponse(cuadre, totals),
        movements,
      },
    });
  } catch (error) {
    next(error);
  }
};

const openCashDesk = async (req, res, next) => {
  try {
    const { saldoInicial = 0, observaciones = null } = req.body;
    const amount = Number(saldoInicial);
    if (!Number.isFinite(amount) || amount < 0) {
      throw createHttpError(400, "Saldo inicial inválido");
    }
    const existing = await fetchActiveCuadre();
    if (existing) {
      throw createHttpError(400, "Ya existe un cuadre abierto");
    }
    const estadoId = await getEstadoId("ABIERTO");
    const [result] = await pool.query(
      `INSERT INTO cuadres (
        usuario_apertura_id,
        fecha_apertura,
        saldo_inicial,
        estado_id,
        observaciones,
        created_at,
        updated_at
      ) VALUES (?, NOW(), ?, ?, ?, NOW(), NOW())`,
      [normalizeId(req.user?._id), amount, estadoId, observaciones || null]
    );
    const cuadre = await fetchCuadreById(result.insertId);
    res.status(201).json({
      success: true,
      message: "Caja abierta correctamente",
      data: mapCuadreResponse(cuadre, { cash: 0, card: 0, transfer: 0 }),
    });
  } catch (error) {
    next(error);
  }
};

const closeCashDesk = async (req, res, next) => {
  try {
    const { saldoReal = 0, gastos = 0, observaciones = null } = req.body;
    const closeAmount = Number(saldoReal);
    const expenses = Number(gastos || 0);
    if (!Number.isFinite(closeAmount) || closeAmount < 0) {
      throw createHttpError(400, "Saldo real inválido");
    }
    if (!Number.isFinite(expenses) || expenses < 0) {
      throw createHttpError(400, "Gastos inválidos");
    }
    const active = await fetchActiveCuadre();
    if (!active) {
      throw createHttpError(400, "No hay caja abierta");
    }
    const movements = await fetchMovements(active.id);
    const totals = categorizeMovements(movements);
    const saldoTeorico =
      Number(active.saldo_inicial || 0) + totals.cash - expenses;
    const diferencia = closeAmount - saldoTeorico;
    const estadoId = await getEstadoId("CERRADO");

    await pool.query(
      `UPDATE cuadres
          SET fecha_cierre = NOW(),
              usuario_cierre_id = ?,
              saldo_real = ?,
              saldo_teorico = ?,
              diferencia = ?,
              gastos = ?,
              observaciones = ?,
              estado_id = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [
        normalizeId(req.user?._id),
        closeAmount,
        saldoTeorico,
        diferencia,
        expenses,
        observaciones || active.observaciones || null,
        estadoId,
        active.id,
      ]
    );

    const updated = await fetchCuadreById(active.id);
    notifyCashDeskClosure(updated, totals).catch((err) =>
      console.error("[cashdesk email]", err?.message || err)
    );
    res.json({
      success: true,
      message: "Caja cerrada correctamente",
      data: mapCuadreResponse(updated, totals),
    });
  } catch (error) {
    next(error);
  }
};

const getCashDeskMovements = async (req, res, next) => {
  try {
    const { cuadreId } = req.query;
    let target = null;
    if (cuadreId) {
      target = await fetchCuadreById(cuadreId);
      if (!target) {
        throw createHttpError(404, "Cuadre no encontrado");
      }
    } else {
      target = await fetchActiveCuadre();
      if (!target) {
        return res.json({ success: true, data: [] });
      }
    }
    const movements = await fetchMovements(target.id);
    res.json({ success: true, data: movements });
  } catch (error) {
    next(error);
  }
};

const listCashDeskHistory = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filters = [];
    const params = [];
    if (startDate) {
      filters.push("c.fecha_apertura >= ?");
      params.push(new Date(startDate));
    }
    if (endDate) {
      filters.push("c.fecha_apertura <= ?");
      params.push(new Date(endDate));
    }
    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `
      SELECT
        c.*,
        ua.nombre AS usuario_apertura_nombre,
        uc.nombre AS usuario_cierre_nombre,
        e.nombre  AS estado_nombre,
        COUNT(f.id) AS facturas_count,
        SUM(CASE WHEN LOWER(mp.nombre) LIKE '%efect%' THEN (f.total + IFNULL(f.propina,0)) ELSE 0 END) AS total_cash,
        SUM(CASE WHEN LOWER(mp.nombre) LIKE '%datafon%' THEN (f.total + IFNULL(f.propina,0)) ELSE 0 END) AS total_card,
        SUM(CASE WHEN LOWER(mp.nombre) NOT LIKE '%efect%' AND LOWER(mp.nombre) NOT LIKE '%datafon%' THEN (f.total + IFNULL(f.propina,0)) ELSE 0 END) AS total_transfer
      FROM cuadres c
      LEFT JOIN usuarios ua ON ua.id = c.usuario_apertura_id
      LEFT JOIN usuarios uc ON uc.id = c.usuario_cierre_id
      LEFT JOIN estados e ON e.id = c.estado_id
      LEFT JOIN facturas f ON f.cuadre_id = c.id
      LEFT JOIN metodos_pagos mp ON mp.id = f.metodos_pago_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.fecha_apertura DESC
      LIMIT 200;
    `,
      params
    );
    const data = (rows || []).map(mapHistoryRow);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const exportCashDeskMovements = async (req, res, next) => {
  try {
    const { cuadreId } = req.query;
    if (!cuadreId) {
      throw createHttpError(400, "cuadreId requerido");
    }
    const cuadre = await fetchCuadreById(cuadreId);
    if (!cuadre) {
      throw createHttpError(404, "Cuadre no encontrado");
    }
    const movements = await fetchMovements(cuadre.id);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Movimientos");
    sheet.columns = [
      { header: "Factura", key: "numero_factura", width: 15 },
      { header: "Pedido", key: "pedido_id", width: 10 },
      { header: "Método", key: "metodo_pago", width: 20 },
      { header: "Total", key: "total", width: 15 },
      { header: "Propina", key: "propina", width: 15 },
      { header: "Fecha", key: "created_at", width: 20 },
    ];
    movements.forEach((movement) => {
      sheet.addRow({
        ...movement,
        total: Number(movement.total || 0),
        propina: Number(movement.propina || 0),
      });
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=cuadre-${cuadreId}-movimientos.xlsx`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCurrentCashDesk,
  openCashDesk,
  closeCashDesk,
  getCashDeskMovements,
  listCashDeskHistory,
  exportCashDeskMovements,
};

async function fetchAdminRecipients() {
  const [roles] = await pool.query(
    "SELECT id FROM roles WHERE LOWER(nombre) IN ('admin','administrator')"
  );
  if (!roles.length) return [];
  const roleIds = roles.map((r) => r.id);
  const placeholders = roleIds.map(() => "?").join(",");
  const [users] = await pool.query(
    `SELECT DISTINCT u.id, u.correo, u.nombre
       FROM roles_x_usuarios rxu
       JOIN usuarios u ON u.id = rxu.usuario_id
      WHERE rxu.role_id IN (${placeholders})
        AND u.estado_id = 1
        AND u.correo IS NOT NULL
        AND u.correo <> ''`,
    roleIds
  );
  return users || [];
}

const money = (value) =>
  Number(value || 0).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

async function notifyCashDeskClosure(cuadre, totals) {
  if (!cuadre) return;
  const admins = await fetchAdminRecipients();
  if (!admins.length) return;
  const closingName =
    cuadre.usuario_cierre_nombre || cuadre.usuario_cierre_id || "Usuario";
  const subject = `Cierre de caja #${cuadre.id} - ${closingName}`;
  const closedAt = new Date(cuadre.fecha_cierre || Date.now()).toLocaleString(
    "es-CO"
  );
  const logo = getLogoDataUri();
  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;">
      ${
        logo
          ? `<div style="text-align:center;margin-bottom:10px;"><img src="${logo}" alt="Nativhos" style="height:60px" /></div>`
          : ""
      }
      <h2 style="margin:0 0 8px;">Cierre de caja #${cuadre.id}</h2>
      <p style="margin:0 0 12px;">${closingName} cerró la caja el ${closedAt}.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>
          <tr><td><strong>Caja inicial</strong></td><td style="text-align:right;">$ ${money(
            cuadre.saldo_inicial
          )}</td></tr>
          <tr><td><strong>Ventas en efectivo</strong></td><td style="text-align:right;">$ ${money(
            totals.cash
          )}</td></tr>
          <tr><td><strong>Ventas con datafono</strong></td><td style="text-align:right;">$ ${money(
            totals.card
          )}</td></tr>
          <tr><td><strong>Ventas con transferencia</strong></td><td style="text-align:right;">$ ${money(
            totals.transfer
          )}</td></tr>
          <tr><td><strong>Gastos</strong></td><td style="text-align:right;">$ ${money(
            cuadre.gastos
          )}</td></tr>
          <tr><td><strong>Total caja</strong></td><td style="text-align:right;">$ ${money(
            totals.totalCaja
          )}</td></tr>
          <tr><td><strong>Saldo real</strong></td><td style="text-align:right;">$ ${money(
            cuadre.saldo_real
          )}</td></tr>
          <tr><td><strong>Saldo teórico</strong></td><td style="text-align:right;">$ ${money(
            cuadre.saldo_teorico
          )}</td></tr>
          <tr><td><strong>Diferencia</strong></td><td style="text-align:right;">$ ${money(
            cuadre.diferencia
          )}</td></tr>
        </tbody>
      </table>
      ${
        cuadre.observaciones
          ? `<p style="margin-top:12px;"><strong>Observaciones:</strong> ${cuadre.observaciones}</p>`
          : ""
      }
    </div>
  `;

  const adminEmails = admins.map((a) => a.correo);
  await sendEmail({ to: adminEmails, subject, html });

  const message = `Cierre de caja #${cuadre.id} realizado por ${closingName}. Total caja: $${money(
    totals.totalCaja
  )}, saldo real: $${money(cuadre.saldo_real)}, diferencia: $${money(
    cuadre.diferencia
  )}.`;
  const [alertRes] = await pool.query(
    "INSERT INTO alertas (mensaje_alrt, created_at, updated_at) VALUES (?, NOW(), NOW())",
    [message]
  );
  const alertaId = alertRes.insertId;
  if (alertaId) {
    const values = admins.map((adm) => [adm.id, alertaId]);
    if (values.length) {
      await pool.query(
        `INSERT INTO alertas_x_usuarios (usuario_id, alerta_id, created_at, updated_at)
         VALUES ${values.map(() => "(?, ?, NOW(), NOW())").join(",")}`,
        values.flat()
      );
    }
  }
}
