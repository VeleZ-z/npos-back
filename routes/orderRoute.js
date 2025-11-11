const express = require("express");
const { addOrder, getOrders, getOrderById, updateOrder, getOrderByTable, addItemToTable, listOrderItems, updateOrderItem, deleteOrderItem, moveOrderItem, deleteOrder, setOrderCustomer, markItemsPrinted } = require("../controllers/orderController");
const { isVerifiedUser, authorizeRoles } = require("../middlewares/tokenVerification");
const router = express.Router();


router.route("/").post(isVerifiedUser, addOrder);
router.route("/").get(isVerifiedUser, getOrders);
router.route("/:id").get(isVerifiedUser, getOrderById);
// Only staff may update order statuses
router.route("/:id").put(isVerifiedUser, authorizeRoles('admin','cashier'), updateOrder);
router.route("/:id").delete(isVerifiedUser, authorizeRoles('admin','cashier'), deleteOrder);
router.put('/:id/customer', isVerifiedUser, authorizeRoles('admin','cashier'), setOrderCustomer);

// Sales endpoints
router.get('/table/:mesaId', isVerifiedUser, authorizeRoles('admin','cashier'), getOrderByTable);
router.post('/table/:mesaId/item', isVerifiedUser, authorizeRoles('admin','cashier'), addItemToTable);
router.get('/:id/items', isVerifiedUser, authorizeRoles('admin','cashier'), listOrderItems);
router.put('/:id/item/:itemId', isVerifiedUser, authorizeRoles('admin','cashier'), updateOrderItem);
router.delete('/:id/item/:itemId', isVerifiedUser, authorizeRoles('admin','cashier'), deleteOrderItem);
router.post('/:id/item/:itemId/move', isVerifiedUser, authorizeRoles('admin','cashier'), moveOrderItem);
router.post('/:id/printed', isVerifiedUser, authorizeRoles('admin','cashier'), markItemsPrinted);

module.exports = router;
