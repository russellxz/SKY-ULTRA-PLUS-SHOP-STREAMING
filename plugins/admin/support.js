"use strict";

const path = require("path");
const fs = require("fs");
const { registry: getRegistry } = require("../../core/pluginLoader");

// Slides de fabrica (default)
const FACTORY_SLIDES = [
  {"text":"¡Bienvenido a nuestra tienda!","subtitle":"Explora nuestros productos y servicios digitales","colorFrom":"#4c1d95","colorTo":"#7c3aed","image":""},
  {"text":"Pagos 100% seguros","subtitle":"Múltiples métodos de pago rápidos y confiables","colorFrom":"#1e3a5f","colorTo":"#2563eb","image":""},
  {"text":"Entrega inmediata","subtitle":"Recibe tus productos digitales al instante","colorFrom":"#1a3a2a","colorTo":"#059669","image":""},
  {"text":"Soporte disponible","subtitle":"Estamos aquí para ayudarte en lo que necesites","colorFrom":"#3d1f1f","colorTo":"#dc2626","image":""},
  {"text":"Precios imbatibles","subtitle":"La mejor relación calidad-precio del mercado","colorFrom":"#1f2d3d","colorTo":"#0ea5e9","image":""},
  {"text":"Catálogo completo","subtitle":"Encuentra exactamente lo que estás buscando","colorFrom":"#3d2a00","colorTo":"#f59e0b","image":""},
  {"text":"Comunidad activa","subtitle":"Únete a miles de clientes satisfechos","colorFrom":"#2d1f3d","colorTo":"#a855f7","image":""}
];

const config = {
  key: "admin_support",
  name: "Marketing Login",
  icon: "ri-customer-service-2-line",
  route: "/admin/support",
  area: "admin",
  category: "Sistema",
  permission: "admin",
  order: 55,
};

