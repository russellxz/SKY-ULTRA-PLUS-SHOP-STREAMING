"use strict";

const path = require("path");
const fs = require("fs");
const { registry: getRegistry } = require("../../core/pluginLoader");

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
<div class="sp-actions" style="margin-top:20px;">
  <button type="button" class="sp-btn primary" data-act="save-all"><i class="ri-save-line"></i> Guardar todos los slides</button>
</div>
<div class="sp-toast" id="spToast"><i class="ri-checkbox-circle-line"></i><span>Guardado</span></div>`;

    const content = `
<link rel="stylesheet" href="/public/css/admin-support.css?v=4">
<div class="sp-page">
  <div class="sp-head"><div class="sp-head-icon"><i class="ri-customer-service-2-line"></i></div><div><h2>Marketing Login</h2><p>Configura slides promocionales y contactos de soporte para el login.</p></div></div>
  ${flash}
  <div class="sp-tabs">
    <button class="sp-tab${tab==="contact"?" active":""}" data-tab="contact" type="button"><i class="ri-contacts-line"></i> Soporte</button>
    <button class="sp-tab${tab==="slides"?" active":""}" data-tab="slides" type="button"><i class="ri-slideshow-line"></i> Slides</button>
  </div>
  <div id="spPanelContact" style="display:${tab==="contact"?"block":"none"}">${contactHtml}</div>
  <div id="spPanelSlides" style="display:${tab==="slides"?"block":"none"}">${slidesHtml}</div>
</div>
<script type="application/json" id="spInitData">${safeJson(slides)}</script>
<script src="/public/js/admin-support.js?v=5"></script>`;

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
