const pino = require("pino");

const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "development" ? "debug" : "info");

const logger = pino({ level });

module.exports = logger;
