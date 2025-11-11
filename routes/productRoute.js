const express = require("express");
const {
  addProduct,
  getProducts,
  updateProduct,
  deleteProduct,
  setProductImage,
  getProductImage,
  updateProductStockState,
} = require("../controllers/productController");
const {
  isVerifiedUser,
  authorizeRoles,
} = require("../middlewares/tokenVerification");
const router = express.Router();
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Invalid file type"));
    cb(null, true);
  }
});

router.route("/")
  .post(isVerifiedUser, authorizeRoles('admin'), addProduct)
  .get(isVerifiedUser, getProducts);

router.route("/:id")
  .put(isVerifiedUser, authorizeRoles('admin'), updateProduct)
  .delete(isVerifiedUser, authorizeRoles('admin'), deleteProduct);

router.patch(
  "/:id/stock-state",
  isVerifiedUser,
  authorizeRoles('admin', 'cashier'),
  updateProductStockState
);

router.post("/:id/image", isVerifiedUser, authorizeRoles('admin'), upload.single("image"), setProductImage);
router.get("/:id/image", getProductImage);

module.exports = router;
