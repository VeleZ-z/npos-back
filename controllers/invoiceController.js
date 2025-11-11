const createHttpError = require("http-errors");
const Invoice = require("../models/invoiceModel");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const { pool } = require("../config/mysql");
const { evaluateProductAlerts } = require("../services/productAlertService");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

const normalizeUserId = (value) => {
  if (value == null) return null;
  if (typeof value === "object") {
    if (value._id != null) return normalizeUserId(value._id);
    if (value.id != null) return normalizeUserId(value.id);
    if (value.userId != null) return normalizeUserId(value.userId);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
};

// Generar numero consecutivo de factura
const generateInvoiceNumber = async () => {
  const last = await Invoice.findOne().sort();
  if (!last) return "F-0001";
  const parts = String(last.invoiceNumber || "F-0000").split("-");
  const lastNumber = parseInt(parts[1] || "0", 10) || 0;
  const newNumber = (lastNumber + 1).toString().padStart(4, "0");
  return `F-${newNumber}`;
};

const fetchPaymentMethod = async (methodId) => {
  if (!methodId) return null;
  const [rows] = await pool.query(
    `SELECT mp.id, mp.nombre, mp.estado_id, e.nombre AS estado_nombre
       FROM metodos_pagos mp
       LEFT JOIN estados e ON e.id = mp.estado_id
      WHERE mp.id = ? LIMIT 1`,
    [methodId]
  );
  if (!rows.length) return null;
  return rows[0];
};

function resolvePaymentDisplay(name) {
  const label = String(name || "").toLowerCase();
  if (label.includes("efectivo")) return "Efectivo";
  if (label.includes("datafono") || label.includes("datáfono") || label.includes("datofono")) {
    return "Datafono";
  }
  return "Transferencia";
}

let cachedInvoiceStateId = null;
async function ensureInvoiceStateId(nombre = "FACTURADO") {
  if (cachedInvoiceStateId) return cachedInvoiceStateId;
  const upper = String(nombre || "").toUpperCase();
  const [rows] = await pool.query(
    "SELECT id FROM estados WHERE UPPER(nombre) = ? AND tipo = 6 LIMIT 1",
    [upper]
  );
  let id = rows[0]?.id || null;
  if (!id) {
    const [res] = await pool.query(
      "INSERT INTO estados (nombre, tipo, created_at, updated_at) VALUES (?, 6, NOW(), NOW())",
      [upper]
    );
    id = res.insertId;
  }
  cachedInvoiceStateId = id;
  return id;
}

async function findActiveCuadreId(userId) {
  const normalized = normalizeUserId(userId);
  if (normalized) {
    const [rows] = await pool.query(
      `SELECT c.id
         FROM cuadres c
         LEFT JOIN estados e ON e.id = c.estado_id
        WHERE c.usuario_apertura_id = ?
          AND (e.id IS NULL OR UPPER(e.nombre) = 'ABIERTO')
        ORDER BY c.fecha_apertura DESC
        LIMIT 1`,
      [normalized]
    );
    if (rows.length) return rows[0].id;
  }
  const [fallback] = await pool.query(
    `SELECT c.id
       FROM cuadres c
       LEFT JOIN estados e ON e.id = c.estado_id
      WHERE (e.id IS NULL OR UPPER(e.nombre) = 'ABIERTO')
      ORDER BY c.fecha_apertura DESC
      LIMIT 1`
  );
  return fallback[0]?.id || null;
}

function computeDiscountedUnitPrice(item) {
  const taxRate = Number(item.taxRate || 0);
  const fallbackUnit =
    Number(item.pricePerQuantity || 0) ||
    Number(item.price || 0) ||
    Number(item.unitPrice || 0);
  const originalUnit = Number(
    item.originalPrice ??
      item.original_price ??
      fallbackUnit
  );
  const discount = item.discount || null;
  if (!discount) {
    return { unitPrice: fallbackUnit || originalUnit, originalUnit };
  }
  const type = String(discount.type || "").toUpperCase();
  const value = Number(discount.value || 0);
  let discounted = originalUnit;
  if (type === "VALUE") {
    discounted = Math.max(0, originalUnit - value);
  } else if (type === "PERCENT") {
    const baseNet =
      taxRate > 0 ? originalUnit / (1 + taxRate / 100) : originalUnit;
    const discAmount = baseNet * (value / 100);
    const newNet = Math.max(0, baseNet - discAmount);
    discounted = taxRate > 0 ? newNet * (1 + taxRate / 100) : newNet;
  }
  return { unitPrice: discounted, originalUnit };
}

const mmToPt = (mm) => (mm / 25.4) * 72;
const RECEIPT_WIDTH = mmToPt(80);
const MIN_RECEIPT_HEIGHT = mmToPt(120);
const moneyFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const formatMoney = (value) => moneyFormatter.format(Number(value || 0));
const resolveDiscountCode = (items = []) => {
  const codes = (items || [])
    .map((item) => item?.discount?.id)
    .filter((id) => id !== undefined && id !== null && String(id).trim() !== "");
  if (!codes.length) {
    return process.env.DEFAULT_DISCOUNT_CODE || "222222222222";
  }
  return [...new Set(codes.map((code) => String(code)))].join(" | ");
};
const getRangeText = () =>
  process.env.BILL_RANGE || "Rango autorizado: 0001 al 9999";

const resolveTableNumber = (order) => {
  if (!order) return "-";
  if (order.table && typeof order.table === "object") {
    return (
      order.table.number ??
      order.table.tableNumber ??
      order.table.name ??
      order.table.id ??
      "-"
    );
  }
  if (order.table != null) return order.table;
  if (order.tableNumber) return order.tableNumber;
  return "-";
};

const normalizeInvoiceItems = (invoiceItems, fallbackItems) => {
  if (Array.isArray(invoiceItems) && invoiceItems.length) return invoiceItems;
  if (Array.isArray(fallbackItems) && fallbackItems.length) {
    return fallbackItems.map((item) => ({
      description: item.description || item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice || item.price,
      subtotal: item.subtotal,
      taxAmount: item.taxAmount,
      taxRate:
        item.taxRate ??
        item.tax?.percentage ??
        item.tax?.porcentaje ??
        item.tax?.valor ??
        0,
      taxRegimen: item.tax?.regimen || item.taxRegimen || "COMUN",
      note: item.note,
      discount: item.discount || null,
    }));
  }
  return [];
};

async function fetchOrderItemsSnapshot(orderId) {
  const [rows] = await pool.query(
    `SELECT
        pxp.cantidad AS quantity,
        pxp.nota     AS note,
        pr.nombre    AS name,
        pr.id        AS productId,
        pr.precio    AS price,
        pxp.precio_unitario,
        pxp.precio_original,
        pxp.descuento_id,
        pxp.descuento_nombre,
        pxp.descuento_tipo,
        pxp.descuento_valor,
        COALESCE(imp.porcentaje, 0) AS taxRate,
        COALESCE(imp.regimen, 'REGIMEN_COMUN') AS taxRegimen
       FROM productos_x_pedidos pxp
       JOIN productos pr       ON pr.id = pxp.producto_id
  LEFT JOIN impuestos imp     ON imp.id = pr.impuesto_id
      WHERE pxp.pedido_id = ?`,
    [orderId]
  );
  return rows.map((row) => ({
    quantity: row.quantity,
    note: row.note,
    name:
      row.descuento_nombre && row.name
        ? `${row.name} - ${row.descuento_nombre}`
        : row.name,
    code: row.productId ? `P-${row.productId}` : "",
    price: row.precio_unitario ?? row.price,
    pricePerQuantity: row.precio_unitario ?? row.price,
    originalPrice: row.precio_original ?? row.price,
    taxRate: row.taxRate,
    taxRegimen: row.taxRegimen,
    discount: row.descuento_id
      ? {
          id: row.descuento_id,
          name: row.descuento_nombre,
          type: row.descuento_tipo,
          value:
            row.descuento_valor != null
              ? Number(row.descuento_valor)
              : null,
        }
      : null,
  }));
}

function buildInvoiceEmailHtml(
  invoice,
  order,
  items,
  { logoCid = null, methodLabel = "", rangeText = getRangeText() } = {}
) {
  const customerName =
    (invoice.customer?.name || order?.customer?.name || "CLIENTES VARIOS").toUpperCase();
  const discountCode = resolveDiscountCode(items);
  const tableNumber = resolveTableNumber(order);
  const pedidoId = order?._id || order?.id || "";
  const regimen =
    items.find((item) => item.taxRegimen)?.taxRegimen || "REGIMEN_COMUN";
  const invoiceNumberPlain =
    (invoice.invoiceNumber || "").replace(/^F-?/i, "").replace(/^0+/, "") ||
    "-";
  const dateObj = new Date(invoice.createdAt || Date.now());
  const dateStr = dateObj.toLocaleDateString("es-CO");
  const timeStr = dateObj.toLocaleTimeString("es-CO");
  const rows = items.length
    ? items
        .map((it) => {
          const rowTotal =
            Number(it.subtotal || 0) + Number(it.taxAmount || 0) ||
            Number(it.unitPrice || 0) * Number(it.quantity || 0);
          const noteBlock = it.note
            ? `<div style="font-size:11px;color:#555;">Nota: ${it.note}</div>`
            : "";
          return `
            <tr>
              <td style="padding:4px 6px;border-bottom:1px dashed #ccc;">${it.quantity}</td>
              <td style="padding:4px 6px;border-bottom:1px dashed #ccc;">
                ${(it.description || "").toUpperCase()}
                ${noteBlock}
              </td>
              <td style="padding:4px 6px;border-bottom:1px dashed #ccc;">${
                it.taxRegimen || "-"
              }</td>
              <td style="padding:4px 6px;border-bottom:1px dashed #ccc;text-align:right;">${formatMoney(
                rowTotal
              )}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="4" style="padding:6px;text-align:center;">Sin productos</td></tr>`;

  return `
    <div style="font-family:Arial,sans-serif;color:#111;">
      ${
        logoCid
          ? `<div style="text-align:center;margin-bottom:10px;"><img src="cid:${logoCid}" alt="Nativhos" style="height:60px" /></div>`
          : ""
      }
      <h2 style="text-align:center;margin:0;">${
        invoice.issuer?.businessName || "Nativhos"
      }</h2>
      <div style="text-align:center;font-size:12px;margin-bottom:10px;">
        <div>NIT: ${invoice.issuer?.nit || ""}</div>
        <div>${invoice.issuer?.address || ""}</div>
        <div>${invoice.issuer?.phone || ""}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;margin-bottom:10px;">
        <div style="flex:1;min-width:120px;">
          <div><strong>VENTA:</strong> ${methodLabel}</div>
          <div><strong>CLIENTE:</strong> ${customerName}</div>
          <div><strong>DTO:</strong> ${discountCode}</div>
        </div>
        <div style="flex:1;min-width:120px;">
          <div><strong>FECHA:</strong> ${dateStr}</div>
          <div><strong>HORA:</strong> ${timeStr}</div>
          <div><strong>PEDIDO:</strong> ${pedidoId || "-"}</div>
          <div><strong>MESA:</strong> ${tableNumber}</div>
        </div>
        <div style="flex:1;min-width:120px;">
          <div><strong>RÉGIMEN:</strong> ${regimen}</div>
          <div><strong>FACTURA:</strong> ${invoiceNumberPlain}</div>
        </div>
      </div>
      <div style="text-align:center;font-size:12px;margin-bottom:6px;">
        <div>Factura de venta POS Número ${invoiceNumberPlain}</div>
        <div>${rangeText}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #000;">Cant</th>
            <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #000;">Detalle</th>
            <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #000;">Régimen</th>
            <th style="text-align:right;padding:4px 6px;border-bottom:1px solid #000;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:12px;font-size:12px;">
        <div><strong>Sub Total:</strong> ${formatMoney(
          invoice.totals?.subtotal || 0
        )}</div>
        <div><strong>Impuestos:</strong> ${formatMoney(
          invoice.totals?.totalTax || 0
        )}</div>
        <div><strong>Propina:</strong> ${formatMoney(invoice.tip || 0)}</div>
        <div><strong>Total:</strong> ${formatMoney(
          invoice.totals?.total || 0
        )}</div>
        ${
          invoice.change
            ? `<div><strong>Cambio:</strong> ${formatMoney(invoice.change)}</div>`
            : ""
        }
      </div>
      <p style="margin-top:12px;font-size:11px;color:#555;text-align:center;">
        Esta factura se asimila para sus efectos legales a una letra de cambio
        según el art. 774 del código de comercio. Con este título valor, el comprador
        declara haber recibido mercancía y/o servicio a satisfacción.
      </p>
    </div>
  `;
}

function generateInvoicePdfBuffer(
  invoice,
  order,
  items,
  { methodLabel = "", rangeText = getRangeText() } = {}
) {
  return new Promise((resolve, reject) => {
    const lineCount = Math.max(items.length, 1);
    const height =
      MIN_RECEIPT_HEIGHT + lineCount * mmToPt(8) + mmToPt(40);
    const doc = new PDFDocument({
      size: [RECEIPT_WIDTH, height],
      margins: {
        top: mmToPt(5),
        left: mmToPt(4),
        right: mmToPt(4),
        bottom: mmToPt(8),
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const customerName =
      (invoice.customer?.name || order?.customer?.name || "CLIENTES VARIOS").toUpperCase();
  const discountCode = resolveDiscountCode(items);
  const tableNumber = resolveTableNumber(order);
    const pedidoId = order?._id || order?.id || "";
    const invoiceNumberPlain =
      (invoice.invoiceNumber || "").replace(/^F-?/i, "").replace(/^0+/, "") ||
      "-";
    const dateObj = new Date(invoice.createdAt || Date.now());
    const dateStr = dateObj.toLocaleDateString("es-CO");
    const timeStr = dateObj.toLocaleTimeString("es-CO");
    const regimen =
      items.find((item) => item.taxRegimen)?.taxRegimen || "REGIMEN_COMUN";

    doc.font("Courier-Bold")
      .fontSize(12)
      .text((invoice.issuer?.businessName || "NATIVHOS").toUpperCase(), {
        align: "center",
      });
    doc.font("Courier").fontSize(9).text(`NIT: ${invoice.issuer?.nit || ""}`, {
      align: "center",
    });
    if (invoice.issuer?.address) {
      doc.text(invoice.issuer.address, { align: "center" });
    }
    if (invoice.issuer?.phone) {
      doc.text(`Cel: ${invoice.issuer.phone}`, { align: "center" });
    }
    doc.moveDown(0.4);

    const printableWidth =
      RECEIPT_WIDTH - doc.page.margins.left - doc.page.margins.right;
    const columnWidth = printableWidth / 3;
    const startY = doc.y;
  const columns = [
    [
      { label: "VENTA", value: methodLabel },
      { label: "CLIENTE", value: customerName },
      { label: "DTO", value: discountCode },
    ],
    [
      { label: "FECHA", value: dateStr },
        { label: "HORA", value: timeStr },
        { label: "PEDIDO", value: pedidoId || "-" },
        { label: "MESA", value: tableNumber },
      ],
      [
        { label: "RÉGIMEN", value: regimen },
        { label: "FACTURA", value: invoiceNumberPlain },
      ],
    ];
    let maxY = startY;
    columns.forEach((group, idx) => {
      const x = doc.page.margins.left + idx * columnWidth;
      let y = startY;
      group.forEach((entry) => {
        doc.font("Courier-Bold")
          .fontSize(8)
          .text(`${entry.label}:`, x, y, { width: columnWidth });
        y = doc.y;
        doc.font("Courier")
          .fontSize(9)
          .text(String(entry.value || "-"), x, y, { width: columnWidth });
        y = doc.y + 4;
      });
      if (y > maxY) maxY = y;
    });
    doc.y = maxY;
    doc.moveDown(0.3);
    doc.font("Courier")
      .fontSize(9)
      .text(
        `Factura de venta POS Número ${invoiceNumberPlain}`,
        doc.page.margins.left,
        doc.y,
        { width: printableWidth, align: "center" }
      );
    doc.text(rangeText, doc.page.margins.left, doc.y, {
      width: printableWidth,
      align: "center",
    });
    doc.moveDown(0.3);

    const qtyX = doc.page.margins.left;
    const descX = qtyX + mmToPt(10);
    const incX = descX + mmToPt(32);
    const totalX = doc.page.width - doc.page.margins.right - mmToPt(5);
    const headerY = doc.y;
    doc.font("Courier-Bold").text("Cant", qtyX, headerY);
    doc.text("Detalle", descX, headerY);
    doc.text("INC", incX, headerY, { width: mmToPt(12), align: "right" });
    doc.text("Total", totalX - mmToPt(15), headerY, {
      width: mmToPt(20),
      align: "right",
    });
    doc.moveDown(0.2);

    if (!items.length) {
      doc.font("Courier").fontSize(9).text("Sin productos", qtyX, doc.y + 4);
      doc.moveDown(0.5);
    } else {
      doc.moveDown(0.1);
      items.forEach((item) => {
        const rowTotal =
          Number(item.subtotal || 0) + Number(item.taxAmount || 0) ||
          Number(item.unitPrice || 0) * Number(item.quantity || 0);
        const rowY = doc.y;
        doc.font("Courier").fontSize(9).text(String(item.quantity), qtyX, rowY);
        doc.text((item.description || "").toUpperCase(), descX, rowY, {
          width: incX - descX - 4,
        });
        doc.text(item.taxRate ? `${item.taxRate}%` : "-", incX, rowY, {
          width: mmToPt(12),
          align: "right",
        });
        doc.text(formatMoney(rowTotal), totalX - mmToPt(15), rowY, {
          width: mmToPt(20),
          align: "right",
        });
        doc.moveDown(0.3);
        if (item.note) {
          doc.font("Courier")
            .fontSize(8)
            .text(`Nota: ${item.note}`, descX, doc.y, {
              width: totalX - descX,
            });
          doc.moveDown(0.2);
        }
      });
    }

    doc.moveDown(0.3);
    const summaryRows = [
      { label: "Sub Total", value: formatMoney(invoice.totals?.subtotal || 0) },
      { label: "Impuestos", value: formatMoney(invoice.totals?.totalTax || 0) },
      { label: "Propina", value: formatMoney(invoice.tip || 0) },
      { label: "Total", value: formatMoney(invoice.totals?.total || 0) },
    ];
    summaryRows.forEach((row) => {
      const currentY = doc.y;
      doc.font("Courier-Bold").fontSize(9).text(row.label, qtyX, currentY);
      doc.font("Courier")
        .fontSize(9)
        .text(row.value, totalX - mmToPt(15), currentY, {
          width: mmToPt(20),
          align: "right",
        });
      doc.moveDown(0.2);
    });
    if (invoice.change) {
      const currentY = doc.y;
      doc.font("Courier").fontSize(9).text("Cambio", qtyX, currentY);
      doc.font("Courier")
        .fontSize(9)
        .text(formatMoney(invoice.change), totalX - mmToPt(15), currentY, {
          width: mmToPt(20),
          align: "right",
        });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.4);
    doc
      .font("Courier")
      .fontSize(9)
      .text("Calidad y Buen Servicio", doc.page.margins.left, doc.y, {
        width: printableWidth,
        align: "center",
      });
    doc.moveDown(0.2);
    doc
      .font("Courier")
      .fontSize(8)
      .text(
        "Esta factura se asimila para sus efectos legales a una letra de cambio según el art. 774 del código de comercio. Con este título valor, el comprador declara haber recibido mercancía y/o servicio a satisfacción.",
        doc.page.margins.left,
        doc.y,
        { width: printableWidth, align: "center" }
      );

    doc.end();
  });
}

async function sendInvoiceEmail(invoice, order, customerEmail) {
  if (!customerEmail) return;
  try {
    const user = process.env.SMTP_USER || process.env.BUSINESS_EMAIL;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_APP_PASS;
    if (!user || !pass) return;
    let nodemailer;
    try {
      nodemailer = require("nodemailer");
    } catch {
      return;
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    const normalizedItems = normalizeInvoiceItems(
      invoice.items,
      order?.items || []
    );
    const methodDisplay =
      invoice.paymentMethod?.name ||
      resolvePaymentDisplay(
        invoice.paymentMethod?.rawName || invoice.paymentMethod || ""
      );
    const rangeText = getRangeText();
    const attachments = [];
    const logoPath = path.resolve(
      __dirname,
      "..",
      "..",
      "pos-frontend",
      "src",
      "assets",
      "images",
      "logo.png"
    );
    let logoCid = null;
    if (fs.existsSync(logoPath)) {
      logoCid = "nativhos-logo";
      attachments.push({ filename: "logo.png", path: logoPath, cid: logoCid });
    }
    const html = buildInvoiceEmailHtml(invoice, order, normalizedItems, {
      logoCid,
      methodLabel: methodDisplay,
      rangeText,
    });
    try {
      const pdfBuffer = await generateInvoicePdfBuffer(
        invoice,
        order,
        normalizedItems,
        { methodLabel: methodDisplay, rangeText }
      );
      attachments.push({
        filename: `Factura-${(invoice.invoiceNumber || "NPOS")
          .replace(/[^A-Za-z0-9_-]/g, "")
          .trim() || "NPOS"}.pdf`,
        content: pdfBuffer,
      });
    } catch (pdfErr) {
      console.log("[invoice email] pdf error:", pdfErr?.message || pdfErr);
    }

    await transporter.sendMail({
      from: `Nativhos <${user}>`,
      to: customerEmail,
      subject: `Factura ${invoice.invoiceNumber}`,
      html,
      attachments,
    });
  } catch (err) {
    console.log("[invoice email] error:", err?.message || err);
  }
}

// Crear factura desde una orden
const createInvoice = async (req, res, next) => {
  try {
    const {
      orderId,
      customerData, // Opcional: { name, nit, address, phone, email }
      paymentType,
      paymentMethod,
      isElectronic,
      notes,
      paymentMethodId,
      cashAmount,
      tipAmount,
    } = req.body;

    // Validaciones basicas
    if (!orderId || (!paymentMethod && !paymentMethodId)) {
      return next(createHttpError(400, "Faltan campos requeridos"));
    }

    // Verificar orden
    const order = await Order.findById(orderId);
    if (!order) {
      return next(createHttpError(404, "Orden no encontrada"));
    }

    if (order.invoice) {
      return next(createHttpError(400, "Esta orden ya tiene factura"));
    }

    // Verificar permisos (solo cajeros y admin)
    const role = String(req.user?.role || "").toLowerCase();
    if (!["cashier", "administrator", "admin"].includes(role)) {
      return next(createHttpError(403, "Solo cajeros pueden generar facturas"));
    }

    // Generar numero de factura
    const invoiceNumber = await generateInvoiceNumber();

    const methodRow = await fetchPaymentMethod(paymentMethodId);
    if (!methodRow) {
      return next(createHttpError(400, "Método de pago inválido"));
    }
    const methodName = methodRow.nombre || paymentMethod || "Sin definir";
    const methodEstado = (methodRow.estado_nombre || "").toUpperCase();
    if (methodEstado && methodEstado !== "ACTIVO") {
      return next(createHttpError(400, "El método de pago no está activo"));
    }
    const isCash = /efectivo/i.test(methodName);
    const methodDisplay = resolvePaymentDisplay(methodName);

    // Preparar datos del cliente
    const orderCustomer = order?.customer || null;
    const orderCustomerUserRef =
      orderCustomer?.user ?? order.customerUserId ?? null;
    const orderCustomerUserId = normalizeUserId(orderCustomerUserRef);
    let linkedUserDoc = null;
    if (orderCustomer && orderCustomer.user && typeof orderCustomer.user === "object") {
      linkedUserDoc = orderCustomer.user;
      if (!linkedUserDoc._id && orderCustomerUserId) {
        linkedUserDoc._id = orderCustomerUserId;
      }
    } else if (orderCustomerUserId) {
      try {
        linkedUserDoc = await User.findById(orderCustomerUserId);
      } catch {
        linkedUserDoc = null;
      }
    }

    const baseName =
      orderCustomer?.name ||
      linkedUserDoc?.customerData?.billingName ||
      linkedUserDoc?.name ||
      "CLIENTES VARIOS";
    const baseNit =
      orderCustomer?.document ||
      orderCustomer?.nit ||
      linkedUserDoc?.customerData?.nit ||
      linkedUserDoc?.document ||
      "222222222222";
    const basePhone = orderCustomer?.phone || linkedUserDoc?.phone || null;
    const baseEmail = orderCustomer?.email || linkedUserDoc?.email || null;
    const baseAddress =
      orderCustomer?.address ||
      linkedUserDoc?.customerData?.address ||
      null;

    let customerInfo = {
      name: baseName || "CLIENTES VARIOS",
      nit: baseNit || "222222222222",
      phone: basePhone,
      email: baseEmail,
      address: baseAddress,
      user: orderCustomerUserId || linkedUserDoc?._id || null,
    };

    if (customerData && customerData.name) {
      customerInfo = {
        user: orderCustomerUserId || null,
        name: customerData.name,
        nit: customerData.nit || "222222222222",
        phone: customerData.phone || null,
        email: customerData.email || null,
        address: customerData.address || null,
      };
    } else if (orderCustomer) {
      customerInfo = {
        user: orderCustomerUserId || linkedUserDoc?._id || null,
        name: baseName || "CLIENTES VARIOS",
        phone: basePhone,
        email: baseEmail,
        nit: baseNit || "222222222222",
        address: baseAddress,
      };
    }

    if ((!customerInfo.email || !customerInfo.phone) && customerInfo.user) {
      try {
        const userDoc = await User.findById(customerInfo.user);
        if (userDoc) {
          if (!customerInfo.email && userDoc.email) {
            customerInfo.email = userDoc.email;
          }
          if (!customerInfo.phone && userDoc.phone) {
            customerInfo.phone = userDoc.phone;
          }
          if (
            (!customerInfo.name ||
              customerInfo.name === "CLIENTES VARIOS") &&
            (userDoc.customerData?.billingName || userDoc.name)
          ) {
            customerInfo.name =
              userDoc.customerData?.billingName ||
              userDoc.name ||
              customerInfo.name;
          }
          if (
            (!customerInfo.nit ||
              customerInfo.nit === "222222222222") &&
            (userDoc.customerData?.nit || userDoc.document)
          ) {
            customerInfo.nit =
              userDoc.customerData?.nit ||
              userDoc.document ||
              customerInfo.nit;
          }
        }
      } catch {}
    }

    // Preparar items de la factura usando snapshot de BD como fuente principal
    const snapshotItems = await fetchOrderItemsSnapshot(orderId);
    const orderItemsJson = Array.isArray(order.items) ? order.items : [];
    const snapshotPool = [...snapshotItems];
    const sourceItems =
      orderItemsJson.length > 0
        ? orderItemsJson.map((item) => {
            const idx = snapshotPool.findIndex(
              (snap) =>
                String(snap.productId || snap.product_id) ===
                String(item.productId || item.baseProductId || item._id)
            );
            const snap = idx >= 0 ? snapshotPool.splice(idx, 1)[0] : null;
            const merged = {
              ...(snap || {}),
              ...item,
            };
            merged.quantity =
              item.quantity ?? snap?.quantity ?? merged.quantity ?? 0;
            return merged;
          })
        : snapshotItems;
    const invoiceItems = sourceItems.map((item) => {
      const quantity = Math.max(1, Number(item.quantity || 0));
      const rate = Number(
        item.taxRate ??
          item.tax?.percentage ??
          item.tax?.porcentaje ??
          item.tax?.valor ??
          0
      );
      const { unitPrice, originalUnit } = computeDiscountedUnitPrice(item);
      const gross = unitPrice * quantity;
      const taxAmount = rate > 0 ? gross - gross / (1 + rate / 100) : 0;
      const subtotal = gross - taxAmount;
      const regimen =
        item.taxRegimen ||
        item.tax?.regimen ||
        item.regimen ||
        "REGIMEN_COMUN";

      return {
        description: item.name || item.description || "",
        quantity,
        code: item.code || "",
        unitPrice,
        originalUnitPrice: originalUnit,
        subtotal,
        taxRate: rate,
        taxAmount,
        taxRegimen: regimen,
        note: item.note || null,
        discount: item.discount || null,
      };
    });

    const totalsAccumulator = invoiceItems.reduce(
      (acc, item) => {
        const lineTotal = Number(item.subtotal || 0) + Number(item.taxAmount || 0);
        return {
          subtotal: acc.subtotal + Number(item.subtotal || 0),
          tax: acc.tax + Number(item.taxAmount || 0),
          total: acc.total + lineTotal,
        };
      },
      { subtotal: 0, tax: 0, total: 0 }
    );
    const billsFallback = order?.bills || {};
    const baseSubtotal =
      totalsAccumulator.subtotal || Number(billsFallback.subtotal) || 0;
    const baseTax = totalsAccumulator.tax || Number(billsFallback.tax) || 0;
    const baseTotal = totalsAccumulator.total || Number(billsFallback.total) || 0;
    const orderSubtotal = Math.round(baseSubtotal);
    const orderTax = Math.round(baseTax);
    const orderTotal = Math.round(baseTotal);
    const tipValue = Number(tipAmount || 0);
    const totalWithTip = orderTotal + tipValue;

    const cashInputAmount = isCash ? Number(cashAmount || 0) : totalWithTip;
    let receivedAmount = cashInputAmount;
    if (isCash) {
      if (cashAmount == null) {
        return next(createHttpError(400, "Monto en efectivo requerido"));
      }
      if (receivedAmount < totalWithTip) {
        return next(createHttpError(400, "El monto recibido es insuficiente"));
      }
    }
    const changeValue = isCash ? Math.max(0, receivedAmount - totalWithTip) : 0;

    // Crear factura
    const invoiceStateId = await ensureInvoiceStateId("FACTURADO");
    const activeCuadreId = await findActiveCuadreId(req.user?._id);

    const invoice = new Invoice({
      invoiceNumber,
      issuer: {
        businessName: process.env.BUSINESS_NAME || "Mi Restaurante",
        nit: process.env.BUSINESS_NIT || "900000000-0",
        address: process.env.BUSINESS_ADDRESS || "Direccion no configurada",
        phone: process.env.BUSINESS_PHONE,
        email: process.env.BUSINESS_EMAIL
      },
      customer: customerInfo,
      customerUserId: customerInfo.user,
      paymentType: paymentType || "CONTADO",
      paymentMethod: methodDisplay,
      items: invoiceItems,
      totals: {
        subtotal: orderSubtotal,
        totalTax: orderTax,
        total: orderTotal
      },
      tip: tipValue,
      cashAmount: receivedAmount,
      change: changeValue,
      paymentMethodId: methodRow.id,
      cuadreId: activeCuadreId || null,
      electronic: {
        isElectronic: isElectronic || false
      },
      order: orderId,
      processedBy: req.user._id,
      notes,
      invoiceStateId,
    });

    await invoice.save();

    // Identificar productos involucrados en la factura
    let affectedProductIds = [];
    try {
      const [rows] = await pool.query(
        "SELECT DISTINCT producto_id FROM productos_x_pedidos WHERE pedido_id = ?",
        [orderId]
      );
      affectedProductIds = rows
        .map((r) => Number(r.producto_id))
        .filter((value) => Number.isFinite(value) && value > 0);
    } catch { }

    // Descontar inventario por productos vendidos en este pedido
    try {
      await pool.query(`
        UPDATE productos p
        JOIN (
          SELECT producto_id, SUM(cantidad) AS qty
          FROM productos_x_pedidos
          WHERE pedido_id = ?
          GROUP BY producto_id
        ) x ON x.producto_id = p.id
        SET p.cantidad = GREATEST(0, COALESCE(p.cantidad, 0) - x.qty),
            p.updated_at = NOW()
      `, [orderId]);
    } catch { }

    if (affectedProductIds.length) {
      for (const productId of affectedProductIds) {
        try {
          const productDoc = await Product.findById(productId);
          if (productDoc) await evaluateProductAlerts(productDoc);
        } catch (err) {
          console.error(err);
        }
      }
    }

    // Actualizar orden
    await Order.findByIdAndUpdate(orderId, { paymentStatus: "PAGADO", orderStatus: "PAGADO", invoice: invoice._id, cashierUserId: normalizeUserId(req.user?._id), customerUserId: normalizeUserId(customerInfo.user || order.customerUserId) });

    try {
      await pool.query("UPDATE pedidos SET mesa_id = NULL WHERE id = ?", [orderId]);
    } catch { }

    const refreshedOrder = await Order.findById(orderId);

    const invoiceResponse = {
      id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      totals: invoice.totals,
      tip: tipValue,
      amount: receivedAmount,
      change: changeValue,
      paymentMethod: {
        id: methodRow.id,
        name: methodDisplay,
        rawName: methodName,
      },
      paymentType: paymentType || (isCash ? "CONTADO" : "ELECTRONICO"),
      customer: customerInfo,
      issuer: invoice.issuer,
      createdAt: invoice.createdAt || new Date(),
      cuadreId: activeCuadreId || null,
      items: invoiceItems,
      totalWithTip,
    };

    if (customerInfo?.email) {
      sendInvoiceEmail(
        invoiceResponse,
        refreshedOrder || order,
        customerInfo.email
      );
    }

    res.status(201).json({
      success: true,
      message: "Factura generada exitosamente",
      data: { invoice: invoiceResponse, order: refreshedOrder }
    });
  } catch (error) {
    next(error);
  }
};

// Obtener factura por ID
const getInvoice = async (req, res, next) => {
  try {
    const invQuery = Invoice.findById(req.params.id);
    const invoice = await invQuery.exec ? invQuery.exec() : invQuery;
    if (!invoice) {
      return next(createHttpError(404, "Factura no encontrada"));
    }
    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

// Listar facturas con filtros
const getInvoices = async (req, res, next) => {
  try {
    const { startDate, endDate, customerNit, status, limit = 50 } = req.query;

    const filter = {};

    if (startDate && endDate) {
      filter.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (customerNit) {
      filter["customer.nit"] = customerNit;
    }

    if (status) {
      filter.status = status;
    }

    const invoices = await Invoice.find(filter)
      .populate()
      .sort({})
      .limit(parseInt(limit));

    res.json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
};

// Obtener facturas de un cliente (si esta registrado)
const getCustomerInvoices = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    const invoices = await Invoice.find({ "customer.user": customerId })
      .populate("order")
      .sort({ invoiceDate: -1 });

    res.json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
};

// Anular factura
const cancelInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return next(createHttpError(404, "Factura no encontrada"));
    }

    if (invoice.status === "ANULADA") {
      return next(createHttpError(400, "Factura ya esta anulada"));
    }

    // Solo admin puede anular facturas
    if (req.user.role !== "Administrator") {
      return next(createHttpError(403, "Solo administradores pueden anular facturas"));
    }

    invoice.status = "ANULADA";
    await invoice.save();

    // Actualizar orden
    await Order.findByIdAndUpdate(invoice.order, {
      paymentStatus: "PENDIENTE",
      orderStatus: "ENTREGADO"
    });

    res.json({
      success: true,
      message: "Factura anulada exitosamente",
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createInvoice,
  getInvoice,
  getInvoices,
  getCustomerInvoices,
  cancelInvoice
};
