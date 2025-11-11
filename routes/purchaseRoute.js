const express = require("express");
const { isVerifiedUser, authorizeRoles } = require("../middlewares/tokenVerification");
const { addPurchase, getPurchases, updatePurchase, updatePurchaseStock, deletePurchase } = require("../controllers/purchaseController");
const router = express.Router();

router.route('/')
  .get(isVerifiedUser, authorizeRoles('admin','cashier'), getPurchases)
  .post(isVerifiedUser, authorizeRoles('admin'), addPurchase);

router.route('/:id')
  .put(isVerifiedUser, authorizeRoles('admin'), updatePurchase)
  .delete(isVerifiedUser, authorizeRoles('admin'), deletePurchase);

router.put('/:id/stock', isVerifiedUser, authorizeRoles('admin','cashier'), updatePurchaseStock);

module.exports = router;

