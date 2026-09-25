// Transición de estados y gestión de items de órdenes:
//   POR_APROBAR → PENDIENTE → LISTO → PAGADO, con guardas de transición
//   inválida (modificar pagado/cerrado, cerrar sin factura como no-admin,
//   estado a PENDIENTE/LISTO sin mesa cuando hay cliente).
// Si la base de pruebas no está disponible, el archivo se omite con mensaje
// explícito (corre en CI con servicio MySQL).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { pool } from "../../config/mysql";
import { isDbAvailable, truncateAll } from "../db";
import { createUser, createProduct, createTable, createOrder } from "../factories/index.js";
import { authHeaders } from "../helpers/auth";

const dbUp = await isDbAvailable();

describe.skipIf(!dbUp)("Órdenes — transición de estados e items", () => {
  let admin, cashier;
  let product, table1, table2;

  beforeAll(async () => {
    await truncateAll();
    admin = await createUser({ email: "admin@nativ.test", role: "Admin" });
    cashier = await createUser({ email: "cashier@nativ.test", role: "Cashier" });
    product = await createProduct({ name: "Plato Estados", precio: 10000, cantidad: 50 });
    table1 = await createTable({ numero: 1 });
    table2 = await createTable({ numero: 2 });
  });

  afterAll(async () => {
    await truncateAll();
  });

  const estadoOf = async (orderId) => {
    const [[row]] = await pool.query(
      "SELECT e.nombre AS estado FROM pedidos p LEFT JOIN estados e ON e.id = p.estado_id WHERE p.id = ?",
      [orderId]
    );
    return row?.estado;
  };

  it("Dado orden en PENDIENTE Cuando admin cambia a LISTO Entonces 200 y estado LISTO", async () => {
    const order = await createOrder({ mesaId: table1._id });
    const res = await request(app)
      .put(`/api/order/${order._id}`)
      .set(authHeaders(admin))
      .send({ orderStatus: "LISTO" });
    expect(res.status).toBe(200);
    expect(await estadoOf(order._id)).toBe("LISTO");
  });

  it("Dado orden sin factura Cuando cajero intenta cerrar (CERRADO) Entonces 403 (solo admin)", async () => {
    const order = await createOrder({ mesaId: table1._id });
    const res = await request(app)
      .put(`/api/order/${order._id}`)
      .set(authHeaders(cashier))
      .send({ orderStatus: "CERRADO" });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Solo el admin puede cerrar una orden sin facturacion");
  });

  it("Dado orden pagada Cuando se intenta modificar Entonces 400", async () => {
    const order = await createOrder({
      estadoId: 15,
      orderStatus: "PAGADO",
      items: [{ productoId: product._id, cantidad: 1 }],
    });
    const res = await request(app)
      .put(`/api/order/${order._id}`)
      .set(authHeaders(admin))
      .send({ orderStatus: "LISTO" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("No se puede modificar un pedido pagado o cerrado");
  });

  it("Dado orden con cliente y sin mesa Cuando cajero cambia a PENDIENTE Entonces 400 (necesita mesa)", async () => {
    const order = await createOrder({ clienteUserId: null, mesaId: null });
    // attach a real customer user so customerReference is set
    const customer = await createUser({ email: "concliente@nativ.test", role: "Customer" });
    await pool.query("UPDATE pedidos SET usuario_cliente_id = ? WHERE id = ?", [customer._id, order._id]);
    const res = await request(app)
      .put(`/api/order/${order._id}`)
      .set(authHeaders(cashier))
      .send({ orderStatus: "PENDIENTE" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Esta orden necesita una mesa asignada antes de cambiar el estado."
    );
  });

  it("Dado id inválido Cuando se actualiza Entonces 400", async () => {
    const res = await request(app)
      .put("/api/order/0")
      .set(authHeaders(admin))
      .send({ orderStatus: "LISTO" });
    expect(res.status).toBe(400);
  });

  it("Dado orden inexistente Cuando se actualiza Entonces 404", async () => {
    const res = await request(app)
      .put("/api/order/999999")
      .set(authHeaders(admin))
      .send({ orderStatus: "LISTO" });
    expect(res.status).toBe(404);
  });

  it("Dado orden por mesa Cuando GET /api/order/table/:mesaId Entonces 200 con la orden", async () => {
    const order = await createOrder({ mesaId: table2._id });
    const res = await request(app)
      .get(`/api/order/table/${table2._id}`)
      .set(authHeaders(cashier));
    expect(res.status).toBe(200);
    const data = res.body.data;
    const found = Array.isArray(data) ? data.find((o) => String(o._id) === String(order._id)) : data;
    expect(found).toBeTruthy();
  });

  it("Dado orden con item Cuando actualizo cantidad del item (campo 'cantidad') Entonces 200 y cantidad persistida", async () => {
    const order = await createOrder({
      mesaId: table1._id,
      items: [{ productoId: product._id, cantidad: 1, precioUnitario: 10000, precioOriginal: 10000 }],
    });
    const items = await request(app).get(`/api/order/${order._id}/items`).set(authHeaders(cashier));
    const itemId = (items.body.data || [])[0]?.id ?? (items.body.data || [])[0]?._id;
    const res = await request(app)
      .put(`/api/order/${order._id}/item/${itemId}`)
      .set(authHeaders(cashier))
      .send({ cantidad: 3 });
    expect(res.status).toBe(200);

    const [[row]] = await pool.query("SELECT cantidad FROM productos_x_pedidos WHERE id = ?", [itemId]);
    expect(Number(row.cantidad)).toBe(3);
  });

  it("Dado orden con item Cuando muevo el item a otra mesa Entonces 200 con pedido destino", async () => {
    const order = await createOrder({
      mesaId: table1._id,
      items: [{ productoId: product._id, cantidad: 1, precioUnitario: 10000, precioOriginal: 10000 }],
    });
    const items = await request(app).get(`/api/order/${order._id}/items`).set(authHeaders(cashier));
    const itemId = (items.body.data || [])[0]?.id ?? (items.body.data || [])[0]?._id;

    const res = await request(app)
      .post(`/api/order/${order._id}/item/${itemId}/move`)
      .set(authHeaders(cashier))
      .send({ mesaId: table2._id });
    expect(res.status).toBe(200);
    expect(res.body.data.targetOrderId).toBeTruthy();

    const [[row]] = await pool.query("SELECT pedido_id FROM productos_x_pedidos WHERE id = ?", [itemId]);
    expect(Number(row.pedido_id)).toBe(Number(res.body.data.targetOrderId));
  });

  it("Dado item con cantidad 0 Cuando se actualiza Entonces el item se elimina (regla de negocio)", async () => {
    const order = await createOrder({
      mesaId: table1._id,
      items: [{ productoId: product._id, cantidad: 2, precioUnitario: 10000, precioOriginal: 10000 }],
    });
    const items = await request(app).get(`/api/order/${order._id}/items`).set(authHeaders(cashier));
    const itemId = (items.body.data || [])[0]?.id ?? (items.body.data || [])[0]?._id;
    const res = await request(app)
      .put(`/api/order/${order._id}/item/${itemId}`)
      .set(authHeaders(cashier))
      .send({ cantidad: 0 });
    expect(res.status).toBe(200);

    const [[row]] = await pool.query("SELECT id FROM productos_x_pedidos WHERE id = ?", [itemId]);
    expect(row).toBeUndefined();
  });

  it.each([
    ["POR_APROBAR", "cashier", 200],
    ["PENDIENTE", "cashier", 403],
    ["PENDIENTE", "admin", 200],
  ])(
    "Dado orden %s Cuando %s elimina un item Entonces %d (regla: confirmadas solo admin)",
    async (status, role, expected) => {
      const estadoId = status === "POR_APROBAR" ? 6 : 5;
      const order = await createOrder({
        mesaId: table1._id,
        estadoId,
        orderStatus: status,
        items: [{ productoId: product._id, cantidad: 1, precioUnitario: 10000, precioOriginal: 10000 }],
      });
      const items = await request(app).get(`/api/order/${order._id}/items`).set(authHeaders(admin));
      const itemId = (items.body.data || [])[0]?.id ?? (items.body.data || [])[0]?._id;

      const res = await request(app)
        .delete(`/api/order/${order._id}/item/${itemId}`)
        .set(authHeaders(role === "admin" ? admin : cashier));
      expect(res.status).toBe(expected);
    }
  );

  it("Dado item para mesa sin producto existente Cuando añado Entonces 404", async () => {
    const res = await request(app)
      .post(`/api/order/table/${table1._id}/item`)
      .set(authHeaders(cashier))
      .send({ productId: 999999, quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Producto no encontrado");
  });

  it("Dado orden POR_APROBAR Cuando admin la elimina Entonces 200 y desaparece", async () => {
    const order = await createOrder({ mesaId: table1._id, estadoId: 6, orderStatus: "POR_APROBAR" });
    const res = await request(app)
      .delete(`/api/order/${order._id}`)
      .set(authHeaders(admin));
    expect(res.status).toBe(200);
    const [[row]] = await pool.query("SELECT id FROM pedidos WHERE id = ?", [order._id]);
    expect(row).toBeUndefined();
  });

  it("Dado orden PENDIENTE (confirmada) Cuando admin la elimina Entonces 403 (solo POR_APROBAR)", async () => {
    const order = await createOrder({ mesaId: table1._id, estadoId: 5, orderStatus: "PENDIENTE" });
    const res = await request(app)
      .delete(`/api/order/${order._id}`)
      .set(authHeaders(admin));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Solo se pueden eliminar pedidos en estado POR_APROBAR");
  });
});
