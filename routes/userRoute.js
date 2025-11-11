const express = require("express");
const { getUserData, logout, googleLogin, getDocTypes, updateProfile, getUsers, adminUpdateUser, adminSetUserRole, getRoles, searchUsers } = require("../controllers/userController");
const { isVerifiedUser, authorizeRoles } = require("../middlewares/tokenVerification");
const router = express.Router();


// Authentication Routes (Google One Tap only)
router.route("/google-login").post(googleLogin);
router.route("/logout").post(isVerifiedUser, logout)

router.route("/").get(isVerifiedUser , getUserData);
router.get('/doc-types', isVerifiedUser, getDocTypes);
router.put('/profile', isVerifiedUser, updateProfile);
router.get('/search', isVerifiedUser, authorizeRoles('admin','cashier'), searchUsers);
router.get('/all', isVerifiedUser, authorizeRoles('admin'), getUsers);
router.put('/:id', isVerifiedUser, authorizeRoles('admin'), adminUpdateUser);
router.put('/:id/role', isVerifiedUser, authorizeRoles('admin'), adminSetUserRole);
router.get('/roles', isVerifiedUser, authorizeRoles('admin'), getRoles);

module.exports = router;
