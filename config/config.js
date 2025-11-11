require("dotenv").config();

const config = Object.freeze({
  port: process.env.PORT || 8000,
  // Legacy field kept for backward-compat, not used anymore
  //databaseURI: process.env.MONGODB_URI || "",
  // MySQL connection settings
  mysql: {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || process.env.MYSQL_DB || "npos"
  },

  nodeEnv: process.env.NODE_ENV || "development",
  accessTokenSecret: process.env.JWT_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  // razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  // razorpaySecretKey: process.env.RAZORPAY_KEY_SECRET,
  // razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  authRoles: {
    adminEmails: (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim()).filter(Boolean),
    adminDomains: (process.env.ADMIN_DOMAINS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
    cashierEmails: (process.env.CASHIER_EMAILS || process.env.CAJERO_EMAILS || "").split(",").map(s => s.trim()).filter(Boolean),
    cashierDomains: (process.env.CASHIER_DOMAINS || process.env.CAJERO_DOMAINS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
    defaultRole: process.env.DEFAULT_ROLE || "Customer"
  },
  // Business metadata used in invoiceController
  business: {
    name: process.env.BUSINESS_NAME || "Nativhos",
    nit: process.env.BUSINESS_NIT || "118098769",
    address: process.env.BUSINESS_ADDRESS || "Calle 31, Cra. 3, Quibdó, Chocó",
    phone: process.env.BUSINESS_PHONE || "+57 323 3800506",
    email: process.env.BUSINESS_EMAIL || "nativpasist@gmail.com"
  }
});

module.exports = config;
