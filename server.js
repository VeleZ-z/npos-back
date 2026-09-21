require("dotenv").config();
const connectDB = require("./config/database");
const config = require("./config/config");
const app = require("./app");

const PORT = process.env.PORT || config.port || 3000;

connectDB();

// Background jobs (birthday notifications)
try { require("./jobs/birthdayJob").schedule(); } catch {}

// Server
app.listen(PORT, () => {
    console.log(`N POS Server is listening on port ${PORT}`);
})
