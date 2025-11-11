const express = require("express");
const multer = require("multer");
const {
  getActiveDiscounts,
  getAdminDiscounts,
  createDiscount,
  updateDiscount,
  resendDiscount,
} = require("../controllers/discountController");
const {
  isVerifiedUser,
  authorizeRoles,
} = require("../middlewares/tokenVerification");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Invalid file"));
    cb(null, true);
  },
});

router.get("/", isVerifiedUser, getActiveDiscounts);
router.get(
  "/admin",
  isVerifiedUser,
  authorizeRoles("Admin"),
  getAdminDiscounts
);
router.post(
  "/",
  isVerifiedUser,
  authorizeRoles("Admin"),
  upload.single("flyer"),
  createDiscount
);
router.put(
  "/:id",
  isVerifiedUser,
  authorizeRoles("Admin"),
  upload.single("flyer"),
  updateDiscount
);
router.post(
  "/:id/resend",
  isVerifiedUser,
  authorizeRoles("Admin"),
  resendDiscount
);

module.exports = router;
