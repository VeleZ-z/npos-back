const { pool } = require("../config/mysql");
const path = require("path");
const fs = require("fs");

const ROLE_NAMES = ["admin", "administrator", "cashier", "cajero"];

function stripDiacritics(value) {
  if (!value) return "";
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeMessage(input) {
  return stripDiacritics(String(input || "")).toLowerCase().replace(/,/g, "").trim();
}

async function ensureAlertIdByMessage(message) {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;
  const [[row]] = await pool.query(
    "SELECT id FROM alertas WHERE REPLACE(LOWER(mensaje_alrt), ',', '') = ? LIMIT 1",
    [normalized]
  );
  if (row?.id) return row.id;
  const [result] = await pool.query(
    "INSERT INTO alertas (mensaje_alrt, created_at, updated_at) VALUES (?, NOW(), NOW())",
    [message]
  );
  return result.insertId;
}

async function evaluateProductAlerts(productOrId) {
  try {
    if (productOrId == null) return;
    let product = productOrId;
    let id = Number(product?._id ?? product?.id ?? productOrId);
    if (!Number.isFinite(id) || id <= 0) return;

    if (!product || product.quantity === undefined || product.alertMinStock === undefined) {
      const Product = require("../models/productModel");
      product = await Product.findById(id);
      if (!product) return;
    }

    const qty = product.quantity != null ? Number(product.quantity) : null;
    const min = product.alertMinStock != null ? Number(product.alertMinStock) : null;
    if (qty == null || Number.isNaN(qty) || min == null || Number.isNaN(min)) {
      if (product.alertaId) {
        await pool.query("UPDATE productos SET alerta_id = NULL WHERE id = ?", [id]);
        product.alertaId = null;
      }
      return;
    }

    if (qty > min) {
      if (product.alertaId) {
        await pool.query("UPDATE productos SET alerta_id = NULL WHERE id = ?", [id]);
        product.alertaId = null;
      }
      return;
    }

    const productName = stripDiacritics(product.name || "").trim() || "Producto";
    const message = `El Producto ${productName} tiene un stock de ${qty}, por debajo o precisamente en el minimo configurado (${min})`;
    const alertaId = await ensureAlertIdByMessage(message);
    if (!alertaId) return;

    const alreadyActive = Number(product.alertaId || 0) === Number(alertaId);
    await pool.query("UPDATE productos SET alerta_id = ? WHERE id = ?", [alertaId, id]);
    product.alertaId = alertaId;

    if (!alreadyActive) {
      await assignProductAlert(alertaId, product, message);
    }
  } catch (err) {
    console.error(err);
  }
}

async function assignProductAlert(alertaId, product, message) {
  if (!alertaId) return;
  try {
    const rolePlaceholders = ROLE_NAMES.map(() => "?").join(",");
    const [roleRows] = await pool.query(
      `SELECT id FROM roles WHERE LOWER(nombre) IN (${rolePlaceholders})`,
      ROLE_NAMES
    );
    if (!roleRows.length) return;
    const roleIds = roleRows.map((r) => r.id);

    const roleIdPlaceholders = roleIds.map(() => "?").join(",");
    const [userRows] = await pool.query(
      `SELECT DISTINCT usuario_id FROM roles_x_usuarios WHERE role_id IN (${roleIdPlaceholders})`,
      roleIds
    );
    if (!userRows.length) return;
    const userIds = userRows.map((r) => r.usuario_id).filter(Boolean);
    if (!userIds.length) return;

    const userPlaceholders = userIds.map(() => "?").join(",");
    const [existingRows] = await pool.query(
      `SELECT usuario_id FROM alertas_x_usuarios WHERE alerta_id = ? AND usuario_id IN (${userPlaceholders})`,
      [alertaId, ...userIds]
    );
    const existing = new Set((existingRows || []).map((r) => r.usuario_id));
    const toInsert = userIds.filter((id) => !existing.has(id));
    if (toInsert.length) {
      const valuesSql = toInsert.map(() => "(?, ?, NOW(), NOW())").join(",");
      const params = toInsert.flatMap((id) => [id, alertaId]);
      await pool.query(
        `INSERT INTO alertas_x_usuarios (usuario_id, alerta_id, created_at, updated_at) VALUES ${valuesSql}`,
        params
      );
    }

    await emailStaff(roleIds, product, message);
  } catch (err) {
    console.error(err);
  }
}

async function emailStaff(roleIds, product, message) {
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
    let subject = "Alerta de producto";
    if (product?.name) subject += ` - ${product.name}`;
    const html = buildProductAlertEmail(subject, message, product);
    for (const row of emails) {
      await sendEmailIfConfigured(row.email, subject, html);
    }
  } catch (err) {
    console.error(err);
  }
}

function buildProductAlertEmail(subject, message, product) {
  const qty = product?.quantity != null ? Number(product.quantity) : "-";
  const min = product?.alertMinStock != null ? Number(product.alertMinStock) : "-";
  const barcode = product?.barcode || "-";
  return (
    '<div style="font-family:Arial,sans-serif;color:#222">' +
    '<div style="text-align:center;margin-bottom:10px;"><img src="cid:logo" alt="Nativhos" style="height:50px" /></div>' +
    `<h3 style="margin:0 0 8px">${subject}</h3>` +
    `<p style="margin:0 0 12px">${message}</p>` +
    `<div><strong>Stock actual:</strong> ${qty}</div>` +
    `<div><strong>Minimo establecido:</strong> ${min}</div>` +
    `<div><strong>Codigo de barras:</strong> ${barcode}</div>` +
    "</div>"
  );
}

async function sendEmailIfConfigured(to, subject, html) {
  try {
    const user =
      process.env.SMTP_USER || require("../config/config").business.email;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_APP_PASS || "";
    if (!user || !pass) return;
    let nodemailer;
    try {
      nodemailer = require("nodemailer");
    } catch {
      return;
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    const logoPath = path.resolve(
      __dirname,
      "..",
      "..",
      "pos-frontend",
      "src",
      "assets",
      "images",
      "logo.png"
    );
    const attachments = [];
    try {
      if (fs.existsSync(logoPath)) {
        attachments.push({ filename: "logo.png", path: logoPath, cid: "logo" });
      }
    } catch {
      // ignore
    }
    await transporter.sendMail({
      from: `Nativhos <${user}>`,
      to,
      subject,
      html,
      attachments,
    });
  } catch (err) {
    console.error(err);
  }
}

module.exports = { evaluateProductAlerts };
