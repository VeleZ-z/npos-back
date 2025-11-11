const express = require("express");
const { getTaxes } = require("../controllers/taxController");
const { isVerifiedUser } = require("../middlewares/tokenVerification");
const router = express.Router();

router.get("/", isVerifiedUser, getTaxes);

module.exports = router;
