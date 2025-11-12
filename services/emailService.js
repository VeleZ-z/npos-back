const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const config = require("../config/config");

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE =
  process.env.SMTP_SECURE != null
    ? String(process.env.SMTP_SECURE).toLowerCase() !== "false"
    : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || config.business.email;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_APP_PASS || "";
const DEFAULT_FROM =
  process.env.SMTP_FROM ||
  (SMTP_USER ? `${config.business.name} <${SMTP_USER}>` : config.business.email);
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
    console.warn(
      "[email] skipped: missing SMTP_USER/SMTP_PASS environment variables"
    );
    return;
  }

  const attList = attachments.map(mapAttachment).filter(Boolean);
  const message = {
    from: DEFAULT_FROM,
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
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
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
