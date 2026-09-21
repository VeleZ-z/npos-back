// Flujo completo de mayor valor (integración de sistema):
//   abrir caja → crear orden → añadir items → marcar impresos → facturar →
//   verificar factura/inventario/mesa/estado → anular (solo admin) → cerrar caja.
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { pool } from "../../config/mysql";
import { isDbAvailable, truncateAll } from "../db";
import { createUser, createProduct, createTable } from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Flujo completo — caja → orden → factura → anulación → cierre", () => {
  let admin, cashier;
  let product, table;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
    product = await createProduct({ name: "Plato Flujo", precio: 20000, cantidad: 50, alertaMinStock: 10 });
    table = await createTable({ numero: 7 });
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("Dado el flujo completo Cuando se ejecuta de punta a punta Entonces cada paso refleja el estado esperado", async () => {
    // 1) Abrir caja
    const open = await request(app)
      .post("/api/cash-desk/open")
      .set(authHeaders(cashier))
      .send({ saldoInicial: 0 });
    expect(open.status).toBe(201);

    // 2) Crear orden para la mesa
    const created = await request(app)
      .post("/api/order")
      .set(authHeaders(cashier))
      .send({ customer: { name: "Cliente Flujo" }, table: table._id });
    expect(created.status).toBe(201);
    const orderId = created.body.data._id;

    // 3) Añadir items vía API (2x plato)
    const add = await request(app)
      .post(`/api/order/table/${table._id}/item`)
      .set(authHeaders(cashier))
      .send({ productId: product._id, quantity: 2 });
    expect(add.status).toBe(201);

    // 4) Listar items y marcar impresos
    const items = await request(app)
      .get(`/api/order/${orderId}/items`)
      .set(authHeaders(cashier));
    expect(items.status).toBe(200);
    const itemIds = (items.body.data || []).map((it) => it.id ?? it._id);
    expect(itemIds.length).toBeGreaterThan(0);

    const printed = await request(app)
      .post(`/api/order/${orderId}/printed`)
      .set(authHeaders(cashier))
      .send({ items: itemIds });
    expect(printed.status).toBe(200);

    const [[printedRow]] = await pool.query(
      "SELECT printed_qty, cantidad FROM productos_x_pedidos WHERE pedido_id = ? LIMIT 1",
      [orderId]
    );
    expect(Number(printedRow.printed_qty)).toBe(Number(printedRow.cantidad));

    // 5) Facturar (efectivo exacto: total 40000, sin propina)
    const invoiceRes = await request(app)
      .post("/api/invoice")
      .set(authHeaders(cashier))
      .send({ orderId, paymentMethodId: 2, cashAmount: 40000 });
    expect(invoiceRes.status).toBe(201);
    const invoiceId = invoiceRes.body.data.invoice.id;
    expect(invoiceRes.body.data.invoice.totals.total).toBe(40000);
    expect(invoiceRes.body.data.invoice.change).toBe(0);

    // 6) Verificar efectos: inventario descontado, mesa liberada, orden PAGADO
    const [[prodRow]] = await pool.query("SELECT cantidad FROM productos WHERE id = ?", [product._id]);
    expect(Number(prodRow.cantidad)).toBe(48);

    const [[orderRow]] = await pool.query(
      `SELECT p.mesa_id, e.nombre AS estado FROM pedidos p LEFT JOIN estados e ON e.id = p.estado_id WHERE p.id = ?`,
      [orderId]
    );
    expect(orderRow.estado).toBe("PAGADO");
    expect(orderRow.mesa_id).toBeNull();

    // 7) Anular factura (solo admin): orden vuelve a ENTREGADO
    const cancel = await request(app)
      .patch(`/api/invoice/${invoiceId}/cancel`)
      .set(authHeaders(admin));
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe("ANULADA");

    // 8) Cerrar caja
    const close = await request(app)
      .post("/api/cash-desk/close")
      .set(authHeaders(cashier))
      .send({ saldoReal: 40000 });
    expect(close.status).toBe(200);

    const [[cuadreRow]] = await pool.query(
      `SELECT e.nombre AS estado FROM cuadres c LEFT JOIN estados e ON e.id = c.estado_id ORDER BY c.id DESC LIMIT 1`
    );
    expect(cuadreRow.estado).toBe("CERRADO");
  });
});
