const createHttpError = require("http-errors");
const Product = require("../models/productModel");
const { pool } = require("../config/mysql");
const path = require("path");
const fs = require("fs");
const { evaluateProductAlerts } = require("../services/productAlertService");

async function generateInternalBarcode() {
  const start = 10000;
  try {
    const [[maxRow]] = await pool.query(
      "SELECT MAX(CAST(codigo_barras AS UNSIGNED)) AS maxcode FROM productos WHERE codigo_barras REGEXP '^[0-9]+$'"
    );
    let candidate = Number(maxRow?.maxcode || 0);
    if (!candidate || !Number.isFinite(candidate) || candidate < start) candidate = start;
    for (let i = 0; i < 100; i++) {
      const code = String(candidate + i);
      const [[exists]] = await pool.query(
        "SELECT 1 AS ok FROM productos WHERE codigo_barras = ? LIMIT 1",
        [code]
      );
      if (!exists?.ok) return code;
    }
    return String(candidate + 101);
  } catch {
    return String(start);
  }
}

async function getDefaultTaxId() {
  const [[row]] = await pool.query("SELECT id FROM impuestos ORDER BY id LIMIT 1");
  if (!row?.id) {
    throw createHttpError(
      500,
      "No hay impuestos configurados. Registra al menos uno antes de crear productos."
    );
  }
  return row.id;
}

async function ensureValidTaxId(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return await getDefaultTaxId();
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createHttpError(400, "El impuesto seleccionado no es valido");
  }
  const [[row]] = await pool.query(
    "SELECT id FROM impuestos WHERE id = ? LIMIT 1",
    [parsed]
  );
  if (!row?.id) {
    throw createHttpError(400, "El impuesto seleccionado no existe");
  }
  return parsed;
}

const addProduct = async (req, res, next) => {
  try {
    const body = req.body || {};
    const {
      name,
      price,
      categoryId,
      estadoId,
      barcode,
      codigo_barras,
      quantity,
      cantidad,
      cost,
      costo,
      impuestoId,
      taxId,
    } = body;
    if (!name || price == null) {
      return next(createHttpError(400, "Producto y Precio son campos requeridos"));
    }
    const rawAlert = body.alertMinStock ?? body.alerta_min_stock;
    const alertMinStock =
      rawAlert === undefined || rawAlert === null || rawAlert === ""
        ? null
        : Number(rawAlert);

    let finalBarcode = barcode ?? codigo_barras ?? null;
    if (!finalBarcode) {
      finalBarcode = await generateInternalBarcode();
    }
    const validatedTaxId = await ensureValidTaxId(
      impuestoId ?? taxId ?? body.impuesto_id ?? body.tax_id
    );

    const product = Product({
      name,
      price,
      estadoId,
      categoryId: categoryId ?? null,
      barcode: finalBarcode,
      quantity: quantity ?? cantidad ?? 0,
      cost: cost ?? costo ?? 0,
      alertMinStock,
      impuestoId: validatedTaxId,
    });
    await product.save();
    let fresh = await Product.findById(product._id);
    const alertSource = fresh || product;
    await evaluateProductAlerts(alertSource);
    if (!fresh) {
      fresh = await Product.findById(product._id);
    }
    res
      .status(201)
      .json({ success: true, message: "Producto creado", data: fresh || product });
  } catch (err) {
    next(err);
  }
};

