// Servicios de alertas de stock: producto bajo umbral (incluye valor límite
// exacto qty == min), limpieza al reponer, y alertas de compras (stock bajo y
// vencimiento próximo). Emails best-effort (SMTP sin configurar no rompe).
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../../config/mysql";
import { isDbAvailable, truncateAll } from "../db";
import { createUser, createProduct } from "../factories/index.js";
import {
  evaluateProductAlerts,
  buildProductAlertEmail,
} from "../../services/productAlertService";
import { evaluatePurchaseAlerts } from "../../services/purchaseAlertService";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("productAlertService — umbral de stock bajo", () => {
  let admin;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado producto bajo el umbral Cuando se evalúa Entonces alerta creada y asignada al staff", async () => {
    const product = await createProduct({ name: "Poca Existencia", cantidad: 3, alertaMinStock: 5 });
    await evaluateProductAlerts(product);

    const [[prodRow]] = await pool.query("SELECT alerta_id FROM productos WHERE id = ?", [product._id]);
    expect(prodRow.alerta_id).not.toBeNull();

    const [[alerta]] = await pool.query(
      "SELECT mensaje_alrt FROM alertas WHERE id = ?",
      [prodRow.alerta_id]
    );
    expect(alerta.mensaje_alrt).toContain("Poca Existencia");
    expect(alerta.mensaje_alrt).toContain("stock de 3");

    const [assignments] = await pool.query(
      "SELECT usuario_id FROM alertas_x_usuarios WHERE alerta_id = ?",
      [prodRow.alerta_id]
    );
    expect(assignments.some((a) => Number(a.usuario_id) === Number(admin._id))).toBe(true);
  });

  it("Dado producto en el umbral exacto (qty == min, valor límite) Cuando se evalúa Entonces alerta", async () => {
    const product = await createProduct({ name: "En Umbral", cantidad: 5, alertaMinStock: 5 });
    await evaluateProductAlerts(product);
    const [[prodRow]] = await pool.query("SELECT alerta_id FROM productos WHERE id = ?", [product._id]);
    expect(prodRow.alerta_id).not.toBeNull();
  });

  it("Dado producto repuesto sobre el umbral Cuando se re-evalúa Entonces la alerta se limpia", async () => {
    const product = await createProduct({ name: "Repuesto", cantidad: 2, alertaMinStock: 5 });
    await evaluateProductAlerts(product);

    await pool.query("UPDATE productos SET cantidad = 20 WHERE id = ?", [product._id]);
    const refreshed = { ...product, quantity: 20 };
    await evaluateProductAlerts(refreshed);

    const [[prodRow]] = await pool.query("SELECT alerta_id FROM productos WHERE id = ?", [product._id]);
    expect(prodRow.alerta_id).toBeNull();
  });

  it("Dado producto id numérico (sin doc) Cuando se evalúa Entonces resuelve desde la BD", async () => {
    const product = await createProduct({ name: "Por Id", cantidad: 1, alertaMinStock: 4 });
    await evaluateProductAlerts(product._id);
    const [[prodRow]] = await pool.query("SELECT alerta_id FROM productos WHERE id = ?", [product._id]);
    expect(prodRow.alerta_id).not.toBeNull();
  });

  it("Dado builder de email Cuando se genera Entonces contiene stock, mínimo y asunto", () => {
    const html = buildProductAlertEmail("Alerta de producto - X", "mensaje de alerta", {
      quantity: 3,
      alertMinStock: 5,
      barcode: "ABC123",
    });
    expect(html).toContain("mensaje de alerta");
    expect(html).toContain("3");
    expect(html).toContain("5");
    expect(html).toContain("ABC123");
  });
});

describe.skipIf(!dbUp)("purchaseAlertService — stock bajo y vencimiento", () => {
  beforeAll(async () => {
    await truncateAll();
    await createUser({ email: "admin2@nativ.test", role: "Admin" });
  });

  afterAll(async () => {
    await truncateAll();
  });

  const insertPurchase = async ({ name, stock, min, vencimiento = null }) => {
    const [res] = await pool.query(
      `INSERT INTO compras (nombre, stock, cantidad, entrega, vencimiento, alerta_min_stock, created_at, updated_at)
       VALUES (?, ?, 0, CURDATE(), ?, ?, NOW(), NOW())`,
      [name, stock, vencimiento, min]
    );
    return { _id: res.insertId, name, stock, quantity: stock, alertMinStock: min, expirationDate: vencimiento };
  };

  it("Dado compra con stock en/bajo el mínimo Cuando se evalúa Entonces alerta 'stock bajo' creada y asignada", async () => {
    const purchase = await insertPurchase({ name: "Insumo Bajo", stock: 2, min: 5 });
    await evaluatePurchaseAlerts(purchase);

    const [[row]] = await pool.query("SELECT alerta_id FROM compras WHERE id = ?", [purchase._id]);
    expect(row.alerta_id).not.toBeNull();
    const [[alerta]] = await pool.query("SELECT mensaje_alrt FROM alertas WHERE id = ?", [row.alerta_id]);
    expect(alerta.mensaje_alrt).toContain("stock bajo");

    const [assignments] = await pool.query(
      "SELECT usuario_id FROM alertas_x_usuarios WHERE alerta_id = ?",
      [row.alerta_id]
    );
    expect(assignments.length).toBeGreaterThan(0);
  });

  it("Dado compra próxima a vencer Cuando se evalúa Entonces alerta de vencimiento creada", async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const purchase = await insertPurchase({ name: "Lácteo", stock: 50, min: 5, vencimiento: soon });
    await evaluatePurchaseAlerts(purchase);

    const [alerts] = await pool.query(
      "SELECT mensaje_alrt FROM alertas WHERE mensaje_alrt LIKE '%vencer%'"
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].mensaje_alrt.toLowerCase()).toContain("lácteo");
  });

  it("Dado compra saludable (stock alto, sin vencimiento) Cuando se evalúa Entonces sin alertas", async () => {
    const purchase = await insertPurchase({ name: "Sano", stock: 100, min: 5 });
    await evaluatePurchaseAlerts(purchase);
    const [[row]] = await pool.query("SELECT alerta_id FROM compras WHERE id = ?", [purchase._id]);
    expect(row.alerta_id).toBeNull();
  });
});
