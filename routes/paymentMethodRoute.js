const express = require("express");
const router = express.Router();
const { isVerifiedUser, authorizeRoles } = require("../middlewares/tokenVerification");
const {
  addPaymentMethod,
  getPaymentMethods,
  getPaymentMethodById,
  updatePaymentMethod,
  updatePaymentMethodEstado,
  deletePaymentMethod,
} = require("../controllers/paymentMethodController");

// List and read
router.get('/', isVerifiedUser, authorizeRoles('admin','cashier'), getPaymentMethods);
router.get('/:id', isVerifiedUser, authorizeRoles('admin','cashier'), getPaymentMethodById);

// Admin CRUD
router.post('/', isVerifiedUser, authorizeRoles('admin'), addPaymentMethod);
router.put('/:id', isVerifiedUser, authorizeRoles('admin'), updatePaymentMethod);
router.delete('/:id', isVerifiedUser, authorizeRoles('admin'), deletePaymentMethod);

// Estado change (Admin or Cashier)
router.put('/:id/estado', isVerifiedUser, authorizeRoles('admin','cashier'), updatePaymentMethodEstado);

module.exports = router;

