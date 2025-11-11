const createHttpError = require("http-errors");
const Purchase = require("../models/purchaseModel");
const { pool } = require("../config/mysql");
const path = require('path');
const fs = require('fs');

const DAYS_BEFORE_EXPIRY_ALERT = 7;

const normalizeMsg = (s) => String(s || '').toLowerCase().replace(/,/g, '').trim();

async function ensureAlertIdByMessage(message) {
  const norm = normalizeMsg(message);
  if (!norm) return null;
  const [[row]] = await pool.query("SELECT id FROM alertas WHERE REPLACE(LOWER(mensaje_alrt), ',', '') = ? LIMIT 1", [norm]);
  if (row?.id) return row.id;
  const [ins] = await pool.query("INSERT INTO alertas (mensaje_alrt, created_at, updated_at) VALUES (?, NOW(), NOW())", [norm]);
  return ins.insertId;
}

const addPurchase = async (req, res, next) => {
  try {
    const { name, batchCode, quantity, deliveryDate, expirationDate, cost, providerId, alertMinStock, unidadMedida, estadoCompraId, alertMessage } = req.body || {};
    if (!name) return next(createHttpError(400, "El nombre es requerido"));
    if (quantity == null) return next(createHttpError(400, "La cantidad es requerida"));

    const alertaId = await ensureAlertIdByMessage(alertMessage);
    const purchase = Purchase({
      name,
      batchCode: batchCode || null,
      quantity: Number(quantity),
      deliveryDate: deliveryDate || null,
      expirationDate: expirationDate || null,
      cost: cost != null ? Number(cost) : 0,
      unit: unidadMedida || null,
      estadoCompraId: estadoCompraId ? Number(estadoCompraId) : null,
      providerId: providerId ? Number(providerId) : null,
      alertMinStock: alertMinStock != null ? Number(alertMinStock) : null,
      alertaId
    });
    await purchase.save();
    await evaluateAndNotifyAlerts(purchase);
    res.status(201).json({ success: true, message: "Compra registrada", data: purchase });
  } catch (err) {
    next(err);
  }
};

const getPurchases = async (req, res, next) => {
  try {
    const purchases = await Purchase.find();
    res.status(200).json({ success: true, data: purchases });
  } catch (err) { next(err); }
};

const updatePurchase = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createHttpError(400, "ID es requerido"));
    const payload = { ...(req.body || {}) };
    if (payload.alertMessage != null) {
      payload.alertaId = await ensureAlertIdByMessage(payload.alertMessage);
    }
    const updated = await Purchase.updateById(Number(id), payload);
    if (!updated) return next(createHttpError(404, "Compra no encontrada"));
    await evaluateAndNotifyAlerts(updated);
    res.status(200).json({ success: true, message: "Compra actualizada", data: updated });
  } catch (err) { next(err); }
};

const updatePurchaseStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body || {};
    if (!id) return next(createHttpError(400, "ID es requerido"));
    if (quantity == null) return next(createHttpError(400, "La cantidad es requerida"));
    const updated = await Purchase.updateQuantity(Number(id), Number(quantity));
    if (!updated) return next(createHttpError(404, "Compra no encontrada"));
    await evaluateAndNotifyAlerts(updated);
    res.status(200).json({ success: true, message: "Stock actualizado", data: updated });
  } catch (err) { next(err); }
};

const deletePurchase = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createHttpError(400, "ID es requerido"));
    await Purchase.deleteById(Number(id));
    res.status(200).json({ success: true, message: "Compra eliminada" });
  } catch (err) { next(err); }
};

module.exports = { addPurchase, getPurchases, updatePurchase, updatePurchaseStock, deletePurchase };

