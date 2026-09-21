// Historia de usuario:
//   Como cajero, quiero que la factura calcule correctamente subtotales,
//   impuestos, descuentos y cambio, para facturar sin errores de dinero.
//
// Criterios (Dado/Cuando/Entonos):
//   Dado un descuento VALUE/PERCENT Cuando se calcula el precio unitario
//   Entonces el descuento se aplica sin dejar negativos (clamp a 0)
//   Dado un pago en efectivo exacto o insuficiente por 1 Cuando se calcula el cambio
//   Entonces el cambio es 0 o el pago se rechaza (validado en controller)
//   Dado items sin código de descuento Cuando se resuelve el código DIAN
//   Entonces se usa el NIT de consumidor final 222222222222 (regla de negocio)

import { describe, it, expect } from "vitest";
import {
  computeDiscountedUnitPrice,
  formatMoney,
  resolveDiscountCode,
  resolveTableNumber,
  normalizeUserId,
  normalizeInvoiceItems,
  resolvePaymentDisplay,
  mmToPt,
} from "../../controllers/invoiceController";

describe("computeDiscountedUnitPrice — descuentos VALUE y PERCENT", () => {
  it("Dado item sin descuento Cuando se calcula Entonces unitPrice = precio base", () => {
    const { unitPrice, originalUnit } = computeDiscountedUnitPrice({
      pricePerQuantity: 2000,
      originalPrice: 2000,
    });
    expect(unitPrice).toBe(2000);
    expect(originalUnit).toBe(2000);
  });

  it("Dado descuento VALUE 500 sobre 2000 Cuando se calcula Entonces 1500", () => {
    const { unitPrice } = computeDiscountedUnitPrice({
      pricePerQuantity: 2000,
      originalPrice: 2000,
      discount: { type: "VALUE", value: 500 },
    });
    expect(unitPrice).toBe(1500);
  });

  it("Dado descuento VALUE mayor al precio Cuando se calcula Entonces clamp a 0", () => {
    const { unitPrice } = computeDiscountedUnitPrice({
      pricePerQuantity: 1000,
      originalPrice: 1000,
      discount: { type: "VALUE", value: 5000 },
    });
    expect(unitPrice).toBe(0);
  });

  it("Dado descuento PERCENT 10 sin impuesto Cuando se calcula Entonces 1800", () => {
    const { unitPrice } = computeDiscountedUnitPrice({
      pricePerQuantity: 2000,
      originalPrice: 2000,
      discount: { type: "PERCENT", value: 10 },
    });
    expect(unitPrice).toBeCloseTo(1800, 6);
  });

  it("Dado descuento PERCENT 10 con taxRate 19 Cuando se calcula Entonces 1800 (proporción bruta preservada)", () => {
    const { unitPrice } = computeDiscountedUnitPrice({
      pricePerQuantity: 2000,
      originalPrice: 2000,
      taxRate: 19,
      discount: { type: "PERCENT", value: 10 },
    });
    expect(unitPrice).toBeCloseTo(1800, 6);
  });

  it.each([0, 100, 101])(
    "Dado descuento PERCENT %d (valor límite) Cuando se calcula Entonces resultado esperado",
    (value) => {
      const { unitPrice } = computeDiscountedUnitPrice({
        pricePerQuantity: 2000,
        originalPrice: 2000,
        discount: { type: "PERCENT", value },
      });
      if (value === 0) expect(unitPrice).toBeCloseTo(2000, 6);
      else expect(unitPrice).toBe(0);
    }
  );

  it("Dado tipo de descuento desconocido Cuando se calcula Entonces precio sin cambios", () => {
    const { unitPrice } = computeDiscountedUnitPrice({
      pricePerQuantity: 2000,
      originalPrice: 2000,
      discount: { type: "BOGUS", value: 999 },
    });
    expect(unitPrice).toBe(2000);
  });

  it("Dado discount null explícito Cuando se calcula Entonces fallback del precio", () => {
    const { unitPrice } = computeDiscountedUnitPrice({
      price: 3000,
      discount: null,
    });
    expect(unitPrice).toBe(3000);
  });
});

describe("formatMoney — formato es-CO sin decimales", () => {
  it("Dado 1234567 Cuando se formatea Entonces '1.234.567'", () => {
    expect(formatMoney(1234567)).toBe("1.234.567");
  });

  it.each([0, null, undefined, "abc"])(
    "Dado %s Cuando se formatea Entonces '0'",
    (value) => {
      expect(formatMoney(value)).toBe("0");
    }
  );
});

