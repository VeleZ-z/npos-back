const createHttpError = require("http-errors");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const { pool } = require("../config/mysql");

const STATUS_REQUIRING_TABLE = new Set(["PENDIENTE", "LISTO", "READY"]);
const ROLE_STAFF = new Set(["Cashier", "Administrator", "Admin", "Administrador"]);

function normalizeUserId(value) {
  if (value == null) return null;
  if (typeof value === "object") {
    if (value._id != null) return normalizeUserId(value._id);
    if (value.id != null) return normalizeUserId(value.id);
    if (value.userId != null) return normalizeUserId(value.userId);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

async function resolveMesaIdFromOrder(order) {
  const table = order?.table;
  if (!table) return null;
  if (typeof table === "number") {
    const num = Number(table);
    if (!Number.isFinite(num) || num <= 0) return null;
    const [[row]] = await pool.query("SELECT id FROM mesas WHERE id = ? LIMIT 1", [num]);
    return row?.id || null;
  }
  if (typeof table === "string") {
    const parsed = Number(table);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const [[row]] = await pool.query("SELECT id FROM mesas WHERE id = ? LIMIT 1", [parsed]);
    return row?.id || null;
  }
  if (table && typeof table === "object") {
    const candidates = [table.tableId, table.id, table._id];
    for (const candidate of candidates) {
      const num = Number(candidate);
      if (!Number.isFinite(num) || num <= 0) continue;
      const [[row]] = await pool.query("SELECT id FROM mesas WHERE id = ? LIMIT 1", [num]);
      if (row?.id) return row.id;
    }
    const numberCandidates = [table.number, table.tableNo];
    for (const candidate of numberCandidates) {
      const tableNumber = Number(candidate);
      if (!Number.isFinite(tableNumber) || tableNumber <= 0) continue;
      const [[row]] = await pool.query(
        "SELECT id FROM mesas WHERE numero = ? LIMIT 1",
        [tableNumber]
      );
      if (row?.id) return row.id;
    }
  }
  return null;
}

const addOrder = async (req, res, next) => {
  try {
    const body = req.body || {};
    const currentUserId = normalizeUserId(req.user?._id);
    // If user is Customer (or guest treated as Customer), enforce initial status and attach userId to customer
    if (req.user?.role === 'Customer') {
      body.orderStatus = 'POR_APROBAR';
      body.paymentStatus = body.paymentStatus || 'PENDIENTE';
      body.customer = {
        ...(body.customer || {}),
        userId: req.user._id || null,
        name: body.customer?.name || req.user.name || body.customer?.phone || "Invitado",
        email: body.customer?.email || req.user.email || null,
      };
      body.customerUserId = currentUserId || null;
    } else if (ROLE_STAFF.has(req.user?.role)) {
      body.cashierUserId = currentUserId;
    }

    if (!body.customerUserId && body.customer) {
      body.customerUserId = normalizeUserId(
        body.customer.userId ?? body.customer.user ?? body.customer.user_id
      );
    }
    if (!body.cashierUserId && body.cashier) {
      body.cashierUserId = normalizeUserId(
        body.cashier.userId ?? body.cashier.user ?? body.cashier.user_id
      );
    }

    const order = new Order(body);
    await order.save();
    res
      .status(201)
      .json({ success: true, message: "Order created!", data: order });
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(Number(id));
    if (!order) {
      const error = createHttpError(404, "Pedido no encontrado!");
      return next(error);
    }

    res.status(200).json({ success: true, message: "Pedido encontrado", data: order });
  } catch (error) {
    next(error);
  }
};

const getOrders = async (req, res, next) => {
  try {
    let orders = await Order.find().populate("table");
    // If customer, only show own orders (by userId in JSON customer)
    if (req.user?.role === 'Customer') {
      const uid = req.user._id;
      orders = orders.filter(o => String(o?.customer?.userId || '') === String(uid));
    }
    res.status(200).json({ data: orders });
  } catch (error) {
    next(error);
  }
};

const updateOrder = async (req, res, next) => {
  try {
    const { orderStatus, tableId } = req.body || {};
    const { id } = req.params;
    const orderId = Number(id);
    if (!orderId) return next(createHttpError(400, "el ID del pedido es inválido!"));

    // Guard: only Admin can close without invoice
    if (orderStatus) {
      const nextStatus = String(orderStatus || "").toUpperCase();
      if (nextStatus === "CERRADO") {
        const [[inv]] = await pool.query(
          "SELECT id FROM facturas WHERE pedido_id = ? LIMIT 1",
          [orderId]
        );
        const hasInvoice = Boolean(inv?.id);
        const role = String(req?.user?.role || "").toLowerCase();
        if (!hasInvoice && role !== "admin") {
          return next(createHttpError(403, "Solo el admin puede cerrar una orden sin facturacion"));
        }
      }
    }

    const current = await Order.findById(orderId);
    if (!current) {
      const error = createHttpError(404, "Pedido no encontrado!");
      return next(error);
    }
    const currentStatusUpper = String(current.orderStatus || "").toUpperCase();
    if (currentStatusUpper === "CERRADO" || currentStatusUpper === "PAGADO") {
      return next(
        createHttpError(400, "No se puede modificar un pedido pagado o cerrado")
      );
    }

    const nextStatus = orderStatus ? String(orderStatus).toUpperCase() : null;
    const customerReference = normalizeUserId(
      current?.customerUserId ?? current?.customer?.userId ?? current?.customer?.user
    );
    const requiresTable =
      Boolean(customerReference) && nextStatus && STATUS_REQUIRING_TABLE.has(nextStatus);

    let mesaId = null;
    if (tableId != null) {
      const parsed = Number(tableId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return next(createHttpError(400, "el ID de la mesa es inválido"));
      }
      mesaId = parsed;
    } else {
      mesaId = await resolveMesaIdFromOrder(current);
    }

    if (requiresTable && !mesaId) {
      return next(
        createHttpError(400, "Esta orden necesita una mesa asignada antes de cambiar el estado.")
      );
    }

    if (mesaId) {
      const [conflict] = await pool.query(
        `SELECT p.id
           FROM pedidos p
           LEFT JOIN estados e ON e.id = p.estado_id
          WHERE p.mesa_id = ?
            AND p.id <> ?
            AND (e.id IS NULL OR UPPER(e.nombre) NOT IN ('CERRADO','POR_APROBAR'))
          LIMIT 1`,
        [mesaId, orderId]
      );
      if (conflict.length) {
        return next(
          createHttpError(409, "La mesa seleccionada ya esta asignada a otro pedido en curso.")
        );
      }
    }

    const updatePayload = {};
    if (orderStatus) updatePayload.orderStatus = orderStatus;
    if (mesaId) updatePayload.table = mesaId;
    if (customerReference) updatePayload.customerUserId = customerReference;
    if (ROLE_STAFF.has(req.user?.role) && nextStatus && STATUS_REQUIRING_TABLE.has(nextStatus)) {
      updatePayload.cashierUserId = normalizeUserId(req.user?._id);
    }

    const order = await Order.findByIdAndUpdate(orderId, updatePayload, { new: true });

    // Free table when closed and allowed
    if (orderStatus && String(orderStatus).toUpperCase() === "CERRADO") {
      try {
        await pool.query("UPDATE pedidos SET mesa_id = NULL, updated_at = NOW() WHERE id = ?", [
          orderId,
        ]);
      } catch {}
    }

    res.status(200).json({ success: true, message: "Order updated", data: order });
  } catch (error) {
    next(error);
  }
};

module.exports = { addOrder, getOrderById, getOrders, updateOrder };

// --- Sales helpers (tables, items) ---
async function findPedidoEstadoId(nombre) {
  const upper = String(nombre || '').toUpperCase();
  const [[row]] = await pool.query(
    `SELECT id FROM estados WHERE nombre = ? AND tipo = 3 LIMIT 1`,
    [upper]
  );
  return row?.id || null;
}

async function getOrCreatePedidoEstadoId(nombre) {
  let id = await findPedidoEstadoId(nombre);
  if (id) return id;
  await pool.query(
    `INSERT INTO estados (nombre, tipo, created_at, updated_at) VALUES (?, 3, NOW(), NOW())`,
    [String(nombre || '').toUpperCase()]
  );
  id = await findPedidoEstadoId(nombre);
  return id;
}

async function ensureOpenOrderForTable(mesaId) {
  // find latest non-closed order for table
  const [rows] = await pool.query(
    `SELECT p.id
       FROM pedidos p
       LEFT JOIN estados e ON e.id = p.estado_id
      WHERE p.mesa_id = ? AND (e.id IS NULL OR UPPER(e.nombre) NOT IN ('CERRADO'))
      ORDER BY p.created_at DESC
      LIMIT 1`,
    [mesaId]
  );
  if (rows.length) return rows[0].id;
  // create a new pedido and orders_json skeleton
  const estadoId = await getOrCreatePedidoEstadoId('POR_APROBAR');
  const [ins] = await pool.query(
    `INSERT INTO pedidos (mesa_id, estado_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
    [mesaId, estadoId]
  );
  const pedidoId = ins.insertId;
  await pool.query(
    `INSERT INTO orders_json (pedido_id, json, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
    [
      pedidoId,
      JSON.stringify({
        customer: null,
        orderStatus: 'POR_APROBAR',
        items: [],
        bills: { subtotal: 0, tax: 0, total: 0 },
        table: mesaId,
      }),
    ]
  );
  return pedidoId;
}

async function getOrderCustomer(pedidoId) {
  const [[row]] = await pool.query(
    `SELECT json FROM orders_json WHERE pedido_id = ? LIMIT 1`,
    [pedidoId]
  );
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.json || '{}');
    return parsed.customer || null;
  } catch {
    return null;
  }
}

async function listItems(pedidoId) {
  const [rows] = await pool.query(
    `SELECT pxp.id,
            pxp.cantidad,
            pxp.printed_qty,
            pxp.nota,
            pr.id AS productId,
            pr.nombre AS name,
            pr.precio AS price,
            pxp.precio_unitario,
            pxp.precio_original,
            pxp.descuento_id,
            pxp.descuento_nombre,
            pxp.descuento_tipo,
            pxp.descuento_valor,
            COALESCE(imp.porcentaje, 0) AS taxRate,
            imp.nombre AS taxName,
            imp.regimen AS taxRegimen
       FROM productos_x_pedidos pxp
       JOIN productos pr ON pr.id = pxp.producto_id
  LEFT JOIN impuestos imp ON imp.id = pr.impuesto_id
      WHERE pxp.pedido_id = ?
      ORDER BY pxp.id ASC`,
    [pedidoId]
  );
  return rows.map((r) => {
    const unitPrice = Number(r.precio_unitario ?? r.price ?? 0);
    const original = Number(r.precio_original ?? r.price ?? unitPrice);
    const discount = r.descuento_id
      ? {
          id: r.descuento_id,
          name: r.descuento_nombre || null,
          type: r.descuento_tipo || null,
          value:
            r.descuento_valor != null ? Number(r.descuento_valor) : null,
        }
      : null;
    const displayName =
      discount?.name && r.name
        ? `${r.name} - ${discount.name}`
        : r.name;
    const total = unitPrice * Number(r.cantidad || 0);
    return {
      _id: r.id,
      productId: r.productId,
      baseProductId: r.productId,
      name: displayName,
      baseName: r.name,
      quantity: r.cantidad,
      note: r.nota,
      price: total,
      pricePerQuantity: unitPrice,
      originalPrice: original,
      isDiscountProduct: !!discount,
      discount,
      taxRate: Number(r.taxRate || 0),
      printedQty: Number(r.printed_qty || 0),
      tax: r.taxName
        ? {
            name: r.taxName,
            percentage: Number(r.taxRate || 0),
            regimen: r.taxRegimen || null,
          }
        : null,
    };
  });
}

async function computeTotals(pedidoId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(pxp.precio_unitario, pr.precio) AS price,
            pxp.cantidad AS quantity,
            COALESCE(imp.porcentaje, 0) AS porcentaje
       FROM productos_x_pedidos pxp
       JOIN productos pr ON pr.id = pxp.producto_id
  LEFT JOIN impuestos imp ON imp.id = pr.impuesto_id
      WHERE pxp.pedido_id = ?`,
    [pedidoId]
  );
  let total = 0;
  let tax = 0;
  for (const row of rows) {
    const price = Number(row.price || 0);
    const qty = Number(row.quantity || 0);
    const rate = Number(row.porcentaje || 0);
    const gross = price * qty;
    total += gross;
    if (rate > 0) {
      const itemTax = gross - gross / (1 + rate / 100);
      tax += itemTax;
    }
  }
  const subtotal = total - tax;
  return {
    subtotal: Math.round(subtotal),
    tax: Math.round(tax),
    total: Math.round(total),
  };
}

async function getOrderStatus(pedidoId) {
  const [[row]] = await pool.query(
    `SELECT e.nombre AS estado
       FROM pedidos p
       LEFT JOIN estados e ON e.id = p.estado_id
      WHERE p.id = ? LIMIT 1`,
    [pedidoId]
  );
  return (row?.estado || 'POR_APROBAR').toUpperCase();
}

// Controller endpoints
async function getOrderData(pedidoId) {
  const [[info]] = await pool.query(
    `SELECT p.mesa_id,
            p.usuario_cliente_id,
            p.usuario_cajero_id,
            cli.nombre AS cliente_nombre,
            caj.nombre AS cajero_nombre
       FROM pedidos p
       LEFT JOIN usuarios cli ON cli.id = p.usuario_cliente_id
       LEFT JOIN usuarios caj ON caj.id = p.usuario_cajero_id
      WHERE p.id = ? LIMIT 1`,
    [pedidoId]
  );
  const items = await listItems(pedidoId);
  const bills = await computeTotals(pedidoId);
  const orderStatus = await getOrderStatus(pedidoId);
  const customer = await getOrderCustomer(pedidoId);
  const customerUserId = info?.usuario_cliente_id ? Number(info.usuario_cliente_id) : null;
  const cashierUserId = info?.usuario_cajero_id ? Number(info.usuario_cajero_id) : null;
  if (customer && customerUserId) {
    if (!customer.user) customer.user = { _id: customerUserId };
    if (!customer.userId) customer.userId = customerUserId;
  }
  return {
    _id: pedidoId,
    orderStatus,
    customer,
    items,
    bills,
    tableId: info?.mesa_id || null,
    customerUserId,
    cashierUserId,
    cashierName: info?.cajero_nombre || null,
  };
}

async function getOrderByTable(req, res, next) {
  try {
    const mesaId = Number(req.params.mesaId);
    if (!mesaId) return next(createHttpError(400, 'mesaId requerido'));
    const pedidoId = await ensureOpenOrderForTable(mesaId);
    const data = await getOrderData(pedidoId);
    data.tableId = mesaId;
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

async function addItemToTable(req, res, next) {
  try {
    const mesaId = Number(req.params.mesaId);
    const {
      productId,
      note,
      quantity = 1,
      price,
      originalPrice,
      discount,
    } = req.body || {};
    if (!mesaId || !productId)
      return next(createHttpError(400, "mesaId y productId requeridos"));

    const [[productRow]] = await pool.query(
      "SELECT precio FROM productos WHERE id = ? LIMIT 1",
      [Number(productId)]
    );
    if (!productRow) {
      return next(createHttpError(404, "Producto no encontrado"));
    }

    const pedidoId = await ensureOpenOrderForTable(mesaId);
    const qty = Number(quantity) > 0 ? Number(quantity) : 1;
    const basePrice = Number(productRow.precio || 0);
    const appliedPrice =
      price != null ? Number(price) : basePrice;
    const original = originalPrice != null ? Number(originalPrice) : basePrice;
    const discountId = discount?.id || discount?.descuento_id || null;
    const discountName = discount?.name || discount?.descuento_nombre || null;
    const discountType = discount?.type || discount?.descuento_tipo || null;
    const discountValue =
      discount?.value != null ? Number(discount.value) : null;

    await pool.query(
      `INSERT INTO productos_x_pedidos (
        cantidad,
        printed_qty,
        nota,
        producto_id,
        pedido_id,
        precio_unitario,
        precio_original,
        descuento_id,
        descuento_nombre,
        descuento_tipo,
        descuento_valor,
        created_at,
        updated_at
      )
      VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        qty,
        note || null,
        Number(productId),
        pedidoId,
        appliedPrice,
        original,
        discountId ? Number(discountId) : null,
        discountName || null,
        discountType || null,
        discountValue,
      ]
    );
    const data = await getOrderData(pedidoId);
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

