"use strict";
const express = require("express");
const wa = require("../../core/wa");

const config = {
  key: "admin_whatsapp_bot",
  name: "WhatsApp Bot",
  icon: "ri-whatsapp-line",
  route: "/admin/whatsapp-bot",
  area: "admin",
  category: "Sistema",
  permission: "admin",
  order: 20,
};

const DEF = {
  wa_bot_enabled: "0",
  wa_bot_phone: "",
  wa_admin_phone: "",
  wa_site_url: "",
  wa_notify_invoice_pending: "1",
  wa_notify_invoice_paid: "1",
  wa_notify_invoice_suspended: "1",
  wa_notify_invoice_canceled: "1",
  wa_notify_service_suspended: "1",
  wa_notify_service_canceled: "1",
};

function h(ctx, v) { return ctx.layout.escapeHtml(v == null ? "" : v); }
function reg(ctx) { return require("../../core/pluginLoader").registry(ctx.db); }
function g(db, k) { return db.getSetting(k, DEF[k] || ""); }

function digits(s) { return String(s || "").replace(/\D/g, ""); }

function statusBadge(state) {
  const map = {
    disconnected: ["Desconectado", "rgba(148,163,184,.18)", "#cbd5e1", "ri-link-unlink"],
    starting:     ["Iniciando…",   "rgba(245,158,11,.18)", "#fbbf24", "ri-loader-4-line"],
    pairing:      ["Esperando vinculación", "rgba(245,158,11,.18)", "#fbbf24", "ri-key-2-line"],
    connected:    ["Conectado",    "rgba(34,197,94,.18)",  "#4ade80", "ri-checkbox-circle-line"],
    error:        ["Error",        "rgba(239,68,68,.18)",  "#fca5a5", "ri-error-warning-line"],
  };
  const [label, bg, color, icon] = map[state] || ["Desconocido", "rgba(148,163,184,.18)", "#cbd5e1", "ri-question-line"];
  return `<span class="wa-pill" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-weight:800;font-size:12px;background:${bg};color:${color};letter-spacing:.04em;text-transform:uppercase"><i class="${icon}"></i> ${label}</span>`;
}

