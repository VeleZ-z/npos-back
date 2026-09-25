// Descuentos: CRUD admin con flyer (multipart), listado público de activos,
// reenvío best-effort. Clases de equivalencia: valor vs porcentaje (excluyentes).
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { isDbAvailable, truncateAll } from "../db";
import { createUser, createProduct } from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Descuentos — CRUD admin, listado y reenvío", () => {
  let admin, cashier, customer;
  let product;
  let discountId;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
    customer = await createUser({ email: "customer@nativ.test", role: "Customer" });
    product = await createProduct({ name: "Producto Desc", precio: 5000 });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado admin Cuando crea descuento por valor con producto asociado Entonces 201", async () => {
    const res = await request(app)
      .post("/api/discount")
      .set(authHeaders(admin))
      .field("nombre", "Descuento 1000")
      .field("valor", "1000")
      .field("mensaje", "Ahorra mil")
      .field("productos", String(product._id));
    expect(res.status).toBe(201);
    discountId = res.body.data?._id ?? res.body.data?.id;
    expect(discountId).toBeTruthy();
  });

  it("Dado admin Cuando crea descuento con valor Y porcentaje Entonces 400 (excluyentes)", async () => {
    const res = await request(app)
      .post("/api/discount")
      .set(authHeaders(admin))
      .field("nombre", "Invalido")
      .field("valor", "1000")
      .field("porciento", "10")
      .field("productos", String(product._id));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Solo puedes aplicar un descuento por valor o por porcentaje"
    );
  });

  it("Dado admin Cuando crea descuento sin producto Entonces 400 'Selecciona un producto asociado'", async () => {
    const res = await request(app)
      .post("/api/discount")
      .set(authHeaders(admin))
      .field("nombre", "Sin producto");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Selecciona un producto asociado");
  });

  it("Dado admin Cuando crea descuento sin nombre Entonces 400", async () => {
    const res = await request(app)
      .post("/api/discount")
      .set(authHeaders(admin))
      .field("valor", "500")
      .field("productos", String(product._id));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Nombre es requerido");
  });

  it("Dado cajero Cuando crea descuento Entonces 403 (solo admin)", async () => {
    const res = await request(app)
      .post("/api/discount")
      .set(authHeaders(cashier))
      .field("nombre", "No permitido")
      .field("valor", "100")
      .field("productos", String(product._id));
    expect(res.status).toBe(403);
  });

  it("Dado descuento activo Cuando GET /api/discount (cualquier autenticado) Entonces aparece en activos", async () => {
    const res = await request(app).get("/api/discount").set(authHeaders(customer));
    expect(res.status).toBe(200);
    expect((res.body.data || []).some((d) => String(d._id) === String(discountId))).toBe(true);
  });

  it("Dado cajero Cuando GET /api/discount/admin Entonces 403 (solo admin)", async () => {
    const res = await request(app).get("/api/discount/admin").set(authHeaders(cashier));
    expect(res.status).toBe(403);
  });

  it("Dado admin Cuando GET /api/discount/admin Entonces 200 con el descuento creado", async () => {
    const res = await request(app).get("/api/discount/admin").set(authHeaders(admin));
    expect(res.status).toBe(200);
    expect((res.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado descuento existente Cuando admin actualiza Entonces 200", async () => {
    const res = await request(app)
      .put(`/api/discount/${discountId}`)
      .set(authHeaders(admin))
      .field("nombre", "Descuento 1000 v2")
      .field("valor", "1500")
      .field("productos", String(product._id));
    expect(res.status).toBe(200);
  });

  it("Dado descuento inexistente Cuando se actualiza Entonces 404", async () => {
    const res = await request(app)
      .put("/api/discount/999999")
      .set(authHeaders(admin))
      .field("nombre", "X")
      .field("productos", String(product._id));
    expect(res.status).toBe(404);
  });

  it("Dado descuento existente Cuando admin reenvía Entonces 200 (email best-effort)", async () => {
    const res = await request(app)
      .post(`/api/discount/${discountId}/resend`)
      .set(authHeaders(admin));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Descuento reenviado");
  });

  it("Dado descuento inexistente Cuando se reenvía Entonces 404", async () => {
    const res = await request(app)
      .post("/api/discount/999999/resend")
      .set(authHeaders(admin));
    expect(res.status).toBe(404);
  });
});
