const Table = require("../models/tableModel");
const createHttpError = require("http-errors");

const addTable = async (req, res, next) => {
  try {
    const { tableNo, seats } = req.body;
    if (!tableNo) {
      const error = createHttpError(400, "Por favor, proporcione el número de mesa!");
      return next(error);
    }
    const isTablePresent = await Table.findOne({ tableNo });

    if (isTablePresent) {
      const error = createHttpError(400, "la mesa ya existe!");
      return next(error);
    }

    const newTable = new Table({ tableNo, seats }); 
    await newTable.save();
    res
      .status(201)
      .json({ success: true, message: "Mesa añadida!", data: newTable });   
  } catch (error) {
    next(error);
  }
};

const getTables = async (req, res, next) => {
  try {
    const tables = await Table.find().populate({
      path: "currentOrder",
      select: "customerDetails"
    });
    res.status(200).json({ success: true, data: tables });
  } catch (error) {
    next(error);
  }
};

const updateTable = async (req, res, next) => {
  try {
    const { status, orderId } = req.body;

    const { id } = req.params;
    if (!id || isNaN(Number(id))) {
      const error = createHttpError(404, "ID inválido!");
      return next(error);
    }

    const table = await Table.findByIdAndUpdate(Number(id), { status, currentOrder: orderId }, { new: true });

    if (!table) {
      const error = createHttpError(404, "Mesa no encontrada!");
      return error;
    }

    res.status(200).json({success: true, message: "Mesa actualizada!", data: table});

  } catch (error) {
    next(error);
  }
};

module.exports = { addTable, getTables, updateTable };
