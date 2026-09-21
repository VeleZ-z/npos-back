// Historia de usuario:
//   Como cajero, quiero generar la factura DIAN de una comanda con caja
//   abierta, para cobrar con consecutivo F-XXXX, descontar inventario,
//   liberar la mesa y enviar el PDF al cliente.
//
// Criterios (Dado/Cuando/Entonces):
//   Dado caja abierta y orden con items Cuando facturo con método ACTIVO
//   Entonces 201 con F-0001, inventario descontado, mesa liberada, orden PAGADO
//   Dado sin caja abierta / método INACTIVO / orden inexistente / orden ya
//   facturada / monto insuficiente Cuando facturo Entonces 400/404 según caso
//   Dado rol waiter o customer Cuando facturo Entonces 403
//   Dado SMTP sin configurar Cuando la factura tiene email de cliente Entonces
//   se emite igual (envío best-effort; el contenido del email y del PDF se
//   verifica en unit/invoiceEmail.test.js)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { pool } from "../../config/mysql";
import { isDbAvailable, truncateAll } from "../db";
import {
  createUser,
  createProduct,
  createTable,
  createOrder,
  createPaymentMethod,
} from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Facturación — createInvoice y cancelInvoice", () => {
  let admin, cashier, waiter;
  let product, method;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
    waiter = await createUser({ email: "waiter@nativ.test", role: "Waiter" });
    product = await createProduct({
      name: "Hamburguesa",
      precio: 10000,
      cantidad: 100,
      alertaMinStock: 5,
    });
    method = await createPaymentMethod({ nombre: "EFECTIVO" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  const invoice = (user, body) =>
    request(app).post("/api/invoice").set(authHeaders(user)).send(body);

  it("Dado caja abierta y orden con 2 items Cuando facturo Entonces 201 F-0001, inventario descontado, mesa liberada, PAGADO", async () => {
    const cuadre = await request(app)
      .post("/api/cash-desk/open")
      .set(authHeaders(cashier))
      .send({ saldoInicial: 50000 });
    expect(cuadre.status).toBe(201);

    const table = await createTable({ numero: 1 });
    const order = await createOrder({
      mesaId: table._id,
      items: [
        { productoId: product._id, cantidad: 2, precioUnitario: 10000, precioOriginal: 10000 },
      ],
    });

    const res = await invoice(cashier, {
      orderId: order._id,
      paymentMethodId: method._id,
      cashAmount: 25000,
      tipAmount: 2000,
      customerData: { name: "Cliente Prueba", email: "cliente@test.nativ" },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.invoice.invoiceNumber).toBe("F-0001");
    expect(res.body.data.invoice.totals.total).toBe(20000);
    expect(res.body.data.invoice.totals.subtotal).toBe(18519);
    expect(res.body.data.invoice.totals.totalTax).toBe(1481);
    expect(res.body.data.invoice.tip).toBe(2000);
    expect(res.body.data.invoice.change).toBe(3000);

    const [[prodRow]] = await pool.query("SELECT cantidad FROM productos WHERE id = ?", [
      product._id,
    ]);
    expect(Number(prodRow.cantidad)).toBe(98);

    const [[orderRow]] = await pool.query(
      `SELECT p.estado_id, p.mesa_id, e.nombre AS estado FROM pedidos p LEFT JOIN estados e ON e.id = p.estado_id WHERE p.id = ?`,
      [order._id]
    );
    expect(orderRow.estado).toBe("PAGADO");
    expect(orderRow.mesa_id).toBeNull();
  });

  it("Dado factura con email de cliente y SMTP sin configurar Cuando se emite Entonces 201 igual (best-effort, no rompe)", async () => {
    const order = await createOrder({
      items: [{ productoId: product._id, cantidad: 1, precioUnitario: 10000, precioOriginal: 10000 }],
    });
    const res = await invoice(cashier, {
      orderId: order._id,
      paymentMethodId: method._id,
      cashAmount: 15000,
      customerData: { name: "Cliente Sin SMTP", email: "no-enviable@test.nativ" },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.invoice.invoiceNumber).toBe("F-0002");
  });

  it("Dado orden ya facturada Cuando facturo Entonces 400 'Esta orden ya tiene factura'", async () => {
    const order = await createOrder({
      items: [{ productoId: product._id, cantidad: 1, precioUnitario: 10000, precioOriginal: 10000 }],
    });
    const first = await invoice(cashier, { orderId: order._id, paymentMethodId: method._id, cashAmount: 20000 });
    expect(first.status).toBe(201);
    const second = await invoice(cashier, { orderId: order._id, paymentMethodId: method._id, cashAmount: 20000 });
    expect(second.status).toBe(400);
    expect(second.body.message).toBe("Esta orden ya tiene factura");
  });

  it("Dado orden inexistente Cuando facturo Entonces 404", async () => {
    const res = await invoice(cashier, { orderId: 999999, paymentMethodId: method._id, cashAmount: 20000 });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Orden no encontrada");
  });

  it("Dado campos faltantes (sin método de pago) Cuando facturo Entonces 400", async () => {
    const order = await createOrder({});
    const res = await invoice(cashier, { orderId: order._id });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Faltan campos requeridos");
  });

  it("Dado método de pago inexistente Cuando facturo Entonces 400", async () => {
    const order = await createOrder({});
    const res = await invoice(cashier, { orderId: order._id, paymentMethodId: 999999, cashAmount: 20000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Método de pago inválido");
  });

  it("Dado método de pago INACTIVO Cuando facturo Entonces 400 'no está activo'", async () => {
    const inactive = await createPaymentMethod({ nombre: "DATAFONO", estadoId: 13 });
    const order = await createOrder({});
    const res = await invoice(cashier, { orderId: order._id, paymentMethodId: inactive._id, cashAmount: 20000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("El método de pago no está activo");
  });

  it("Dado monto insuficiente por 1 Cuando facturo en efectivo Entonces 400", async () => {
    const order = await createOrder({
      items: [{ productoId: product._id, cantidad: 1, precioUnitario: 10000, precioOriginal: 10000 }],
    });
    const res = await invoice(cashier, {
      orderId: order._id,
      paymentMethodId: method._id,
      cashAmount: 9999,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("El monto recibido es insuficiente");
  });

  it("Dado efectivo sin monto Cuando facturo Entonces 400 'Monto en efectivo requerido'", async () => {
    const order = await createOrder({});
    const res = await invoice(cashier, { orderId: order._id, paymentMethodId: method._id });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Monto en efectivo requerido");
  });

  it("Dado rol waiter Cuando facturo Entonces 403 'Solo cajeros'", async () => {
    const order = await createOrder({});
    const res = await invoice(waiter, { orderId: order._id, paymentMethodId: method._id, cashAmount: 20000 });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Solo cajeros pueden generar facturas");
  });

  it("Dado caja cerrada (sin cuadre activo) Cuando facturo Entonces 400 'No hay una caja abierta'", async () => {
    await request(app).post("/api/cash-desk/close").set(authHeaders(cashier)).send({ saldoReal: 50000 });
    const order = await createOrder({});
    const res = await invoice(cashier, { orderId: order._id, paymentMethodId: method._id, cashAmount: 20000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("No hay una caja abierta. Debes abrir caja antes de facturar.");
  });

  describe("Anulación de facturas", () => {
    it("Dado factura emitida Cuando el cajero anula Entonces 403 (solo admin)", async () => {
      await request(app).post("/api/cash-desk/open").set(authHeaders(cashier)).send({ saldoInicial: 10000 });
      const order = await createOrder({
        items: [{ productoId: product._id, cantidad: 1, precioUnitario: 10000, precioOriginal: 10000 }],
      });
      const created = await invoice(cashier, { orderId: order._id, paymentMethodId: method._id, cashAmount: 20000 });
      expect(created.status).toBe(201);
      const res = await request(app)
        .patch(`/api/invoice/${created.body.data.invoice.id}/cancel`)
        .set(authHeaders(cashier));
      expect(res.status).toBe(403);
    });

    it("Dado factura emitida Cuando el admin anula Entonces 200 ANULADA y orden vuelve a ENTREGADO", async () => {
      const order = await createOrder({
        items: [{ productoId: product._id, cantidad: 1, precioUnitario: 10000, precioOriginal: 10000 }],
      });
      const created = await invoice(cashier, { orderId: order._id, paymentMethodId: method._id, cashAmount: 20000 });
      const invoiceId = created.body.data.invoice.id;
      const res = await request(app)
        .patch(`/api/invoice/${invoiceId}/cancel`)
        .set(authHeaders(admin));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("ANULADA");

      const [[orderRow]] = await pool.query(
        `SELECT p.estado_id, e.nombre AS estado FROM pedidos p LEFT JOIN estados e ON e.id = p.estado_id WHERE p.id = ?`,
        [order._id]
      );
      expect(orderRow.estado).toBe("ENTREGADO");
    });

    it("Dado factura ya anulada Cuando anulo de nuevo Entonces 400", async () => {
      const order = await createOrder({});
      const created = await invoice(cashier, { orderId: order._id, paymentMethodId: method._id, cashAmount: 20000 });
      await request(app)
        .patch(`/api/invoice/${created.body.data.invoice.id}/cancel`)
        .set(authHeaders(admin));
      const again = await request(app)
        .patch(`/api/invoice/${created.body.data.invoice.id}/cancel`)
        .set(authHeaders(admin));
      expect(again.status).toBe(400);
      expect(again.body.message).toBe("Factura ya esta anulada");
    });

    it("Dado factura inexistente Cuando anulo Entonces 404", async () => {
      const res = await request(app)
        .patch("/api/invoice/999999/cancel")
        .set(authHeaders(admin));
      expect(res.status).toBe(404);
    });
  });
});
