"use strict";

const nodemailer = require("nodemailer");

function getSmtpConfig(db) {
  return {
    host:      db.getSetting("smtp_host", ""),
    port:      parseInt(db.getSetting("smtp_port", "587"), 10) || 587,
    security:  db.getSetting("smtp_security", "STARTTLS"),
    user:      db.getSetting("smtp_user", ""),
    pass:      db.getSetting("smtp_pass", ""),
    fromName:  db.getSetting("smtp_from_name", ""),
    fromEmail: db.getSetting("smtp_from_email", ""),
  };
}

function createTransport(cfg) {
  const secure = cfg.security === "SSL";
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure,
    requireTLS: cfg.security === "STARTTLS",
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
}

function isConfigured(cfg) {
  return !!(cfg.host && cfg.user && cfg.pass && cfg.fromEmail);
}

async function testConnection(db) {
  const cfg = getSmtpConfig(db);
  if (!isConfigured(cfg)) return { ok: false, error: "Configuración SMTP incompleta." };
  try {
    await createTransport(cfg).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function resolveLogoUrl(logoPath, baseUrl) {
  if (!logoPath) return "";
  if (/^https?:\/\//i.test(logoPath)) return logoPath;
  return baseUrl ? baseUrl.replace(/\/$/, "") + "/" + logoPath.replace(/^\//, "") : "";
}

function buildEmailHtml({ siteName, siteLogo, baseUrl, subject, body, colorFrom, colorTo }) {
  const absLogo = resolveLogoUrl(siteLogo, baseUrl);
  const from = colorFrom || "#4c1d95";
  const to   = colorTo   || "#7c3aed";

  const logoHtml = absLogo
    ? `<img src="${absLogo}" alt="${siteName}" style="max-height:56px;max-width:200px;object-fit:contain;display:block;margin:0 auto;">`
    : `<span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:.06em;">${siteName}</span>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:36px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
      style="max-width:600px;width:100%;background:#101426;border-radius:20px;overflow:hidden;border:1px solid rgba(139,92,246,.25);">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,${from},${to});padding:28px 32px;text-align:center;border-bottom:2px solid rgba(255,255,255,.08);">
          ${logoHtml}
        </td>
      </tr>

      <!-- Subject -->
      <tr>
        <td style="padding:28px 32px 10px;">
          <h2 style="margin:0;font-size:20px;font-weight:900;color:#e9f2ff;line-height:1.3;">${subject}</h2>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:10px 32px 30px;color:#b0bcd4;font-size:15px;line-height:1.75;">
          ${body}
        </td>
      </tr>

      <!-- Divider -->
      <tr>
        <td style="padding:0 32px;"><hr style="border:none;border-top:1px solid rgba(139,92,246,.15);margin:0;"></td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:18px 32px;text-align:center;">
          <p style="margin:0;color:#4b5563;font-size:12px;">
            Este correo fue enviado por
            <a href="${baseUrl}" style="color:#a78bfa;font-weight:700;text-decoration:none;">${siteName}</a>.
            Si no lo solicitaste, ignóralo.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function sendMail(db, { to, toName = "", subject, bodyHtml, baseUrl = "" }) {
  const cfg = getSmtpConfig(db);
  if (!isConfigured(cfg)) return { ok: false, error: "Configuración SMTP incompleta." };

  const siteName  = db.getSetting("site_name", "SKY ULTRA PLUS shop");
  const siteLogo  = db.getSetting("site_logo", "");
  const colorFrom = db.getSetting("mail_header_color_from", "#4c1d95");
  const colorTo   = db.getSetting("mail_header_color_to",   "#7c3aed");

  const html = buildEmailHtml({ siteName, siteLogo, baseUrl, subject, body: bodyHtml, colorFrom, colorTo });

  try {
    await createTransport(cfg).sendMail({
      from: `"${cfg.fromName || siteName}" <${cfg.fromEmail}>`,
      to:    toName ? `"${toName}" <${to}>` : to,
      subject,
      html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function logMail(db, { adminId, recipientEmail, recipientName, subject, status, errorMsg = "" }) {
  try {
    db.sqlite.prepare(
      "INSERT INTO mail_log (admin_id,recipient_email,recipient_name,subject,status,error_msg,sent_at) VALUES (?,?,?,?,?,?,?)"
    ).run(adminId || null, recipientEmail, recipientName || "", subject, status, errorMsg, new Date().toISOString());
  } catch {}
}

module.exports = { getSmtpConfig, isConfigured, testConnection, sendMail, logMail };
