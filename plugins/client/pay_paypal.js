"use strict";

const express = require("express");
const payments = require("../../core/payments");

const config = {
  key: "client_pay_paypal",
  name: "Pagar con PayPal",
  icon: "ri-paypal-line",
  route: "/pay/paypal",
  area: "client",
  category: "Facturación",
  permission: "user",
  order: 199,
  showInMenu: false,
};

function get(ctx, k, d = "") { return ctx.db.getSetting(k, d); }
function enabled(ctx, k) { return String(get(ctx, k, "0")) === "1"; }
function isLive(ctx) { return get(ctx, "paypal_api_mode", "sandbox") === "live"; }
function apiRoot(ctx) {
  return isLive(ctx) ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}
function baseUrl(req, db) {
  // 1) saved override
  try {
    if (db) {
      const saved = String(db.getSetting("public_base_url", "") || "").trim().replace(/\/+$/, "");
      if (saved && !/localhost|127\.0\.0\.1/.test(saved)) return saved;
    }
  } catch {}
  // 2) request-derived
  const proto = (req.headers["x-forwarded-proto"] || "").split(",")[0] || (req.secure ? "https" : "http") || req.protocol;
  const host  = req.headers["x-forwarded-host"] || req.headers.host || req.get("host");
  return `${proto}://${host}`;
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function getAccessToken(ctx) {
  const cid = get(ctx, "paypal_api_client_id", "");
  const sec = get(ctx, "paypal_api_secret", "");
  if (!cid || !sec) throw new Error("Falta Client ID / Secret de PayPal.");
  const r = await fetch(apiRoot(ctx) + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(cid + ":" + sec).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("OAuth PayPal " + r.status);
  const j = await r.json();
  return j.access_token;
}

function loadInvoice(ctx, invoiceId, userId) {
  return ctx.db.sqlite.prepare("SELECT * FROM invoices WHERE id=? AND user_id=?").get(invoiceId, userId);
}

function invoiceProduct(ctx, invoice) {
  const item = ctx.db.sqlite.prepare(
    "SELECT * FROM invoice_items WHERE invoice_id=? AND item_type='product' LIMIT 1"
  ).get(invoice.id);
  return item ? ctx.db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(item.reference_id) : null;
}

function ctxBase(ctx, req) { return baseUrl(req, ctx.db); }

async function startPaypalApiCheckout(ctx, req, inv, p) {
  const access = await getAccessToken(ctx);
  const site = get(ctx, "site_name", "SkyShop");
  const orderBody = {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: "inv-" + inv.id,
      custom_id: String(inv.id),
      invoice_id: (inv.number || ("INV-" + inv.id)) + "-" + Date.now(),
      description: (p && p.name) || ("Factura " + (inv.number || inv.id)),
      amount: { currency_code: inv.currency, value: Number(inv.total).toFixed(2) },
    }],
    application_context: {
      brand_name: String(site).slice(0, 127),
      user_action: "PAY_NOW",
      return_url: ctxBase(ctx, req) + `/pay/paypal/return?invoice_id=${inv.id}`,
      cancel_url: ctxBase(ctx, req) + `/pay/paypal/cancel?invoice_id=${inv.id}`,
    },
  };
  const rsp = await fetch(apiRoot(ctx) + "/v2/checkout/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + access },
    body: JSON.stringify(orderBody),
  });
  const data = await rsp.json();
  if (!rsp.ok) throw new Error("No se pudo crear la orden PayPal: " + (data.message || rsp.status));
  const approve = (data.links || []).find(l => l.rel === "approve")?.href;
  if (!approve) throw new Error("Respuesta PayPal sin link de aprobación.");
  return approve;
}

