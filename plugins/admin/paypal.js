"use strict";

const express = require("express");

const config = {
  key: "admin_paypal",
  name: "PayPal",
  icon: "ri-paypal-line",
  route: "/admin/paypal",
  area: "admin",
  category: "Sistema",
  permission: "admin",
  order: 30,
};

function h(ctx, v) { return ctx.layout.escapeHtml(v || ""); }
function reg(ctx) { return require("../../core/pluginLoader").registry(ctx.db); }

function page(ctx, req, res) {
  const g = (k, d = "") => ctx.db.getSetting(k, d);
  const apiEnabled = g("paypal_api_enabled", "0") === "1";
  const apiMode    = g("paypal_api_mode", "sandbox");
  const apiClient  = g("paypal_api_client_id", "");
  const apiSecret  = g("paypal_api_secret", "");
  const ipnEnabled = g("paypal_ipn_enabled", "0") === "1";
  const ipnEmail   = g("paypal_ipn_email", "");

  const baseUrl = (req.headers["x-forwarded-proto"] ? req.headers["x-forwarded-proto"].split(",")[0] : req.protocol) + "://" + (req.headers["x-forwarded-host"] || req.get("host"));
  const ipnUrl  = `${baseUrl}/pay/paypal/ipn`;
  const returnUrl = `${baseUrl}/pay/paypal/return`;
  const cancelUrl = `${baseUrl}/pay/paypal/cancel`;

  const ok  = req.query.saved ? `<div class="notice success" style="margin:0 0 14px"><i class="ri-check-line"></i> Configuración guardada.</div>` : "";
  const err = req.query.error ? `<div class="notice error" style="margin:0 0 14px"><i class="ri-error-warning-line"></i> ${h(ctx, req.query.error)}</div>` : "";

  res.renderPage({
    title: "PayPal",
    area: "admin",
    registry: reg(ctx),
    content: `
<style>
  .pp-wrap{display:grid;grid-template-columns:1fr;gap:18px;max-width:1100px}
  .pp-card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:22px 22px 18px;box-shadow:0 18px 50px rgba(0,0,0,.18)}
  .pp-head{display:flex;align-items:center;gap:14px;margin-bottom:6px}
  .pp-head-icon{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#003087,#009cde);color:#fff;font-size:24px}
  .pp-head h2{margin:0;font-size:20px}
  .pp-head p{margin:2px 0 0;color:var(--muted);font-size:13px}
  .pp-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
  .pp-row .full{grid-column:1/-1}
  .pp-field{display:flex;flex-direction:column;gap:6px}
  .pp-field>span{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
  .pp-field input,.pp-field select{padding:11px 13px;border-radius:11px;border:1px solid var(--border);background:rgba(0,0,0,.18);color:var(--text);font-size:14px;font-family:inherit}
  .pp-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid var(--border);border-radius:14px;margin-top:10px;background:rgba(255,255,255,.02)}
  .pp-toggle .t-text b{display:block;font-size:14px;margin-bottom:2px}
  .pp-toggle .t-text small{color:var(--muted);font-size:12px}
  .pp-switch{position:relative;display:inline-block;width:46px;height:26px}
  .pp-switch input{display:none}
  .pp-switch em{position:absolute;inset:0;background:rgba(255,255,255,.16);border-radius:999px;transition:.2s}
  .pp-switch em:before{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:.2s}
  .pp-switch input:checked+em{background:#22c55e}
  .pp-switch input:checked+em:before{transform:translateX(20px)}
  .pp-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
  .pp-btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#003087,#009cde);color:#fff;border:0;padding:11px 18px;border-radius:11px;font-weight:700;cursor:pointer;font-size:14px}
  .pp-help{background:rgba(0,156,222,.08);border:1px solid rgba(0,156,222,.35);border-radius:14px;padding:16px 18px;font-size:13.5px;line-height:1.55}
  .pp-help h3{margin:0 0 8px;font-size:15px;color:#3ec5ff;display:flex;align-items:center;gap:8px}
  .pp-help ol{padding-left:20px;margin:6px 0}
  .pp-help li{margin:4px 0}
  .pp-help code{background:rgba(0,0,0,.35);padding:2px 7px;border-radius:6px;font-size:12.5px;color:#7dd3fc}
  .pp-url{font-family:ui-monospace,monospace;background:rgba(0,0,0,.35);padding:8px 12px;border-radius:9px;font-size:12.5px;color:#7dd3fc;word-break:break-all}
  @media (max-width:720px){.pp-row{grid-template-columns:1fr}}
</style>
<div class="page-head"><h1><i class="ri-paypal-line"></i> Configuración de PayPal</h1><p>Habilita pagos con PayPal. Puedes usar la API (recomendado) o IPN (solo correo).</p></div>
${ok}${err}

<div class="pp-wrap">

  <section class="pp-card">
    <div class="pp-help">
      <h3><i class="ri-information-line"></i> ¿Cómo funciona?</h3>
      <p>PayPal ofrece dos formas de cobrar en tu tienda. Puedes habilitar una o ambas:</p>
      <ul style="padding-left:20px;margin:6px 0">
        <li><b>API (REST)</b>: Captura los pagos automáticamente. Necesitas <code>Client ID</code> y <code>Secret</code> desde tu cuenta de desarrollador PayPal.</li>
        <li><b>IPN clásico</b>: Solo necesita tu correo de PayPal. PayPal te notifica cuando paga el cliente.</li>
      </ul>
      <p style="margin-top:10px"><b>URLs que debes configurar en PayPal:</b></p>
      <div style="display:grid;gap:6px;margin:8px 0">
        <div><b>IPN Notification URL:</b><div class="pp-url">${h(ctx, ipnUrl)}</div></div>
        <div><b>Return URL (API):</b><div class="pp-url">${h(ctx, returnUrl)}</div></div>
        <div><b>Cancel URL (API):</b><div class="pp-url">${h(ctx, cancelUrl)}</div></div>
      </div>
    </div>
  </section>

  <form class="pp-card" method="POST" action="/admin/paypal/save-api">
    <div class="pp-head">
      <div class="pp-head-icon"><i class="ri-key-2-line"></i></div>
      <div><h2>Opción 1 — API REST de PayPal</h2><p>Pagos automáticos con captura inmediata.</p></div>
    </div>

    <label class="pp-toggle">
      <div class="t-text"><b>Habilitar PayPal API</b><small>Activa esta opción para mostrar el botón "Pagar con PayPal" (API).</small></div>
      <label class="pp-switch"><input type="checkbox" name="paypal_api_enabled" value="1" ${apiEnabled ? "checked" : ""}><em></em></label>
    </label>

    <div class="pp-row">
      <label class="pp-field">
        <span>Modo</span>
        <select name="paypal_api_mode">
          <option value="sandbox" ${apiMode === "sandbox" ? "selected" : ""}>Sandbox (pruebas)</option>
          <option value="live" ${apiMode === "live" ? "selected" : ""}>Live (producción)</option>
        </select>
      </label>
      <label class="pp-field">
        <span>Client ID</span>
        <input type="text" name="paypal_api_client_id" value="${h(ctx, apiClient)}" placeholder="AYSq3RDGsmBLJE-otTkBtM..." autocomplete="off">
      </label>
      <label class="pp-field full">
        <span>Secret</span>
        <input type="text" name="paypal_api_secret" value="${h(ctx, apiSecret)}" placeholder="EGnHDxD_qRPdaLdHzjT5Rdc..." autocomplete="off">
      </label>
    </div>

    <div class="pp-help" style="margin-top:14px">
      <h3><i class="ri-guide-line"></i> Cómo obtener tus credenciales API</h3>
      <ol>
        <li>Inicia sesión en <a href="https://developer.paypal.com/dashboard/applications" target="_blank" rel="noopener">developer.paypal.com</a>.</li>
        <li>Ve a <b>Apps &amp; Credentials</b> y elige <b>Sandbox</b> o <b>Live</b>.</li>
        <li>Crea una app (REST API). Copia el <b>Client ID</b> y el <b>Secret</b> y pégalos arriba.</li>
        <li>En la configuración de tu app, agrega las URL <b>Return</b> y <b>Cancel</b> mostradas en la tarjeta superior.</li>
        <li>Guarda los cambios aquí y prueba con una factura pendiente.</li>
      </ol>
    </div>

    <div class="pp-actions">
      <button class="pp-btn" type="submit"><i class="ri-save-3-line"></i> Guardar API</button>
    </div>
  </form>

  <form class="pp-card" method="POST" action="/admin/paypal/save-ipn">
    <div class="pp-head">
      <div class="pp-head-icon" style="background:linear-gradient(135deg,#0070ba,#005ea6)"><i class="ri-mail-send-line"></i></div>
      <div><h2>Opción 2 — IPN clásico (solo correo PayPal)</h2><p>No requiere API, solo tu correo PayPal. PayPal te notifica cuando paga el cliente.</p></div>
    </div>

    <label class="pp-toggle">
      <div class="t-text"><b>Habilitar PayPal IPN</b><small>Activa esta opción para mostrar el botón "Pagar con PayPal (IPN)".</small></div>
      <label class="pp-switch"><input type="checkbox" name="paypal_ipn_enabled" value="1" ${ipnEnabled ? "checked" : ""}><em></em></label>
    </label>

    <div class="pp-row">
      <label class="pp-field full">
        <span>Correo de PayPal del comerciante</span>
        <input type="email" name="paypal_ipn_email" value="${h(ctx, ipnEmail)}" placeholder="tu-correo@paypal.com" autocomplete="off">
      </label>
    </div>

    <div class="pp-help" style="margin-top:14px">
      <h3><i class="ri-guide-line"></i> Cómo configurar IPN en PayPal</h3>
      <ol>
        <li>Entra a tu cuenta PayPal Business y ve a <b>Account Settings → Instant Payment Notifications</b>.</li>
        <li>Pega esta URL como <b>Notification URL</b>:<div class="pp-url" style="margin-top:6px">${h(ctx, ipnUrl)}</div></li>
        <li>Activa "Receive IPN messages (Enabled)" y guarda.</li>
        <li>El modo (Sandbox/Live) se toma de la sección <b>API</b> de arriba. Si solo usas IPN, configura ese mismo selector según tu cuenta.</li>
        <li>Guarda este formulario con tu correo de PayPal y prueba con una factura pendiente.</li>
      </ol>
    </div>

    <div class="pp-actions">
      <button class="pp-btn" type="submit" style="background:linear-gradient(135deg,#0070ba,#005ea6)"><i class="ri-save-3-line"></i> Guardar IPN</button>
    </div>
  </form>

</div>`
  });
}

function router(ctx) {
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);

  r.post("/save-api", (req, res) => {
    ctx.db.setSetting("paypal_api_enabled", req.body.paypal_api_enabled ? "1" : "0");
    ctx.db.setSetting("paypal_api_mode", String(req.body.paypal_api_mode || "sandbox") === "live" ? "live" : "sandbox");
    ctx.db.setSetting("paypal_api_client_id", String(req.body.paypal_api_client_id || "").trim());
    ctx.db.setSetting("paypal_api_secret", String(req.body.paypal_api_secret || "").trim());
    res.redirect("/admin/paypal?saved=1");
  });

  r.post("/save-ipn", (req, res) => {
    ctx.db.setSetting("paypal_ipn_enabled", req.body.paypal_ipn_enabled ? "1" : "0");
    ctx.db.setSetting("paypal_ipn_email", String(req.body.paypal_ipn_email || "").trim());
    res.redirect("/admin/paypal?saved=1");
  });

  r.get("/", (req, res) => page(ctx, req, res));
  return r;
}

module.exports = { config, router };
