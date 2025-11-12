const https = require("https");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const config = require("../config/config");

// Resend HTTP API (preferred in Render)
const RESEND_ENDPOINT = process.env.RESEND_API_URL || "https://api.resend.com/emails";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

const sanitizeSender = (value) => {
  if (!value) return null;
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed || null;
};

const RESEND_FROM = sanitizeSender(process.env.RESEND_FROM);

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
  sanitizeSender(process.env.SMTP_FROM) ||
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

const logoPath = process.env.EMAIL_LOGO_PATH
  ? path.resolve(process.env.EMAIL_LOGO_PATH)
  : path.resolve(__dirname, "..", "assets", "email-logo.png");
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
  if (RESEND_API_KEY && RESEND_FROM) {
    await sendViaResend({ to: recipients, subject, html, attachments });
    return;
  }
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

async function sendViaResend({ to, subject, html, attachments }) {
  const payload = {
    from: RESEND_FROM,
    to,
    subject,
    html,
  };
  const attList = attachments.map(mapAttachmentForResend).filter(Boolean);
  if (attList.length) {
    payload.attachments = attList;
  }
  await requestResend(payload);
}

const mapAttachmentForResend = (attachment) => {
  if (!attachment) return null;
  let buffer = null;
  if (attachment.content) {
    buffer = Buffer.isBuffer(attachment.content)
      ? attachment.content
      : Buffer.from(attachment.content);
  } else if (attachment.path) {
    try {
      buffer = fs.readFileSync(attachment.path);
    } catch {
      return null;
    }
  }
  if (!buffer) return null;
  return {
    filename: attachment.filename || "attachment",
    content: buffer.toString("base64"),
    contentType: attachment.contentType || "application/octet-stream",
  };
};

function buildAssetUrl(relativePath = "") {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  if (!assetBaseUrl) return relativePath;
  return `${assetBaseUrl.replace(/\/$/, "")}/${relativePath.replace(/^\//, "")}`;
}

function getLogoDataUri() {
  if (process.env.EMAIL_LOGO_URL) {
    return process.env.EMAIL_LOGO_URL.trim();
  }
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

function requestResend(payload) {
  return new Promise((resolve, reject) => {
    if (!RESEND_API_KEY || !payload.from) {
      return reject(new Error("Resend is not configured"));
    }
    const body = JSON.stringify(payload);
    const url = new URL(RESEND_ENDPOINT);
    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(
              new Error(
                `Resend API error ${res.statusCode}: ${responseBody}`
              )
            );
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  sendEmail,
  buildAssetUrl,
  getLogoDataUri,
};
