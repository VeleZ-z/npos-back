// Historia de usuario:
//   Como cliente, quiero recibir la factura por email con el PDF de tirilla
//   80mm correcto, para tener mi comprobante de compra.
//
// Criterios (Dado/Cuando/Entonces):
//   Dado una factura con items Cuando se genera el PDF Entonces el buffer
//   inicia con %PDF- e incluye emisor, items y totales (nunca snapshots
//   binarios)
//   Dado una factura con 0 items Cuando se genera el PDF Entonces muestra
//   'Sin productos' sin romper
//   Dado una factura Cuando se genera el HTML del email Entonces incluye NIT,
//   cliente, items, totales y nota legal art. 774
import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import {
  buildInvoiceEmailHtml,
  generateInvoicePdfBuffer,
} from "../../controllers/invoiceController";

// PDFKit comprime los content streams (FlateDecode): se descomprimen para
// verificar textos clave sin snapshots binarios.
function pdfText(buffer) {
  const raw = buffer.toString("latin1");
  const chunks = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    try {
      chunks.push(zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"));
    } catch {
      chunks.push(match[1]);
    }
  }
  const content = chunks.join("\n");
  // PDFKit escribe el texto como strings hex dentro de arrays TJ/Tj:
  // [<4e4154...> 0] TJ -> se decodifican a texto legible.
  return content.replace(/<([0-9A-Fa-f]+)>/g, (_, hex) =>
    Buffer.from(hex, "hex").toString("latin1")
  );
}

const invoiceBase = {
  invoiceNumber: "F-0042",
  issuer: {
    businessName: "Nativhos",
    nit: "118098769",
    address: "Calle 31, Quibdó",
    phone: "+57 323 3800506",
  },
  customer: { name: "Cliente Prueba", nit: "1020304050" },
  totals: { subtotal: 18519, totalTax: 1481, total: 20000 },
  tip: 2000,
  change: 3000,
};

const items = [
  {
    description: "Hamburguesa",
    quantity: 2,
    unitPrice: 10000,
    subtotal: 18519,
    taxAmount: 1481,
    taxRate: 8,
    taxRegimen: "REGIMEN_COMUN",
  },
];

describe("generateInvoicePdfBuffer — PDF tirilla 80mm", () => {
  it("Dado una factura con items Cuando se genera Entonces buffer %PDF- con textos clave", async () => {
    const buffer = await generateInvoicePdfBuffer(invoiceBase, { _id: 7 }, items, {});
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdfText(buffer);
    expect(text).toContain("NATIVHOS");
    expect(text).toContain("118098769");
    expect(text).toContain("HAMBURGUESA");
    expect(text).toContain("20.000");
  });

  it("Dado 0 items Cuando se genera Entonces 'Sin productos' sin romper", async () => {
    const buffer = await generateInvoicePdfBuffer(invoiceBase, { _id: 7 }, [], {});
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfText(buffer)).toContain("Sin productos");
  });

  it("Dado item con nota Cuando se genera Entonces la nota aparece en el PDF", async () => {
    const buffer = await generateInvoicePdfBuffer(
      invoiceBase,
      { _id: 7 },
      [{ ...items[0], note: "sin cebolla" }],
      {}
    );
    expect(pdfText(buffer)).toContain("sin cebolla");
  });
});

describe("buildInvoiceEmailHtml — HTML del email de factura", () => {
  const order = { _id: 7, customer: { name: "Cliente Prueba" }, table: { number: 3 } };

  it("Dado factura y orden Cuando se genera Entonces incluye NIT, cliente, items y totales", () => {
    const html = buildInvoiceEmailHtml(invoiceBase, order, items, {});
    expect(html).toContain("NIT: 118098769");
    expect(html).toContain("CLIENTE PRUEBA");
    expect(html).toContain("HAMBURGUESA");
    expect(html).toContain("18.519");
    expect(html).toContain("20.000");
    expect(html).toContain("2.000");
  });

  it("Dado factura Cuando se genera Entonces nota legal art. 774 presente", () => {
    const html = buildInvoiceEmailHtml(invoiceBase, order, items, {});
    expect(html).toContain("art. 774");
  });

  it("Dado 0 items Cuando se genera Entonces fila 'Sin productos'", () => {
    const html = buildInvoiceEmailHtml(invoiceBase, order, [], {});
    expect(html).toContain("Sin productos");
  });

  it("Dado cliente ausente Cuando se genera Entonces CLIENTES VARIOS (consumidor final)", () => {
    const html = buildInvoiceEmailHtml(
      { ...invoiceBase, customer: {} },
      { _id: 7 },
      items,
      {}
    );
    expect(html).toContain("CLIENTES VARIOS");
  });
});
