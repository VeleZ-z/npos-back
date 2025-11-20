const { pool } = require("../config/mysql");
const { sendEmail, getLogoDataUri } = require("./emailService");

const DAYS_BEFORE_EXPIRY_ALERT = 7;
const STAFF_ROLE_NAMES = ["admin", "administrator", "cashier", "cajero"];

const normalizeMsg = (s) =>
  String(s || "").toLowerCase().replace(/,/g, "").trim();

async function ensurePurchaseAlertId(message) {
  const norm = normalizeMsg(message);
  if (!norm) return null;
  const [[row]] = await pool.query(
    "SELECT id FROM alertas WHERE REPLACE(LOWER(mensaje_alrt), ',', '') = ? LIMIT 1",
    [norm]
  );
  if (row?.id) return row.id;
  const [ins] = await pool.query(
    "INSERT INTO alertas (mensaje_alrt, created_at, updated_at) VALUES (?, NOW(), NOW())",
    [norm]
  );
  return ins.insertId;
}

const formatDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

async function evaluatePurchaseAlerts(purchase) {
  try {
    if (!purchase) return;
    const alerts = [];
    const currentStock =
      purchase.stock != null
        ? Number(purchase.stock)
        : purchase.quantity != null
        ? Number(purchase.quantity)
        : null;
    if (
      purchase.alertMinStock != null &&
      currentStock != null &&
      currentStock <= Number(purchase.alertMinStock)
    ) {
      const msg = `stock bajo: ${purchase.name} restante/s ${
        purchase.stock ?? currentStock
      } ; en el minimo o por debajo del minimo (${purchase.alertMinStock})`;
      alerts.push(msg);
    }

    if (purchase.expirationDate) {
      const today = new Date();
      const exp = new Date(purchase.expirationDate);
      const diffDays = Math.ceil(
        (exp - today) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= DAYS_BEFORE_EXPIRY_ALERT) {
        alerts.push(
          `compra proxima a vencer (${purchase.name}) vence: ${formatDate(
            exp
          )}`
        );
      }
    }

    if (!alerts.length) return;
    for (const mensaje of alerts) {
      const alertaId = await ensurePurchaseAlertId(mensaje);
      try {
        await pool.query(
          "UPDATE compras SET alerta_id = ? WHERE id = ? AND (alerta_id IS NULL)",
          [alertaId, purchase._id]
        );
      } catch {}
      await assignAlertToStaff(alertaId, purchase);
    }
  } catch (err) {
    console.error(err);
  }
}

async function assignAlertToStaff(alertaId, purchase) {
  if (!alertaId) return;
  const [roleRows] = await pool.query(
    `SELECT id FROM roles WHERE LOWER(nombre) IN (${STAFF_ROLE_NAMES.map(
      () => "?"
    ).join(",")})`,
    STAFF_ROLE_NAMES
  );
  if (!roleRows.length) return;
  const roleIds = roleRows.map((r) => r.id);
  const placeholders = roleIds.map(() => "?").join(",");
  const [userRows] = await pool.query(
    `SELECT DISTINCT usuario_id FROM roles_x_usuarios WHERE role_id IN (${placeholders})`,
    roleIds
  );
  if (!userRows.length) return;
  const values = userRows.map((u) => [u.usuario_id, alertaId]);
  await pool.query(
    `INSERT INTO alertas_x_usuarios (usuario_id, alerta_id, created_at, updated_at)
     VALUES ${values.map(() => "(?, ?, NOW(), NOW())").join(",")}`,
    values.flat()
  );

  await emailStaff(roleIds, purchase, alertaId);
}

async function emailStaff(roleIds, purchase, alertaId) {
  if (!roleIds.length) return;
  try {
    const placeholders = roleIds.map(() => "?").join(",");
    const [emails] = await pool.query(
      `SELECT DISTINCT u.correo AS email
         FROM roles_x_usuarios rxu
         JOIN usuarios u ON u.id = rxu.usuario_id
        WHERE rxu.role_id IN (${placeholders})
          AND u.estado_id = 1
          AND u.correo IS NOT NULL AND u.correo <> ''`,
      roleIds
    );
    if (!emails?.length) return;

    const [[alertRow]] = await pool.query(
      "SELECT mensaje_alrt FROM alertas WHERE id = ? LIMIT 1",
      [alertaId]
    );
    const [ctxRows] = await pool.query(
      "SELECT c.nombre AS producto, c.cantidad AS cantidad, c.unidad_medida AS unidad, c.entrega AS entrega, p.nombre AS prov_nombre, p.telefono AS prov_tel, p.correo AS prov_correo, p.contacto AS prov_contacto FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedore_id WHERE c.id = ? LIMIT 1",
      [purchase?._id || 0]
    );
    const ctx = ctxRows && ctxRows[0] ? ctxRows[0] : {};
    const subject =
      "Alerta de stock" + (ctx && ctx.producto ? ` - ${ctx.producto}` : "");
    const message = alertRow?.mensaje_alrt || subject;
    const lastQty =
      (ctx.cantidad != null ? String(ctx.cantidad) : "-") +
      (ctx.unidad ? ` ${ctx.unidad}` : "");
    const entrega = ctx.entrega || "-";
    let prov = "";
    if (ctx.prov_nombre) {
      prov +=
        '<div style="margin-top:12px;"><div style="font-weight:bold">Proveedor</div>';
      prov += `<div>${ctx.prov_nombre}${
        ctx.prov_contacto ? ` - ${ctx.prov_contacto}` : ""
      }</div>`;
      if (ctx.prov_tel) prov += `<div>Tel: ${ctx.prov_tel}</div>`;
      if (ctx.prov_correo) prov += `<div>Email: ${ctx.prov_correo}</div>`;
      prov += "</div>";
    }
    const detalles =
      '<div style="margin-top:12px;"><div style="font-weight:bold">Última compra</div>' +
      `<div>Cantidad: ${lastQty}</div>` +
      `<div>Entrega: ${entrega}</div></div>`;
    const logo = getLogoDataUri();
    const html =
      '<div style="font-family:Arial,sans-serif;color:#222">' +
      (logo
        ? `<div style="text-align:center; margin-bottom: 10px;"><img src="${logo}" alt="Nativhos" style="height:50px" /></div>`
        : "") +
      `<h3 style="margin:0 0 8px">${subject}</h3>` +
      `<p style="margin:0 0 8px">${message}</p>` +
      detalles +
      prov +
      "</div>";

    for (const row of emails) {
      await sendEmail({ to: row.email, subject, html });
    }
  } catch (err) {
    console.error(err);
  }
}

module.exports = {
  ensurePurchaseAlertId,
  evaluatePurchaseAlerts,
};
