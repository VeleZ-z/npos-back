const createHttpError = require("http-errors");
const Purchase = require("../models/purchaseModel");
const {
  ensurePurchaseAlertId,
  evaluatePurchaseAlerts,
} = require("../services/purchaseAlertService");

const addPurchase = async (req, res, next) => {
  try {
    const {
      name,
      batchCode,
      quantity,
      deliveryDate,
      expirationDate,
      cost,
      providerId,
      alertMinStock,
      unidadMedida,
      estadoCompraId,
      alertMessage,
    } = req.body || {};
    if (!name) return next(createHttpError(400, "El nombre es requerido"));
    if (quantity == null)
      return next(createHttpError(400, "La cantidad es requerida"));

    const alertaId = await ensurePurchaseAlertId(alertMessage);
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
      alertaId,
    });
    await purchase.save();
    await evaluatePurchaseAlerts(purchase);
    res
      .status(201)
      .json({ success: true, message: "Compra registrada", data: purchase });
  } catch (err) {
    next(err);
  }
};

const getPurchases = async (req, res, next) => {
  try {
    const purchases = await Purchase.find();
    res.status(200).json({ success: true, data: purchases });
  } catch (err) {
    next(err);
  }
};

const updatePurchase = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createHttpError(400, "ID es requerido"));
    const payload = { ...(req.body || {}) };
    if (payload.alertMessage != null) {
      payload.alertaId = await ensurePurchaseAlertId(payload.alertMessage);
    }
    const updated = await Purchase.updateById(Number(id), payload);
    if (!updated) return next(createHttpError(404, "Compra no encontrada"));
    await evaluatePurchaseAlerts(updated);
    res
      .status(200)
      .json({ success: true, message: "Compra actualizada", data: updated });
  } catch (err) {
    next(err);
  }
};

const updatePurchaseStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body || {};
    if (!id) return next(createHttpError(400, "ID es requerido"));
    if (quantity == null)
      return next(createHttpError(400, "La cantidad es requerida"));
    const updated = await Purchase.updateQuantity(Number(id), Number(quantity));
    if (!updated) return next(createHttpError(404, "Compra no encontrada"));
    await evaluatePurchaseAlerts(updated);
    res
      .status(200)
      .json({ success: true, message: "Stock actualizado", data: updated });
  } catch (err) {
    next(err);
  }
};

const deletePurchase = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createHttpError(400, "ID es requerido"));
    await Purchase.deleteById(Number(id));
    res.status(200).json({ success: true, message: "Compra eliminada" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  addPurchase,
  getPurchases,
  updatePurchase,
  updatePurchaseStock,
  deletePurchase,
};