describe("resolveDiscountCode — código DIAN de consumidor final", () => {
  it("Dado items sin descuento Cuando se resuelve Entonces NIT consumidor final 222222222222", () => {
    expect(resolveDiscountCode([{ description: "Hamburguesa" }])).toBe(
      "222222222222"
    );
    expect(resolveDiscountCode([])).toBe("222222222222");
  });

  it("Dado un único código de descuento Cuando se resuelve Entonces ese código", () => {
    expect(resolveDiscountCode([{ discount: { id: 7 } }])).toBe("7");
  });

  it("Dado códigos duplicados Cuando se resuelve Entonces se deduplican", () => {
    expect(
      resolveDiscountCode([
        { discount: { id: 7 } },
        { discount: { id: 7 } },
      ])
    ).toBe("7");
  });

  it("Dado códigos distintos Cuando se resuelve Entonces unidos con ' | '", () => {
    expect(
      resolveDiscountCode([
        { discount: { id: 7 } },
        { discount: { id: 3 } },
      ])
    ).toBe("7 | 3");
  });
});

describe("resolveTableNumber — número de mesa para la factura", () => {
  it("Dado order.table objeto con number Cuando se resuelve Entonces ese número", () => {
    expect(resolveTableNumber({ table: { number: 5 } })).toBe(5);
  });

  it.each([
    [{ table: 3 }, 3],
    [{ tableNumber: 7 }, 7],
    [{ table: { tableNumber: 2 } }, 2],
    [{ table: { name: "Mesa 1" } }, "Mesa 1"],
  ])("Dado %j Cuando se resuelve Entonces %s", (order, expected) => {
    expect(resolveTableNumber(order)).toBe(expected);
  });

  it.each([null, {}, { table: null }])(
    "Dado order %j sin mesa Cuando se resuelve Entonces '-'",
    (order) => {
      expect(resolveTableNumber(order)).toBe("-");
    }
  );
});

describe("normalizeUserId — normalización de referencias de usuario", () => {
  it.each([
    [null, null],
    [undefined, null],
    [5, 5],
    ["5", 5],
    [{ _id: 5 }, 5],
    [{ id: "7" }, 7],
    [{ userId: 3 }, 3],
    [{ _id: { _id: 9 } }, 9],
    ["abc", null],
    [0, null],
    [-1, null],
  ])("Dado %j Cuando se normaliza Entonces %j", (input, expected) => {
    expect(normalizeUserId(input)).toBe(expected);
  });
});

describe("normalizeInvoiceItems — snapshot vs items de orden", () => {
  it("Dado invoiceItems presentes Cuando se normaliza Entonces se devuelven tal cual", () => {
    const items = [{ description: "X", quantity: 1 }];
    expect(normalizeInvoiceItems(items, [])).toBe(items);
  });

  it("Dado solo fallbackItems Cuando se normaliza Entonces se mapean con defaults", () => {
    const result = normalizeInvoiceItems([], [
      { name: "Hamburguesa", quantity: 2, price: 10000, tax: { percentage: 19, regimen: "COMUN" } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Hamburguesa");
    expect(result[0].quantity).toBe(2);
    expect(result[0].unitPrice).toBe(10000);
    expect(result[0].taxRate).toBe(19);
    expect(result[0].taxRegimen).toBe("COMUN");
    expect(result[0].discount).toBeNull();
  });

  it("Dado fallback sin tax Entonces taxRate 0 y régimen COMUN", () => {
    const result = normalizeInvoiceItems([], [{ name: "Gaseosa", quantity: 1 }]);
    expect(result[0].taxRate).toBe(0);
    expect(result[0].taxRegimen).toBe("COMUN");
  });

  it("Dado ambos vacíos Cuando se normaliza Entonces []", () => {
    expect(normalizeInvoiceItems([], [])).toEqual([]);
  });
});

describe("resolvePaymentDisplay — etiqueta de método de pago", () => {
  it.each([
    ["Efectivo", "Efectivo"],
    ["pago en efectivo", "Efectivo"],
    ["Datafono", "Datafono"],
    ["datáfono", "Datafono"],
    ["Transferencia", "Transferencia"],
    ["transferencia bancaria", "Transferencia"],
    ["", "Transferencia"],
    [null, "Transferencia"],
  ])("Dado '%s' Cuando se resuelve Entonces '%s'", (input, expected) => {
    expect(resolvePaymentDisplay(input)).toBe(expected);
  });
});

describe("mmToPt — conversión para tirilla 80mm", () => {
  it("Dado 80mm Cuando se convierte Entonces ≈226.77pt (ancho de tirilla térmica)", () => {
    expect(mmToPt(80)).toBeCloseTo(226.7717, 3);
  });
});
