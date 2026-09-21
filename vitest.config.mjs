import { defineConfig } from "vitest/config";

// Coverage `include` mirrors sonar.sources (app + config + controllers + jobs +
// middlewares + models + routes + services). scripts/ is excluded from both:
// standalone migration CLIs, not part of the running app.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    setupFiles: ["test/setup.js"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Los archivos de integración comparten una sola base de pruebas:
    // deben ejecutarse en secuencia para que el truncado entre suites
    // no pise datos de otro archivo en paralelo.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "app.js",
        "config/**",
        "controllers/**",
        "jobs/**",
        "middlewares/**",
        "models/**",
        "routes/**",
        "services/**",
      ],
      exclude: ["scripts/**"],
    },
  },
});