function router({ db, auth, layout }) {
  const { Router } = require("express");
  const r = Router();
  const { escapeHtml: h } = layout;

  r.use(auth.requireAdmin);

  function getSlides() {
    try { return JSON.parse(db.getSetting("promo_slides", "[]")); } catch { return []; }
  }

  // Escape JSON for safe inline embedding in <script type="application/json">
  function safeJson(value) {
    return JSON.stringify(value)
      .replace(/<\/script/gi, "<\\/script")
      .replace(/<!--/g, "<\\!--");
  }

  function renderPage(req, res, tab) {
    const slides = getSlides();
    const supEmail = db.getSetting("support_email","");
    const supWaC = db.getSetting("support_whatsapp_country","+1");
    const supWaN = db.getSetting("support_whatsapp_number","");
    const supWaG = db.getSetting("support_whatsapp_group","");
    // Estilo del marketing
    const gdFrom = db.getSetting("promo_title_grad_from_dark","#a78bfa");
    const gdTo   = db.getSetting("promo_title_grad_to_dark","#60a5fa");
    const glFrom = db.getSetting("promo_title_grad_from_light","#2563eb");
    const glTo   = db.getSetting("promo_title_grad_to_light","#7c3aed");
    const pAlign = db.getSetting("promo_text_align","left");
    // Google OAuth
    const goEnabled = db.getSetting("google_oauth_enabled","0") === "1";
    const goCid     = db.getSetting("google_oauth_client_id","");
    const goSec     = db.getSetting("google_oauth_client_secret","");
    const proto = req.protocol;
    const host  = req.get("host");
    const callbackUrl = `${proto}://${host}/auth/google/callback`;
    const flash = req.query.ok
      ? `<div class="sp-flash ok"><i class="ri-check-circle-line"></i> Guardado correctamente.</div>`
      : req.query.err
        ? `<div class="sp-flash err"><i class="ri-error-warning-line"></i> ${h(req.query.err === "1" ? "Error al guardar." : req.query.err)}</div>`
        : "";

    const countryOpts = auth.countryOptions(supWaC);

    const contactHtml = `
<div class="sp-card">
  <h3 class="sp-sect"><i class="ri-mail-line"></i> Correo de soporte</h3>
  <form method="POST" action="/admin/support/save-contact">
    <div class="sp-field"><label>Email de soporte</label><input type="email" name="support_email" value="${h(supEmail)}" placeholder="soporte@tudominio.com"></div>
    <h3 class="sp-sect" style="margin-top:22px;"><i class="ri-whatsapp-line"></i> WhatsApp</h3>
    <div class="sp-2col">
      <div class="sp-field"><label>Código de país</label><select name="support_whatsapp_country">${countryOpts}</select></div>
      <div class="sp-field"><label>Número</label><input type="tel" name="support_whatsapp_number" value="${h(supWaN)}" placeholder="8091234567"></div>
    </div>
    <div class="sp-field"><label>URL del grupo de WhatsApp</label><input type="url" name="support_whatsapp_group" value="${h(supWaG)}" placeholder="https://chat.whatsapp.com/..."></div>
    <div class="sp-actions"><button type="submit" class="sp-btn primary"><i class="ri-save-line"></i> Guardar contacto</button></div>
  </form>
</div>`;

    const slidesHtml = `
<div class="sp-slides-bar">
  <span class="sp-slides-ct" id="spSlidesCount">${slides.length} slide${slides.length!==1?"s":""}</span>
  <button type="button" class="sp-btn secondary" data-act="add"><i class="ri-add-line"></i> Agregar slide</button>
</div>
<div id="spList"><div class="sp-empty">Cargando slides...</div></div>
<div class="sp-actions sp-actions-row" style="margin-top:20px;">
  <button type="button" class="sp-btn primary" data-act="save-all"><i class="ri-save-line"></i> Guardar todos los slides</button>
  <button type="button" class="sp-btn danger" data-act="reset-factory"><i class="ri-restart-line"></i> Restablecer de fábrica</button>
</div>
<div class="sp-toast" id="spToast"><i class="ri-checkbox-circle-line"></i><span>Guardado</span></div>`;

    // Estilo del marketing (gradiente + alineación)
    const styleHtml = `
<div class="sp-card">
  <h3 class="sp-sect"><i class="ri-magic-line"></i> Estilo del marketing</h3>
  <p style="margin:0 0 14px;opacity:.7;font-size:13px">Personaliza el degradado del título de cada slide y dónde se alinea el texto. Aplica en /login y /register.</p>
  <form method="POST" action="/admin/support/save-style">
    <div class="sp-2col">
      <div class="sp-field"><label>Texto del título (gradiente · modo oscuro)</label>
        <div style="display:flex;gap:8px;align-items:center"><input type="color" name="promo_title_grad_from_dark" value="${h(gdFrom)}" style="width:54px;height:42px;border-radius:10px;border:1px solid rgba(139,92,246,.3);cursor:pointer"><input type="text" value="${h(gdFrom)}" readonly style="flex:1"><span style="opacity:.5">→</span><input type="color" name="promo_title_grad_to_dark" value="${h(gdTo)}" style="width:54px;height:42px;border-radius:10px;border:1px solid rgba(139,92,246,.3);cursor:pointer"><input type="text" value="${h(gdTo)}" readonly style="flex:1"></div>
        <small style="opacity:.6;margin-top:4px">Por defecto morado → azul.</small>
      </div>
      <div class="sp-field"><label>Texto del título (gradiente · modo claro)</label>
        <div style="display:flex;gap:8px;align-items:center"><input type="color" name="promo_title_grad_from_light" value="${h(glFrom)}" style="width:54px;height:42px;border-radius:10px;border:1px solid rgba(99,102,241,.3);cursor:pointer"><input type="text" value="${h(glFrom)}" readonly style="flex:1"><span style="opacity:.5">→</span><input type="color" name="promo_title_grad_to_light" value="${h(glTo)}" style="width:54px;height:42px;border-radius:10px;border:1px solid rgba(99,102,241,.3);cursor:pointer"><input type="text" value="${h(glTo)}" readonly style="flex:1"></div>
        <small style="opacity:.6;margin-top:4px">Por defecto azul → morado.</small>
      </div>
    </div>
    <div class="sp-field" style="margin-top:14px"><label>Alineación del texto en el slide</label>
      <div style="display:flex;gap:14px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:10px 14px;border-radius:12px;background:${pAlign==='left'?'rgba(124,58,237,.18)':'rgba(124,58,237,.06)'};border:1px solid ${pAlign==='left'?'rgba(124,58,237,.5)':'rgba(124,58,237,.2)'}"><input type="radio" name="promo_text_align" value="left" ${pAlign==='left'?'checked':''}> <i class="ri-align-left"></i> Al lado (izquierda)</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:10px 14px;border-radius:12px;background:${pAlign==='center'?'rgba(124,58,237,.18)':'rgba(124,58,237,.06)'};border:1px solid ${pAlign==='center'?'rgba(124,58,237,.5)':'rgba(124,58,237,.2)'}"><input type="radio" name="promo_text_align" value="center" ${pAlign==='center'?'checked':''}> <i class="ri-align-center"></i> Centrado</label>
      </div>
    </div>
    <div class="sp-actions"><button type="submit" class="sp-btn primary"><i class="ri-save-line"></i> Guardar estilo</button></div>
  </form>
</div>`;

    // Google OAuth config
    const googleHtml = `
<div class="sp-card">
  <h3 class="sp-sect"><i class="ri-google-fill"></i> Inicio de sesión con Google</h3>
  <p style="margin:0 0 14px;opacity:.7;font-size:13px">Si activas esto y configuras Client ID / Secret, los usuarios verán un botón <b>"Continuar con Google"</b> en /login y /register. Al registrarse con Google se les pedirá nombre, apellido, teléfono y contraseña antes de entrar.</p>
  <form method="POST" action="/admin/support/save-google">
    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:12px 16px;border-radius:12px;background:${goEnabled?'rgba(34,197,94,.14)':'rgba(148,163,184,.1)'};border:1px solid ${goEnabled?'rgba(34,197,94,.32)':'rgba(148,163,184,.24)'};margin-bottom:14px"><input type="checkbox" name="google_oauth_enabled" value="1" ${goEnabled?'checked':''}> <span><b>Activar Google OAuth</b> <small style="display:block;opacity:.7">${goEnabled?'Activado':'Desactivado'} — sólo aparece el botón si está activado <em>y</em> tiene Client ID configurado.</small></span></label>
    <div class="sp-field"><label>Client ID</label><input type="text" name="google_oauth_client_id" value="${h(goCid)}" placeholder="123456789-abcdef.apps.googleusercontent.com" autocomplete="off"></div>
    <div class="sp-field"><label>Client Secret</label><input type="password" name="google_oauth_client_secret" value="${h(goSec)}" placeholder="${goSec?'(guardado, escribe para cambiar)':'GOCSPX-...'}" autocomplete="new-password"></div>
    <div class="sp-field"><label>URL de redirect autorizada (copiar en Google Cloud)</label><input type="text" value="${h(callbackUrl)}" readonly onclick="this.select()" style="background:rgba(124,58,237,.12);font-family:monospace;font-size:13px"></div>
    <div class="sp-actions" style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button type="submit" class="sp-btn primary"><i class="ri-save-line"></i> Guardar Google OAuth</button>
      <a href="https://developers.google.com/identity/protocols/oauth2/web-server?hl=es#enable-apis" target="_blank" rel="noopener" class="sp-btn secondary"><i class="ri-external-link-line"></i> Documentación oficial</a>
    </div>
  </form>
  <details style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.22)">
    <summary style="cursor:pointer;font-weight:800;color:#c4b5fd">📋 Cómo crear las credenciales en Google Cloud (paso a paso)</summary>
    <ol style="margin:12px 0 0;padding-left:20px;line-height:1.85;font-size:13px">
      <li>Entra a <a href="https://console.cloud.google.com/" target="_blank" rel="noopener" style="color:#7dd3fc;text-decoration:underline">console.cloud.google.com</a> y crea (o elige) un proyecto.</li>
      <li>Ve a <b>APIs y servicios → Pantalla de consentimiento OAuth</b>, configura una pantalla "Externa", llena el nombre de la app y tu correo de soporte, y publícala (modo Producción o Testing).</li>
      <li>Ve a <b>APIs y servicios → Credenciales</b> → <b>Crear credenciales → ID de cliente OAuth</b> → <b>Aplicación web</b>.</li>
      <li>En <b>URI de redireccionamiento autorizados</b> pega exactamente:<br><code style="display:inline-block;padding:6px 10px;border-radius:6px;background:rgba(0,0,0,.25);margin-top:6px;font-size:12px">${h(callbackUrl)}</code></li>
      <li>Te dará un <b>Client ID</b> y un <b>Client Secret</b>. Copia ambos y pégalos en los campos de arriba.</li>
      <li>Activa el toggle y guarda. El botón "Continuar con Google" aparecerá automáticamente en /login y /register.</li>
    </ol>
  </details>
</div>`;

    const content = `
<link rel="stylesheet" href="/public/css/admin-support.css?v=7">
<div class="sp-page">
  <div class="sp-head"><div class="sp-head-icon"><i class="ri-customer-service-2-line"></i></div><div><h2>Marketing Login</h2><p>Configura slides promocionales y contactos de soporte para el login.</p></div></div>
  ${flash}
  <div class="sp-tabs">
    <button class="sp-tab${tab==="contact"?" active":""}" data-tab="contact" type="button"><i class="ri-contacts-line"></i> Soporte</button>
    <button class="sp-tab${tab==="slides"?" active":""}" data-tab="slides" type="button"><i class="ri-slideshow-line"></i> Slides</button>
    <button class="sp-tab${tab==="style"?" active":""}" data-tab="style" type="button"><i class="ri-magic-line"></i> Estilo</button>
    <button class="sp-tab${tab==="google"?" active":""}" data-tab="google" type="button"><i class="ri-google-fill"></i> Google OAuth</button>
  </div>
  <div id="spPanelContact" style="display:${tab==="contact"?"block":"none"}">${contactHtml}</div>
  <div id="spPanelSlides" style="display:${tab==="slides"?"block":"none"}">${slidesHtml}</div>
  <div id="spPanelStyle" style="display:${tab==="style"?"block":"none"}">${styleHtml}</div>
  <div id="spPanelGoogle" style="display:${tab==="google"?"block":"none"}">${googleHtml}</div>
</div>
<script type="application/json" id="spInitData">${safeJson(slides)}</script>
<script src="/public/js/admin-support.js?v=7"></script>`;

    res.renderPage({ title: "Marketing Login", area: "admin", registry: getRegistry(db), content });
  }

  r.get("/", (req, res) => renderPage(req, res, req.query.tab || "contact"));

  function isAjax(req) {
    return req.headers["x-requested-with"] === "fetch" ||
      (req.headers.accept || "").indexOf("application/json") !== -1;
  }

  function normalizeSlide(s) {
    s = s || {};
    return {
      text: String(s.text || ""),
      subtitle: String(s.subtitle || ""),
      colorFrom: String(s.colorFrom || "#4c1d95"),
      colorTo: String(s.colorTo || "#7c3aed"),
      image: String(s.image || ""),
    };
  }

  r.post("/save-style", (req, res) => {
    try {
      const cleanColor = (v, fb) => {
        const s = String(v || "").trim();
        return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fb;
      };
      db.setSetting("promo_title_grad_from_dark", cleanColor(req.body.promo_title_grad_from_dark, "#a78bfa"));
      db.setSetting("promo_title_grad_to_dark",   cleanColor(req.body.promo_title_grad_to_dark,   "#60a5fa"));
      db.setSetting("promo_title_grad_from_light",cleanColor(req.body.promo_title_grad_from_light,"#2563eb"));
      db.setSetting("promo_title_grad_to_light",  cleanColor(req.body.promo_title_grad_to_light,  "#7c3aed"));
      const align = req.body.promo_text_align === "center" ? "center" : "left";
      db.setSetting("promo_text_align", align);
      res.redirect("/admin/support?tab=style&ok=1");
    } catch (e) {
      res.redirect("/admin/support?tab=style&err=" + encodeURIComponent(e.message));
    }
  });

  r.post("/save-google", (req, res) => {
    try {
      db.setSetting("google_oauth_enabled", req.body.google_oauth_enabled === "1" ? "1" : "0");
      const cid = String(req.body.google_oauth_client_id || "").trim();
      db.setSetting("google_oauth_client_id", cid);
      const sec = String(req.body.google_oauth_client_secret || "").trim();
      if (sec) db.setSetting("google_oauth_client_secret", sec);
      res.redirect("/admin/support?tab=google&ok=1");
    } catch (e) {
      res.redirect("/admin/support?tab=google&err=" + encodeURIComponent(e.message));
    }
  });

  r.post("/save-contact", (req, res) => {
    try {
      db.setSetting("support_email", req.body.support_email || "");
      db.setSetting("support_whatsapp_country", req.body.support_whatsapp_country || "+1");
      db.setSetting("support_whatsapp_number", req.body.support_whatsapp_number || "");
      db.setSetting("support_whatsapp_group", req.body.support_whatsapp_group || "");
      if (isAjax(req)) return res.json({ ok: true });
      res.redirect("/admin/support?ok=1");
    } catch (e) {
      if (isAjax(req)) return res.status(500).json({ ok: false, error: e.message });
      res.redirect("/admin/support?err=1");
    }
  });

  r.post("/save-slides", (req, res) => {
    try {
      const raw = (req.body && req.body.slides) || (req.body && Array.isArray(req.body) ? req.body : null);
      const slides = [];
      if (Array.isArray(raw)) {
        raw.forEach(s => slides.push(normalizeSlide(s)));
      } else if (raw && typeof raw === "object") {
        const keys = Object.keys(raw).sort((a,b) => parseInt(a)-parseInt(b));
        for (const k of keys) slides.push(normalizeSlide(raw[k]));
      }
      db.setSetting("promo_slides", JSON.stringify(slides));
      if (isAjax(req)) return res.json({ ok: true, count: slides.length });
      res.redirect("/admin/support?tab=slides&ok=1");
    } catch (e) {
      if (isAjax(req)) return res.status(500).json({ ok: false, error: e.message });
      res.redirect("/admin/support?tab=slides&err=1");
    }
  });

  // Restablecer slides de fabrica
  r.post("/reset-slides", (req, res) => {
    try {
      db.setSetting("promo_slides", JSON.stringify(FACTORY_SLIDES));
      if (isAjax(req)) return res.json({ ok: true, slides: FACTORY_SLIDES });
      res.redirect("/admin/support?tab=slides&ok=1");
    } catch (e) {
      if (isAjax(req)) return res.status(500).json({ ok: false, error: e.message });
      res.redirect("/admin/support?tab=slides&err=1");
    }
  });

  // Guardar un solo slide (por indice). Si no existe, lo agrega.
  r.post("/save-slide", (req, res) => {
    try {
      const idx = parseInt(req.body.index, 10);
      const slide = normalizeSlide(req.body.slide || req.body);
      const slides = getSlides();
      if (Number.isFinite(idx) && idx >= 0 && idx < slides.length) {
        slides[idx] = slide;
      } else {
        slides.push(slide);
      }
      db.setSetting("promo_slides", JSON.stringify(slides));
      res.json({ ok: true, index: Number.isFinite(idx) ? idx : slides.length - 1, count: slides.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  r.post("/upload-image", (req, res) => {
    try {
      if (!req.files || !req.files.image) return res.json({ ok: false, error: "No se recibió archivo." });
      const file = req.files.image;
      const ext = path.extname(file.name || "").toLowerCase() || ".jpg";
      if (![".jpg",".jpeg",".png",".gif",".webp"].includes(ext))
        return res.json({ ok: false, error: "Tipo de archivo no permitido." });
      const dir = path.join(process.cwd(), "uploads", "promo");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const fname = `promo_${Date.now()}${ext}`;
      file.mv(path.join(dir, fname), (err) => {
        if (err) return res.json({ ok: false, error: err.message });
        res.json({ ok: true, path: `/uploads/promo/${fname}` });
      });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  return r;
}

module.exports = { config, router };
