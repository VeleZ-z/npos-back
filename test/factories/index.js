// Factories (patrón Object Mother): insertan filas reales en la base de
// pruebas con SQL directo, independientes de la lógica bajo test (los modelos
// se ejercitan a través de la API). IDs de lookup según el seed de
// scripts/migrate_full_schema.js.
import { pool } from "../../config/mysql";

export const ESTADOS = {
  USUARIO_ACTIVO: 1,
  PRODUCTO_ACTIVO: 2,
  PEDIDO_LISTO: 4,
  PEDIDO_PENDIENTE: 5,
  PEDIDO_POR_APROBAR: 6,
  PAGO: 15,
  METODO_ACTIVO: 12,
  METODO_INACTIVO: 13,
  FACTURADO: 14,
  CUADRE_ABIERTO: 16,
  CUADRE_CERRADO: 17,
};

export async function createRole(nombre) {
  const [res] = await pool.query(
    "INSERT IGNORE INTO roles (nombre, created_at, updated_at) VALUES (?, NOW(), NOW())",
    [nombre]
  );
  const [[row]] = await pool.query(
    "SELECT id FROM roles WHERE nombre = ? LIMIT 1",
    [nombre]
  );
  return { _id: row?.id ?? res.insertId, nombre };
}

export async function createUser({
  name = "Usuario Test",
  email = "user@test.nativ",
  phone = "3001234567",
  role = null,
  document = "1020304050",
} = {}) {
  const [res] = await pool.query(
    `INSERT INTO usuarios (nombre, correo, telefono, documento, social_id, estado_id, tipo_doc_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', ?, 1, NOW(), NOW())`,
    [name, email, phone, document, ESTADOS.USUARIO_ACTIVO]
  );
  if (role) {
    const [[roleRow]] = await pool.query(
      "SELECT id FROM roles WHERE nombre = ? LIMIT 1",
      [role]
    );
    if (roleRow) {
      await pool.query(
        `INSERT INTO roles_x_usuarios (usuario_id, role_id, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())`,
        [res.insertId, roleRow.id]
      );
    }
  }
  return { _id: res.insertId, name, email, phone, role: role || "Customer" };
}

export async function createProduct({
  name = "Hamburguesa Test",
  precio = 10000,
  cantidad = 100,
  costo = 3000,
  impuestoId = 1,
  categoriaId = null,
  alertaMinStock = null,
} = {}) {
  const [res] = await pool.query(
    `INSERT INTO productos (nombre, precio, cantidad, costo, impuesto_id, categoria_id, estado_id, alerta_min_stock, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [name, precio, cantidad, costo, impuestoId, categoriaId, ESTADOS.PRODUCTO_ACTIVO, alertaMinStock]
  );
  return { _id: res.insertId, name, precio, cantidad };
}

export async function createTable({ numero, capacidad = 4 } = {}) {
  const [res] = await pool.query(
    "INSERT INTO mesas (numero, capacidad, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
    [numero, capacidad]
  );
  return { _id: res.insertId, numero, capacidad };
}

export async function createCuadre({
  userId,
  estadoId = ESTADOS.CUADRE_ABIERTO,
  saldoInicial = 0,
} = {}) {
  const [res] = await pool.query(
    `INSERT INTO cuadres (usuario_apertura_id, fecha_apertura, saldo_inicial, saldo_teorico, saldo_real, diferencia, gastos, estado_id, created_at, updated_at)
     VALUES (?, NOW(), ?, 0, 0, 0, 0, ?, NOW(), NOW())`,
    [userId, saldoInicial, estadoId]
  );
  return { _id: res.insertId, userId, estadoId };
}

export async function createPaymentMethod({
  nombre = "EFECTIVO",
  estadoId = ESTADOS.METODO_ACTIVO,
} = {}) {
  const [res] = await pool.query(
    "INSERT INTO metodos_pagos (nombre, estado_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
    [nombre, estadoId]
  );
  return { _id: res.insertId, nombre, estadoId };
}

export async function createOrder({
  mesaId = null,
  estadoId = ESTADOS.PEDIDO_PENDIENTE,
  clienteUserId = null,
  cashierUserId = null,
  customer = null,
  items = [],
} = {}) {
  const [res] = await pool.query(
    `INSERT INTO pedidos (mesa_id, estado_id, usuario_cliente_id, usuario_cajero_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [mesaId, estadoId, clienteUserId, cashierUserId]
  );
  const orderId = res.insertId;

  const customerPayload = customer
    ? { ...customer, user: customer.user ?? { _id: clienteUserId } }
    : null;
  await pool.query(
    "INSERT INTO orders_json (pedido_id, json, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
    [
      orderId,
      JSON.stringify({
        customer: customerPayload,
        orderStatus: "PENDIENTE",
        items: [],
        bills: { subtotal: 0, tax: 0, total: 0 },
        table: mesaId,
        paymentStatus: "PENDIENTE",
        invoice: null,
        waiter: null,
        notes: null,
        customerUserId: clienteUserId,
        cashierUserId: cashierUserId,
      }),
    ]
  );

  for (const item of items) {
    await pool.query(
      `INSERT INTO productos_x_pedidos (cantidad, printed_qty, nota, producto_id, pedido_id, precio_unitario, precio_original, descuento_id, descuento_nombre, descuento_tipo, descuento_valor, created_at, updated_at)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        item.cantidad ?? 1,
        item.nota ?? null,
        item.productoId,
        orderId,
        item.precioUnitario ?? null,
        item.precioOriginal ?? null,
        item.descuentoId ?? null,
        item.descuentoNombre ?? null,
        item.descuentoTipo ?? null,
        item.descuentoValor ?? null,
      ]
    );
  }
  return { _id: orderId, mesaId, estadoId, items };
}
