const express = require("express");
const {
  getCurrentCashDesk,
  openCashDesk,
  closeCashDesk,
  getCashDeskMovements,
  listCashDeskHistory,
  exportCashDeskMovements,
} = require("../controllers/cashDeskController");
const {
  isVerifiedUser,
  authorizeRoles,
} = require("../middlewares/tokenVerification");

const router = express.Router();

router.use(isVerifiedUser, authorizeRoles("Admin", "Cashier"));

router.get("/current", getCurrentCashDesk);
router.post("/open", openCashDesk);
router.post("/close", closeCashDesk);
router.get("/movements", getCashDeskMovements);
router.get("/history", authorizeRoles("Admin"), listCashDeskHistory);
router.get("/export", exportCashDeskMovements);

module.exports = router;
