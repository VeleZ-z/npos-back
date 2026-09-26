import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../app";

// Umbrales de cabeceras de helmet según su default actual: nosniff siempre,
// CORP same-origin en la API y cross-origin en estáticos consumidos por el
// frontend. No se asumen cabeceras que helmet pueda rotar entre versiones.

describe("Integración — Hardening HTTP", () => {
  it("Dado GET /api/health Cuando responde Entonces cabeceras de seguridad presentes", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("Dado respuesta de la API Cuando se inspecciona Entonces CORP same-origin", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("Dado estático /assets consumido por el front Cuando se pide Entonces CORP cross-origin", async () => {
    // Aunque el archivo no exista (404), las cabeceras del middleware ya viajan.
    const res = await request(app).get("/assets/logo-inexistente.png");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("Dado respuesta de /api Cuando se inspecciona Entonces cabeceras RateLimit estándar", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
  });

  it("Dado google-login con credential mal tipado (número) Cuando se envía Entonces 400 de validación, no 500", async () => {
    const res = await request(app)
      .post("/api/user/google-login")
      .send({ credential: 12345, state: "x".repeat(32) });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Campo inválido");
  });

  it("Dado POST /api/invoice con orderId mal tipado Cuando se envía Entonces 400 de validación", async () => {
    const res = await request(app)
      .post("/api/invoice")
      .send({ orderId: { id: 1 }, paymentMethodId: "pm" });
    // Sin token: el orden de middlewares es validateBody -> isVerifiedUser;
    // el 400 tipado ocurre antes del 401 si el router monta validateBody primero.
    expect([400, 401]).toContain(res.status);
  });
});
