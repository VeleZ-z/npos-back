[![Coverage Status](https://coveralls.io/repos/github/VeleZ-z/npos-back/badge.svg?branch=main)](https://coveralls.io/github/VeleZ-z/npos-back?branch=main)

# Nativ POS System - Backend (`npos-back`)

API RESTful para la gestión operativa de restaurantes y facturación electrónica adaptada a la normativa colombiana (DIAN).

## Descripción

`npos-back` es la capa de servidor del sistema **Nativ POS**. Desarrollado en Node.js y Express, maneja el ciclo de vida de las comandas, asignación de mesas, control de acceso basado en roles (RBAC), generación de facturas y envío automatizado de notificaciones y facturas por correo electrónico con infraestructura DNS autenticada.

---

## Características Principales

- **Gestión de Autenticación y Usuarios (RBAC)**
  - Roles: `Administrador`, `Cajero`, `Mesero`, `Cliente`.
  - Autenticación mediante JSON Web Tokens (JWT) almacenados en cookies `HttpOnly`.
  - Encriptación de contraseñas con `bcrypt`.
- **Motor de Órdenes y Comandas**
  - Estados: `PENDIENTE`, `EN_PREPARACION`, `LISTO`, `ENTREGADO`, `PAGADO`, `CANCELADO`.
  - Asignación dinámica de meseros y mesas.
  - Cálculo automático de subtotales e impuestos configurables (IVA).
- **Módulo de Facturación Colombiana (DIAN)**
  - Consecutivos únicos de factura.
  - Receptores: Consumidor Final o Cliente Registrado (NIT, Dirección, Razón Social).
  - Estructura preparada para integración electrónica (CUFE, QR, Firma Digital).
  - Anulación restrictiva de facturas (solo Administradores).
- **Notificaciones y Correo Transaccional**
  - Envío automático de notificaciones de pedido y facturas PDF/detalles vía SMTP.
  - Configuración DNS autenticada (**SPF, DKIM y DMARC**) para evitar la bandeja de SPAM y garantizar alta entregabilidad.
- **Manejo de Errores Centralizado**
  - Integración de `http-errors` y middleware global de manejo de excepciones.

---

##  Stack Tecnológico

- **Runtime:** Node.js
- **Framework Web:** Express.js
- **Base de Datos:** MySQL 
- **Autenticación & Seguridad:** JWT, `bcrypt`, cookies `HttpOnly`
- **Utilidades & Manejo de Errores:** `http-errors`, `dotenv`
- **Infraestructura de Correo:** SMTP + Registros DNS (SPF, DKIM, DMARC)

---

## Estructura del Proyecto

```text
pos-backend/
├── config/
│   ├── config.js          # Configuración de variables globales
│   └── database.js        # Conexión a MySQL
├── controllers/
│   ├── userController.js  # Lógica de usuarios y auth
│   ├── orderController.js # Lógica de comandas y pedidos
│   ├── invoiceController.js # Lógica de facturación DIAN
│   ├── tableController.js # Lógica de gestión de mesas
│   └── paymentController.js # Lógica de métodos de pago
├── middlewares/
│   ├── tokenVerification.js # Middleware de autenticación y roles
│   └── globalErrorHandler.js # Manejo centralizado de errores
├── models/
│   ├── userModel.js       # Esquema de Usuario / Cliente
│   ├── orderModel.js      # Esquema de Orden / Comanda
│   ├── invoiceModel.js    # Esquema de Factura DIAN
│   ├── tableModel.js      # Esquema de Mesa
│   └── paymentModel.js    # Esquema de Pago
├── routes/
│   ├── userRoute.js
│   ├── orderRoute.js
│   ├── invoiceRoute.js
│   ├── tableRoute.js
│   └── paymentRoute.js
├── .env.example
├── app.js                 # Servidor y configuración Express
└── package.json
```

---

## Configuración e Instalación

### Prerrequisitos
- Node.js (v16.x o superior)
- MySQL (Local o Servicio BD)
- Servidor SMTP configurado con registros DNS (SPF, DKIM, DMARC)

### 1. Clonar e Instalar Dependencias
```bash
git clone https://github.com/VeleZ-z/npos-back.git
cd npos-back
npm install
```

### 2. Variables de Entorno (`.env`)
Crea un archivo `.env` en la raíz del proyecto basándote en la siguiente configuración:

```env
PORT= EJ: 8000
DB_URI= [provider]+srv://[user]:[password]@cluster.[DB]/[app]
JWT_SECRET=[JWT]

# Datos del negocio para la facturación
BUSINESS_NAME=Tu Restaurante S.A.S.
BUSINESS_NIT=900123456-7
BUSINESS_ADDRESS=Calle 123 #45-67, Medellín, Colombia
BUSINESS_PHONE=+57 300 123 4567
BUSINESS_EMAIL=facturacion@turestaurante.com

# Configuración SMTP / Correo Transaccional
SMTP_HOST=mail.[domain].com
SMTP_PORT= EJ: 587
SMTP_USER=notificaciones@[urdomain].com
SMTP_PASS=[password]
```

### 3. Ejecutar en Desarrollo
```bash
npm run dev
```

---

## API Endpoints principales

| Módulo | Método | Endpoint | Descripción | Restricción |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/user/register` | Registro de usuarios | Público |
| **Auth** | `POST` | `/api/user/login` | Inicio de sesión | Público |
| **Auth** | `GET` | `/api/user` | Datos del usuario actual | Autenticado |
| **Órdenes** | `POST` | `/api/order` | Crear comanda/orden | Mesero / Admin |
| **Órdenes** | `GET` | `/api/order` | Listar órdenes | Autenticado |
| **Órdenes** | `PATCH` | `/api/order/:id` | Actualizar estado de orden | Cajero / Admin |
| **Facturas** | `POST` | `/api/invoice` | Generar factura y enviar por email | Cajero / Admin |
| **Facturas** | `GET` | `/api/invoice` | Listar facturas | Cajero / Admin |
| **Facturas** | `PATCH` | `/api/invoice/:id/cancel` | Anular factura | Solo Admin |
| **Mesas** | `GET` | `/api/table` | Listar mesas y disponibilidad | Autenticado |
