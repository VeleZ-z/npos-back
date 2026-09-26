const { rateLimit } = require("express-rate-limit");

const resolveLimit = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Factory testeable: los tests de unidad la usan con límites mínimos sobre
// una app express desechable, sin tocar los limiters reales de la app.
const createRateLimiter = ({
  windowMs = 60_000,
  limit = 100,
  message = "Demasiadas solicitudes, intenta de nuevo más tarde",
} = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, message },
  });

// Límite general de la API: generoso (anti-bucle desbocado / abuso básico).
const apiLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: resolveLimit(process.env.RATE_LIMIT_API_MAX, 300),
  message: "Demasiadas solicitudes, intenta de nuevo en un minuto",
});

// Superficie sin autenticar (google-login + oauth state): más estricto.
// Un NAT de restaurante comparte IP: 30 logins/15min sobra para un flujo
// que se usa una vez por sesión.
const authLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  limit: resolveLimit(process.env.RATE_LIMIT_AUTH_MAX, 30),
  message: "Demasiados intentos de autenticación, intenta de nuevo en 15 minutos",
});

module.exports = { createRateLimiter, apiLimiter, authLimiter };
