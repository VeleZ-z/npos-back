const { z } = require("zod");

// Schemas espejo del contrato real del frontend (src/pages/Sales.jsx y
// google-login). Aceptan lo que hoy envía el front: sólo rechazan tipos
// estructuralmente inválidos; las reglas de negocio siguen en controllers.

const optionalString = z.string().optional();

// Front: { credential | idToken | token, state } (Google One Tap)
const googleLoginSchema = z
  .object({
    idToken: optionalString,
    credential: optionalString,
    token: optionalString,
    state: optionalString,
  })
  .passthrough();

// Front: customerData puede llevar phone/email en null
const customerDataSchema = z
  .object({
    name: optionalString,
    nit: optionalString,
    address: optionalString,
    phone: optionalString.nullable(),
    email: optionalString.nullable(),
  })
  .passthrough()
  .optional();

// Front: orderId, paymentMethodId, cashAmount, tipAmount, customerData
const createInvoiceSchema = z
  .object({
    orderId: z.union([z.string(), z.number()]).optional(),
    customerData: customerDataSchema,
    paymentType: optionalString,
    paymentMethod: z.union([z.string(), z.number()]).optional(),
    isElectronic: z.boolean().optional(),
    notes: optionalString.nullable(),
    paymentMethodId: z.union([z.string(), z.number()]).optional(),
    cashAmount: z.union([z.number(), z.string()]).optional(),
    tipAmount: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

module.exports = { googleLoginSchema, createInvoiceSchema };
