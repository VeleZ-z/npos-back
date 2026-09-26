const config = require("../config/config");
const logger = require("../config/logger");

const globalErrorHandler = (err, req, res, _next) => {
    const statusCode = err.statusCode || 500;

    // Log estructurado: los 5xx se registran completos (con stack), los 4xx
    // como advertencia de uso. Pino serializa Error bajo la clave `err`.
    if (statusCode >= 500) {
        logger.error(
            { err, statusCode, method: req.method, url: req.originalUrl },
            err.message || "Error interno"
        );
    } else {
        logger.warn(
            { statusCode, method: req.method, url: req.originalUrl },
            err.message
        );
    }

    // En producción los 5xx responden un mensaje genérico: err.message puede
    // contener SQL o detalles internos. Los 4xx son mensajes intencionales.
    const isProduction = config.nodeEnv === "production";
    const message =
        statusCode >= 500 && isProduction
            ? "Error interno del servidor"
            : err.message;

    return res.status(statusCode).json({
        status: statusCode,
        message,
        errorStack: config.nodeEnv === "development" ? err.stack : ""
    })
}

module.exports = globalErrorHandler;
