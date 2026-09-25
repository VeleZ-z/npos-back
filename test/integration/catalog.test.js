// CRUDs de catálogo y configuración: categorías, productos (con estado de
// stock e imagen), métodos de pago, impuestos y estados.
// Clases de equivalencia: método de pago ACTIVO/INACTIVO/inexistente.
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { isDbAvailable, truncateAll } from "../db";
import { createUser, createPaymentMethod } from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Categorías — CRUD", () => {
  let admin, cashier;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado admin Cuando crea categoría Entonces 201 y aparece en el listado", async () => {
    const created = await request(app)
      .post("/api/category")
      .set(authHeaders(admin))
      .send({ name: "Comidas" });
    expect(created.status).toBe(201);

    const list = await request(app).get("/api/category").set(authHeaders(cashier));
    expect(list.status).toBe(200);
    expect((list.body.data || []).some((c) => c.name === "Comidas")).toBe(true);
  });

  it("Dado categoría con el mismo nombre Cuando se crea de nuevo Entonces 201 (duplicados permitidos hoy — sin unicidad)", async () => {
    const first = await request(app)
      .post("/api/category")
      .set(authHeaders(admin))
      .send({ name: "Bebidas" });
    expect(first.status).toBe(201);
    const second = await request(app)
      .post("/api/category")
      .set(authHeaders(admin))
      .send({ name: "Bebidas" });
    // Comportamiento actual: la tabla categorias no tiene constraint único
    // y el controller no valida duplicados. Se fija el comportamiento real
    // para detectar cambios accidentales; unicidad queda como observación.
    expect(second.status).toBe(201);
  });

  it("Dado cajero Cuando crea categoría Entonces 403", async () => {
    const res = await request(app)
      .post("/api/category")
      .set(authHeaders(cashier))
      .send({ name: "No permitido" });
    expect(res.status).toBe(403);
  });

  it("Dado categoría existente Cuando admin actualiza y elimina Entonces 200", async () => {
    const created = await request(app)
      .post("/api/category")
      .set(authHeaders(admin))
      .send({ name: "Postres" });
    const id = created.body.data?._id ?? created.body.data?.id ?? created.body.data?.insertId;

    const updated = await request(app)
      .put(`/api/category/${id}`)
      .set(authHeaders(admin))
      .send({ name: "Postres Premium" });
    expect(updated.status).toBe(200);

    const deleted = await request(app)
      .delete(`/api/category/${id}`)
      .set(authHeaders(admin));
    expect(deleted.status).toBe(200);
  });
});

describe.skipIf(!dbUp)("Productos — CRUD, stock-state e imagen", () => {
  let admin, cashier;
  let product;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin2@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier2@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado admin Cuando crea producto Entonces 201 y aparece en listado", async () => {
    const created = await request(app)
      .post("/api/product")
      .set(authHeaders(admin))
      .send({ name: "Hamburguesa CRUD", price: 12000, quantity: 10, cost: 4000 });
    expect(created.status).toBe(201);
    product = created.body.data;

    const list = await request(app).get("/api/product").set(authHeaders(cashier));
    expect(list.status).toBe(200);
    expect((list.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado producto Cuando admin actualiza precio Entonces 200", async () => {
    const id = product?._id ?? product?.id;
    const res = await request(app)
      .put(`/api/product/${id}`)
      .set(authHeaders(admin))
      .send({ name: "Hamburguesa CRUD", price: 15000 });
    expect(res.status).toBe(200);
  });

  it("Dado producto Cuando cajero cambia stock-state (cantidad y estado) Entonces 200 (admin y cashier permitidos)", async () => {
    const id = product?._id ?? product?.id;
    const res = await request(app)
      .patch(`/api/product/${id}/stock-state`)
      .set(authHeaders(cashier))
      .send({ cantidad: 3, estado_id: 13 });
    expect(res.status).toBe(200);
  });

  it("Dado customer Cuando crea producto Entonces 403", async () => {
    const customer = await createUser({ email: "cust2@nativ.test", role: "Customer" });
    const res = await request(app)
      .post("/api/product")
      .set(authHeaders(customer))
      .send({ name: "No permitido", price: 1000 });
    expect(res.status).toBe(403);
  });

  it("Dado imagen válida (PNG) Cuando admin la sube Entonces 200/201", async () => {
    const id = product?._id ?? product?.id;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const res = await request(app)
      .post(`/api/product/${id}/image`)
      .set(authHeaders(admin))
      .attach("image", png, { filename: "pixel.png", contentType: "image/png" });
    expect([200, 201]).toContain(res.status);
  });

  it("Dado imagen con tipo no permitido Cuando se sube Entonces falla (fileFilter)", async () => {
    const id = product?._id ?? product?.id;
    const res = await request(app)
      .post(`/api/product/${id}/image`)
      .set(authHeaders(admin))
      .attach("image", Buffer.from("not-an-image"), { filename: "evil.pdf", contentType: "application/pdf" });
    expect([400, 500]).toContain(res.status);
  });

  it("Dado producto Cuando admin elimina Entonces 200", async () => {
    const id = product?._id ?? product?.id;
    const res = await request(app).delete(`/api/product/${id}`).set(authHeaders(admin));
    expect(res.status).toBe(200);
  });
});

