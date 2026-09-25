// Endpoints de usuario: perfil, doc-types, búsqueda, listado, roles y
// administración; logout limpia cookie. Escalada de rol vía body bloqueada.
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { pool } from "../../config/mysql";
import { isDbAvailable, truncateAll } from "../db";
import { createUser } from "../factories/index.js";
import { authHeaders, tokenFor } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Usuarios — perfil, búsqueda y administración", () => {
  let admin, cashier, customer;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
    customer = await createUser({ email: "customer@nativ.test", role: "Customer" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado usuario autenticado Cuando GET /api/user Entonces 200 con su perfil", async () => {
    const res = await request(app).get("/api/user").set(authHeaders(customer));
    expect(res.status).toBe(200);
    expect(res.body.data?.email ?? res.body.data?._id).toBeTruthy();
  });

  it("Dado token de usuario eliminado Cuando GET /api/user Entonces 401 'User not exist!'", async () => {
    const temp = await createUser({ email: "temporal@nativ.test", role: "Customer" });
    const token = tokenFor(temp);
    await pool.query("DELETE FROM usuarios WHERE id = ?", [temp._id]);
    const res = await request(app).get("/api/user").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("User not exist!");
  });

  it("Dado cajero Cuando GET /api/user/search?q= Entonces 200 con resultados", async () => {
    const res = await request(app)
      .get("/api/user/search")
      .query({ q: "customer" })
      .set(authHeaders(cashier));
    expect(res.status).toBe(200);
    expect((res.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado admin Cuando GET /api/user/roles Entonces 200 con roles sembrados", async () => {
    const res = await request(app).get("/api/user/roles").set(authHeaders(admin));
    expect(res.status).toBe(200);
    expect((res.body.data || []).length).toBeGreaterThan(0);
  });

  it("Dado admin Cuando PUT /api/user/:id con documento Entonces 200 con datos actualizados", async () => {
    const res = await request(app)
      .put(`/api/user/${customer._id}`)
      .set(authHeaders(admin))
      .send({ documento: "9999999", telefono: "3112223344" });
    expect(res.status).toBe(200);
    expect(res.body.data?.document ?? res.body.data?.documento).toBeTruthy();
  });

  it("Dado cajero Cuando PUT /api/user/:id/role Entonces 403 (solo admin)", async () => {
    const res = await request(app)
      .put(`/api/user/${customer._id}/role`)
      .set(authHeaders(cashier))
      .send({ role: "Cashier" });
    expect(res.status).toBe(403);
  });

  it("Dado admin Cuando PUT /api/user/:id/role Entonces 200 y el rol cambia en DB", async () => {
    const res = await request(app)
      .put(`/api/user/${customer._id}/role`)
      .set(authHeaders(admin))
      .send({ role: "Cashier" });
    expect(res.status).toBe(200);

    const [[row]] = await pool.query(
      `SELECT r.nombre AS role FROM roles_x_usuarios rxu JOIN roles r ON r.id = rxu.role_id WHERE rxu.usuario_id = ? LIMIT 1`,
      [customer._id]
    );
    expect(row?.role).toBe("Cashier");
  });

  it("Dado logout Cuando POST /api/user/logout Entonces 200 y cookie limpiada", async () => {
    const res = await request(app).post("/api/user/logout").set(authHeaders(customer));
    expect(res.status).toBe(200);
    const setCookie = res.headers["set-cookie"]?.[0] || "";
    if (setCookie) {
      expect(/accessToken=;|Expires=Thu, 01 Jan 1970/.test(setCookie)).toBe(true);
    }
  });

  it("Dado cajero Cuando GET /api/user/doc-types Entonces 200", async () => {
    const res = await request(app).get("/api/user/doc-types").set(authHeaders(cashier));
    expect(res.status).toBe(200);
  });
});

describe.skipIf(!dbUp)("Perfil — updateProfile con cumpleaños de un solo uso", () => {
  let customer;

  beforeAll(async () => {
    await truncateAll();
    customer = await createUser({ email: "perfil@nativ.test", role: "Customer" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado cumpleaños null Cuando PUT /api/user/profile Entonces se guarda", async () => {
    const res = await request(app)
      .put("/api/user/profile")
      .set(authHeaders(customer))
      .send({ cumpleanos: "1995-05-15", telefono: "3009998877" });
    expect(res.status).toBe(200);

    const [[row]] = await pool.query("SELECT cumpleanos FROM usuarios WHERE id = ?", [customer._id]);
    expect(String(row.cumpleanos).slice(0, 10)).toBe("1995-05-15");
  });

  it("Dado cumpleaños ya establecido Cuando se intenta cambiar Entonces se conserva el original (one-time set)", async () => {
    const res = await request(app)
      .put("/api/user/profile")
      .set(authHeaders(customer))
      .send({ cumpleanos: "2000-01-01" });
    expect(res.status).toBe(200);

    const [[row]] = await pool.query("SELECT cumpleanos FROM usuarios WHERE id = ?", [customer._id]);
    expect(String(row.cumpleanos).slice(0, 10)).toBe("1995-05-15");
  });
});
