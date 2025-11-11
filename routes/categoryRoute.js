const express = require("express");
const { addCategory, getCategories, updateCategory, deleteCategory } = require("../controllers/categoryController");
const { isVerifiedUser, authorizeRoles } = require("../middlewares/tokenVerification");
const router = express.Router();

router.route("/")
  .post(isVerifiedUser, authorizeRoles('admin'), addCategory)
  .get(isVerifiedUser, getCategories);

router.route("/:id")
  .put(isVerifiedUser, authorizeRoles('admin'), updateCategory)
  .delete(isVerifiedUser, authorizeRoles('admin'), deleteCategory);

module.exports = router;
