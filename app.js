const express = require("express");
require("dotenv").config();
const connectDB = require("./config/database");
const config = require("./config/config");
const { ping } = require("./config/mysql");
const globalErrorHandler = require("./middlewares/globalErrorHandler");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const app = express();

const PORT = process.env.PORT || config.port || 3000;
connectDB();

// Middlewares
const allowedOrigins = (process.env.CORS_ORIGINS || "https://npos-front.vercel.app, http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json()); // parse incoming request in json format
app.use(cookieParser())
// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Root Endpoint
app.get("/", (req,res) => {
    res.json({message : "from NPOS Server!"});
})

app.get("/api/health", async (req, res) => {
  try {
    await ping();
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "Database unreachable",
      details: error.message,
    });
  }
});

// Other Endpoints
app.use("/api/user", require("./routes/userRoute"));
app.use("/api/order", require("./routes/orderRoute"));
app.use("/api/table", require("./routes/tableRoute"));
app.use("/api/payment", require("./routes/paymentRoute"));
app.use("/api/invoice", require("./routes/invoiceRoute"));
app.use("/api/category", require("./routes/categoryRoute"));
app.use("/api/product", require("./routes/productRoute"));
app.use("/api/auth", require("./routes/authRoute"));
app.use("/api/state", require("./routes/stateRoute"));
app.use("/api/provider", require("./routes/providerRoute"));
app.use("/api/discount", require("./routes/discountRoute"));
app.use("/api/alert", require("./routes/alertRoute"));
app.use("/api/purchase", require("./routes/purchaseRoute"));
app.use("/api/paymethod", require("./routes/paymentMethodRoute"));
app.use("/api/tax", require("./routes/taxRoute"));
app.use("/api/stats", require("./routes/statsRoute"));
app.use("/api/cash-desk", require("./routes/cashDeskRoute"));

// Global Error Handler
app.use(globalErrorHandler);

// Background jobs (birthday notifications)
try { require('./jobs/birthdayJob').schedule(); } catch {}


// Server
app.listen(PORT, () => {
    console.log(`N POS Server is listening on port ${PORT}`);
})


