"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const config = {
  key: "admin_manual_payments",
  name: "Pago manual",
  icon: "ri-bank-card-2-line",
  route: "/admin/manual-payments",
  area: "admin",
  category: "Facturación",
  permission: "admin",
  order: 55,
};

const ACCENTS = ["#7c3aed", "#2563eb", "#16a34a", "#f59e0b", "#ec4899", "#0ea5e9", "#dc2626", "#0d9488", "#a16207"];

function h(ctx, v) { return ctx.layout.escapeHtml(v == null ? "" : v); }
function reg(ctx) { return require("../../core/pluginLoader").registry(ctx.db); }

function ensureSchema(db) {
  db.sqlite.exec(`CREATE TABLE IF NOT EXISTS manual_payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_path TEXT DEFAULT '',
    accent_color TEXT DEFAULT '#7c3aed',
    order_index INTEGER NOT NULL DEFAULT 100,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ''
  )`);
}

function saveUpload(file) {
  if (!file || !file.name) return "";
  const dir = path.join(process.cwd(), "uploads", "manual-payments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name = Date.now() + "-" + crypto.randomBytes(4).toString("hex") + (path.extname(file.name) || ".png");
  const dest = path.join(dir, name);
  if (file.tempFilePath) {
    try { fs.renameSync(file.tempFilePath, dest); }
    catch (e) { fs.copyFileSync(file.tempFilePath, dest); try { fs.unlinkSync(file.tempFilePath); } catch (_) {} }
  } else if (file.data && file.data.length) {
    fs.writeFileSync(dest, file.data);
  } else {
    return "";
  }
  return "/uploads/manual-payments/" + name;
}

function listMethods(db) {
  return db.sqlite.prepare(
    "SELECT * FROM manual_payment_methods ORDER BY order_index, id"
  ).all();
}

function getMethod(db, id) {
  return db.sqlite.prepare("SELECT * FROM manual_payment_methods WHERE id=?").get(id);
}

function router(ctx) {
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);
  ensureSchema(ctx.db);

  // Crear o actualizar
  r.post("/save", (req, res) => {
    const id = Number(req.body.id || 0);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const accent = String(req.body.accent_color || "#7c3aed").trim();
    const order = Number(req.body.order_index || 100);
    const active = req.body.active === "1" ? 1 : 0;

    if (!title) {
      return res.redirect("/admin/manual-payments?error=" + encodeURIComponent("El título es obligatorio."));
    }

    const file = req.files && req.files.image;
    let imagePath = "";
    if (file && file.name) imagePath = saveUpload(file);

    if (id > 0) {
      const existing = getMethod(ctx.db, id);
      if (!existing) return res.redirect("/admin/manual-payments?error=" + encodeURIComponent("Método no encontrado."));
      const finalImage = imagePath || (req.body.remove_image === "1" ? "" : existing.image_path);
      ctx.db.sqlite.prepare(
        "UPDATE manual_payment_methods SET title=?, description=?, image_path=?, accent_color=?, order_index=?, active=? WHERE id=?"
      ).run(title, description, finalImage, accent, order, active, id);
      return res.redirect("/admin/manual-payments?saved=1");
    }

    ctx.db.sqlite.prepare(
      "INSERT INTO manual_payment_methods (title,description,image_path,accent_color,order_index,active,created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(title, description, imagePath, accent, order, active, ctx.db.now());
    res.redirect("/admin/manual-payments?saved=1");
  });

  // Eliminar
  r.post("/:id/delete", (req, res) => {
    const id = Number(req.params.id);
    const m = getMethod(ctx.db, id);
    if (m && m.image_path && m.image_path.startsWith("/uploads/manual-payments/")) {
      try { fs.unlinkSync(path.join(process.cwd(), m.image_path.replace(/^\//, ""))); } catch (_) {}
    }
    ctx.db.sqlite.prepare("DELETE FROM manual_payment_methods WHERE id=?").run(id);
    res.redirect("/admin/manual-payments?deleted=1");
  });

  // Toggle activo
  r.post("/:id/toggle", (req, res) => {
    const id = Number(req.params.id);
    const m = getMethod(ctx.db, id);
    if (!m) return res.redirect("/admin/manual-payments");
    ctx.db.sqlite.prepare("UPDATE manual_payment_methods SET active=? WHERE id=?").run(m.active ? 0 : 1, id);
    res.redirect("/admin/manual-payments?saved=1");
  });

  // Página principal
  r.get("/", (req, res) => {
    const editId = Number(req.query.edit || 0);
    const editing = editId ? getMethod(ctx.db, editId) : null;
    const methods = listMethods(ctx.db);

    let msg = "";
    if (req.query.saved) msg = `<div class="appr-notice success"><i class="ri-checkbox-circle-line"></i> Cambios guardados.</div>`;
    if (req.query.deleted) msg = `<div class="appr-notice success"><i class="ri-delete-bin-line"></i> Método eliminado.</div>`;
    if (req.query.error) msg = `<div class="appr-notice" style="background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.32)"><i class="ri-error-warning-line"></i> ${h(ctx, req.query.error)}</div>`;

    const accentOptions = ACCENTS.map((c) => {
      const checked = editing && editing.accent_color === c ? "checked" : (!editing && c === "#7c3aed" ? "checked" : "");
      return `<label class="mp-accent" style="background:${c}"><input type="radio" name="accent_color" value="${c}" ${checked}><i class="ri-check-line"></i></label>`;
    }).join("");

    const formTitle = editing ? "Editar método de pago" : "Nuevo método de pago";
    const formAction = "/admin/manual-payments/save";

    const cardsHtml = methods.length
      ? methods.map((m) => {
          const img = m.image_path
            ? `<img src="${h(ctx, m.image_path)}" alt="">`
            : `<div class="mp-card-img-fallback"><i class="ri-bank-card-2-line"></i></div>`;
          const preview = String(m.description || "").split("\n").slice(0, 2).join(" • ");
          return `<article class="mp-card ${m.active ? "" : "is-inactive"}" style="--mp-accent:${h(ctx, m.accent_color || "#7c3aed")}">
            <div class="mp-card-img">${img}</div>
            <div class="mp-card-body">
              <div class="mp-card-head">
                <h3>${h(ctx, m.title)}</h3>
                <span class="mp-pill ${m.active ? "ok" : "off"}">${m.active ? "Activo" : "Inactivo"}</span>
              </div>
              <p>${h(ctx, preview || "Sin descripción")}</p>
              <div class="mp-card-actions">
                <a class="mp-action edit" href="/admin/manual-payments?edit=${m.id}#mp-form"><i class="ri-pencil-line"></i> Editar</a>
                <form method="POST" action="/admin/manual-payments/${m.id}/toggle" style="margin:0">
                  <button class="mp-action ${m.active ? "warn" : "ok"}"><i class="ri-${m.active ? "pause" : "play"}-circle-line"></i> ${m.active ? "Desactivar" : "Activar"}</button>
                </form>
                <form method="POST" action="/admin/manual-payments/${m.id}/delete" style="margin:0" onsubmit="return confirm('¿Eliminar este método de pago?')">
                  <button class="mp-action danger"><i class="ri-delete-bin-line"></i> Eliminar</button>
                </form>
              </div>
            </div>
          </article>`;
        }).join("")
      : `<div class="mp-empty"><i class="ri-bank-card-2-line"></i><b>Sin métodos aún</b><span>Agrega tu primer método de pago manual para que tus clientes lo vean en la dashboard.</span></div>`;

    res.renderPage({
      title: "Pago manual",
      area: "admin",
      registry: reg(ctx),
      content: `
<link rel="stylesheet" href="/public/css/admin-appearance-design.css?v=1">
<style>
  .mp-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media(max-width:760px){.mp-form-grid{grid-template-columns:1fr}}
  .mp-field{display:flex;flex-direction:column;gap:6px}
  .mp-field>span{font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;color:rgba(233,242,255,.7)}
  body.light .mp-field>span{color:rgba(15,23,42,.6)}
  .mp-field input[type=text],.mp-field input[type=number],.mp-field textarea{height:42px;border-radius:12px;padding:10px 14px;background:rgba(15,23,42,.6);border:1px solid rgba(139,92,246,.3);color:inherit;font-weight:600;font-family:inherit;font-size:14px;width:100%;box-sizing:border-box}
  body.light .mp-field input[type=text],body.light .mp-field input[type=number],body.light .mp-field textarea{background:rgba(255,255,255,.92);border-color:rgba(99,102,241,.32)}
  .mp-field textarea{min-height:160px;height:auto;line-height:1.55;resize:vertical}
  .mp-accent-row{display:flex;flex-wrap:wrap;gap:8px}
  .mp-accent{position:relative;width:34px;height:34px;border-radius:50%;cursor:pointer;display:grid;place-items:center;color:#fff;font-size:18px;box-shadow:0 4px 14px rgba(0,0,0,.18);opacity:.55}
  .mp-accent input{display:none}
  .mp-accent i{opacity:0;transition:opacity .12s}
  .mp-accent:has(input:checked){opacity:1;transform:scale(1.08)}
  .mp-accent:has(input:checked) i{opacity:1}
  .mp-image-preview{margin-top:8px;border-radius:14px;overflow:hidden;border:1px solid rgba(139,92,246,.24);max-width:260px}
  .mp-image-preview img{display:block;width:100%;height:auto}
  .mp-image-remove{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;margin-top:8px;color:#fca5a5;cursor:pointer}
  .mp-image-remove input{width:auto;margin:0}
  .mp-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
  .mp-card{display:flex;flex-direction:column;border-radius:18px;background:linear-gradient(145deg,rgba(13,18,38,.94),rgba(10,14,28,.78));border:1px solid rgba(139,92,246,.22);overflow:hidden;position:relative;box-shadow:0 10px 28px rgba(0,0,0,.22)}
  body.light .mp-card{background:rgba(255,255,255,.96);border-color:rgba(99,102,241,.22);box-shadow:0 12px 26px rgba(15,23,42,.08)}
  .mp-card.is-inactive{opacity:.55}
  .mp-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--mp-accent,#7c3aed)}
  .mp-card-img{height:130px;overflow:hidden;background:linear-gradient(135deg,rgba(139,92,246,.18),rgba(15,23,42,.6));display:grid;place-items:center}
  .mp-card-img img{width:100%;height:100%;object-fit:cover}
  .mp-card-img-fallback{font-size:42px;color:#a78bfa}
  .mp-card-body{padding:16px;display:flex;flex-direction:column;gap:10px;flex:1}
  .mp-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .mp-card-head h3{margin:0;font-size:16px;font-weight:900;letter-spacing:-.01em}
  .mp-pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}
  .mp-pill.ok{background:rgba(34,197,94,.16);color:#4ade80}
  .mp-pill.off{background:rgba(148,163,184,.16);color:#94a3b8}
  .mp-card p{margin:0;color:rgba(233,242,255,.7);font-size:13px;line-height:1.5;flex:1}
  body.light .mp-card p{color:rgba(15,23,42,.7)}
  .mp-card-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
  .mp-action{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:9px;font-weight:800;font-size:12px;text-decoration:none;cursor:pointer;border:0;color:#fff}
  .mp-action.edit{background:linear-gradient(135deg,#4338ca,#7c3aed)}
  .mp-action.ok{background:linear-gradient(135deg,#16a34a,#22c55e)}
  .mp-action.warn{background:linear-gradient(135deg,#d97706,#f59e0b)}
  .mp-action.danger{background:linear-gradient(135deg,#7f1d1d,#dc2626)}
  .mp-action:hover{filter:brightness(1.07)}
  .mp-empty{padding:32px;text-align:center;color:rgba(233,242,255,.6);border-radius:18px;background:rgba(15,23,42,.4);border:1px dashed rgba(139,92,246,.3)}
  .mp-empty i{display:block;font-size:38px;margin-bottom:8px;color:#a78bfa}
  .mp-empty b{display:block;font-size:16px;margin-bottom:4px}
</style>
<div class="appr-page">
  <header class="appr-head">
    <p class="appr-eyebrow">Facturación</p>
    <h1>Pago manual / Transferencias</h1>
    <p>Configura métodos de pago donde tus clientes te transfieran directamente (cuentas bancarias, billeteras, etc.). Aparecen como tarjetas en el inicio de cada usuario, con instrucciones para abrir un ticket adjuntando el comprobante.</p>
  </header>
  ${msg}

  <form class="appr-card" id="mp-form" method="POST" action="${formAction}" enctype="multipart/form-data">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-add-circle-line"></i> ${formTitle}</h2>
        <p>${editing ? "Estás editando un método existente. Cambia lo que quieras y guarda." : "Crea una tarjeta nueva. El cliente la verá tal cual la describas."}</p>
      </div>
      <div style="display:flex;gap:8px">
        ${editing ? `<a class="appr-save-btn" style="background:rgba(148,163,184,.18);color:inherit" href="/admin/manual-payments"><i class="ri-arrow-go-back-line"></i> Cancelar</a>` : ""}
        <button class="appr-save-btn"><i class="ri-save-line"></i> ${editing ? "Guardar cambios" : "Crear método"}</button>
      </div>
    </div>
    <div class="appr-card-body">
      ${editing ? `<input type="hidden" name="id" value="${editing.id}">` : ""}
      <div class="mp-form-grid">
        <label class="mp-field">
          <span>Título <em style="color:#f87171">*</em></span>
          <input type="text" name="title" required placeholder="Transferencia BBVA / PayPal Familia / Binance Pay" value="${h(ctx, editing?.title)}">
        </label>
        <label class="mp-field">
          <span>Orden</span>
          <input type="number" name="order_index" min="1" placeholder="100" value="${editing ? editing.order_index : 100}">
        </label>
        <label class="mp-field" style="grid-column:1/-1">
          <span>Descripción / datos de la cuenta</span>
          <textarea name="description" placeholder="Banco: BBVA México&#10;Titular: Juan Pérez&#10;CLABE: 012345678901234567&#10;Cuenta: 1234 5678 9012 3456&#10;Concepto: tu correo o número de usuario&#10;Moneda: MXN">${h(ctx, editing?.description)}</textarea>
        </label>
        <div class="mp-field" style="grid-column:1/-1">
          <span>Imagen (opcional)</span>
          <input type="file" name="image" accept="image/*">
          ${editing?.image_path ? `
            <div class="mp-image-preview"><img src="${h(ctx, editing.image_path)}" alt=""></div>
            <label class="mp-image-remove"><input type="checkbox" name="remove_image" value="1"> Quitar la imagen actual</label>` : ""}
        </div>
        <div class="mp-field" style="grid-column:1/-1">
          <span>Color de acento</span>
          <div class="mp-accent-row">${accentOptions}</div>
        </div>
        <div class="mp-field" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:14px">
          <label class="appr-toggle"><input type="checkbox" name="active" value="1" ${(!editing || editing.active) ? "checked" : ""}><em></em></label>
          <span style="font-weight:800;color:rgba(233,242,255,.85)">Método activo (visible para los clientes)</span>
        </div>
      </div>
    </div>
  </form>

  <section class="appr-card">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-stack-line"></i> Métodos configurados</h2>
        <p>${methods.length} método${methods.length === 1 ? "" : "s"} ${methods.length === 1 ? "creado" : "creados"}. Sólo los activos se muestran en la dashboard de los clientes.</p>
      </div>
    </div>
    <div class="appr-card-body">
      <div class="mp-cards-grid">${cardsHtml}</div>
    </div>
  </section>

  <section class="appr-card">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-information-line"></i> Cómo funciona para el cliente</h2>
        <p>Esta es la información que verá tu cliente cuando elija pagar por transferencia.</p>
      </div>
    </div>
    <div class="appr-card-body">
      <ol style="margin:0;padding-left:18px;line-height:1.75;color:rgba(233,242,255,.85)">
        <li>El cliente entra a la dashboard y ve las tarjetas de pago manual que tú creaste aquí.</li>
        <li>Elige una y copia los datos de transferencia.</li>
        <li>Hace la transferencia desde su banco / app.</li>
        <li>Toma captura del comprobante.</li>
        <li>Hace clic en <b>"Abrir ticket con comprobante"</b> que aparece en cada tarjeta. Eso lo lleva a <code>/tickets</code> donde adjunta el capture.</li>
        <li>Tú revisas el ticket y, si todo está bien, le agregas el crédito desde <b>Admin → Usuarios → Créditos</b>.</li>
      </ol>
    </div>
  </section>
</div>`,
    });
  });

  return r;
}

module.exports = { config, router };
