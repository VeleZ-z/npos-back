// Job de cumpleaños: lógica pura del HTML y runOnce contra la base de
// pruebas con de-duplicación (alreadyAlertedToday). El envío de email es
// best-effort (SMTP sin configurar no rompe el job).
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../../config/mysql";
import { isDbAvailable, truncateAll } from "../db";
import { createUser } from "../factories/index.js";
import { runOnce, buildBirthdayHtml } from "../../jobs/birthdayJob";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("birthdayJob — alertas de cumpleaños con de-duplicación", () => {
  let cumpleanero;

  beforeAll(async () => {
    await truncateAll();
    const today = new Date().toISOString().slice(0, 10);
    cumpleanero = await createUser({ email: "cumple@nativ.test", role: "Customer" });
    await pool.query("UPDATE usuarios SET cumpleanos = ? WHERE id = ?", [
      `${today.replace(/^\d{4}-/, "1995-")}`,
      cumpleanero._id,
    ]);
    // Cumpleaños de HOY (mes/día actual) para que runOnce lo detecte
    await pool.query(
      "UPDATE usuarios SET cumpleanos = CONCAT('1995-', LPAD(MONTH(CURDATE()), 2, '0'), '-', LPAD(DAY(CURDATE()), 2, '0')) WHERE id = ?",
      [cumpleanero._id]
    );
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado HTML builder Cuando se genera Entonces contiene nombre y logo", () => {
    const html = buildBirthdayHtml("María");
    expect(html).toContain("MARÍA");
    expect(html).toContain("cid:logo");
    expect(html).toContain("Feliz cumpleaños");
  });

  it("Dado usuario que cumple años hoy Cuando runOnce Entonces se crea alerta única", async () => {
    await runOnce();

    const [[row]] = await pool.query(
      `SELECT a.id, a.mensaje_alrt
         FROM alertas_x_usuarios axu
         JOIN alertas a ON a.id = axu.alerta_id
        WHERE axu.usuario_id = ? AND a.mensaje_alrt LIKE 'Feliz cumpleaños%'`,
      [cumpleanero._id]
    );
    expect(row).toBeTruthy();
    expect(row.mensaje_alrt).toContain("Feliz cumpleaños");

    // De-duplicación: segunda corrida no crea otra alerta
    await runOnce();
    const [[count]] = await pool.query(
      `SELECT COUNT(*) AS n
         FROM alertas_x_usuarios axu
         JOIN alertas a ON a.id = axu.alerta_id
        WHERE axu.usuario_id = ? AND a.mensaje_alrt LIKE 'Feliz cumpleaños%'`,
      [cumpleanero._id]
    );
    expect(Number(count.n)).toBe(1);
  });

  it("Dado usuario SIN cumpleaños hoy Cuando runOnce Entonces no se crea alerta para él", async () => {
    const otro = await createUser({ email: "otro@nativ.test", role: "Customer" });
    await pool.query("UPDATE usuarios SET cumpleanos = '1995-01-01' WHERE id = ?", [otro._id]);
    await runOnce();
    const [[row]] = await pool.query(
      `SELECT axu.id
         FROM alertas_x_usuarios axu
         JOIN alertas a ON a.id = axu.alerta_id
        WHERE axu.usuario_id = ? AND a.mensaje_alrt LIKE 'Feliz cumpleaños%'`,
      [otro._id]
    );
    expect(row).toBeUndefined();
  });
});
