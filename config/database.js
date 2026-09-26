const { ping, ensureAuxTables } = require("./mysql");
const logger = require("./logger");

const connectDB = async () => {
  try {
    await ping();
    await ensureAuxTables();
    logger.info("Connected to MySQL and ensured auxiliary tables.");
  } catch (error) {
    logger.error({ err: error }, "MySQL connection error");
    process.exit(1);
  }
};

module.exports = connectDB;
