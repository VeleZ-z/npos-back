const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const config = require("../config/config");

const SMTP_SERVICE = process.env.SMTP_SERVICE || "gmail";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE =
  process.env.SMTP_SECURE != null
    ? String(process.env.SMTP_SECURE).toLowerCase() !== "false"
    : false;
const SMTP_POOL = String(process.env.SMTP_POOL || "true").toLowerCase() !== "false";
const SMTP_USER = process.env.SMTP_USER || config.business.email;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_APP_PASS || "";
const SMTP_FROM =
  process.env.SMTP_FROM ||
  (SMTP_USER ? `${config.business.name} <${SMTP_USER}>` : config.business.email);
const SMTP_CONN_TIMEOUT = Number(process.env.SMTP_CONN_TIMEOUT || 15000);
const SMTP_SOCKET_TIMEOUT = Number(process.env.SMTP_SOCKET_TIMEOUT || 20000);
const SMTP_TLS_REJECT =
  process.env.SMTP_TLS_REJECT_UNAUTHORIZED == null
    ? true
    : String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED).toLowerCase() !== "false";
const SMTP_DNS_PREF = process.env.SMTP_DNS_PREFERENCE || "ipv4";

let transporter = null;

const assetBaseUrl =
  process.env.EMAIL_ASSET_BASE_URL ||
  process.env.ASSET_BASE_URL ||
  process.env.PUBLIC_BASE_URL ||
  process.env.BACKEND_PUBLIC_URL ||
  process.env.VITE_BACKEND_URL ||
  "";

const logoPath = path.resolve(
  __dirname,
  "..",
  "..",
  "pos-frontend",
  "src",
  "assets",
  "images",
  "logo.png"
);
let cachedLogoDataUri = undefined;

const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
};

const mapAttachment = (attachment) => {
  if (!attachment) return null;
  let content = null;
  if (attachment.content) {
    content = attachment.content;
  } else if (attachment.path) {
    try {
      content = fs.readFileSync(attachment.path);
    } catch {
      return null;
    }
  }
  if (!content) return null;
  return {
    filename: attachment.filename || "attachment",
    content,
    contentType: attachment.contentType || "application/octet-stream",
  };
};

async function sendEmail({ to, subject, html, attachments = [] }) {
  const recipients = toArray(to);
  if (!recipients.length) return;
  const mailer = getTransporter();
  if (!mailer) {
    console.warn("[email] skipped: SMTP credentials are not configured");
    return;
  }

  const attList = attachments.map(mapAttachment).filter(Boolean);
  const message = {
    from: SMTP_FROM,
    to: recipients,
    subject,
    html,
  };
  if (attList.length) {
    message.attachments = attList;
  }

  await mailer.sendMail(message);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_USER || !SMTP_PASS) return null;
  const baseOptions = {
    pool: SMTP_POOL,
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: SMTP_CONN_TIMEOUT,
    greetingTimeout: SMTP_CONN_TIMEOUT,
    socketTimeout: SMTP_SOCKET_TIMEOUT,
    tls: {
      rejectUnauthorized: SMTP_TLS_REJECT,
      servername: SMTP_HOST,
    },
  };
  const serviceOptions = SMTP_SERVICE
    ? {
        service: SMTP_SERVICE,
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        pool: SMTP_POOL,
        connectionTimeout: SMTP_CONN_TIMEOUT,
        greetingTimeout: SMTP_CONN_TIMEOUT,
        socketTimeout: SMTP_SOCKET_TIMEOUT,
        tls: {
          rejectUnauthorized: SMTP_TLS_REJECT,
          servername: SMTP_HOST,
        },
        dnsResolvePreference: SMTP_DNS_PREF,
      }
    : null;
  transporter = nodemailer.createTransport(serviceOptions || {
    ...baseOptions,
    dnsResolvePreference: SMTP_DNS_PREF,
  });
  return transporter;
}

function buildAssetUrl(relativePath = "") {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  if (!assetBaseUrl) return relativePath;
  return `${assetBaseUrl.replace(/\/$/, "")}/${relativePath.replace(/^\//, "")}`;
}

function getLogoDataUri() {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  try {
    const buffer = fs.readFileSync(logoPath);
    const ext = path.extname(logoPath).replace(/^\./, "") || "png";
    cachedLogoDataUri = `data:image/${ext};base64,${buffer.toString("base64")}`;
  } catch {
    cachedLogoDataUri = null;
  }
  return cachedLogoDataUri;
}

module.exports = {
  sendEmail,
  buildAssetUrl,
  getLogoDataUri,
};