describe.skipIf(!dbUp)("Métodos de pago — CRUD y clases de equivalencia de estado", () => {
  let admin, cashier;
  let method;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin3@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier3@nativ.test", role: "Cashier" });
    method = await createPaymentMethod({ nombre: "EFECTIVO CRUD" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado cajero Cuando lista métodos Entonces 200", async () => {
    const res = await request(app).get("/api/paymethod").set(authHeaders(cashier));
    expect(res.status).toBe(200);
    expect((res.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado admin Cuando crea método Entonces 201 y GET /:id lo devuelve", async () => {
    const created = await request(app)
      .post("/api/paymethod")
      .set(authHeaders(admin))
      .send({ name: "TRANSFERENCIA CRUD" });
    expect(created.status).toBe(201);
    const id = created.body.data?._id ?? created.body.data?.id;

    const got = await request(app).get(`/api/paymethod/${id}`).set(authHeaders(cashier));
    expect(got.status).toBe(200);
  });

  it("Dado método Cuando cajero cambia estado_id Entonces 200", async () => {
    const id = method._id ?? method.id;
    const res = await request(app)
      .put(`/api/paymethod/${id}/estado`)
      .set(authHeaders(cashier))
      .send({ estado_id: 13 });
    expect(res.status).toBe(200);
  });

  it("Dado customer Cuando crea método Entonces 403", async () => {
    const customer = await createUser({ email: "cust3@nativ.test", role: "Customer" });
    const res = await request(app)
      .post("/api/paymethod")
      .set(authHeaders(customer))
      .send({ name: "No permitido" });
    expect(res.status).toBe(403);
  });

  it("Dado método Cuando admin actualiza y elimina Entonces 200", async () => {
    const created = await request(app)
      .post("/api/paymethod")
      .set(authHeaders(admin))
      .send({ name: "TEMPORAL" });
    const id = created.body.data?._id ?? created.body.data?.id;
    const updated = await request(app)
      .put(`/api/paymethod/${id}`)
      .set(authHeaders(admin))
      .send({ name: "TEMPORAL 2" });
    expect(updated.status).toBe(200);
    const deleted = await request(app).delete(`/api/paymethod/${id}`).set(authHeaders(admin));
    expect(deleted.status).toBe(200);
  });
});

describe.skipIf(!dbUp)("Impuestos y estados — lectura", () => {
  let cashier;

  beforeAll(async () => {
    await truncateAll();
    cashier = await createUser({ email: "cashier4@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado cajero autenticado Cuando GET /api/tax Entonces 200 con el impuesto sembrado", async () => {
    const res = await request(app).get("/api/tax").set(authHeaders(cashier));
    expect(res.status).toBe(200);
    expect((res.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado sin token Cuando GET /api/tax Entonces 401", async () => {
    const res = await request(app).get("/api/tax");
    expect(res.status).toBe(401);
  });

  it("Dado cajero autenticado Cuando GET /api/state?type=3 Entonces 200 con estados de pedido", async () => {
    const res = await request(app)
      .get("/api/state")
      .query({ type: 3 })
      .set(authHeaders(cashier));
    expect(res.status).toBe(200);
    expect((res.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado GET /api/state sin type Cuando se consulta Entonces 400 (parámetro requerido)", async () => {
    const res = await request(app).get("/api/state").set(authHeaders(cashier));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Missing or invalid type");
  });
});
