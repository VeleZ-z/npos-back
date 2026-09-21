// Historia de usuario:
//   Como administrador, quiero que el sistema asigne roles automáticamente
//   según whitelists de emails/dominios al hacer login con Google, para no
//   gestionar roles manualmente.
//
// Criterios (Dado/Cuando/Entonces):
//   Dado un email en ADMIN_EMAILS o su dominio en ADMIN_DOMAINS Cuando hace login
//   Entonces se le asigna el rol Admin
//   Dado un email en CASHIER_EMAILS o su dominio en CASHIER_DOMAINS Cuando hace login
//   Entonces se le asigna el rol Cashier
//   Dado un email sin coincidencias Cuando hace login Entonces recibe DEFAULT_ROLE
//   Dado el email en otra capitalización Cuando hace login Entonces la comparación
//   es insensible a mayúsculas

import { describe, it, expect } from "vitest";
import {
  determineRoleByEmail,
  getEmailDomain,
} from "../../controllers/userController";

describe("getEmailDomain — extracción de dominio", () => {
  it("Dado 'user@udea.edu.co' Cuando se extrae Entonces devuelve 'udea.edu.co'", () => {
    expect(getEmailDomain("user@udea.edu.co")).toBe("udea.edu.co");
  });

  it("Dado 'USER@NATIV.TEST' Cuando se extrae Entonces devuelve en minúsculas", () => {
    expect(getEmailDomain("USER@NATIV.TEST")).toBe("nativ.test");
  });

  it("Dado un string sin '@' Cuando se extrae Entonces devuelve ''", () => {
    expect(getEmailDomain("no-email")).toBe("");
  });

  it("Dado null Cuando se extrae Entonces devuelve ''", () => {
    expect(getEmailDomain(null)).toBe("");
  });
});

describe("determineRoleByEmail — whitelist de roles por email/dominio", () => {
  it("Dado email en ADMIN_EMAILS Cuando se determina Entonces devuelve 'Admin'", () => {
    expect(determineRoleByEmail("admin@nativ.test")).toBe("Admin");
  });

  it("Dado email de admin en otra capitalización Cuando se determina Entonces 'Admin'", () => {
    expect(determineRoleByEmail("ADMIN@NATIV.TEST")).toBe("Admin");
  });

  it("Dado email en CASHIER_EMAILS Cuando se determina Entonces devuelve 'Cashier'", () => {
    expect(determineRoleByEmail("cashier@nativ.test")).toBe("Cashier");
  });

  it("Dado dominio en ADMIN_DOMAINS Cuando se determina Entonces 'Admin'", () => {
    const roleCfg = {
      adminEmails: [],
      adminDomains: ["udea.edu.co"],
      cashierEmails: [],
      cashierDomains: [],
      defaultRole: "Customer",
    };
    expect(determineRoleByEmail("anyone@udea.edu.co", roleCfg)).toBe("Admin");
  });

  it("Dado dominio en CASHIER_DOMAINS Cuando se determina Entonces 'Cashier'", () => {
    const roleCfg = {
      adminEmails: [],
      adminDomains: [],
      cashierEmails: [],
      cashierDomains: ["nativ.test"],
      defaultRole: "Customer",
    };
    expect(determineRoleByEmail("anyone@nativ.test", roleCfg)).toBe("Cashier");
  });

  it("Dado dominio en CASHIER_DOMAINS pero email en ADMIN_EMAILS Cuando se determina Entonces 'Admin' (prioridad admin)", () => {
    const roleCfg = {
      adminEmails: ["admin@nativ.test"],
      adminDomains: [],
      cashierEmails: [],
      cashierDomains: ["nativ.test"],
      defaultRole: "Customer",
    };
    expect(determineRoleByEmail("admin@nativ.test", roleCfg)).toBe("Admin");
  });

  it("Dado email sin coincidencias Cuando se determina Entonces DEFAULT_ROLE ('Customer')", () => {
    expect(determineRoleByEmail("random@gmail.com")).toBe("Customer");
  });

  it("Dado email vacío Cuando se determina Entonces DEFAULT_ROLE", () => {
    expect(determineRoleByEmail("")).toBe("Customer");
  });
});
