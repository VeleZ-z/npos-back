const express = require("express");
const { getState } = require("../controllers/authController");
const router = express.Router();

router.get('/state', getState);

module.exports = router;