const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find();
    res.status(200).json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id)
      return next(createHttpError(400, "el id del Producto es un campo requerido"));
    const body = req.body || {};
    const {
      name,
      price,
      active,
      categoryId,
      estadoId,
      barcode,
      codigo_barras,
      quantity,
      cantidad,
      cost,
      costo,
      impuestoId,
      taxId,
    } = body;
    const rawAlert = body.alertMinStock ?? body.alerta_min_stock;
    const alertMinStock =
      rawAlert === undefined
        ? undefined
        : rawAlert === null || rawAlert === ""
        ? null
        : Number(rawAlert);

    const payload = {
      name,
      price,
      active,
      categoryId,
      estadoId,
      barcode: barcode ?? codigo_barras,
      quantity: quantity ?? cantidad,
      cost: cost ?? costo,
    };
    if (alertMinStock !== undefined) payload.alertMinStock = alertMinStock;
    payload.impuestoId = await ensureValidTaxId(
      impuestoId ?? taxId ?? body.impuesto_id ?? body.tax_id
    );

    const updated = await Product.updateById(Number(id), payload);
    if (!updated) return next(createHttpError(404, "Producto no encontrado"));
    await evaluateProductAlerts(updated);
    const refreshed = await Product.findById(Number(id));
    res
      .status(200)
      .json({ success: true, message: "Producto actualizado", data: refreshed });
  } catch (err) {
    next(err);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id)
      return next(createHttpError(400, "el id del Producto es un campo requerido"));
    await Product.deleteById(Number(id));
    res.status(200).json({ success: true, message: "Producto eliminado" });
  } catch (err) {
    next(err);
  }
};

const updateProductStockState = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id)
      return next(createHttpError(400, "el id del Producto es un campo requerido"));

    const body = req.body || {};
    const qty =
      body.quantity !== undefined
        ? body.quantity
        : body.cantidad !== undefined
        ? body.cantidad
        : undefined;
    const estadoId =
      body.estadoId !== undefined
        ? body.estadoId
        : body.estado_id !== undefined
        ? body.estado_id
        : undefined;

    const payload = {};
    if (qty !== undefined) {
      const parsed = Number(qty);
      if (Number.isNaN(parsed)) {
        return next(createHttpError(400, "Cantidad inválida"));
      }
      payload.quantity = parsed;
    }
    if (estadoId !== undefined && estadoId !== null && estadoId !== "") {
      payload.estadoId = estadoId;
    }
    if (!Object.keys(payload).length) {
      return next(
        createHttpError(
          400,
          "Proporciona cantidad o estado para actualizar"
        )
      );
    }

    const updated = await Product.updateById(Number(id), payload);
    if (!updated) return next(createHttpError(404, "Producto no encontrado"));
    await evaluateProductAlerts(updated);
    const refreshed = await Product.findById(Number(id));
    res.status(200).json({
      success: true,
      message: "Producto actualizado",
      data: refreshed,
    });
  } catch (err) {
    next(err);
  }
};

const ensureImageTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS productos_imagenes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      producto_id BIGINT UNSIGNED NOT NULL,
      mime_type VARCHAR(100) DEFAULT NULL,
      data LONGBLOB NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_producto (producto_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
};

const setProductImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id)
      return next(createHttpError(400, "el id del Producto es un campo requerido"));
    if (!req.file) return next(createHttpError(400, "Se requiere un archivo de Imagen"));

    await ensureImageTable();
    const mime = req.file.mimetype || null;
    const buf = req.file.buffer;
    await pool.query(
      `INSERT INTO productos_imagenes (producto_id, mime_type, data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [Number(id), mime, buf]
    );
    res.status(200).json({
      success: true,
      message: "Imagen cargada",
      data: { imageUrl: `/api/product/${id}/image` },
    });
  } catch (err) {
    next(err);
  }
};

const getProductImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id)
      return next(createHttpError(400, "el id del Producto es un campo requerido"));
    await ensureImageTable();
    const [rows] = await pool.query(
      "SELECT mime_type, data FROM productos_imagenes WHERE producto_id = ? LIMIT 1",
      [Number(id)]
    );
    if (!rows || rows.length === 0)
      return next(createHttpError(404, "Imagen no encontrada"));
    const row = rows[0];
    res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    return res.end(row.data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  addProduct,
  getProducts,
  updateProduct,
  deleteProduct,
  setProductImage,
  getProductImage,
  updateProductStockState,
};




