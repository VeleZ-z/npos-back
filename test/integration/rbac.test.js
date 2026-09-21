// Tabla de decisión RBAC: rol (admin/cashier/waiter/customer/invitado/sin token)
// × endpoint protegido × resultado esperado (200/401/403).
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { isDbAvailable, truncateAll } from "../db";
import { createUser, createRole } from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("RBAC — matriz de decisión por rol y endpoint", () => {
  let admin, cashier, waiter, customer;

  beforeAll(async () => {
    await truncateAll();
    await createRole("Waiter");
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
    waiter = await createUser({ email: "waiter@nativ.test", role: "Waiter" });
    customer = await createUser({ email: "customer@nativ.test", role: "Customer" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  const usersByRole = () => ({ admin, cashier, waiter, customer });

  // GET /api/order — authorizeRoles('admin', 'cashier', 'customer')
  const orderEndpoint = () => request(app).get("/api/order");

  it.each([
    ["admin", 200],
    ["cashier", 200],
    ["customer", 200],
    ["waiter", 403],
  ])("Dado rol %s Cuando GET /api/order Entonces %d", async (role, expected) => {
    // Justificación: selección de fixture por rol; las claves provienen de los
    // literales del propio it.each (no de input externo).
    // eslint-disable-next-line security/detect-object-injection
    const user = usersByRole()[role];
    const res = await orderEndpoint().set(authHeaders(user));
    expect(res.status).toBe(expected);
  });

  it("Dado customer Cuando GET /api/order Entonces solo ve sus propias órdenes", async () => {
    const res = await orderEndpoint().set(authHeaders(customer));
    expect(res.status).toBe(200);
    const orders = res.body.data || [];
    for (const order of orders) {
      expect(String(order.customer?.userId || "")).toBe(String(customer._id));
    }
  });

  it("Dado invitado (X-Guest: 1) Cuando GET /api/order Entonces 200 (por contrato del front, filtrado)", async () => {
    const res = await orderEndpoint().set("X-Guest", "1");
    expect(res.status).toBe(200);
  });

  it("Dado sin token Cuando GET /api/order Entonces 401", async () => {
    const res = await orderEndpoint();
    expect(res.status).toBe(401);
  });

  it("Dado token inválido Cuando GET /api/order Entonces 401", async () => {
    const res = await orderEndpoint().set({
      Authorization: "Bearer token-invalido-firmado-con-otra-clave",
    });
    expect(res.status).toBe(401);
  });

  it("Dado JWT expirado Cuando GET /api/order Entonces 401", async () => {
    const expired = authHeaders(admin, { expiresIn: "-10s" });
    const res = await orderEndpoint().set(expired);
    expect(res.status).toBe(401);
  });

  // GET /api/user/all — solo admin
  it.each([
    ["admin", 200],
    ["cashier", 403],
  ])("Dado rol %s Cuando GET /api/user/all Entonces %d", async (role, expected) => {
    // Justificación: selección de fixture por rol (claves de literales propios).
    // eslint-disable-next-line security/detect-object-injection
    const user = usersByRole()[role];
    const res = await request(app).get("/api/user/all").set(authHeaders(user));
    expect(res.status).toBe(expected);
  });

  // POST /api/table — solo admin (shape correcto: { tableNo, seats })
  it.each([
    ["admin", 201],
    ["cashier", 403],
  ])("Dado rol %s Cuando POST /api/table Entonces %d", async (role, expected) => {
    // Justificación: selección de fixture por rol (claves de literales propios).
    // eslint-disable-next-line security/detect-object-injection
    const user = usersByRole()[role];
    const res = await request(app)
      .post("/api/table")
      .set(authHeaders(user))
      .send({ tableNo: 99, seats: 4 });
    expect(res.status).toBe(expected);
  });

  // Escalada de rol vía body no debe funcionar: el rol viene del token/DB
  it("Dado customer que envía role=admin en body Cuando crea orden Entonces status POR_APROBAR (no escalada)", async () => {
    const res = await request(app)
      .post("/api/order")
      .set(authHeaders(customer))
      .send({ customer: { name: "Intento" }, orderStatus: "PENDIENTE" });
    expect(res.status).toBe(201);
    expect(res.body.data.orderStatus).toBe("POR_APROBAR");
  });
});
