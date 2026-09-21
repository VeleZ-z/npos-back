// Smoke de sistema: endpoints públicos y /api/health (requisito del
// HEALTHCHECK de Docker). Si la base de pruebas no está disponible, el
// archivo se omite con mensaje explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { isDbAvailable } from "../db";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Health — humo de sistema", () => {
  beforeAll(async () => {});

  it("Dado el servidor levantado Cuando GET / Entonces responde 200", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  });

  it("Dado la DB de pruebas accesible Cuando GET /api/health Entonces 200 con status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
  });
});
