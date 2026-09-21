// Historia de usuario:
//   Como staff del restaurante, quiero que solo los roles autorizados accedan
//   a los endpoints protegidos, para mantener la seguridad de la operación.
//
// Criterios (Dado/Cuando/Entonces):
//   Dado un rol entrante (con o sin alias en español) Cuando se normaliza
//   Entonces se resuelve a admin/cashier/waiter/customer
//   Dado un usuario con rol autorizado Cuando invoca un endpoint protegido
//   Entonces la cadena continúa (next sin error)
//   Dado un usuario con rol no autorizado o sin rol Cuando invoca un endpoint protegido
//   Entonces el middleware produce 403 Forbidden

import { describe, it, expect, vi } from "vitest";
import createHttpError from "http-errors";
import {
  authorizeRoles,
  normalizeRole,
  resolveRole,
} from "../../middlewares/tokenVerification";

describe("normalizeRole / resolveRole — normalización y aliases de RBAC", () => {
  it("Dado 'Admin  ' Cuando se normaliza Entonces devuelve 'admin'", () => {
    expect(normalizeRole("Admin  ")).toBe("admin");
  });

  it("Dado null/undefined Cuando se normaliza Entonces devuelve ''", () => {
    expect(normalizeRole(null)).toBe("");
    expect(normalizeRole(undefined)).toBe("");
  });

  it.each([
    ["administrator", "admin"],
    ["administrador", "admin"],
    ["ADMINISTRADOR", "admin"],
    ["cajero", "cashier"],
    ["Cajero", "cashier"],
    ["mesero", "waiter"],
    ["Mesero", "waiter"],
    ["cliente", "customer"],
    ["client", "customer"],
    ["Customer", "customer"],
  ])("Dado el alias '%s' Cuando se resuelve Entonces devuelve '%s'", (input, expected) => {
    expect(resolveRole(input)).toBe(expected);
  });

  it("Dado un rol desconocido Cuando se resuelve Entonces pasa tal cual normalizado", () => {
    expect(resolveRole("supervisor")).toBe("supervisor");
  });

  it.each(["toString", "constructor", "__proto__"])(
    "Dado rol '%s' (prototype pollution) Cuando se resuelve Entonces devuelve string, no función heredada",
    (input) => {
      const resolved = resolveRole(input);
      expect(typeof resolved).toBe("string");
      expect(resolved).toBe(normalizeRole(input));
    }
  );
});

describe("authorizeRoles — matriz de decisión RBAC en middleware", () => {
  const middleware = authorizeRoles("admin", "cashier");

  const runWith = (role) => {
    const req = { user: role === undefined ? undefined : { role } };
    const next = vi.fn();
    middleware(req, {}, next);
    return next;
  };

  it("Dado rol 'admin' autorizado Cuando invoca Entonces next() sin error", () => {
    const next = runWith("admin");
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ["Cashier", "mayúsculas"],
    ["Cajero", "alias español"],
  ])("Dado rol '%s' (%s) Cuando invoca Entonces next() sin error", (role) => {
    const next = runWith(role);
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ["customer", "rol no autorizado"],
    ["waiter", "rol no autorizado"],
    [undefined, "usuario sin rol"],
  ])("Dado %s Cuando invoca Entonces produce 403 Forbidden", (role) => {
    const next = runWith(role);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(createHttpError.HttpError);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Forbidden");
  });

  it("Dado allowlist vacío Cuando cualquier rol invoca Entonces 403 Forbidden", () => {
    const locked = authorizeRoles();
    const next = vi.fn();
    locked({ user: { role: "admin" } }, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
});
