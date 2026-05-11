"use strict";

const express = require("express");
const payments = require("../../core/payments");

const config = {
  key: "client_pay_stripe",
  name: "Pagar con Stripe",
  icon: "ri-bank-card-line",
  route: "/pay/stripe",
  area: "client",
  category: "Facturación",
  permission: "user",
  order: 200,
  showInMenu: false,
};

const MINIMUMS = { usd: 0.50, mxn: 10.00 };

let stripeCache = null;
let stripeCacheKey = "";
function getStripe(db) {
  const sk = db.getSetting("stripe_sk", "");
  if (!sk) return null;
  if (stripeCache && stripeCacheKey === sk) return stripeCache;
  stripeCache = require("stripe")(sk);
  stripeCacheKey = sk;
  return stripeCache;
}

function absoluteBase(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const host  = (req.headers["x-forwarded-host"] || req.headers.host || req.get("host") || "").split(",")[0].trim();
  return `${proto}://${host}`;
}
function escHtml(s) { return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function notAvailableHtml(method) {
  return `<!doctype html><meta charset="utf-8">
<div style="font-family:system-ui;max-width:680px;margin:32px auto;padding:20px;background:#111827;color:#e5e7eb;border-radius:14px">
  <h2 style="margin:0 0 8px">Este método aún no está disponible</h2>
  <p>El administrador no ha configurado <b>${escHtml(method)}</b>. Por favor usa otro método de pago.</p>
  <p><a href="/store" style="color:#a5b4fc">← Volver a la tienda</a></p>
</div>`;
}

async function startStripeCheckout(ctx, req, inv, p) {
  const cli = getStripe(ctx.db);
  if (!cli) throw new Error("Stripe no inicializado");
  const base = absoluteBase(req);
  const currency = String(inv.currency || "USD").toUpperCase();
  const curLower = currency.toLowerCase();
  const amount = Number(inv.total || 0);
  const session = await cli.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: curLower,
        product_data: { name: (p && p.name) || `Factura #${inv.number || inv.id}` },
        unit_amount: Math.round(amount * 100),
      },
      quantity: 1,
    }],
    allow_promotion_codes: false,
    metadata: { invoice_id: String(inv.id), product_id: String(p?.id || ""), user_id: String(inv.user_id) },
    payment_intent_data: {
      metadata: { invoice_id: String(inv.id), product_id: String(p?.id || ""), user_id: String(inv.user_id) }
    },
    success_url: `${base}/pay/stripe/return?invoice_id=${inv.id}`,
    cancel_url:  `${base}/invoices/${inv.id}?canceled=1`,
  });
  if (!session?.url) throw new Error("No se pudo obtener la URL de Stripe Checkout.");
  return session.url;
}