function buildIpnForm(ctx, req, inv, p) {
  const email = get(ctx, "paypal_ipn_email", "");
  const webscr = isLive(ctx)
    ? "https://www.paypal.com/cgi-bin/webscr"
    : "https://www.sandbox.paypal.com/cgi-bin/webscr";
  const retOk     = ctxBase(ctx, req) + `/pay/paypal/ok?invoice_id=${inv.id}`;
  const retCancel = ctxBase(ctx, req) + `/pay/paypal/cancel_ipn?invoice_id=${inv.id}`;
  const notify    = ctxBase(ctx, req) + `/pay/paypal/ipn`;
  const itemName  = (p && p.name) || ("Factura " + (inv.number || inv.id));

  return `<!doctype html>
<meta charset="utf-8">
<title>Redirigiendo a PayPal…</title>
<p style="font-family:system-ui;padding:20px">Redirigiendo a PayPal…</p>
<form id="f" method="post" action="${webscr}">
  <input type="hidden" name="cmd" value="_xclick">
  <input type="hidden" name="business" value="${esc(email)}">
  <input type="hidden" name="item_name" value="${esc(itemName)}">
  <input type="hidden" name="amount" value="${Number(inv.total).toFixed(2)}">
  <input type="hidden" name="currency_code" value="${esc(inv.currency)}">
  <input type="hidden" name="invoice" value="${esc(inv.number || ("INV-" + inv.id))}">
  <input type="hidden" name="custom" value="${inv.id}">
  <input type="hidden" name="notify_url" value="${esc(notify)}">
  <input type="hidden" name="return" value="${esc(retOk)}">
  <input type="hidden" name="cancel_return" value="${esc(retCancel)}">
  <input type="hidden" name="no_shipping" value="1">
  <input type="hidden" name="rm" value="2">
</form>
<script>document.getElementById('f').submit()</script>`;
}

function notAvailableHtml(method) {
  return `<!doctype html><meta charset="utf-8">
<div style="font-family:system-ui;max-width:680px;margin:32px auto;padding:20px;background:#111827;color:#e5e7eb;border-radius:14px">
  <h2 style="margin:0 0 8px">Este método aún no está disponible</h2>
  <p>El administrador no ha configurado <b>${esc(method)}</b>. Por favor usa otro método de pago.</p>
  <p><a href="/store" style="color:#a5b4fc">← Volver a la tienda</a></p>
</div>`;
}

