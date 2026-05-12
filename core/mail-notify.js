"use strict";

const mailer = require("./mailer");

function fmtMoney(n) { return Number(n || 0).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function isEventEnabled(db, event) {
  return db.getSetting(`mail_notify_${event}`, "0") === "1";
}

function siteUrl(db) {
  const manual = (db.getSetting("wa_site_url", "") || "").trim();
  if (manual) return manual.replace(/\/+$/, "");
  const detected = (db.getSetting("wa_detected_site_url", "") || "").trim();
  if (detected) return detected.replace(/\/+$/, "");
  const seed = (db.getSetting("site_url", "") || "").trim();
  if (seed) return seed.replace(/\/+$/, "");
  return "";
}

function escapeHtml(v = "") {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function buildSubject(siteName, event, payload) {
  const inv = payload.invoice?.number || "";
  const prodName = payload.product?.name || "";
  switch (event) {
    case "invoice_pending":   return `📩 Nueva factura ${inv} — ${siteName}`;
    case "invoice_paid":      return `✅ Pago confirmado ${inv} — ${siteName}`;
    case "invoice_suspended": return `⚠️ Factura suspendida ${inv} — ${siteName}`;
    case "invoice_canceled":  return `❌ Factura cancelada ${inv} — ${siteName}`;
    case "service_suspended": return `⚠️ Servicio suspendido${prodName ? ": " + prodName : ""} — ${siteName}`;
    case "service_canceled":  return `❌ Servicio cancelado${prodName ? ": " + prodName : ""} — ${siteName}`;
    default: return `Notificación — ${siteName}`;
  }
}

function detailRow(label, value) {
  return `<tr><td style="padding:8px 0;color:#8b93a8;font-size:13px;">${label}</td><td style="padding:8px 0;color:#e9f2ff;font-weight:700;text-align:right;">${value}</td></tr>`;
}

function buildBodyHtml(event, payload, url) {
  const u = payload.user || {};
  const inv = payload.invoice || {};
  const prod = payload.product || {};
  const greet = `Hola <strong>${escapeHtml(u.first_name || u.username || "cliente")}</strong>,`;
  const productName = escapeHtml(prod.name || "—");
  const invoiceLink = inv.id && url ? `${url}/invoices/${inv.id}` : "";

  const detailsBox = `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.22);border-radius:14px;padding:16px;margin:18px 0;">
      <tbody>
        ${prod.name ? detailRow("🛍️ Producto", `<span style="color:#c4b5fd">${productName}</span>`) : ""}
        ${inv.number ? detailRow("📄 Factura", escapeHtml(inv.number)) : ""}
        ${inv.total ? detailRow("💰 Monto", `${escapeHtml(inv.currency || "")} $${fmtMoney(inv.total)}`) : ""}
      </tbody>
    </table>`;

  const ctaLink = invoiceLink || url || "";
  const ctaBtn = (text, color) =>
    ctaLink
      ? `<div style="text-align:center;margin:24px 0 6px;"><a href="${escapeHtml(ctaLink)}" style="display:inline-block;background:linear-gradient(135deg,${color || "#4c1d95"},#7c3aed);color:#fff;padding:12px 28px;border-radius:11px;text-decoration:none;font-weight:800;font-size:14px;">${text}</a></div>`
      : "";

  switch (event) {
    case "invoice_pending":
      return `<p>${greet}</p>
<p>Tienes una nueva factura <strong>pendiente de pago</strong>.</p>
${detailsBox}
${ctaBtn("💳 Pagar ahora")}`;
    case "invoice_paid":
      return `<p>${greet}</p>
<p>Recibimos tu pago. ¡Gracias por tu compra!</p>
${detailsBox}
${ctaBtn("📄 Ver factura", "#059669")}`;
    case "invoice_suspended":
      return `<p>${greet}</p>
<p>Tu factura fue <strong>suspendida por falta de pago</strong>. Aún puedes pagarla para reactivar tu servicio.</p>
${detailsBox}
${ctaBtn("💳 Pagar y reactivar", "#d97706")}`;
    case "invoice_canceled":
      return `<p>${greet}</p>
<p>Tu factura fue <strong>cancelada</strong>. Si crees que es un error, contacta a soporte.</p>
${detailsBox}
${url ? `<div style="text-align:center;margin:24px 0 6px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:rgba(255,255,255,.08);color:#a78bfa;padding:12px 28px;border-radius:11px;text-decoration:none;font-weight:800;font-size:14px;border:1px solid rgba(139,92,246,.3);">Ir al inicio</a></div>` : ""}`;
    case "service_suspended":
      return `<p>${greet}</p>
<p>Tu servicio <strong>${productName}</strong> fue <strong>suspendido</strong> porque tienes una factura pendiente. Paga la factura para reactivar el servicio.</p>
${detailsBox}
${ctaBtn("💳 Pagar y reactivar", "#d97706")}`;
    case "service_canceled":
      return `<p>${greet}</p>
<p>Tu servicio <strong>${productName}</strong> fue <strong>cancelado</strong>. La información privada ya no está disponible desde tu cuenta.</p>
${detailsBox}
${url ? `<div style="text-align:center;margin:24px 0 6px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:rgba(255,255,255,.08);color:#a78bfa;padding:12px 28px;border-radius:11px;text-decoration:none;font-weight:800;font-size:14px;border:1px solid rgba(139,92,246,.3);">Ir al inicio</a></div>` : ""}`;
    default:
      return `<p>${greet}</p><p>Notificación de tu cuenta.</p>${detailsBox}`;
  }
}

async function notify(db, event, payload = {}) {
  try {
    if (!isEventEnabled(db, event)) return { ok: false, skipped: true };
    if (!payload.user || !payload.user.email) return { ok: false, error: "Sin email destinatario." };
    const cfg = mailer.getSmtpConfig(db);
    if (!mailer.isConfigured(cfg)) return { ok: false, error: "SMTP no configurado." };

    const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
    const url = siteUrl(db);
    const subject = buildSubject(siteName, event, payload);
    const bodyHtml = buildBodyHtml(event, payload, url);
    const toName = `${payload.user.first_name || ""} ${payload.user.last_name || ""}`.trim() || payload.user.username || "";

    const result = await mailer.sendMail(db, {
      to: payload.user.email,
      toName,
      subject,
      bodyHtml,
      baseUrl: url,
    });

    try {
      mailer.logMail(db, {
        adminId: null,
        recipientEmail: payload.user.email,
        recipientName: toName,
        subject,
        status: result.ok ? "sent" : "failed",
        errorMsg: result.ok ? "" : (result.error || ""),
      });
    } catch (_) {}
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function notifyByInvoiceId(db, event, invoiceId) {
  try {
    if (!isEventEnabled(db, event)) return;
    const inv = db.sqlite.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId);
    if (!inv) return;
    const user = db.getUserById(inv.user_id);
    if (!user) return;
    const item =
      db.sqlite.prepare("SELECT * FROM invoice_items WHERE invoice_id=? AND item_type='product' LIMIT 1").get(invoiceId) ||
      db.sqlite.prepare("SELECT * FROM invoice_items WHERE invoice_id=? LIMIT 1").get(invoiceId);
    let product = null;
    if (item && item.reference_id) {
      product = db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(item.reference_id);
    }
    if (!product) product = { name: item?.name || "—" };
    notify(db, event, { user, invoice: inv, product }).catch(() => {});
  } catch (_) {}
}

function notifyByServiceId(db, event, serviceId, triggerInvoiceId = null) {
  try {
    if (!isEventEnabled(db, event)) return;
    const svc = db.sqlite.prepare("SELECT * FROM services WHERE id=?").get(serviceId);
    if (!svc) return;
    const user = db.getUserById(svc.user_id);
    if (!user) return;
    const product = db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(svc.product_id) || { name: "—" };
    let invoice = null;
    if (triggerInvoiceId) invoice = db.sqlite.prepare("SELECT * FROM invoices WHERE id=?").get(triggerInvoiceId);
    if (!invoice && svc.invoice_id) invoice = db.sqlite.prepare("SELECT * FROM invoices WHERE id=?").get(svc.invoice_id);
    notify(db, event, { user, invoice, product, service: svc }).catch(() => {});
  } catch (_) {}
}

module.exports = { notify, notifyByInvoiceId, notifyByServiceId, isEventEnabled };
