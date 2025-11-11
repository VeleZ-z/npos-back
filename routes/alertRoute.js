const express = require("express");
const { isVerifiedUser } = require("../middlewares/tokenVerification");
const { getMyAlerts, ackMyAlert } = require("../controllers/alertController");
const router = express.Router();

// Any verified user can read/ack their own alerts
router.get('/', isVerifiedUser, getMyAlerts);
router.post('/:id/ack', isVerifiedUser, ackMyAlert);

module.exports = router;
