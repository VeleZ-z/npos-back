const createHttpError = require("http-errors");
const fs = require("fs");
const path = require("path");
const Discount = require("../models/discountModel");
const User = require("../models/userModel");
const { pool } = require("../config/mysql");
const { sendEmail, buildAssetUrl } = require("../services/emailService");

const flyersDir = path.resolve(__dirname, "..", "uploads", "discounts");

const ensureFlyersDir = () => {
  try {
    fs.mkdirSync(flyersDir, { recursive: true });
  } catch {}
};

const saveFlyer = (file) => {
  if (!file) return null;
  ensureFlyersDir();
  const ext = path.extname(file.originalname) || ".png";
  const filename = `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}${ext}`;
  const destPath = path.join(flyersDir, filename);
  fs.writeFileSync(destPath, file.buffer);
  return `/uploads/discounts/${filename}`;
};

const buildDiscountHtml = (discount) => {
  const lines = [];
  lines.push(`<h2>Nuevo descuento: ${discount.name}</h2>`);
  if (discount.message) {
    lines.push(`<p>${discount.message}</p>`);
  }
  lines.push(
    `<p><strong>Valor:</strong> ${discount.value ?? "-"} | <strong>Porcentaje:</strong> ${
      discount.percent ?? "-"
    }%</p>`
  );
  if (discount.products?.length) {
    const list = discount.products
      .map(
        (p) =>
          `<li>${p.name || `Producto #${p.productId || p.id || ""}`}</li>`
      )
      .join("");
    lines.push(`<div><strong>Productos:</strong><ul>${list}</ul></div>`);
  }
  const flyerUrl = buildAssetUrl(discount.imageUrl);
  if (flyerUrl) {
    lines.push(
      `<div><img src="${flyerUrl}" alt="${discount.name}" style="max-width:400px;border-radius:12px"/></div>`
    );
  }
  return `<div style="font-family:Arial,sans-serif;color:#111;">${lines.join(
    ""
  )}</div>`;
};

const broadcastDiscount = async (discount) => {
  const users = await User.findAll();
  if (!users.length) return;

  const html = buildDiscountHtml(discount);
  const recipients = users
    .map((user) => user.email)
    .filter((email) => Boolean(email));
  const chunkSize = 40;
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const batch = recipients.slice(i, i + chunkSize);
    if (!batch.length) continue;
    try {
      await sendEmail({
        to: batch,
        subject: `Nuevo descuento: ${discount.name}`,
        html,
      });
      if (i + chunkSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    } catch (err) {
      console.log("[discount email]", err?.message || err);
    }
  }

  // Notifications (alertas)
  const message = `Nuevo descuento: ${discount.name} - ${
    discount.message || "Aprovecha esta promoción."
  }`;
  const [alertRes] = await pool.query(
    "INSERT INTO alertas (mensaje_alrt, created_at, updated_at) VALUES (?, NOW(), NOW())",
    [message]
  );
  const alertaId = alertRes.insertId;
  const userIds = users.map((u) => u._id).filter(Boolean);
  if (alertaId && userIds.length) {
    const values = userIds.map(() => "(?, ?, NOW(), NOW())").join(",");
    const params = [];
    userIds.forEach((id) => {
      params.push(id, alertaId);
    });
    await pool.query(
      `INSERT INTO alertas_x_usuarios (usuario_id, alerta_id, created_at, updated_at) VALUES ${values}`,
      params
    );
  }
};

const getActiveDiscounts = async (req, res, next) => {
  try {
    const list = await Discount.findActive();
    res.status(200).json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
};

const getAdminDiscounts = async (req, res, next) => {
  try {
    const list = await Discount.findAll();
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

const parseProductIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.slice(0, 1);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.slice(0, 1);
    } catch {}
    return value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 1);
  }
  return [];
};

const createDiscount = async (req, res, next) => {
  try {
    const { nombre, valor, porciento, is_activo, mensaje, productos, productoId } =
      req.body;
    if (!nombre) {
      return next(createHttpError(400, "Nombre es requerido"));
    }
    if (valor && porciento) {
      return next(
        createHttpError(
          400,
          "Solo puedes aplicar un descuento por valor o por porcentaje"
        )
      );
    }
    const flyerPath = saveFlyer(req.file);
    const productIds = parseProductIds(productos ?? productoId);
    if (!productIds.length) {
      return next(createHttpError(400, "Selecciona un producto asociado"));
    }
    const discount = await Discount.create({
      name: nombre,
      value: valor != null ? Number(valor) : null,
      percent: porciento != null ? Number(porciento) : null,
      active: is_activo !== undefined ? Boolean(Number(is_activo)) : true,
      message: mensaje || null,
      imageUrl: flyerPath,
      productIds,
    });
    await broadcastDiscount(discount);
    res.status(201).json({
      success: true,
      message: "Descuento creado y enviado",
      data: discount,
    });
  } catch (error) {
    next(error);
  }
};

const updateDiscount = async (req, res, next) => {
  try {
    const discountId = req.params.id;
    const existing = await Discount.findById(discountId);
    if (!existing) {
      return next(createHttpError(404, "Descuento no encontrado"));
    }
    let flyerPath = existing.imageUrl;
    if (req.file) {
      flyerPath = saveFlyer(req.file);
    }
    if (req.body.valor && req.body.porciento) {
      return next(
        createHttpError(
          400,
          "Solo puedes aplicar un descuento por valor o por porcentaje"
        )
      );
    }
    const productIds = parseProductIds(
      req.body.productos ?? req.body.productoId
    );
    if (!productIds.length) {
      return next(createHttpError(400, "Selecciona un producto asociado"));
    }
    const updated = await Discount.updateById(discountId, {
      name: req.body.nombre,
      value: req.body.valor,
      percent: req.body.porciento,
      active: req.body.is_activo,
      message: req.body.mensaje,
      imageUrl: flyerPath,
      productIds,
    });
    res.json({
      success: true,
      message: "Descuento actualizado",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

const resendDiscount = async (req, res, next) => {
  try {
    const discount = await Discount.findById(req.params.id);
    if (!discount) {
      return next(createHttpError(404, "Descuento no encontrado"));
    }
    await broadcastDiscount(discount);
    res.json({
      success: true,
      message: "Descuento reenviado",
      data: discount,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActiveDiscounts,
  getAdminDiscounts,
  createDiscount,
  updateDiscount,
  resendDiscount,
};
