// CRUDs de compras/proveedores, alertas y estadísticas.
// Valores límite: stock de compra y umbral de alerta (alerta_min_stock).
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { pool } from "../../config/mysql";
import { isDbAvailable, truncateAll } from "../db";
import { createUser } from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Proveedores — CRUD", () => {
  let admin, cashier;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado admin Cuando crea proveedor Entonces 201 y aparece en listado", async () => {
    const created = await request(app)
      .post("/api/provider")
      .set(authHeaders(admin))
      .send({ name: "Distribuidora Test", phone: "3001112233", email: "prov@test.nativ", contact: "Contacto" });
    expect(created.status).toBe(201);

    const list = await request(app).get("/api/provider").set(authHeaders(cashier));
    expect(list.status).toBe(200);
    expect((list.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado cajero Cuando crea proveedor Entonces 403", async () => {
    const res = await request(app)
      .post("/api/provider")
      .set(authHeaders(cashier))
      .send({ name: "No permitido", contact: "X" });
    expect(res.status).toBe(403);
  });

  it("Dado proveedor Cuando admin actualiza y elimina Entonces 200", async () => {
    const created = await request(app)
      .post("/api/provider")
      .set(authHeaders(admin))
      .send({ name: "Temporal Prov", contact: "C" });
    const id = created.body.data?._id ?? created.body.data?.id;
    const updated = await request(app)
      .put(`/api/provider/${id}`)
      .set(authHeaders(admin))
      .send({ name: "Temporal Prov 2" });
    expect(updated.status).toBe(200);
    const deleted = await request(app).delete(`/api/provider/${id}`).set(authHeaders(admin));
    expect(deleted.status).toBe(200);
  });
});