function router(ctx) {
  const r = express.Router();

  /* ===== Compra directa desde la tienda con PayPal API ===== */
  r.post("/buy", async (req, res) => {
    try {
      if (!enabled(ctx, "paypal_api_enabled")) return res.status(400).type("html").send(notAvailableHtml("PayPal"));
      const pid = Number(req.body.product_id || 0);
      if (!pid) return res.status(400).send("Falta product_id");
      const out = payments.findOrCreatePendingInvoice(ctx.db, req.session.user.id, pid);
      if (!out.ok) return res.status(400).type("html").send(`<div style="font-family:system-ui;padding:20px">${esc(out.error)} <a href="/store/product/${pid}">Volver</a></div>`);
      if (!payments.productAcceptsProvider(out.product, "paypal")) return res.status(400).send("Este producto no acepta PayPal.");
      const url = await startPaypalApiCheckout(ctx, req, out.invoice, out.product);
      return res.redirect(302, url);
    } catch (e) {
      console.error("[paypal] buy:", e);
      return res.status(500).send("Error: " + e.message);
    }
  });

  /* ===== Compra directa con PayPal IPN ===== */
  r.post("/buy-ipn", (req, res) => {
    try {
      if (!enabled(ctx, "paypal_ipn_enabled")) return res.status(400).type("html").send(notAvailableHtml("PayPal IPN"));
      const email = get(ctx, "paypal_ipn_email", "");
      if (!email) return res.status(400).type("html").send(notAvailableHtml("PayPal IPN (falta correo)"));
      const pid = Number(req.body.product_id || 0);
      if (!pid) return res.status(400).send("Falta product_id");
      const out = payments.findOrCreatePendingInvoice(ctx.db, req.session.user.id, pid);
      if (!out.ok) return res.status(400).type("html").send(`<div style="font-family:system-ui;padding:20px">${esc(out.error)} <a href="/store/product/${pid}">Volver</a></div>`);
      if (!payments.productAcceptsProvider(out.product, "paypal")) return res.status(400).send("Este producto no acepta PayPal.");
      return res.type("html").send(buildIpnForm(ctx, req, out.invoice, out.product));
    } catch (e) {
      console.error("[paypal] buy-ipn:", e);
      return res.status(500).send("Error: " + e.message);
    }
  });

  /* ===== API Checkout: create order from existing invoice ===== */
  r.post("/api/create", async (req, res) => {
    try {
      if (!enabled(ctx, "paypal_api_enabled")) return res.status(400).type("html").send(notAvailableHtml("PayPal"));
      const u = req.session.user;
      const invoice_id = Number(req.body.invoice_id || 0);
      if (!invoice_id) return res.status(400).send("Falta invoice_id");
      const inv = loadInvoice(ctx, invoice_id, u.id);
      if (!inv) return res.status(404).send("Factura no encontrada.");
      if (String(inv.status).toLowerCase() === "paid") return res.redirect(`/invoices/${invoice_id}?paid=1`);
      if (String(inv.status).toLowerCase() !== "pending") return res.status(400).send("Factura no disponible para pago.");

      const p = invoiceProduct(ctx, inv);
      if (!p) return res.status(400).send("Producto inválido.");
      if (!payments.productAcceptsProvider(p, "paypal")) return res.status(400).send("Este producto no acepta PayPal.");

      const url = await startPaypalApiCheckout(ctx, req, inv, p);
      return res.redirect(302, url);
    } catch (e) {
      console.error("[paypal] create:", e);
      return res.status(500).send("Error: " + e.message);
    }
  });

  /* ===== API Return (capture) ===== */
  r.get("/return", async (req, res) => {
    const u = req.session.user;
    const invoice_id = Number(req.query.invoice_id || 0);
    const token = String(req.query.token || "");
    if (!invoice_id || !token) return res.status(400).send("Faltan parámetros.");
    try {
      if (!enabled(ctx, "paypal_api_enabled")) return res.status(400).send("PayPal API deshabilitado.");
      const inv = loadInvoice(ctx, invoice_id, u.id);
      if (!inv) return res.status(404).send("Factura no encontrada.");
      if (String(inv.status).toLowerCase() === "paid") return res.redirect(`/invoices/${invoice_id}?paid=1`);

      const access = await getAccessToken(ctx);
      const cap = await fetch(apiRoot(ctx) + `/v2/checkout/orders/${token}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + access },
      });
      const data = await cap.json();
      if (!cap.ok) { console.error("[paypal] capture:", data); return res.status(500).send("No se pudo capturar el pago."); }
      const status = data.status;
      const pu = (data.purchase_units && data.purchase_units[0]) || {};
      const amt = pu.payments?.captures?.[0]?.amount || pu.amount || {};
      const value = Number(amt.value || 0);
      const curr = amt.currency_code || inv.currency;
      if (status !== "COMPLETED") return res.status(400).send("Pago no completado en PayPal.");

      const out = payments.finalizeExternalPayment(ctx.db, invoice_id, {
        provider: "paypal",
        providerRef: data.id || token,
        amount: value,
        currency: curr,
        rawJson: data,
      });
      if (!out.ok) return res.status(400).send(out.error || "Error al confirmar el pago.");
      return res.redirect(`/invoices/${invoice_id}?paid=1`);
    } catch (e) {
      console.error("[paypal] return:", e);
      return res.status(500).send("Error: " + e.message);
    }
  });

  /* ===== API Cancel ===== */
  r.get("/cancel", (req, res) => {
    const id = Number(req.query.invoice_id || 0);
    return res.redirect(id ? `/invoices/${id}?canceled=1` : "/invoices");
  });

  /* ===== IPN Checkout (button) — builds the auto-submit form to PayPal classic ===== */
  r.post("/ipn/checkout", (req, res) => {
    if (!enabled(ctx, "paypal_ipn_enabled")) return res.status(400).type("html").send(notAvailableHtml("PayPal IPN"));
    const email = get(ctx, "paypal_ipn_email", "");
    if (!email) return res.status(400).type("html").send(notAvailableHtml("PayPal IPN (falta correo)"));
    const u = req.session.user;
    const invoice_id = Number(req.body.invoice_id || 0);
    if (!invoice_id) return res.status(400).send("Falta invoice_id");
    const inv = loadInvoice(ctx, invoice_id, u.id);
    if (!inv) return res.status(404).send("Factura no encontrada.");
    if (String(inv.status).toLowerCase() === "paid") return res.redirect(`/invoices/${invoice_id}?paid=1`);

    const p = invoiceProduct(ctx, inv);
    if (p && !payments.productAcceptsProvider(p, "paypal")) return res.status(400).send("Este producto no acepta PayPal.");

    res.type("html").send(buildIpnForm(ctx, req, inv, p));
  });

  r.get("/ok", (req, res) => {
    const id = Number(req.query.invoice_id || 0);
    res.type("html").send(`<!doctype html>
<meta charset="utf-8">
<title>Gracias</title>
<body style="font-family:system-ui">
  <div style="max-width:680px;margin:30px auto;padding:20px;background:#fff;border-radius:14px;box-shadow:0 10px 35px rgba(0,0,0,.08)">
    <h2 style="margin:0 0 8px">Gracias. Estamos confirmando tu pago…</h2>
    <p>Factura #${id}. Cuando PayPal envíe la notificación IPN y se verifique, la factura se marcará como pagada y se entregará el producto.</p>
    <p><a href="/invoices/${id}">← Volver a la factura</a></p>
  </div>
</body>`);
  });

  r.get("/cancel_ipn", (req, res) => {
    const id = Number(req.query.invoice_id || 0);
    res.redirect(id ? `/invoices/${id}?canceled=1` : "/invoices");
  });

  return r;
}

/* ===== Public IPN listener — mounted in index.js BEFORE auth =====
 * PayPal POSTs here without a session. We must verify with PayPal and then
 * call the same finalize logic. */
function publicIPNRouter(deps) {
  const { db } = deps;
  const r = express.Router();
  const cget = (k, d = "") => db.getSetting(k, d);
  const isEnabled = () => String(cget("paypal_ipn_enabled", "0")) === "1";
  const live = () => cget("paypal_api_mode", "sandbox") === "live";

  r.post("/", express.urlencoded({ extended: false }), async (req, res) => {
    try {
      if (!isEnabled()) return res.status(200).end();

      const verifyUrl = live()
        ? "https://ipnpb.paypal.com/cgi-bin/webscr"
        : "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr";

      const params = new URLSearchParams(req.body);
      params.append("cmd", "_notify-validate");

      const vr = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const text = (await vr.text()).trim();
      if (text !== "VERIFIED") {
        console.warn("[paypal] IPN NOT VERIFIED:", text);
        return res.status(200).end();
      }

      const payment_status = String(req.body.payment_status || "");
      const receiver_email = String(req.body.receiver_email || req.body.business || "");
      const gross = String(req.body.mc_gross || req.body.gross_total || "");
      const currency = String(req.body.mc_currency || req.body.settle_currency || "");
      const custom = Number(req.body.custom || 0);
      const invoiceStr = String(req.body.invoice || "");
      const txn_id = String(req.body.txn_id || "");

      let inv = null;
      if (custom) inv = db.sqlite.prepare("SELECT * FROM invoices WHERE id=?").get(custom);
      if (!inv && invoiceStr) inv = db.sqlite.prepare("SELECT * FROM invoices WHERE number=?").get(invoiceStr);
      if (!inv) { console.warn("[paypal] IPN factura no encontrada", { custom, invoiceStr }); return res.status(200).end(); }

      const cfgEmail = cget("paypal_ipn_email", "");
      if (cfgEmail && receiver_email && cfgEmail.toLowerCase() !== receiver_email.toLowerCase()) {
        console.warn("[paypal] IPN receiver_email mismatch", { cfgEmail, receiver_email });
      }
      if (payment_status !== "Completed") { console.warn("[paypal] IPN not Completed:", payment_status); return res.status(200).end(); }

      const out = payments.finalizeExternalPayment(db, inv.id, {
        provider: "paypal_ipn",
        providerRef: txn_id,
        amount: Number(gross || 0),
        currency: currency || inv.currency,
        rawJson: req.body,
      });
      if (!out.ok) console.warn("[paypal] IPN finalize error:", out.error);
      else console.log("[paypal] IPN VERIFIED OK invoice=" + inv.id + " txn=" + txn_id);
      return res.status(200).end();
    } catch (e) {
      console.error("[paypal] IPN error:", e);
      return res.status(200).end();
    }
  });
  return r;
}

module.exports = { config, router, publicIPNRouter };
