const express = require("express");
const {
  getPopularProducts,
  getTodaySummary,
} = require("../controllers/statsController");
const { isVerifiedUser } = require("../middlewares/tokenVerification");

const router = express.Router();

router.get("/popular-products", isVerifiedUser, getPopularProducts);
router.get("/today", isVerifiedUser, getTodaySummary);

module.exports = router;