function router(ctx) {
  const r = express.Router();
  const payments = require("../../core/payments");

  /* ===== Compra directa desde la tienda con Stripe ===== */
  r.get("/buy", async (req, res) => {
    const en = ctx.db.getSetting("stripe_enabled", "0") === "1"
      && !!ctx.db.getSetting("stripe_pk", "")
      && !!ctx.db.getSetting("stripe_sk", "");
    if (!en) return res.status(400).type("html").send(notAvailableHtml("Stripe"));
    const pid = Number(req.query.product_id || 0);
    if (!pid) return res.status(400).send("Falta product_id");
    const out = payments.findOrCreatePendingInvoice(ctx.db, req.session.user.id, pid);
    if (!out.ok) return res.status(400).type("html").send(`<div style="font-family:system-ui;padding:20px">${escHtml(out.error)} <a href="/store/product/${pid}">Volver</a></div>`);
    if (!payments.productAcceptsProvider(out.product, "stripe")) return res.status(400).send("Este producto no acepta Stripe.");

    const currency = String(out.invoice.currency || "USD").toLowerCase();
    const min = MINIMUMS[currency] ?? 0.50;
    if (Number(out.invoice.total) < min) {
      return res.status(400).type("html").send(`<!doctype html><meta charset="utf-8">
        <div style="font-family:system-ui;max-width:680px;margin:32px auto;padding:16px">
          <h2 style="margin:0 0 8px">Importe demasiado bajo para Stripe</h2>
          <p>Stripe exige un mínimo de <b>${out.invoice.currency} ${min.toFixed(2)}</b>.</p>
          <p><a href="/invoices/${out.invoice.id}">← Volver a la factura</a></p>
        </div>`);
    }
    try {
      const url = await startStripeCheckout(ctx, req, out.invoice, out.product);
      return res.redirect(303, url);
    } catch (e) {
      console.error("[stripe] buy:", e);
      return res.status(500).send("Error: " + (e.message || e));
    }
  });

  /* ===== GET /pay/stripe?invoice_id=... — crea sesión de Checkout ===== */
  r.get("/", async (req, res) => {
    const en = ctx.db.getSetting("stripe_enabled", "0") === "1";
    const pk = ctx.db.getSetting("stripe_pk", "");
    const sk = ctx.db.getSetting("stripe_sk", "");
    if (!en || !pk || !sk) {
      return res.status(400).type("html").send(
        `<div style="font-family:system-ui;padding:18px"><h2>Stripe no está configurado</h2>
          <p>Ve a <b>Admin → Stripe</b> y guarda PK, SK y Webhook secret.</p></div>`
      );
    }

    const u = req.session.user;
    const base = absoluteBase(req);
    const invoiceId = Number(req.query.invoice_id || 0);
    if (!invoiceId) return res.status(400).type("text/plain").send("Falta invoice_id");

    const inv = ctx.db.sqlite.prepare(`
      SELECT i.*, it.name AS p_name, it.reference_id AS product_id
      FROM invoices i
      LEFT JOIN invoice_items it ON it.invoice_id=i.id AND it.item_type='product'
      WHERE i.id=? AND i.user_id=? AND i.status='pending'
      LIMIT 1
    `).get(invoiceId, u.id);
    if (!inv) return res.status(404).type("text/plain").send("Factura no encontrada o no pagable.");

    const product = inv.product_id ? ctx.db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(inv.product_id) : null;
    if (product && !payments.productAcceptsProvider(product, "stripe")) {
      return res.status(400).type("html").send(
        `<div style="font-family:system-ui;padding:18px"><h2>No disponible</h2><p>Este producto no acepta Stripe.</p>
         <p><a href="/invoices/${inv.id}">← Volver a la factura</a></p></div>`
      );
    }

    const currency = String(inv.currency || "USD").toUpperCase();
    const curLower = currency.toLowerCase();
    const amount = Number(inv.total || 0);
    const min = MINIMUMS[curLower] ?? 0.50;
    if (amount < min) {
      return res.type("html").send(`<!doctype html><meta charset="utf-8">
        <div style="font-family:system-ui;max-width:680px;margin:32px auto;padding:16px">
          <h2 style="margin:0 0 8px">Importe demasiado bajo para Stripe</h2>
          <p>Stripe exige un mínimo de <b>${currency} ${min.toFixed(2)}</b>.
          Esta factura es de <b>${currency} ${amount.toFixed(2)}</b>.</p>
          <p><a href="/invoices/${inv.id}">← Volver a la factura</a></p>
        </div>`);
    }

    try {
      const cli = getStripe(ctx.db);
      if (!cli) throw new Error("Stripe no inicializado");
      const session = await cli.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: curLower,
            product_data: { name: inv.p_name || `Factura #${inv.number || inv.id}` },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        allow_promotion_codes: false,
        metadata: {
          invoice_id: String(inv.id),
          product_id: String(inv.product_id || ""),
          user_id: String(u.id),
        },
        payment_intent_data: {
          metadata: {
            invoice_id: String(inv.id),
            product_id: String(inv.product_id || ""),
            user_id: String(u.id),
          }
        },
        success_url: `${base}/pay/stripe/return?invoice_id=${inv.id}`,
        cancel_url:  `${base}/invoices/${inv.id}?canceled=1`,
      });
      if (session?.url) return res.redirect(303, session.url);
      throw new Error("No se pudo obtener la URL de Stripe Checkout.");
    } catch (err) {
      const code   = err?.raw?.code || err?.code || "";
      const msg    = err?.raw?.message || err?.message || "Error creando sesión";
      const reqLog = err?.raw?.request_log_url || err?.request_log_url || "";
      console.error("[stripe] create-session error:", { code, msg, request_log_url: reqLog });

      return res.status(400).type("html").send(`<!doctype html><meta charset="utf-8">
        <div style="font-family:system-ui;max-width:680px;margin:32px auto;padding:16px">
          <h2 style="margin:0 0 8px">No se pudo iniciar el pago con Stripe</h2>
          <p style="color:#ef4444"><b>${escHtml(msg)}</b></p>
          ${reqLog ? `<p style="color:#6b7280">Log de Stripe: <a href="${escHtml(reqLog)}" target="_blank" rel="noopener">ver</a></p>` : ""}
          <p><a href="/invoices/${inv.id}">← Volver a la factura</a></p>
        </div>`);
    }
  });

  /* ===== success_url — el webhook ya hizo el trabajo, redirigimos ===== */
  r.get("/return", (req, res) => {
    const id = Number(req.query.invoice_id || 0);
    return res.redirect(id ? `/invoices/${id}?paid=1` : "/invoices");
  });

  return r;
}

/* ===== Webhook público — montado en index.js antes de auth, con body raw ===== */
function publicWebhookRouter(deps) {
  const { db } = deps;
  const r = express.Router();

  r.post("/", express.raw({ type: "application/json" }), (req, res) => {
    const whsec = db.getSetting("stripe_webhook_secret", "");
    if (!whsec) {
      console.warn("[stripe] webhook: sin whsec configurado");
      return res.status(200).send("OK");
    }
    const stripeLib = getStripe(db);
    if (!stripeLib) {
      console.warn("[stripe] webhook: sin SK configurado");
      return res.status(200).send("OK");
    }

    let event;
    try {
      event = stripeLib.webhooks.constructEvent(req.body, req.headers["stripe-signature"], whsec);
    } catch (err) {
      console.warn("[stripe] webhook verify error:", err?.message || err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
        const obj = event.data?.object || {};
        const md = obj.metadata || obj.payment_intent?.metadata || {};
        const invoiceId = Number(md.invoice_id || 0);
        if (invoiceId) {
          const inv = db.sqlite.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId);
          if (inv && inv.status === "pending") {
            const out = payments.finalizeExternalPayment(db, invoiceId, {
              provider: "stripe",
              providerRef: obj.id || "",
              amount: obj.amount_total ? Number(obj.amount_total) / 100 : Number(inv.total),
              currency: (obj.currency || inv.currency).toUpperCase(),
              rawJson: obj,
            });
            if (!out.ok) console.warn("[stripe] finalize error:", out.error);
            else console.log("[stripe] paid invoice=" + invoiceId);
          }
        }
      }
    } catch (e) {
      console.error("[stripe] webhook handler error:", e?.message || e);
    }
    return res.status(200).send("OK");
  });

  return r;
}

module.exports = { config, router, publicWebhookRouter };
