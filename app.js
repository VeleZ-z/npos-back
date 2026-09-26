const express = require("express");
require("dotenv").config();
const { ping } = require("./config/mysql");
const globalErrorHandler = require("./middlewares/globalErrorHandler");
const { apiLimiter } = require("./middlewares/rateLimiters");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const app = express();

// Detrás de un proxy (nginx en producción) los IPs reales llegan en
// X-Forwarded-For: sin esto el rate limiting limitaría la IP del proxy.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined && trustProxy !== "") {
  app.set(
    "trust proxy",
    /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "true" ? true : trustProxy
  );
}

// Middlewares
const allowedOrigins = (process.env.CORS_ORIGINS || "https://nativhos-uib.vercel.app, http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
// Estáticos consumidos cross-origin por el frontend: la política CORP por
// defecto (same-origin) bloquearía <img>/assets en el navegador.
app.use(
  ["/uploads", "/assets"],
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" })
);
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
app.use(express.json({ limit: "1mb" })); // parse incoming request in json format
app.use(cookieParser());
app.use("/api", apiLimiter);
// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));


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

module.exports = app;
