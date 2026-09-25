// Mesas: creación, duplicado, listado con estado computado y actualización.
// El estado (Available/Booked/PendingApproval) se calcula con pedidos abiertos.
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { isDbAvailable, truncateAll } from "../db";
import { createUser, createOrder } from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Mesas — creación, duplicado, estado computado y actualización", () => {
  let admin, cashier;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado admin Cuando crea mesa Entonces 201 y aparece en el listado", async () => {
    const res = await request(app)
      .post("/api/table")
      .set(authHeaders(admin))
      .send({ tableNo: 21, seats: 4 });
    expect(res.status).toBe(201);
    // La respuesta devuelve el TableDoc (tableNo/seats, sin _id); el id se
    // resuelve desde el listado (observación: shape de respuesta sin _id).
    expect(res.body.data?.tableNo).toBe(21);

    const list = await request(app).get("/api/table").set(authHeaders(admin));
    expect((list.body.data || []).some((t) => t.number === 21)).toBe(true);
  });

  it("Dado mesa existente Cuando se crea de nuevo Entonces 400 'la mesa ya existe!'", async () => {
    const res = await request(app)
      .post("/api/table")
      .set(authHeaders(admin))
      .send({ tableNo: 21, seats: 4 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("la mesa ya existe!");
  });

  it("Dado mesa sin número Cuando se crea Entonces 400", async () => {
    const res = await request(app)
      .post("/api/table")
      .set(authHeaders(admin))
      .send({ seats: 2 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Por favor, proporcione el número de mesa!");
  });

  it("Dado cajero Cuando lista mesas Entonces 200 (admin/cashier permitidos)", async () => {
    const res = await request(app).get("/api/table").set(authHeaders(cashier));
    expect(res.status).toBe(200);
    expect((res.body.data || []).some((t) => t.number === 21)).toBe(true);
  });

  it("Dado mesa con pedido abierto Cuando se lista Entonces estado 'Booked'", async () => {
    await request(app)
      .post("/api/table")
      .set(authHeaders(admin))
      .send({ tableNo: 22, seats: 2 });
    const list0 = await request(app).get("/api/table").set(authHeaders(admin));
    const tableId = (list0.body.data || []).find((t) => t.number === 22)?._id;
    await createOrder({ mesaId: tableId, estadoId: 5, orderStatus: "PENDIENTE" });

    const list = await request(app).get("/api/table").set(authHeaders(admin));
    const table = (list.body.data || []).find((t) => t.number === 22);
    expect(table?.status).toBe("Booked");
  });

  it("Dado mesa existente Cuando admin actualiza Entonces 200", async () => {
    const list = await request(app).get("/api/table").set(authHeaders(admin));
    const table = (list.body.data || []).find((t) => t.number === 21);
    const res = await request(app)
      .put(`/api/table/${table._id}`)
      .set(authHeaders(admin))
      .send({ status: "Available" });
    expect(res.status).toBe(200);
  });

  it("Dado id inválido Cuando se actualiza Entonces 404 'ID inválido!'", async () => {
    const res = await request(app)
      .put("/api/table/abc")
      .set(authHeaders(admin))
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("ID inválido!");
  });
});
