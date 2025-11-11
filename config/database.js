const { ping, ensureAuxTables } = require("./mysql");

const connectDB = async () => {
  try {
    await ping();
    await ensureAuxTables();
    console.log("Connected to MySQL and ensured auxiliary tables.");
  } catch (error) {
    console.error("MySQL connection error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
