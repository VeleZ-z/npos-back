const js = require("@eslint/js");
const pluginN = require("eslint-plugin-n");
const pluginSecurity = require("eslint-plugin-security");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      ".opencode/**",
      "uploads/**",
      "certs/**",
    ],
  },
  js.configs.recommended,
  ...pluginN.configs["flat/mixed-esm-and-cjs"],
  {
    files: ["**/*.js"],
    plugins: {
      n: pluginN,
      security: pluginSecurity,
    },
    rules: {
      ...pluginSecurity.configs.recommended.rules,
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Justificación: los catch vacíos son intencionales alrededor de
      // operaciones no críticas (DDL idempotente en migraciones, cookies
      // best-effort, envíos de email best-effort). Los bloques vacíos reales
      // (if/for sin cuerpo) siguen reportándose y se arreglan.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // El código de app usa el logger estructurado (config/logger.js).
      // Los scripts de migración exentos abajo: stdout es su UX correcta.
      "no-console": "error",
      "n/no-process-exit": "off",
    },
  },
  {
    // Justificación: scripts de migración/seed son CLIs cuyo UX es stdout.
    files: ["scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Justificación: devDependencies usadas en archivos de tooling (configs de
    // ESLint/Vitest y pruebas). Limitación conocida de n/no-unpublished-* con
    // tooling; los tests y configs no se publican en el paquete npm.
    files: ["test/**", "eslint.config.js", "vitest.config.mjs"],
    rules: {
      "n/no-unpublished-import": "off",
      "n/no-unpublished-require": "off",
    },
  },
  {
    files: ["test/**/*.js", "vitest.config.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
