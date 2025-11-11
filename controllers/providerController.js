const createHttpError = require("http-errors");
const Provider = require("../models/providerModel");

const addProvider = async (req, res, next) => {
  try {
    const { name, phone, email, contact } = req.body || {};
    if (!name || !contact) return next(createHttpError(400, "name and contact are required"));
    const prov = Provider({ name, phone, email, contact });
    await prov.save();
    res.status(201).json({ success: true, message: "Provider created", data: prov });
  } catch (err) {
    next(err);
  }
};

const getProviders = async (req, res, next) => {
  try {
    const provs = await Provider.find();
    res.status(200).json({ success: true, data: provs });
  } catch (err) {
    next(err);
  }
};

const getProviderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const prov = await Provider.findById(Number(id));
    if (!prov) return next(createHttpError(404, "Provider not found"));
    res.status(200).json({ success: true, data: prov });
  } catch (err) {
    next(err);
  }
};

const updateProvider = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await Provider.updateById(Number(id), req.body || {});
    if (!updated) return next(createHttpError(404, "Provider not found"));
    res.status(200).json({ success: true, message: "Provider updated", data: updated });
  } catch (err) {
    next(err);
  }
};

const deleteProvider = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Provider.deleteById(Number(id));
    res.status(200).json({ success: true, message: "Provider deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = { addProvider, getProviders, getProviderById, updateProvider, deleteProvider };