// Helpers
async function evaluateAndNotifyAlerts(purchase) {
  try {
    const alerts = [];
    // Min-stock
    const currentStock = (purchase.stock != null) ? Number(purchase.stock) : (purchase.quantity != null ? Number(purchase.quantity) : null);
    if (purchase.alertMinStock != null && currentStock != null && currentStock <= Number(purchase.alertMinStock)) {
      const msg = `stock bajo: ${purchase.name} restante/s ${purchase.stock} ; en el minimo o por debajo del minimo (${purchase.alertMinStock})`;
      alerts.push(msg);
    }
     
    
    // Expiry
    if (purchase.expirationDate) {
      const today = new Date();
      const exp = new Date(purchase.expirationDate);
      const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
      if (diffDays <= DAYS_BEFORE_EXPIRY_ALERT) {
        alerts.push(`compra proxima a vencer (${purchase.name}) vence: ${formatDate(exp)}`);
      }
    }
    if (alerts.length === 0) return;
    for (const mensaje of alerts) {
      const alertaId = await ensureAlertIdByMessage(mensaje);
      try { await pool.query('UPDATE compras SET alerta_id = ? WHERE id = ? AND (alerta_id IS NULL)', [alertaId, purchase._id]); } catch {}
      await assignAlertToStaff(alertaId, purchase);
    }
  }catch { }
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function assignAlertToStaff(alertaId, purchase) {
  // Find role IDs for Admin/Cashier (supports 'Cajero' too)
  const [roleRows] = await pool.query(
    `SELECT id FROM roles WHERE LOWER(nombre) IN ('admin','cashier','cajero')`
  );
  if (!roleRows.length) return;
  const roleIds = roleRows.map(r => r.id);
  const placeholders = roleIds.map(() => '?').join(',');
  const [userRows] = await pool.query(
    `SELECT DISTINCT usuario_id FROM roles_x_usuarios WHERE role_id IN (${placeholders})`,
    roleIds
  );
  if (!userRows.length) return;
  const values = userRows.map(u => [u.usuario_id, alertaId]);
  await pool.query(
    `INSERT INTO alertas_x_usuarios (usuario_id, alerta_id, created_at, updated_at) VALUES ${values.map(() => '(?, ?, NOW(), NOW())').join(',')}`,
    values.flat()
  );

  // Email recipients that are active (estado_id=1)
  try {
    const [emails] = await pool.query(
      `SELECT DISTINCT u.correo AS email
         FROM roles_x_usuarios rxu
         JOIN usuarios u ON u.id = rxu.usuario_id
        WHERE rxu.role_id IN (${placeholders})
          AND u.estado_id = 1
          AND u.correo IS NOT NULL AND u.correo <> ''`,
      roleIds
    );
    if (emails?.length) {
      const [[a]] = await pool.query('SELECT mensaje_alrt FROM alertas WHERE id = ? LIMIT 1', [alertaId]);
      const [ctxRows] = await pool.query(
        "SELECT c.nombre AS producto, c.cantidad AS cantidad, c.unidad_medida AS unidad, c.entrega AS entrega, p.nombre AS prov_nombre, p.telefono AS prov_tel, p.correo AS prov_correo, p.contacto AS prov_contacto FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedore_id WHERE c.id = ? LIMIT 1",
        [purchase?._id || 0]
      );
      const ctx = ctxRows && ctxRows[0] ? ctxRows[0] : {};
      const subject = 'Alerta de stock' + (ctx && ctx.producto ? ' - ' + ctx.producto : '');
      const message = a?.mensaje_alrt || subject;
      const lastQty = (ctx.cantidad != null ? String(ctx.cantidad) : '-') + (ctx.unidad ? (' ' + ctx.unidad) : '');
      const entrega = ctx.entrega || '-';
      let prov = '';
      if (ctx.prov_nombre) {
        prov += '<div style="margin-top:12px;"><div style="font-weight:bold">Proveedor</div>';
        prov += '<div>' + ctx.prov_nombre + (ctx.prov_contacto ? (' - ' + ctx.prov_contacto) : '') + '</div>';
        if (ctx.prov_tel) prov += '<div>Tel: ' + ctx.prov_tel + '</div>';
        if (ctx.prov_correo) prov += '<div>Email: ' + ctx.prov_correo + '</div>';
        prov += '</div>';
      }
      const detalles = '<div style="margin-top:12px;"><div style="font-weight:bold">Última compra</div>' +
        '<div>Cantidad: ' + lastQty + '</div>' +
        '<div>Entrega: ' + entrega + '</div></div>';
      const enriched = '<div style="font-family:Arial,sans-serif;color:#222">' +
        '<div style="text-align:center; margin-bottom: 10px;"><img src="cid:logo" alt="Nativhos" style="height:50px" /></div>' +
        '<h3 style="margin:0 0 8px">' + subject + '</h3>' +
        '<p style="margin:0 0 8px">' + message + '</p>' +
        detalles + prov + '</div>';
      for (const row of emails) {
        await sendEmailIfConfigured(row.email, subject, enriched);
      }
    }
  } catch { }
}

async function sendEmailIfConfigured(to, subject, html) {
  try {
    const user = process.env.SMTP_USER || (require('../config/config').business.email);
    const pass = process.env.SMTP_PASS || process.env.EMAIL_APP_PASS || '';
    if (!user || !pass) return;
    let nodemailer; try { nodemailer = require('nodemailer'); } catch { return; }
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    const logoPath = require('path').resolve(__dirname, '..', '..', 'pos-frontend', 'src', 'assets', 'images', 'logo.png');
    const attachments = [];
    try {
      if (require('fs').existsSync(logoPath)) {
        attachments.push({ filename: 'logo.png', path: logoPath, cid: 'logo' });
      }
    } catch { }
    await transporter.sendMail({ from: `Nativhos <${user}>`, to, subject, html, attachments });
  } catch { }
}



