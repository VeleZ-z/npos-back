const createHttpError = require("http-errors");
const Category = require("../models/categoryModel");

const addCategory = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return next(createHttpError(400, "Category name is required"));
    const cat = Category({ name });
    await cat.save();
    res.status(201).json({ success: true, message: "Category created", data: cat });
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
    if (!id) return next(createHttpError(400, "Category id is required"));
    const updated = await Category.updateById(Number(id), { name });
    if (!updated) return next(createHttpError(404, "Category not found"));
    res.status(200).json({ success: true, message: "Category updated", data: updated });
  } catch (err) {
    next(err);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createHttpError(400, "Category id is required"));
    await Category.deleteById(Number(id));
    res.status(200).json({ success: true, message: "Category deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = { addCategory, getCategories, updateCategory, deleteCategory };

