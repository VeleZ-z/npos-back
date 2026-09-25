// Auth: emisión de state anti-CSRF (GET /api/auth/state) y máquina de estados
// del state en google-login: single-use, expiración, ausencia.
// La verificación del ID token de Google no se prueba aquí (requiere token
// real); se prueba TODO el flujo de state hasta el consumo.
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { pool } from "../../config/mysql";
import { isDbAvailable, truncateAll } from "../db";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Auth — state anti-CSRF y login Google (máquina de estados)", () => {
  beforeAll(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
  });

  const insertState = async (state, expiration) => {
    await pool.query(
      "INSERT INTO cache (`key`, `value`, `expiration`) VALUES (?, '1', ?)",
      [`oauth_state:${state}`, expiration]
    );
  };

  it("Dado el endpoint público Cuando GET /api/auth/state Entonces 200 con state hex de 48 chars y cookie httpOnly", async () => {
    const res = await request(app).get("/api/auth/state");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.state).toMatch(/^[0-9a-f]{48}$/);

    const setCookie = res.headers["set-cookie"]?.join("; ") || "";
    expect(setCookie).toContain("oauth_state=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("Dado state emitido Cuando se usa en google-login con token Google basura Entonces el state se consume (single-use)", async () => {
    const stateRes = await request(app).get("/api/auth/state");
    const state = stateRes.body.state;

    // Token Google inválido: falla DESPUÉS de consumir el state
    // (mensaje crudo de google-auth-library, p.ej. 'Wrong number of segments')
    const first = await request(app)
      .post("/api/user/google-login")
      .send({ credential: "token-basura-no-jwt", state });
    expect(first.status).toBe(401);

    // Reuso del mismo state: ya fue consumido -> 400 Invalid or expired state
    const reuse = await request(app)
      .post("/api/user/google-login")
      .send({ credential: "token-basura-no-jwt", state });
    expect(reuse.status).toBe(400);
    expect(reuse.body.message).toBe("Invalid or expired state");
  });

  it("Dado state expirado (>10 min) Cuando se usa Entonces 400 Invalid or expired state", async () => {
    const expired = Math.floor(Date.now() / 1000) - 60;
    await insertState("estado-expirado-test", expired);
    const res = await request(app)
      .post("/api/user/google-login")
      .send({ credential: "token-basura", state: "estado-expirado-test" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid or expired state");
  });

  it("Dado state inexistente Cuando se usa Entonces 400 Invalid or expired state", async () => {
    const res = await request(app)
      .post("/api/user/google-login")
      .send({ credential: "token-basura", state: "no-existe" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid or expired state");
  });

  it("Dado sin credential Cuando google-login Entonces 400 'Google ID token is required'", async () => {
    const res = await request(app)
      .post("/api/user/google-login")
      .send({ state: "x" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Google ID token is required");
  });

  it("Dado credential sin state Cuando google-login Entonces 400 'Missing state'", async () => {
    const res = await request(app)
      .post("/api/user/google-login")
      .send({ credential: "token-basura" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Missing state");
  });
});

// Hallazgo documentado (F5b): userController.register y userController.login
// NO tienen rutas montadas en userRoute.js y el frontend solo usa google-login
// (src/https/index.js). Son código legacy inalcanzable; se propone su
// eliminación en la oleada de refactorización con ADR.