async function listOrderItems(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const items = await listItems(orderId);
    res.status(200).json({ success: true, data: items });
  } catch (e) {
    next(e);
  }
}

async function updateOrderItem(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { cantidad, note } = req.body || {};
    if (!itemId) return next(createHttpError(400, 'itemId requerido'));
    if (cantidad != null) {
      if (Number(cantidad) <= 0) {
        await pool.query(`DELETE FROM productos_x_pedidos WHERE id = ? AND pedido_id = ?`, [itemId, orderId]);
      } else {
        await pool.query(
          `UPDATE productos_x_pedidos
              SET cantidad = ?, printed_qty = LEAST(printed_qty, ?), updated_at = NOW()
            WHERE id = ? AND pedido_id = ?`,
          [Number(cantidad), Number(cantidad), itemId, orderId]
        );
      }
    }
    if (note !== undefined) {
      await pool.query(`UPDATE productos_x_pedidos SET nota = ?, updated_at = NOW() WHERE id = ? AND pedido_id = ?`, [note || null, itemId, orderId]);
    }
    const data = await getOrderData(orderId);
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

async function deleteOrderItem(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const [[statusRow]] = await pool.query(
      `SELECT e.nombre AS estado
         FROM pedidos p
         LEFT JOIN estados e ON e.id = p.estado_id
        WHERE p.id = ?
        LIMIT 1`,
      [orderId]
    );
    const estado = (statusRow?.estado || 'POR_APROBAR').toUpperCase();
    const role = String(req?.user?.role || '').toLowerCase();
    if (estado !== 'POR_APROBAR') {
      const isPaidOrClosed = estado === 'PAGADO' || estado === 'CERRADO';
      if (isPaidOrClosed) {
        return next(createHttpError(403, 'No se puede modificar un pedido pagado o cerrado'));
      }
      if (role !== 'admin') {
        return next(createHttpError(403, 'Solo el admin puede modificar items de un pedido confirmado'));
      }
    }
    await pool.query(`DELETE FROM productos_x_pedidos WHERE id = ? AND pedido_id = ?`, [itemId, orderId]);
    const data = await getOrderData(orderId);
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

async function moveOrderItem(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { mesaId } = req.body || {};
    if (!mesaId) return next(createHttpError(400, 'mesaId destino requerido'));
    const [[statusRow]] = await pool.query(
      `SELECT e.nombre AS estado
         FROM pedidos p
         LEFT JOIN estados e ON e.id = p.estado_id
        WHERE p.id = ?
        LIMIT 1`,
      [orderId]
    );
    const estado = (statusRow?.estado || 'POR_APROBAR').toUpperCase();
    if (estado === 'PAGADO' || estado === 'CERRADO') {
      return next(createHttpError(403, 'No se puede modificar un pedido pagado o cerrado'));
    }
    const targetOrderId = await ensureOpenOrderForTable(Number(mesaId));
    await pool.query(
      `UPDATE productos_x_pedidos SET pedido_id = ?, updated_at = NOW() WHERE id = ? AND pedido_id = ?`,
      [targetOrderId, itemId, orderId]
    );
    const sourceData = await getOrderData(orderId);
    res.status(200).json({ success: true, data: { source: sourceData, targetOrderId } });
  } catch (e) {
    next(e);
  }
}

async function markItemsPrinted(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!orderId || items.length === 0) {
      return next(createHttpError(400, "items requeridos"));
    }
    const ids = items
      .map((it) => Number(it))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return next(createHttpError(400, "items invalidos"));
    const placeholders = ids.map(() => "?").join(",");
    await pool.query(
      `UPDATE productos_x_pedidos
          SET printed_qty = cantidad, updated_at = NOW()
        WHERE pedido_id = ? AND id IN (${placeholders})`,
      [orderId, ...ids]
    );
    const data = await getOrderData(orderId);
    res.status(200).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

module.exports.getOrderByTable = getOrderByTable;
module.exports.addItemToTable = addItemToTable;
module.exports.listOrderItems = listOrderItems;
module.exports.updateOrderItem = updateOrderItem;
module.exports.deleteOrderItem = deleteOrderItem;
module.exports.moveOrderItem = moveOrderItem;
module.exports.markItemsPrinted = markItemsPrinted;

async function setOrderCustomer(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return next(createHttpError(400, "ID de pedido invalido"));
    const { userId, name, phone, clear } = req.body || {};
    const existing = await Order.findById(orderId);
    if (!existing) return next(createHttpError(404, "Pedido no encontrado"));
    const currentStatus = String(existing.orderStatus || '').toUpperCase();
    if (currentStatus !== 'POR_APROBAR') {
      return next(createHttpError(403, "El pedido ya fue confirmado; no es posible reasignar el cliente"));
    }

    if (clear === true) {
      const cleared = await Order.findByIdAndUpdate(orderId, {
        customer: null,
        customerUserId: null,
      });
      return res.status(200).json({ success: true, data: cleared });
    }

    if (userId) {
      const resolvedId = Number(userId);
      if (!Number.isFinite(resolvedId) || resolvedId <= 0) {
        return next(createHttpError(400, "Usuario invalido"));
      }
      const user = await User.findById(resolvedId);
      if (!user) return next(createHttpError(404, "Usuario no encontrado"));
      const payload = {
        name: user.name,
        phone: user.phone ? String(user.phone) : null,
        email: user.email || null,
        userId: user._id,
        user: { _id: user._id },
      };
      const updated = await Order.findByIdAndUpdate(orderId, {
        customer: payload,
        customerUserId: user._id,
      });
      return res.status(200).json({ success: true, data: updated });
    }

    const manualName = typeof name === "string" ? name.trim() : "";
    if (!manualName) {
      return next(createHttpError(400, "Debe suministrar un nombre o usuario"));
    }
    const manualPhone = phone != null && String(phone).trim() ? String(phone).trim() : null;
    const manual = {
      name: manualName,
      phone: manualPhone,
      userId: null,
      user: null,
      labelOnly: true,
    };
    const updated = await Order.findByIdAndUpdate(orderId, {
      customer: manual,
      customerUserId: null,
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
}

module.exports.setOrderCustomer = setOrderCustomer;

async function deleteOrder(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return next(createHttpError(400, "el ID del pedido es inválido"));
    const order = await Order.findById(orderId);
    if (!order) return next(createHttpError(404, "Pedido no encontrado"));
    const status = String(order.orderStatus || "").toUpperCase();
    if (status !== "POR_APROBAR") {
      return next(createHttpError(403, "Solo se pueden eliminar pedidos en estado POR_APROBAR"));
    }
    // clean products_x_pedidos
    await pool.query("DELETE FROM productos_x_pedidos WHERE pedido_id = ?", [orderId]);
    // delete orders_json
    await pool.query("DELETE FROM orders_json WHERE pedido_id = ?", [orderId]);
    // release mesa then delete pedido
    await pool.query("UPDATE pedidos SET mesa_id = NULL WHERE id = ?", [orderId]);
    await pool.query("DELETE FROM pedidos WHERE id = ?", [orderId]);
    res.status(200).json({ success: true, message: "Pedido eliminado" });
  } catch (e) {
    next(e);
  }
}

module.exports.deleteOrder = deleteOrder;


