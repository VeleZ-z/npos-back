// Fail-fast de configuración: se valida ANTES de conectar/escuchar para
// fallar con un mensaje claro en vez de errores crípticos en runtime.
// Sólo la valida server.js (el entry real); app.js exportada no, para que
// Supertest arranque la app sin depender del entorno de producción.

const REQUIRED_ENV = [
  "JWT_SECRET",
  "MYSQL_HOST",
  "MYSQL_USER",
  "MYSQL_DATABASE",
  "GOOGLE_CLIENT_ID",
];

const validateEnv = (env = process.env) => {
  const errors = [];

  for (const name of REQUIRED_ENV) {
    // Justificación: acceso computado seguro; `name` itera el array congelado
    // REQUIRED_ENV de literales, nunca entrada del usuario.
    // eslint-disable-next-line security/detect-object-injection
    if (!String(env[name] ?? "").trim()) {
      errors.push(`Falta la variable de entorno requerida: ${name}`);
    }
  }

  // La fortaleza del secreto sólo se exige en producción: dev/CI arrancan
  // con dummies a propósito (el smoke de CI usa JWT_SECRET=ci-dummy).
  const jwtSecret = String(env.JWT_SECRET ?? "");
  if (
    jwtSecret &&
    env.NODE_ENV === "production" &&
    jwtSecret.length < 32
  ) {
    errors.push(
      "JWT_SECRET debe tener al menos 32 caracteres en producción"
    );
  }

  return errors;
};

const assertValidEnv = (env = process.env) => {
  const errors = validateEnv(env);
  if (errors.length > 0) {
    throw new Error(
      `Configuración inválida:\n- ${errors.join("\n- ")}`
    );
  }
};

module.exports = { validateEnv, assertValidEnv, REQUIRED_ENV };
