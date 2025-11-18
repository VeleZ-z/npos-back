const { pool } = require("../config/mysql");

async function run() {
  const conn = await pool.getConnection();
  const exec = async (label, sql) => {
    console.log(label);
    await conn.query(sql);
  };

  try {
    console.log("[Full Schema] Starting migration");

    await exec("Creating table estados", `
      CREATE TABLE IF NOT EXISTS estados (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        tipo TINYINT NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table documentos", `
      CREATE TABLE IF NOT EXISTS documentos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tipo_doc VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table roles", `
      CREATE TABLE IF NOT EXISTS roles (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        UNIQUE KEY uq_roles_nombre (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table categorias", `
      CREATE TABLE IF NOT EXISTS categorias (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table alertas", `
      CREATE TABLE IF NOT EXISTS alertas (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        mensaje_alrt VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table impuestos", `
      CREATE TABLE IF NOT EXISTS impuestos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        regimen VARCHAR(100) NOT NULL DEFAULT 'REGIMEN_COMUN',
        porcentaje INT(10) UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_impuestos_nombre (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table proveedores", `
      CREATE TABLE IF NOT EXISTS proveedores (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        telefono VARCHAR(255) DEFAULT NULL,
        correo VARCHAR(255) DEFAULT NULL,
        contacto VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table mesas", `
      CREATE TABLE IF NOT EXISTS mesas (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        numero TINYINT(3) UNSIGNED NOT NULL,
        capacidad TINYINT(3) UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table metodos_pagos", `
      CREATE TABLE IF NOT EXISTS metodos_pagos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        estado_id BIGINT UNSIGNED DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_metodos_pagos_estado_id (estado_id),
        CONSTRAINT metodos_pagos_estado_id_fk FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table descuentos", `
      CREATE TABLE IF NOT EXISTS descuentos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        valor INT(10) UNSIGNED DEFAULT NULL,
        porciento INT(10) UNSIGNED DEFAULT NULL,
        mensaje TEXT DEFAULT NULL,
        imagen_path VARCHAR(255) DEFAULT NULL,
        imagen_data LONGBLOB NULL,
        imagen_mime VARCHAR(100) DEFAULT NULL,
        is_activo TINYINT(3) UNSIGNED NOT NULL DEFAULT 1,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table productos", `
      CREATE TABLE IF NOT EXISTS productos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        codigo_barras VARCHAR(64) DEFAULT NULL,
        precio INT(10) UNSIGNED NOT NULL,
        cantidad INT(10) UNSIGNED NOT NULL DEFAULT 0,
        alerta_min_stock INT(10) UNSIGNED DEFAULT NULL,
        alerta_id BIGINT UNSIGNED DEFAULT NULL,
        costo INT(10) UNSIGNED NOT NULL DEFAULT 0,
        impuesto_id BIGINT UNSIGNED DEFAULT NULL,
        categoria_id BIGINT UNSIGNED DEFAULT NULL,
        estado_id BIGINT UNSIGNED DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        KEY idx_productos_codigo_barras (codigo_barras),
        KEY productos_categoria_id_foreign (categoria_id),
        KEY productos_estado_id_fk (estado_id),
        KEY fk_productos_alerta (alerta_id),
        KEY fk_productos_impuesto (impuesto_id),
        CONSTRAINT fk_productos_alerta FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE SET NULL,
        CONSTRAINT fk_productos_impuesto FOREIGN KEY (impuesto_id) REFERENCES impuestos(id) ON DELETE SET NULL,
        CONSTRAINT productos_categoria_id_foreign FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
        CONSTRAINT productos_estado_id_fk FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table usuarios", `
      CREATE TABLE IF NOT EXISTS usuarios (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        correo VARCHAR(150) NOT NULL,
        documento VARCHAR(25) DEFAULT NULL,
        telefono VARCHAR(25) DEFAULT NULL,
        cumpleanos DATE DEFAULT NULL,
        social_id VARCHAR(255) NOT NULL,
        estado_id BIGINT UNSIGNED NOT NULL,
        tipo_doc_id BIGINT UNSIGNED NOT NULL,
        remember_token VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        UNIQUE KEY usuarios_correo_unique (correo),
        KEY usuarios_estado_id_foreign (estado_id),
        KEY usuarios_tipo_doc_id_foreign (tipo_doc_id),
        CONSTRAINT usuarios_estado_id_foreign FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE CASCADE,
        CONSTRAINT usuarios_tipo_doc_id_foreign FOREIGN KEY (tipo_doc_id) REFERENCES documentos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table compras", `
      CREATE TABLE IF NOT EXISTS compras (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        cantidad INT(10) UNSIGNED DEFAULT 0,
        stock INT(10) UNSIGNED DEFAULT NULL,
        entrega DATE NOT NULL,
        vencimiento DATE DEFAULT NULL,
        costo INT(10) UNSIGNED DEFAULT 0,
        unidad_medida VARCHAR(100) DEFAULT NULL,
        alerta_min_stock INT(10) UNSIGNED DEFAULT NULL,
        alerta_id BIGINT UNSIGNED DEFAULT NULL,
        estado_compra_id BIGINT UNSIGNED DEFAULT NULL,
        proveedore_id BIGINT UNSIGNED DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        KEY compras_estado_compra_id_foreign (estado_compra_id),
        KEY compras_proveedore_id_foreign (proveedore_id),
        KEY compras_alerta_fk (alerta_id),
        CONSTRAINT compras_alerta_fk FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE SET NULL,
        CONSTRAINT compras_estado_compra_id_foreign FOREIGN KEY (estado_compra_id) REFERENCES estados(id) ON DELETE SET NULL,
        CONSTRAINT compras_proveedore_id_foreign FOREIGN KEY (proveedore_id) REFERENCES proveedores(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table cuadres", `
      CREATE TABLE IF NOT EXISTS cuadres (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_apertura_id BIGINT UNSIGNED NOT NULL,
        usuario_cierre_id BIGINT UNSIGNED DEFAULT NULL,
        fecha_apertura DATETIME NOT NULL,
        fecha_cierre DATETIME DEFAULT NULL,
        saldo_inicial DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        saldo_teorico DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        saldo_real DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        diferencia DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        gastos DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        estado_id BIGINT UNSIGNED NOT NULL,
        observaciones TEXT DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY fk_cuadres_estado (estado_id),
        KEY fk_cuadres_usuario_apertura (usuario_apertura_id),
        KEY fk_cuadres_usuario_cierre (usuario_cierre_id),
        CONSTRAINT fk_cuadres_estado FOREIGN KEY (estado_id) REFERENCES estados(id),
        CONSTRAINT fk_cuadres_usuario_apertura FOREIGN KEY (usuario_apertura_id) REFERENCES usuarios(id),
        CONSTRAINT fk_cuadres_usuario_cierre FOREIGN KEY (usuario_cierre_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table pedidos", `
      CREATE TABLE IF NOT EXISTS pedidos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        mesa_id BIGINT UNSIGNED DEFAULT NULL,
        estado_id BIGINT UNSIGNED DEFAULT NULL,
        usuario_cliente_id BIGINT UNSIGNED DEFAULT NULL,
        usuario_cajero_id BIGINT UNSIGNED DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        KEY pedidos_mesa_id_foreign (mesa_id),
        KEY idx_pedidos_estado_id (estado_id),
        KEY fk_pedidos_usuario_cliente (usuario_cliente_id),
        KEY fk_pedidos_usuario_cajero (usuario_cajero_id),
        CONSTRAINT pedidos_mesa_id_foreign FOREIGN KEY (mesa_id) REFERENCES mesas(id) ON DELETE SET NULL,
        CONSTRAINT pedidos_estado_id_fk FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE SET NULL,
        CONSTRAINT fk_pedidos_usuario_cliente FOREIGN KEY (usuario_cliente_id) REFERENCES usuarios(id) ON DELETE SET NULL,
        CONSTRAINT fk_pedidos_usuario_cajero FOREIGN KEY (usuario_cajero_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table orders_json", `
      CREATE TABLE IF NOT EXISTS orders_json (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        pedido_id BIGINT UNSIGNED NOT NULL,
        json LONGTEXT NOT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_orders_json_pedido (pedido_id),
        CONSTRAINT orders_json_pedido_id_fk FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table facturas", `
      CREATE TABLE IF NOT EXISTS facturas (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        numero_factura VARCHAR(255) NOT NULL,
        subTotal INT(10) UNSIGNED NOT NULL DEFAULT 0,
        impuestos INT(10) UNSIGNED NOT NULL,
        propina INT(10) UNSIGNED NOT NULL DEFAULT 0,
        total INT(10) UNSIGNED NOT NULL DEFAULT 0,
        monto INT(10) UNSIGNED NOT NULL DEFAULT 0,
        cambio INT(10) UNSIGNED NOT NULL DEFAULT 0,
        pedido_id BIGINT UNSIGNED NOT NULL,
        cuadre_id BIGINT UNSIGNED DEFAULT NULL,
        estado_factura_id BIGINT UNSIGNED NOT NULL,
        metodos_pago_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        KEY facturas_pedido_id_foreign (pedido_id),
        KEY facturas_estado_factura_id_foreign (estado_factura_id),
        KEY facturas_metodos_pago_id_foreign (metodos_pago_id),
        KEY fk_facturas_cuadre (cuadre_id),
        CONSTRAINT facturas_pedido_id_foreign FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
        CONSTRAINT facturas_estado_factura_id_foreign FOREIGN KEY (estado_factura_id) REFERENCES estados(id) ON DELETE CASCADE,
        CONSTRAINT facturas_metodos_pago_id_foreign FOREIGN KEY (metodos_pago_id) REFERENCES metodos_pagos(id) ON DELETE CASCADE,
        CONSTRAINT fk_facturas_cuadre FOREIGN KEY (cuadre_id) REFERENCES cuadres(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table cache", `
      CREATE TABLE IF NOT EXISTS cache (
        ` + "`key`" + ` VARCHAR(255) NOT NULL,
        value MEDIUMTEXT NOT NULL,
        expiration INT(11) NOT NULL,
        PRIMARY KEY (` + "`key`" + `)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table cache_locks", `
      CREATE TABLE IF NOT EXISTS cache_locks (
        ` + "`key`" + ` VARCHAR(255) NOT NULL,
        owner VARCHAR(255) NOT NULL,
        expiration INT(11) NOT NULL,
        PRIMARY KEY (` + "`key`" + `)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table jobs", `
      CREATE TABLE IF NOT EXISTS jobs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        queue VARCHAR(255) NOT NULL,
        payload LONGTEXT NOT NULL,
        attempts TINYINT(3) UNSIGNED NOT NULL,
        reserved_at INT(10) UNSIGNED DEFAULT NULL,
        available_at INT(10) UNSIGNED NOT NULL,
        created_at INT(10) UNSIGNED NOT NULL,
        KEY jobs_queue_index (queue)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table job_batches", `
      CREATE TABLE IF NOT EXISTS job_batches (
        id VARCHAR(255) NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        total_jobs INT NOT NULL,
        pending_jobs INT NOT NULL,
        failed_jobs INT NOT NULL,
        failed_job_ids LONGTEXT NOT NULL,
        options MEDIUMTEXT DEFAULT NULL,
        cancelled_at INT DEFAULT NULL,
        created_at INT NOT NULL,
        finished_at INT DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table failed_jobs", `
      CREATE TABLE IF NOT EXISTS failed_jobs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(255) NOT NULL,
        connection TEXT NOT NULL,
        queue TEXT NOT NULL,
        payload LONGTEXT NOT NULL,
        exception LONGTEXT NOT NULL,
        failed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY failed_jobs_uuid_unique (uuid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table migrations", `
      CREATE TABLE IF NOT EXISTS migrations (
        id INT(10) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        migration VARCHAR(255) NOT NULL,
        batch INT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table productos_imagenes", `
      CREATE TABLE IF NOT EXISTS productos_imagenes (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        producto_id BIGINT UNSIGNED NOT NULL,
        mime_type VARCHAR(100) DEFAULT NULL,
        data LONGBLOB NOT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_producto (producto_id),
        CONSTRAINT productos_imagenes_producto_fk FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table productos_x_pedidos", `
      CREATE TABLE IF NOT EXISTS productos_x_pedidos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        cantidad INT(10) UNSIGNED NOT NULL DEFAULT 1,
        printed_qty INT(10) UNSIGNED NOT NULL DEFAULT 0,
        nota VARCHAR(255) DEFAULT NULL,
        producto_id BIGINT UNSIGNED NOT NULL,
        precio_unitario DECIMAL(10,2) DEFAULT NULL,
        precio_original DECIMAL(10,2) DEFAULT NULL,
        pedido_id BIGINT UNSIGNED NOT NULL,
        descuento_id BIGINT UNSIGNED DEFAULT NULL,
        descuento_nombre VARCHAR(255) DEFAULT NULL,
        descuento_tipo VARCHAR(20) DEFAULT NULL,
        descuento_valor DECIMAL(10,2) DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY productos_x_pedidos_producto_id_foreign (producto_id),
        KEY productos_x_pedidos_pedido_id_foreign (pedido_id),
        KEY fk_pxp_descuento (descuento_id),
        CONSTRAINT productos_x_pedidos_producto_id_foreign FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
        CONSTRAINT productos_x_pedidos_pedido_id_foreign FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
        CONSTRAINT fk_pxp_descuento FOREIGN KEY (descuento_id) REFERENCES descuentos(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table descuentos_x_productos", `
      CREATE TABLE IF NOT EXISTS descuentos_x_productos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        producto_id BIGINT UNSIGNED NOT NULL,
        descuento_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        KEY descuentos_x_productos_producto_id_foreign (producto_id),
        KEY descuentos_x_productos_descuento_id_foreign (descuento_id),
        CONSTRAINT descuentos_x_productos_producto_id_foreign FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
        CONSTRAINT descuentos_x_productos_descuento_id_foreign FOREIGN KEY (descuento_id) REFERENCES descuentos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table roles_x_usuarios", `
      CREATE TABLE IF NOT EXISTS roles_x_usuarios (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id BIGINT UNSIGNED NOT NULL,
        role_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        KEY roles_x_usuarios_usuario_id_foreign (usuario_id),
        KEY roles_x_usuarios_role_id_foreign (role_id),
        CONSTRAINT roles_x_usuarios_usuario_id_foreign FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT roles_x_usuarios_role_id_foreign FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await exec("Creating table alertas_x_usuarios", `
      CREATE TABLE IF NOT EXISTS alertas_x_usuarios (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id BIGINT UNSIGNED NOT NULL,
        alerta_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        KEY alertas_x_usuarios_usuario_id_foreign (usuario_id),
        KEY alertas_x_usuarios_alerta_id_foreign (alerta_id),
        CONSTRAINT alertas_x_usuarios_usuario_id_foreign FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT alertas_x_usuarios_alerta_id_foreign FOREIGN KEY (alerta_id) REFERENCES alertas(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("[Full Schema] Seeding lookup data");

    const seedEstados = [
      { id: 1, nombre: "ACTIVO", tipo: 1 },
      { id: 2, nombre: "ACTIVO", tipo: 2 },
      { id: 3, nombre: "INACTIVO", tipo: 2 },
      { id: 4, nombre: "LISTO", tipo: 3 },
      { id: 5, nombre: "PENDIENTE", tipo: 3 },
      { id: 6, nombre: "POR_APROBAR", tipo: 3 },
      { id: 7, nombre: "CERRADO", tipo: 3 },
      { id: 8, nombre: "PENDIENTE", tipo: 4 },
      { id: 9, nombre: "RECIBIDA", tipo: 4 },
      { id: 10, nombre: "CANCELADA", tipo: 4 },
      { id: 11, nombre: "SALIO", tipo: 4 },
      { id: 12, nombre: "ACTIVO", tipo: 5 },
      { id: 13, nombre: "INACTIVO", tipo: 5 },
      { id: 14, nombre: "FACTURADO", tipo: 6 },
      { id: 15, nombre: "PAGADO", tipo: 3 },
      { id: 16, nombre: "ABIERTO", tipo: 7 },
      { id: 17, nombre: "CERRADO", tipo: 7 },
      { id: 18, nombre: "ANULADO", tipo: 7 },
    ];
    for (const estado of seedEstados) {
      await conn.query(
        "INSERT INTO estados (id, nombre, tipo, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), tipo=VALUES(tipo)",
        [estado.id, estado.nombre, estado.tipo]
      );
    }

    await conn.query(
      "INSERT INTO documentos (id, tipo_doc, created_at, updated_at) VALUES (1, 'CC', NOW(), NOW()) ON DUPLICATE KEY UPDATE tipo_doc=VALUES(tipo_doc)"
    );

    const seedRoles = [
      { id: 1, nombre: "Cashier" },
      { id: 3, nombre: "Admin" },
      { id: 4, nombre: "Customer" },
    ];
    for (const role of seedRoles) {
      await conn.query(
        "INSERT INTO roles (id, nombre, created_at, updated_at) VALUES (?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)",
        [role.id, role.nombre]
      );
    }

    await conn.query(
      "INSERT INTO impuestos (id, nombre, regimen, porcentaje, created_at, updated_at) VALUES (1, 'INC', 'REGIMEN_COMUN', 8, NOW(), NOW()) ON DUPLICATE KEY UPDATE regimen=VALUES(regimen), porcentaje=VALUES(porcentaje)"
    );

    await conn.query(
      "INSERT INTO metodos_pagos (id, nombre, estado_id, created_at, updated_at) VALUES (2, 'EFECTIVO', 12, NOW(), NOW()) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), estado_id=VALUES(estado_id)"
    );

    console.log("[Full Schema] Migration finished successfully");
    conn.release();
    process.exit(0);
  } catch (error) {
    console.error("[Full Schema] Migration failed", error);
    conn.release();
    process.exit(1);
  }
}

run();
