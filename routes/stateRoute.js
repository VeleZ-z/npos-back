const express = require("express");
const { getStates } = require("../controllers/stateController");
const { isVerifiedUser } = require("../middlewares/tokenVerification");
const router = express.Router();

router.get('/', isVerifiedUser, getStates);

module.exports = router;

