const express = require("express");
const router = express.Router();
const { isVerifiedUser } = require("../middlewares/tokenVerification");
const { validateBody } = require("../middlewares/validateBody");
const { createInvoiceSchema } = require("../validations/schemas");
const {
  createInvoice,
  getInvoice,
  getInvoices,
  getCustomerInvoices,
  cancelInvoice
} = require("../controllers/invoiceController");

// Todas las rutas requieren autenticación
router.use(isVerifiedUser);

// Crear factura (solo cajeros y admin)
router.post("/", validateBody(createInvoiceSchema), createInvoice);

// Listar facturas con filtros
router.get("/", getInvoices);

// Obtener facturas de un cliente específico
router.get("/customer/:customerId", getCustomerInvoices);

// Obtener factura por ID
router.get("/:id", getInvoice);

// Anular factura (solo admin)
router.patch("/:id/cancel", cancelInvoice);

module.exports = router;