function selectRow(ctx, k, title, desc, icon, opts) {
  const sel = g(ctx.db, k);
  return `<div class="appr-row">
    <span class="appr-row-icon"><i class="${icon}"></i></span>
    <div class="appr-row-text"><b>${title}</b><small>${desc}</small></div>
    <div class="appr-row-control">
      <span class="appr-select"><select name="${k}">${opts.map(o => `<option value="${o[0]}" ${sel === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></span>
    </div>
  </div>`;
}

function toggleRow(name, title, desc, icon, checked) {
  return `<div class="appr-row">
    <span class="appr-row-icon"><i class="${icon}"></i></span>
    <div class="appr-row-text"><b>${title}</b><small>${desc}</small></div>
    <div class="appr-row-control">
      <label class="appr-toggle"><input type="checkbox" name="${name}" value="1" ${checked ? "checked" : ""}><em></em></label>
    </div>
  </div>`;
}

function inputRow(ctx, name, title, desc, icon, placeholder) {
  const val = h(ctx, g(ctx.db, name));
  return `<div class="appr-row">
    <span class="appr-row-icon"><i class="${icon}"></i></span>
    <div class="appr-row-text"><b>${title}</b><small>${desc}</small></div>
    <div class="appr-row-control">
      <input class="wa-input" type="text" name="${name}" value="${val}" placeholder="${h(ctx, placeholder || "")}">
    </div>
  </div>`;
}

function router(ctx) {
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);

  for (const [k, v] of Object.entries(DEF)) if (!ctx.db.getSetting(k, "")) ctx.db.setSetting(k, v);

  // Guardar configuración
  r.post("/save", (req, res) => {
    ctx.db.setSetting("wa_bot_enabled", req.body.wa_bot_enabled === "1" ? "1" : "0");
    if (req.body.wa_bot_phone !== undefined)   ctx.db.setSetting("wa_bot_phone",   digits(req.body.wa_bot_phone));
    if (req.body.wa_admin_phone !== undefined) ctx.db.setSetting("wa_admin_phone", digits(req.body.wa_admin_phone));
    if (req.body.wa_site_url !== undefined)    ctx.db.setSetting("wa_site_url",    String(req.body.wa_site_url || "").trim());
    for (const ev of ["invoice_pending","invoice_paid","invoice_suspended","invoice_canceled","service_suspended","service_canceled"]) {
      ctx.db.setSetting(`wa_notify_${ev}`, req.body[`wa_notify_${ev}`] === "1" ? "1" : "0");
    }
    res.redirect("/admin/whatsapp-bot?saved=1");
  });

  // Conectar / solicitar código de emparejamiento
  r.post("/connect", async (req, res) => {
    const phone = digits(req.body.wa_bot_phone || g(ctx.db, "wa_bot_phone"));
    if (phone) ctx.db.setSetting("wa_bot_phone", phone);
    if (!phone) return res.redirect("/admin/whatsapp-bot?error=" + encodeURIComponent("Pon primero el número del bot."));
    // Aseguramos que el bot quede habilitado al conectar
    ctx.db.setSetting("wa_bot_enabled", "1");
    const out = await wa.start(ctx.db, { phoneNumber: phone });
    if (!out.ok) return res.redirect("/admin/whatsapp-bot?error=" + encodeURIComponent(out.error));
    res.redirect("/admin/whatsapp-bot?pairing=1");
  });

  // Desconectar (mantiene credenciales en disco)
  r.post("/disconnect", async (req, res) => {
    await wa.stop();
    res.redirect("/admin/whatsapp-bot?disconnected=1");
  });

  // Borrar carpeta de sesión y poder vincular un nuevo número
  r.post("/reset", async (req, res) => {
    const out = await wa.resetSession(ctx.db);
    if (!out.ok) return res.redirect("/admin/whatsapp-bot?error=" + encodeURIComponent(out.error));
    res.redirect("/admin/whatsapp-bot?reset=1");
  });

  // Mensaje de prueba al admin
  r.post("/test", async (req, res) => {
    const aphone = g(ctx.db, "wa_admin_phone");
    if (!aphone) return res.redirect("/admin/whatsapp-bot?error=" + encodeURIComponent("Configura primero el número del admin."));
    const siteName = ctx.db.getSetting("site_name", "SKY ULTRA PLUS shop");
    const out = await wa.sendMessageToNumber(aphone, `✅ *${siteName}*\n\nMensaje de prueba desde el panel admin. Si lo recibes, el bot está conectado y enviando notificaciones correctamente.`);
    if (!out.ok) return res.redirect("/admin/whatsapp-bot?error=" + encodeURIComponent(out.error));
    res.redirect("/admin/whatsapp-bot?tested=1");
  });

  // Endpoint JSON para polling en vivo del estado
  r.get("/status.json", (req, res) => {
    const s = wa.status();
    res.json({
      ...s,
      botPhone: g(ctx.db, "wa_bot_phone"),
      adminPhone: g(ctx.db, "wa_admin_phone"),
      enabled: g(ctx.db, "wa_bot_enabled") === "1",
      siteUrl: ctx.db.getSetting("wa_site_url", "") || ctx.db.getSetting("wa_detected_site_url", ""),
    });
  });

  // Página principal
  r.get("/", (req, res) => {
    const s = wa.status();
    const enabled = g(ctx.db, "wa_bot_enabled") === "1";
    const botPhone = g(ctx.db, "wa_bot_phone");
    const adminPhoneVal = g(ctx.db, "wa_admin_phone");
    const siteUrlManual = g(ctx.db, "wa_site_url");
    const siteUrlDetected = ctx.db.getSetting("wa_detected_site_url", "");

    let msg = "";
    if (req.query.saved)         msg = `<div class="appr-notice success"><i class="ri-checkbox-circle-line"></i> Configuración guardada.</div>`;
    if (req.query.pairing)       msg = `<div class="appr-notice success"><i class="ri-key-2-line"></i> Solicitando código de emparejamiento. En unos segundos aparecerá abajo.</div>`;
    if (req.query.disconnected)  msg = `<div class="appr-notice success"><i class="ri-link-unlink"></i> Bot desconectado.</div>`;
    if (req.query.reset)         msg = `<div class="appr-notice success"><i class="ri-refresh-line"></i> Carpeta de sesión eliminada. Ya puedes vincular un nuevo número.</div>`;
    if (req.query.tested)        msg = `<div class="appr-notice success"><i class="ri-send-plane-line"></i> Mensaje de prueba enviado al admin.</div>`;
    if (req.query.error)         msg = `<div class="appr-notice" style="background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.32)"><i class="ri-error-warning-line"></i> ${h(ctx, req.query.error)}</div>`;

    const lastErr = s.lastError ? `<div class="appr-notice" style="background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.32)"><i class="ri-error-warning-line"></i> ${h(ctx, s.lastError)}</div>` : "";

    const pairingBox = s.pairingCode
      ? `<div class="wa-code-card"><div class="wa-code-eyebrow"><i class="ri-key-2-line"></i> Código de emparejamiento</div><div class="wa-code-value" id="waPairCode">${h(ctx, s.pairingCode)}</div><div class="wa-code-hint">Abre WhatsApp en el teléfono del bot → Ajustes → Dispositivos vinculados → Vincular un dispositivo → <b>Vincular con número de teléfono</b> e ingresa este código.</div></div>`
      : "";

    res.renderPage({
      title: "WhatsApp Bot",
      area: "admin",
      registry: reg(ctx),
      content: `
<link rel="stylesheet" href="/public/css/admin-appearance-design.css?v=1">
<style>
  .wa-status-card{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;padding:18px 20px;background:linear-gradient(145deg,rgba(13,18,38,.94),rgba(10,14,28,.78));border:1px solid rgba(139,92,246,.2);border-radius:18px}
  body.light .wa-status-card{background:rgba(255,255,255,.94);border-color:rgba(99,102,241,.18)}
  .wa-status-info{display:flex;align-items:center;gap:14px}
  .wa-status-info i.wa-big{font-size:28px;width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:rgba(34,197,94,.16);color:#22c55e}
  .wa-status-info.is-disconnected i.wa-big{background:rgba(148,163,184,.16);color:#94a3b8}
  .wa-status-info.is-pairing i.wa-big,.wa-status-info.is-starting i.wa-big{background:rgba(245,158,11,.16);color:#f59e0b}
  .wa-status-info.is-error i.wa-big{background:rgba(239,68,68,.16);color:#f87171}
  .wa-status-info b{display:block;font-size:16px}
  .wa-status-info small{display:block;color:rgba(233,242,255,.7);font-size:12px;margin-top:2px}
  body.light .wa-status-info small{color:rgba(15,23,42,.66)}
  .wa-actions{display:flex;flex-wrap:wrap;gap:10px}
  .wa-actions button,.wa-actions a{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;border:0;font-weight:800;font-size:13px;cursor:pointer;text-decoration:none}
  .wa-btn-connect{background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff}
  .wa-btn-disconnect{background:rgba(148,163,184,.18);color:inherit;border:1px solid rgba(148,163,184,.32)}
  .wa-btn-test{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff}
  .wa-btn-reset{background:rgba(239,68,68,.16);color:#f87171;border:1px solid rgba(239,68,68,.32)}
  .wa-actions form{margin:0}
  .wa-code-card{margin-top:14px;padding:22px;border-radius:18px;background:linear-gradient(145deg,rgba(245,158,11,.16),rgba(245,158,11,.06));border:1px solid rgba(245,158,11,.36);text-align:center}
  .wa-code-eyebrow{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:rgba(245,158,11,.22);color:#fde68a;font-weight:850;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
  body.light .wa-code-eyebrow{color:#92400e}
  .wa-code-value{margin:14px 0 6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:42px;font-weight:900;letter-spacing:.12em;color:#fde68a}
  body.light .wa-code-value{color:#92400e}
  .wa-code-hint{margin:8px auto 0;max-width:520px;color:rgba(233,242,255,.78);font-size:13px;line-height:1.55}
  body.light .wa-code-hint{color:rgba(15,23,42,.7)}
  .wa-input{height:42px;border-radius:10px;padding:0 12px;background:rgba(15,23,42,.6);border:1px solid rgba(139,92,246,.32);color:inherit;font-weight:700;min-width:220px}
  body.light .wa-input{background:rgba(255,255,255,.85);border-color:rgba(99,102,241,.32)}
  .wa-help{padding:14px 16px;border-radius:14px;background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.32);color:rgba(233,242,255,.85);font-size:13px;line-height:1.6}
  body.light .wa-help{color:rgba(15,23,42,.78)}
  .wa-help b{color:#c4b5fd}
  body.light .wa-help b{color:#5b21b6}
</style>
<div class="appr-page">
  <header class="appr-head">
    <p class="appr-eyebrow">Notificaciones</p>
    <h1>WhatsApp Bot</h1>
    <p>Conecta un número de WhatsApp para que tu tienda notifique automáticamente a clientes y al admin cuando hay facturas pendientes, pagos, suspensiones o cancelaciones.</p>
  </header>
  ${msg}
  ${lastErr}

  <section class="appr-card">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-pulse-line"></i> Estado del bot</h2>
        <p>Aquí ves la conexión actual y el código de emparejamiento cuando hace falta vincular.</p>
      </div>
    </div>
    <div class="appr-card-body">
      <div class="wa-status-card">
        <div class="wa-status-info is-${h(ctx, s.state)}" id="waStatusInfo">
          <i class="wa-big ri-whatsapp-line"></i>
          <div>
            <span id="waStatusBadge">${statusBadge(s.state)}</span>
            <b style="margin-top:6px" id="waStatusPhone">${botPhone ? "+" + h(ctx, botPhone) : "Sin número configurado"}</b>
            <small id="waStatusSub">${s.lastConnectedAt ? "Conectado desde: " + h(ctx, new Date(s.lastConnectedAt).toLocaleString()) : "Aún no conectado"}</small>
          </div>
        </div>
        <div class="wa-actions">
          <form method="POST" action="/admin/whatsapp-bot/connect">
            <button type="submit" class="wa-btn-connect"><i class="ri-link"></i> Conectar / Solicitar código</button>
          </form>
          <form method="POST" action="/admin/whatsapp-bot/disconnect">
            <button type="submit" class="wa-btn-disconnect"><i class="ri-link-unlink"></i> Desconectar</button>
          </form>
          <form method="POST" action="/admin/whatsapp-bot/test">
            <button type="submit" class="wa-btn-test"><i class="ri-send-plane-line"></i> Enviar prueba al admin</button>
          </form>
          <form method="POST" action="/admin/whatsapp-bot/reset" onsubmit="return confirm('Esto borrará la carpeta de sesión actual. Tendrás que volver a vincular el bot con el código de emparejamiento. ¿Continuar?')">
            <button type="submit" class="wa-btn-reset"><i class="ri-delete-bin-line"></i> Borrar sesión</button>
          </form>
        </div>
      </div>
      <div id="waPairWrap">${pairingBox}</div>
    </div>
  </section>

  <form class="appr-card" method="POST" action="/admin/whatsapp-bot/save">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-settings-3-line"></i> Configuración</h2>
        <p>Activa o desactiva el bot, define los números y la URL pública del sitio.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar</button>
    </div>
    <div class="appr-card-body">
      ${toggleRow("wa_bot_enabled", "Activar bot", "Si está apagado el bot no envía notificaciones aunque esté conectado.", "ri-power-line", enabled)}
      ${inputRow(ctx, "wa_bot_phone",   "Número del bot",   "Número que se vinculará a WhatsApp. Sólo dígitos, con código de país. Ej: 5215512345678 (México), 15555555555 (USA), 5491112345678 (Argentina).", "ri-smartphone-line", "5215512345678")}
      ${inputRow(ctx, "wa_admin_phone", "Número del admin", "Recibirá la copia de cada notificación con los datos completos del cliente. Sólo dígitos con código de país.", "ri-user-star-line", "5215512345678")}
      ${inputRow(ctx, "wa_site_url",    "URL pública de la tienda (opcional)", "Si la dejas vacía, se detecta automáticamente de la primera visita. Ej: https://mitienda.com", "ri-global-line", "https://mitienda.com")}
      <div class="appr-row" style="background:transparent">
        <span class="appr-row-icon"><i class="ri-radar-line"></i></span>
        <div class="appr-row-text"><b>URL detectada</b><small>${siteUrlDetected ? h(ctx, siteUrlDetected) : "Aún no detectada. Visita el sitio una vez."}</small></div>
      </div>
    </div>
  </form>

  <form class="appr-card" method="POST" action="/admin/whatsapp-bot/save">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-notification-3-line"></i> Eventos a notificar</h2>
        <p>Elige qué eventos disparan un mensaje al cliente y al admin.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar</button>
    </div>
    <div class="appr-card-body">
      <input type="hidden" name="wa_bot_enabled" value="${enabled ? "1" : "0"}">
      <input type="hidden" name="wa_bot_phone" value="${h(ctx, botPhone)}">
      <input type="hidden" name="wa_admin_phone" value="${h(ctx, adminPhoneVal)}">
      <input type="hidden" name="wa_site_url" value="${h(ctx, siteUrlManual)}">
      ${toggleRow("wa_notify_invoice_pending",   "Factura pendiente",   "Cuando se crea una factura (compra o renovación).", "ri-time-line", g(ctx.db, "wa_notify_invoice_pending") === "1")}
      ${toggleRow("wa_notify_invoice_paid",      "Factura pagada",      "Cuando un cliente paga (crédito, PayPal o Stripe).", "ri-checkbox-circle-line", g(ctx.db, "wa_notify_invoice_paid") === "1")}
      ${toggleRow("wa_notify_invoice_suspended", "Factura suspendida",  "Cuando el ciclo automático suspende una factura pendiente.", "ri-pause-circle-line", g(ctx.db, "wa_notify_invoice_suspended") === "1")}
      ${toggleRow("wa_notify_invoice_canceled",  "Factura cancelada",   "Cancelación automática o manual.", "ri-close-circle-line", g(ctx.db, "wa_notify_invoice_canceled") === "1")}
      ${toggleRow("wa_notify_service_suspended", "Servicio suspendido", "Cuando el servicio asociado a una factura queda suspendido.", "ri-stack-line", g(ctx.db, "wa_notify_service_suspended") === "1")}
      ${toggleRow("wa_notify_service_canceled",  "Servicio cancelado",  "Cuando el servicio queda cancelado (por automatización o manual).", "ri-close-circle-line", g(ctx.db, "wa_notify_service_canceled") === "1")}
    </div>
  </form>

  <section class="appr-card">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-information-line"></i> Cómo conectar el bot</h2>
        <p>Lee con calma — sobre todo el formato del número de México.</p>
      </div>
    </div>
    <div class="appr-card-body">
      <div class="wa-help">
        <ol style="margin:0;padding-left:18px;line-height:1.8">
          <li>Instala las dependencias en tu servidor con <b>npm install</b> (la primera vez Baileys descarga la librería).</li>
          <li>Escribe el número del bot (el WhatsApp que se va a conectar) en el campo <b>"Número del bot"</b> y guarda.</li>
          <li>Pulsa <b>Conectar / Solicitar código</b>. En unos segundos verás un código de 8 caracteres tipo <code>XXXX-XXXX</code>.</li>
          <li>En el teléfono del bot abre <b>WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo → "Vincular con número de teléfono"</b> e introduce ese código.</li>
          <li>Cuando el estado pase a <b>Conectado</b>, prueba con el botón <b>"Enviar prueba al admin"</b>.</li>
          <li>Si el bot se desconecta o quieres vincular otro número, pulsa <b>"Borrar sesión"</b> y vuelve a conectar.</li>
        </ol>
        <hr style="margin:14px 0;border:none;border-top:1px solid rgba(139,92,246,.22)">
        <p style="margin:0;font-weight:850;color:#fbbf24"><i class="ri-error-warning-line"></i> Importante — números de México</p>
        <p style="margin:6px 0 0">
          Por regla de WhatsApp, los números mexicanos celulares necesitan un <b>1</b> después del código de país <b>+52</b>.<br>
          Ejemplo: el número <b>+52 55 1234 5678</b> se escribe como <b>5215512345678</b> (con el <b>1</b> después del 52).<br>
          Aplica tanto para el número del bot como para el número del admin si son mexicanos.
        </p>
        <p style="margin:10px 0 0;color:rgba(233,242,255,.7);font-size:12px">Otros países: ingresa código de país + número sin signos ni espacios. Ej: USA <b>1</b> + 10 dígitos, Argentina <b>54 9</b> + área + número, Colombia <b>57</b> + 10 dígitos.</p>
      </div>
    </div>
  </section>
</div>
<script>
(function(){
  function refresh(){
    fetch('/admin/whatsapp-bot/status.json', {credentials:'same-origin'})
      .then(r => r.json())
      .then(d => {
        const badge = document.getElementById('waStatusBadge');
        const info  = document.getElementById('waStatusInfo');
        const pairWrap = document.getElementById('waPairWrap');
        const sub = document.getElementById('waStatusSub');
        if (info) info.className = 'wa-status-info is-' + d.state;
        if (badge) {
          const map = {
            disconnected: ['Desconectado','rgba(148,163,184,.18)','#cbd5e1','ri-link-unlink'],
            starting:     ['Iniciando…','rgba(245,158,11,.18)','#fbbf24','ri-loader-4-line'],
            pairing:      ['Esperando vinculación','rgba(245,158,11,.18)','#fbbf24','ri-key-2-line'],
            connected:    ['Conectado','rgba(34,197,94,.18)','#4ade80','ri-checkbox-circle-line'],
            error:        ['Error','rgba(239,68,68,.18)','#fca5a5','ri-error-warning-line']
          };
          const m = map[d.state] || ['Desconocido','rgba(148,163,184,.18)','#cbd5e1','ri-question-line'];
          badge.innerHTML = '<span class="wa-pill" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-weight:800;font-size:12px;background:'+m[1]+';color:'+m[2]+';letter-spacing:.04em;text-transform:uppercase"><i class="'+m[3]+'"></i> '+m[0]+'</span>';
        }
        if (sub) {
          if (d.lastConnectedAt) sub.textContent = 'Conectado desde: ' + new Date(d.lastConnectedAt).toLocaleString();
          else if (d.state === 'pairing') sub.textContent = 'Esperando que ingreses el código en WhatsApp...';
          else sub.textContent = 'Aún no conectado';
        }
        if (pairWrap) {
          if (d.pairingCode) {
            pairWrap.innerHTML = '<div class="wa-code-card"><div class="wa-code-eyebrow"><i class="ri-key-2-line"></i> Código de emparejamiento</div><div class="wa-code-value">'+d.pairingCode+'</div><div class="wa-code-hint">Abre WhatsApp en el teléfono del bot → Ajustes → Dispositivos vinculados → Vincular un dispositivo → <b>Vincular con número de teléfono</b> e ingresa este código.</div></div>';
          } else if (d.state === 'connected') {
            pairWrap.innerHTML = '';
          }
        }
      })
      .catch(()=>{});
  }
  setInterval(refresh, 4000);
})();
</script>`
    });
  });

  return r;
}

module.exports = { config, router };
