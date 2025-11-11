MySQL migration notes

Overview
- Backend switched from MongoDB/Mongoose to MySQL (mysql2 + lightweight wrappers).
- Keeps existing API shapes so the frontend continues working.
- Uses base schema (mesas, pedidos, facturas, usuarios, roles, etc.) a auxiliary tables to bridge gaps:
  - `orders_json`: stores the order payload (customer/items/bills) to reconstruct orders and generate invoices.

Env vars (.env)
- MYSQL_HOST=localhost
- MYSQL_PORT=3306
- MYSQL_USER=root
- MYSQL_PASSWORD=your_password
- MYSQL_DATABASE=npos
- JWT_SECRET=change_me

Aux tables DDL (created automatically on server start)
```sql

CREATE TABLE IF NOT EXISTS orders_json (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_id BIGINT UNSIGNED NOT NULL,
  json LONGTEXT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_json_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Notes
- Tables list (`GET /api/table`) is computed from `mesas`; `status` derives from presence of unpaid `pedidos` (no `facturas`).
- Orders are inserted into `pedidos` and fully persisted in `orders_json` for reconstruction and invoicing.
- Invoices are stored in `facturas` using totals and `pedido_id`.


Next steps (optional)
- Normalize order items into `productos` and `productos_x_pedidos` if you want catalog-level reporting.
- Add a `pagos` table if you want to persist Razorpay webhooks.
- Define `estados` records and wire them into `pedidos`/`facturas` consistently.

