"use strict";

const express = require("express");
const payments = require("../../core/payments");

const config = {
  key: "admin_stripe",
  name: "Stripe",
  icon: "ri-bank-card-line",
  route: "/admin/stripe",
  area: "admin",
  category: "Sistema",
  permission: "admin",
  order: 31,
};

function h(ctx, v) { return ctx.layout.escapeHtml(v || ""); }
function reg(ctx) { return require("../../core/pluginLoader").registry(ctx.db); }

function page(ctx, req, res) {
  const g = (k, d = "") => ctx.db.getSetting(k, d);
  const enabled  = g("stripe_enabled", "0") === "1";
  const pk       = g("stripe_pk", "");
  const sk       = g("stripe_sk", "");
  const whsec    = g("stripe_webhook_secret", "");

  const savedBase = String(ctx.db.getSetting("public_base_url", "") || "").trim().replace(/\/+$/, "");
  const baseUrl   = savedBase || payments.publicBaseUrl(ctx.db, req);
  const webhookUrl = `${baseUrl}/pay/stripe/webhook`;
  const isLocal   = /localhost|127\.0\.0\.1/.test(baseUrl);

  const ok  = req.query.saved ? `<div class="notice success" style="margin:0 0 14px"><i class="ri-check-line"></i> Configuración guardada.</div>` : "";
  const err = req.query.error ? `<div class="notice error" style="margin:0 0 14px"><i class="ri-error-warning-line"></i> ${h(ctx, req.query.error)}</div>` : "";

  res.renderPage({
    title: "Stripe",
    area: "admin",
    registry: reg(ctx),
    content: `
<style>
  .st-wrap{display:grid;grid-template-columns:1fr;gap:18px;max-width:1100px}
  .st-card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,.18)}
  .st-head{display:flex;align-items:center;gap:14px;margin-bottom:6px}
  .st-head-icon{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#635bff,#3b82f6);color:#fff;font-size:24px}
  .st-head h2{margin:0;font-size:20px}
  .st-head p{margin:2px 0 0;color:var(--muted);font-size:13px}
  .st-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
  .st-row .full{grid-column:1/-1}
  .st-field{display:flex;flex-direction:column;gap:6px}
  .st-field>span{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
  .st-field input{padding:11px 13px;border-radius:11px;border:1px solid var(--border);background:rgba(0,0,0,.18);color:var(--text);font-size:14px;font-family:inherit}
  .st-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid var(--border);border-radius:14px;margin-top:10px;background:rgba(255,255,255,.02)}
  .st-toggle .t-text b{display:block;font-size:14px;margin-bottom:2px}
  .st-toggle .t-text small{color:var(--muted);font-size:12px}
  .st-switch{position:relative;display:inline-block;width:46px;height:26px}
  .st-switch input{display:none}
  .st-switch em{position:absolute;inset:0;background:rgba(255,255,255,.16);border-radius:999px;transition:.2s}
  .st-switch em:before{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:.2s}
  .st-switch input:checked+em{background:#635bff}
  .st-switch input:checked+em:before{transform:translateX(20px)}
  .st-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
  .st-btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#635bff,#3b82f6);color:#fff;border:0;padding:11px 18px;border-radius:11px;font-weight:700;cursor:pointer;font-size:14px}
  .st-help{background:rgba(99,91,255,.08);border:1px solid rgba(99,91,255,.35);border-radius:14px;padding:16px 18px;font-size:13.5px;line-height:1.55}
  .st-help h3{margin:0 0 8px;font-size:15px;color:#a5b4fc;display:flex;align-items:center;gap:8px}
  .st-help ol{padding-left:20px;margin:6px 0}
  .st-help code{background:rgba(0,0,0,.35);padding:2px 7px;border-radius:6px;font-size:12.5px;color:#a5b4fc}
  .st-url{font-family:ui-monospace,monospace;background:rgba(0,0,0,.35);padding:8px 12px;border-radius:9px;font-size:12.5px;color:#a5b4fc;word-break:break-all}
  @media (max-width:720px){.st-row{grid-template-columns:1fr}}
</style>
<div class="page-head"><h1><i class="ri-bank-card-line"></i> Configuración de Stripe</h1><p>Habilita pagos con tarjeta vía Stripe Checkout.</p></div>
${ok}${err}

<div class="st-wrap">

  <form class="st-card" method="POST" action="/admin/paypal/save-base-url">
    <div class="st-head">
      <div class="st-head-icon" style="background:linear-gradient(135deg,#16a34a,#22c55e)"><i class="ri-link"></i></div>
      <div><h2>URL pública de tu tienda</h2><p>Esta URL la comparten PayPal y Stripe. Si no se autodetecta, configúrala manualmente abajo.</p></div>
    </div>
    <div class="st-help" style="margin-top:6px">
      <p>Tu URL pública actual es:</p>
      <div class="st-url" style="font-size:14px;font-weight:700;color:#a5b4fc">${h(ctx, baseUrl || "(no detectada)")}</div>
      ${isLocal ? `<p style="color:#f59e0b;margin-top:8px"><i class="ri-error-warning-line"></i> Esta URL es local. Stripe NO podrá conectarse a ella. Configura una URL pública (HTTPS) abajo, o visita tu sitio por su dominio real al menos una vez para autodetectarla.</p>` : ""}
      <p style="margin-top:8px"><b>URL del webhook que debes pegar en Stripe:</b></p>
      <div class="st-url">${h(ctx, webhookUrl)}</div>
    </div>
    <div class="st-row">
      <label class="st-field full">
        <span>URL pública (déjala vacía para autodetectar)</span>
        <input type="text" name="public_base_url" value="${h(ctx, savedBase)}" placeholder="https://tu-dominio.com">
      </label>
    </div>
    <div class="st-actions">
      <button class="st-btn" type="submit" style="background:linear-gradient(135deg,#16a34a,#22c55e)"><i class="ri-save-3-line"></i> Guardar URL pública</button>
    </div>
  </form>

  <section class="st-card">
    <div class="st-help">
      <h3><i class="ri-information-line"></i> ¿Cómo funciona?</h3>
      <p>Cuando un usuario paga una factura con Stripe, lo redirigimos a la página segura de <b>Stripe Checkout</b>. Al confirmarse el pago, Stripe envía un evento al webhook que registra la factura como pagada y entrega el producto automáticamente.</p>
    </div>
  </section>

  <form class="st-card" method="POST" action="/admin/stripe/save">
    <div class="st-head">
      <div class="st-head-icon"><i class="ri-key-2-line"></i></div>
      <div><h2>Credenciales de Stripe</h2><p>Pega tus claves desde el panel de Stripe.</p></div>
    </div>

    <label class="st-toggle">
      <div class="t-text"><b>Habilitar Stripe</b><small>Activa esta opción para mostrar el botón "Pagar con Stripe".</small></div>
      <label class="st-switch"><input type="checkbox" name="stripe_enabled" value="1" ${enabled ? "checked" : ""}><em></em></label>
    </label>

    <div class="st-row">
      <label class="st-field full">
        <span>Publishable Key (pk_…)</span>
        <input type="text" name="stripe_pk" value="${h(ctx, pk)}" placeholder="pk_live_... o pk_test_..." autocomplete="off">
      </label>
      <label class="st-field full">
        <span>Secret Key (sk_…)</span>
        <input type="text" name="stripe_sk" value="${h(ctx, sk)}" placeholder="sk_live_... o sk_test_..." autocomplete="off">
      </label>
      <label class="st-field full">
        <span>Webhook Signing Secret (whsec_…)</span>
        <input type="text" name="stripe_webhook_secret" value="${h(ctx, whsec)}" placeholder="whsec_..." autocomplete="off">
      </label>
    </div>

    <div class="st-help" style="margin-top:14px">
      <h3><i class="ri-guide-line"></i> Cómo obtener tus credenciales</h3>
      <ol>
        <li>Entra a <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener">dashboard.stripe.com/apikeys</a> y copia tu <b>Publishable key</b> y <b>Secret key</b>.</li>
        <li>Pégalas arriba (usa <code>test_*</code> para pruebas y <code>live_*</code> para producción).</li>
        <li>Ve a <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener">dashboard.stripe.com/webhooks</a> y crea un nuevo endpoint con esta URL:
          <div class="st-url" style="margin-top:6px">${h(ctx, webhookUrl)}</div>
        </li>
        <li>Selecciona los eventos: <code>checkout.session.completed</code> y <code>payment_intent.succeeded</code>.</li>
        <li>Una vez creado, abre el webhook y copia el <b>Signing secret</b> (empieza por <code>whsec_</code>) y pégalo arriba.</li>
        <li>Guarda esta configuración. Stripe exige un mínimo de <b>USD 0.50</b> / <b>MXN 10.00</b> por cobro.</li>
      </ol>
    </div>

    <div class="st-actions">
      <button class="st-btn" type="submit"><i class="ri-save-3-line"></i> Guardar configuración</button>
    </div>
  </form>

</div>`
  });
}

function router(ctx) {
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);

  r.post("/save", (req, res) => {
    ctx.db.setSetting("stripe_enabled", req.body.stripe_enabled ? "1" : "0");
    ctx.db.setSetting("stripe_pk", String(req.body.stripe_pk || "").trim());
    ctx.db.setSetting("stripe_sk", String(req.body.stripe_sk || "").trim());
    ctx.db.setSetting("stripe_webhook_secret", String(req.body.stripe_webhook_secret || "").trim());
    res.redirect("/admin/stripe?saved=1");
  });

  r.get("/", (req, res) => page(ctx, req, res));
  return r;
}

module.exports = { config, router };