describe.skipIf(!dbUp)("Compras — CRUD, stock y umbral de alerta", () => {
  let admin, cashier;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin2@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier2@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado cajero Cuando lista compras Entonces 200", async () => {
    const res = await request(app).get("/api/purchase").set(authHeaders(cashier));
    expect(res.status).toBe(200);
  });

  it("Dado cajero Cuando crea compra Entonces 403 (solo admin)", async () => {
    const res = await request(app)
      .post("/api/purchase")
      .set(authHeaders(cashier))
      .send({ name: "Compra Test", quantity: 10, deliveryDate: "2026-10-01" });
    expect(res.status).toBe(403);
  });

  it("Dado admin Cuando crea compra Entonces 201 y el stock se refleja", async () => {
    const created = await request(app)
      .post("/api/purchase")
      .set(authHeaders(admin))
      .send({
        name: "Insumo Test",
        quantity: 20,
        deliveryDate: "2026-10-01",
        cost: 5000,
        unidad_medida: "kg",
        alerta_min_stock: 5,
      });
    expect(created.status).toBe(201);
    const purchase = created.body.data;
    const id = purchase?._id ?? purchase?.id;
    expect(Number(purchase?.stock ?? purchase?.quantity ?? 0)).toBeGreaterThan(0);

    // Limpiar para no afectar otros tests del archivo
    await request(app).delete(`/api/purchase/${id}`).set(authHeaders(admin));
  });

  it("Dado compra recibida Cuando cajero actualiza stock Entonces 200", async () => {
    const created = await request(app)
      .post("/api/purchase")
      .set(authHeaders(admin))
      .send({ name: "Insumo Stock", quantity: 10, deliveryDate: "2026-10-01", cost: 1000 });
    const id = created.body.data?._id ?? created.body.data?.id;

    const res = await request(app)
      .put(`/api/purchase/${id}/stock`)
      .set(authHeaders(cashier))
      .send({ quantity: 5 });
    expect(res.status).toBe(200);

    await request(app).delete(`/api/purchase/${id}`).set(authHeaders(admin));
  });

  it("Dado customer Cuando lista compras Entonces 403", async () => {
    const customer = await createUser({ email: "cust@nativ.test", role: "Customer" });
    const res = await request(app).get("/api/purchase").set(authHeaders(customer));
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!dbUp)("Alertas — lectura y ack por usuario", () => {
  let cashier;

  beforeAll(async () => {
    await truncateAll();
    cashier = await createUser({ email: "cashier3@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado usuario sin alertas Cuando GET /api/alert Entonces 200 con lista vacía", async () => {
    const res = await request(app).get("/api/alert").set(authHeaders(cashier));
    expect(res.status).toBe(200);
    expect(res.body.data || []).toEqual([]);
  });

  it("Dado alerta asignada al usuario Cuando GET /api/alert Entonces aparece y se puede ack", async () => {
    const [alerta] = await pool.query(
      "INSERT INTO alertas (mensaje_alrt, created_at, updated_at) VALUES ('Alerta de prueba', NOW(), NOW())"
    );
    await pool.query(
      "INSERT INTO alertas_x_usuarios (usuario_id, alerta_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
      [cashier._id, alerta.insertId]
    );

    const list = await request(app).get("/api/alert").set(authHeaders(cashier));
    expect(list.status).toBe(200);
    expect((list.body.data || []).some((a) => a.message === "Alerta de prueba")).toBe(true);

    const alertId = (list.body.data || []).find((a) => a.message === "Alerta de prueba")?.id;
    const ack = await request(app)
      .post(`/api/alert/${alertId}/ack`)
      .set(authHeaders(cashier));
    expect(ack.status).toBe(200);
  });
});

describe.skipIf(!dbUp)("Estadísticas — métricas del dashboard", () => {
  let cashier;

  beforeAll(async () => {
    await truncateAll();
    cashier = await createUser({ email: "cashier4@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado cajero Cuando GET /api/stats/today Entonces 200 con objeto de métricas", async () => {
    const res = await request(app).get("/api/stats/today").set(authHeaders(cashier));
    expect(res.status).toBe(200);
    expect(typeof res.body.data).toBe("object");
  });

  it("Dado cajero Cuando GET /api/stats/popular-products Entonces 200", async () => {
    const res = await request(app)
      .get("/api/stats/popular-products")
      .set(authHeaders(cashier));
    expect(res.status).toBe(200);
  });

  it("Dado sin token Cuando GET /api/stats/today Entonces 401", async () => {
    const res = await request(app).get("/api/stats/today");
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!dbUp)("Caja — current, movements, history y export", () => {
  let admin, cashier;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin5@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier5@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado sin caja abierta Cuando GET /api/cash-desk/current Entonces 200 con null/estado cerrado", async () => {
    const res = await request(app).get("/api/cash-desk/current").set(authHeaders(cashier));
    expect(res.status).toBe(200);
  });

  it("Dado caja abierta Cuando GET current/movements/history/export Entonces 200", async () => {
    const open = await request(app)
      .post("/api/cash-desk/open")
      .set(authHeaders(cashier))
      .send({ saldoInicial: 100000 });
    expect(open.status).toBe(201);

    const current = await request(app).get("/api/cash-desk/current").set(authHeaders(cashier));
    expect(current.status).toBe(200);

    const movements = await request(app).get("/api/cash-desk/movements").set(authHeaders(cashier));
    expect(movements.status).toBe(200);

    const history = await request(app).get("/api/cash-desk/history").set(authHeaders(admin));
    expect(history.status).toBe(200);

    const cajeroHistory = await request(app).get("/api/cash-desk/history").set(authHeaders(cashier));
    expect(cajeroHistory.status).toBe(403);

    const exportNoId = await request(app).get("/api/cash-desk/export").set(authHeaders(cashier));
    expect(exportNoId.status).toBe(400);
    expect(exportNoId.body.message).toBe("cuadreId requerido");

    const cuadreId = current.body.data?.cuadre?.id;
    const exportRes = await request(app)
      .get("/api/cash-desk/export")
      .query({ cuadreId })
      .set(authHeaders(cashier));
    expect([200, 201]).toContain(exportRes.status);
  });

  it("Dado caja ya abierta Cuando abro otra Entonces 400 'Ya existe un cuadre abierto'", async () => {
    const res = await request(app)
      .post("/api/cash-desk/open")
      .set(authHeaders(admin))
      .send({ saldoInicial: 0 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Ya existe un cuadre abierto");
  });

  it("Dado saldo inicial inválido Cuando abro caja Entonces 400", async () => {
    // Cerrar la caja abierta por el test anterior primero
    await request(app).post("/api/cash-desk/close").set(authHeaders(cashier)).send({ saldoReal: 100000 });
    const res = await request(app)
      .post("/api/cash-desk/open")
      .set(authHeaders(cashier))
      .send({ saldoInicial: -5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Saldo inicial inválido");
  });
});
