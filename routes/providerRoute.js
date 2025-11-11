const express = require("express");
const { addProvider, getProviders, getProviderById, updateProvider, deleteProvider } = require("../controllers/providerController");
const { isVerifiedUser, authorizeRoles } = require("../middlewares/tokenVerification");
const router = express.Router();

// List providers (Admin + Cashier)
router.get('/', isVerifiedUser, authorizeRoles('admin','cashier'), getProviders);
router.get('/:id', isVerifiedUser, authorizeRoles('admin','cashier'), getProviderById);

// CRUD only Admin
router.post('/', isVerifiedUser, authorizeRoles('admin'), addProvider);
router.put('/:id', isVerifiedUser, authorizeRoles('admin'), updateProvider);
router.delete('/:id', isVerifiedUser, authorizeRoles('admin'), deleteProvider);

module.exports = router;

