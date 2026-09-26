import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validateEnv, assertValidEnv, REQUIRED_ENV } from "../../config/validateConfig";
import { createRateLimiter } from "../../middlewares/rateLimiters";
import { validateBody } from "../../middlewares/validateBody";
import { googleLoginSchema, createInvoiceSchema } from "../../validations/schemas";

const validEnv = () => ({
  NODE_ENV: "test",
  JWT_SECRET: "x".repeat(32),
  MYSQL_HOST: "localhost",
  MYSQL_USER: "npos_test",
  MYSQL_DATABASE: "npos_test",
  GOOGLE_CLIENT_ID: "dummy.apps.googleusercontent.com",
});

describe("Unit — validateConfig (fail-fast)", () => {
  it("Dado env vacío Cuando validateEnv Entonces reporta TODOS los requeridos faltantes", () => {
    const errors = validateEnv({});
    for (const name of REQUIRED_ENV) {
      expect(errors.some((e) => e.includes(name))).toBe(true);
    }
  });

  it("Dado env completo Cuando validateEnv Entonces cero errores", () => {
    expect(validateEnv(validEnv())).toEqual([]);
  });

  it("Dado JWT corto en producción Cuando validateEnv Entonces error de longitud", () => {
    const errors = validateEnv({ ...validEnv(), NODE_ENV: "production", JWT_SECRET: "corto" });
    expect(errors.some((e) => e.includes("32 caracteres"))).toBe(true);
  });

  it("Dado JWT dummy corto en test Cuando validateEnv Entonces sin error (graduado)", () => {
    const errors = validateEnv({ ...validEnv(), JWT_SECRET: "test-secret-do-not-use-in-prod" });
    expect(errors).toEqual([]);
  });

  it("Dado env inválido Cuando assertValidEnv Entonces lanza con lista agregada", () => {
    expect(() => assertValidEnv({})).toThrow(/JWT_SECRET/);
  });
});

describe("Unit — createRateLimiter", () => {
  const buildApp = () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, limit: 2, message: "limite alcanzado" }));
    app.get("/ping", (_req, res) => res.json({ ok: true }));
    return app;
  };

  it("Dado límite 2 Cuando 3 requests Entonces la tercera es 429 con cuerpo tipado", async () => {
    const app = buildApp();
    const r1 = await request(app).get("/ping");
    const r2 = await request(app).get("/ping");
    const r3 = await request(app).get("/ping");
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.body).toEqual({ status: 429, message: "limite alcanzado" });
  });

  it("Dado respuesta limitada Cuando se inspecciona Entonces cabeceras estándar RateLimit presentes", async () => {
    const app = buildApp();
    await request(app).get("/ping");
    const res = await request(app).get("/ping");
    // Draft-8: cabeceras individuales, sin legacy x-ratelimit-*
    expect(res.headers["ratelimit-limit"]).toBe("2");
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeUndefined();
  });
});

describe("Unit — validateBody (zod)", () => {
  const schema = z.object({ name: z.string() }).passthrough();
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.post("/echo", validateBody(schema), (req, res) => res.json(req.body));
    // Handler de errores mínimo para que el 400 tipado llegue como JSON
    // (la app real usa globalErrorHandler; aquí sólo se prueba validateBody).
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ message: err.message });
    });
    return app;
  };

  it("Dado cuerpo con tipo incorrecto Cuando pasa el middleware Entonces 400 con campo señalado", async () => {
    const res = await request(buildApp()).post("/echo").send({ name: 123 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("name");
  });

  it("Dado cuerpo válido con campos extra (passthrough) Cuando pasa Entonces 200 y conserva extras", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .send({ name: "Café", extra: { deep: true } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "Café", extra: { deep: true } });
  });
});

describe("Unit — schemas espejo del contrato del front", () => {
  

  it("Dado payload real de One Tap (credential+state) Cuando parse Entonces acepta", () => {
    const r = googleLoginSchema.safeParse({ credential: "abc.def.ghi", state: "deadbeef".repeat(4) });
    expect(r.success).toBe(true);
  });

  it("Dado credential numérico (mal tipado) Cuando parse Entonces rechaza", () => {
    const r = googleLoginSchema.safeParse({ credential: 12345, state: "x" });
    expect(r.success).toBe(false);
  });

  it("Dado payload real de Sales.jsx Cuando parse createInvoice Entonces acepta con nulls en customerData", () => {
    const r = createInvoiceSchema.safeParse({
      orderId: "ord_123",
      paymentMethodId: "pm_1",
      paymentMethod: "Efectivo",
      paymentType: "CONTADO",
      cashAmount: 50000,
      tipAmount: 0,
      customerData: { name: "Ana", nit: "222222222222", phone: null, email: null },
    });
    expect(r.success).toBe(true);
  });

  it("Dado orderId como objeto (mal tipado) Cuando parse createInvoice Entonces rechaza", () => {
    const r = createInvoiceSchema.safeParse({ orderId: { id: 1 } });
    expect(r.success).toBe(false);
  });
});
