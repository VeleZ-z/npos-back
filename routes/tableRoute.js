const express = require("express");
const { addTable, getTables, updateTable } = require("../controllers/tableController");
const router = express.Router();
const { isVerifiedUser, authorizeRoles } = require("../middlewares/tokenVerification")

// RBAC según matriz del proyecto: listar = admin/cashier; crear/actualizar = admin
router.route("/").post(isVerifiedUser, authorizeRoles("admin"), addTable);
router.route("/").get(isVerifiedUser, authorizeRoles("admin", "cashier"), getTables);
router.route("/:id").put(isVerifiedUser, authorizeRoles("admin"), updateTable);

module.exports = router;