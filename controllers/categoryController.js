const createHttpError = require("http-errors");
const Category = require("../models/categoryModel");

const addCategory = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return next(createHttpError(400, "el nombre de la categoría es requerido"));
    const cat = Category({ name });
    await cat.save();
    res.status(201).json({ success: true, message: "Categoría creada", data: cat });
  } catch (err) {
    next(err);
  }
};

const getCategories = async (req, res, next) => {
  try {
    const cats = await Category.find();
    res.status(200).json({ success: true, data: cats });
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!id) return next(createHttpError(400, "el ID de la categoría es requerido"));
    const updated = await Category.updateById(Number(id), { name });
    if (!updated) return next(createHttpError(404, "Categoría no encontrada"));
    res.status(200).json({ success: true, message: "Categoría actualizada", data: updated });
  } catch (err) {
    next(err);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createHttpError(400, "el ID de la categoría es requerido"));
    await Category.deleteById(Number(id));
    res.status(200).json({ success: true, message: "Category deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = { addCategory, getCategories, updateCategory, deleteCategory };

