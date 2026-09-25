// Lectura de facturas: listado (con rango de fechas), detalle por id y
// facturas por cliente. Hallazgo documentado: el filtro customerNit del
// listado NO está implementado en el modelo (se envía al frontend todas las
// facturas sin filtrar por NIT).
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { isDbAvailable, truncateAll } from "../db";
import { createUser, createProduct, createOrder, createPaymentMethod, createCuadre } from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Facturas — listado, detalle y por cliente", () => {
  let admin, cashier, customer;
  let product, method;
  let invoiceId;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
    customer = await createUser({ email: "cliente@nativ.test", role: "Customer" });
    product = await createProduct({ name: "Producto Fact", precio: 8000, cantidad: 50 });
    method = await createPaymentMethod({ nombre: "EFECTIVO" });
    await createCuadre({ userId: cashier._id });

    // Emitir una factura real vía API para tener datos consistentes
    const order = await createOrder({
      clienteUserId: customer._id,
      customer: { name: "Cliente Fact", email: "cliente@nativ.test" },
      items: [{ productoId: product._id, cantidad: 1, precioUnitario: 8000, precioOriginal: 8000 }],
    });
    const created = await request(app)
      .post("/api/invoice")
      .set(authHeaders(cashier))
      .send({ orderId: order._id, paymentMethodId: method._id, cashAmount: 8000 });
    expect(created.status).toBe(201);
    invoiceId = created.body.data.invoice.id;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado facturas emitidas Cuando GET /api/invoice Entonces 200 con la factura", async () => {
    const res = await request(app).get("/api/invoice").set(authHeaders(cashier));
    expect(res.status).toBe(200);
    const invoices = res.body.data || [];
    expect(invoices.some((f) => String(f._id) === String(invoiceId))).toBe(true);
  });

  it("Dado rango de fechas de hoy (hasta fin del día) Cuando GET /api/invoice?startDate&endDate Entonces 200 con resultados", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get("/api/invoice")
      .query({ startDate: `${today}T00:00:00`, endDate: `${today}T23:59:59` })
      .set(authHeaders(cashier));
    expect(res.status).toBe(200);
    expect((res.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado id existente Cuando GET /api/invoice/:id Entonces 200 con la factura", async () => {
    const res = await request(app)
      .get(`/api/invoice/${invoiceId}`)
      .set(authHeaders(admin));
    expect(res.status).toBe(200);
    expect(String(res.body.data._id)).toBe(String(invoiceId));
  });

  it("Dado id inexistente Cuando GET /api/invoice/:id Entonces 404", async () => {
    const res = await request(app)
      .get("/api/invoice/999999")
      .set(authHeaders(admin));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Factura no encontrada");
  });

  it("Dado cliente con factura Cuando GET /api/invoice/customer/:customerId Entonces 200", async () => {
    const res = await request(app)
      .get(`/api/invoice/customer/${customer._id}`)
      .set(authHeaders(cashier));
    expect(res.status).toBe(200);
    const invoices = res.body.data || [];
    expect(
      invoices.some(
        (f) => String(f.customerUserId ?? f.customer?.user) === String(customer._id)
      )
    ).toBe(true);
  });

  it("Dado customerNit en el query Cuando se lista Entonces comportamiento actual: filtro NO aplicado (hallazgo documentado)", async () => {
    const res = await request(app)
      .get("/api/invoice")
      .query({ customerNit: "111111111111" })
      .set(authHeaders(cashier));
    expect(res.status).toBe(200);
    // El modelo ignora customerNit: devuelve todas las facturas.
    expect((res.body.data || []).length).toBeGreaterThan(0);
  });
});
