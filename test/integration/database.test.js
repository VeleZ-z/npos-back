// config/database.js — connectDB happy path (ping + ensureAuxTables contra la
// base de pruebas). El camino de fallo (process.exit) no se prueba: sería
// letal para el runner; se cubre por diseño fail-fast documentado.
import { describe, it, expect } from "vitest";
import connectDB from "../../config/database";
import { isDbAvailable } from "../db";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("config/database — connectDB", () => {
  it("Dado la base accesible Cuando connectDB Entonces resuelve sin error", async () => {
    await expect(connectDB()).resolves.toBeUndefined();
  });
});
