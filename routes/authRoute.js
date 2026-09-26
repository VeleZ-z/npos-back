const express = require("express");
const { getState } = require("../controllers/authController");
const { authLimiter } = require("../middlewares/rateLimiters");
const router = express.Router();

router.get('/state', authLimiter, getState);

module.exports = router;
