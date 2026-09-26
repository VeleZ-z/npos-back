require("dotenv").config();
const { assertValidEnv } = require("./config/validateConfig");
const connectDB = require("./config/database");
const config = require("./config/config");
const logger = require("./config/logger");
const app = require("./app");

// Fail-fast: arrancar sin la configuración crítica es un error de
// despliegue, no de runtime. Mensaje agregado con TODOS los faltantes.
assertValidEnv();

const PORT = process.env.PORT || config.port || 3000;

connectDB();

// Background jobs (birthday notifications)
try { require("./jobs/birthdayJob").schedule(); } catch {}

// Server
app.listen(PORT, () => {
    logger.info(`N POS Server is listening on port ${PORT}`);
})
