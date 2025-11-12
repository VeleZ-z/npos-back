const createHttpError = require("http-errors");
const PaymentMethod = require("../models/paymentMethodModel");

const addPaymentMethod = async (req, res, next) => {
  try {
    const { name, estado_id } = req.body || {};
    if (!name) return next(createHttpError(400, "el nombre es requerido"));
    const pm = PaymentMethod({ name, estadoId: estado_id });
    await pm.save();
    res.status(201).json({ success: true, message: "Método de pago creado", data: pm });
  } catch (err) {
    next(err);
  }
};

const getPaymentMethods = async (req, res, next) => {
  try {
    const list = await PaymentMethod.find();
    res.status(200).json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
};

const getPaymentMethodById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pm = await PaymentMethod.findById(Number(id));
    if (!pm) return next(createHttpError(404, "Método de pago no encontrado"));
    res.status(200).json({ success: true, data: pm });
  } catch (err) {
    next(err);
  }
};

const updatePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await PaymentMethod.updateById(Number(id), req.body || {});
    if (!updated) return next(createHttpError(404, "Método de pago no encontrado"));
    res.status(200).json({ success: true, message: "Método de pago actualizado", data: updated });
  } catch (err) {
    next(err);
  }
};

const updatePaymentMethodEstado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { estado_id } = req.body || {};
    if (!estado_id) return next(createHttpError(400, "el estado_id es requerido"));
    const updated = await PaymentMethod.updateEstado(Number(id), Number(estado_id));
    res.status(200).json({ success: true, message: "Estado actualizado", data: updated });
  } catch (err) {
    next(err);
  }
};

const deletePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;
    await PaymentMethod.deleteById(Number(id));
    res.status(200).json({ success: true, message: "Método de pago eliminado" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  addPaymentMethod,
  getPaymentMethods,
  getPaymentMethodById,
  updatePaymentMethod,
  updatePaymentMethodEstado,
  deletePaymentMethod,
};

