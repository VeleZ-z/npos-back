const Tax = require("../models/taxModel");

const getTaxes = async (req, res, next) => {
  try {
    const taxes = await Tax.findAll();
    res.status(200).json({ success: true, data: taxes });
  } catch (err) {
    next(err);
  }
};

module.exports = { getTaxes };
