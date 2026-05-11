"use strict";
const express = require("express");

const config = {
  key: "admin_invoice_automation",
  name: "Automatización",
  icon: "ri-timer-flash-line",
  route: "/admin/invoice-automation",
  area: "admin",
  category: "Facturación",
  permission: "admin",
  order: 50,
};

const DEF = {
  lifecycle_enabled: "1",
  lifecycle_pending_minutes: "5",
  lifecycle_suspend_minutes: "7",
  lifecycle_cancel_minutes: "10",
};

const OPTIONS = [
  ["5", "5 minutos (prueba)"],
  ["7", "7 minutos (prueba)"],
  ["10", "10 minutos (prueba)"],
  ["60", "1 hora"],
  ["1440", "1 día"],
  ["4320", "3 días"],
  ["10080", "7 días"],
  ["21600", "15 días"],
  ["43200", "30 días"],
];

let workerStarted = false;
let lastRunAt = null;
let lastRunStats = null;

function ensureColumn(db, table, column, type) {
  const cols = db.sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function ensureSchema(db) {
  ensureColumn(db, "invoices", "state_changed_at", "TEXT");
  ensureColumn(db, "services", "state_changed_at", "TEXT");
}

function findServiceByInvoiceId(db, invoiceId) {
  let svc = db.sqlite.prepare("SELECT * FROM services WHERE invoice_id=?").get(invoiceId);
  if (svc) return svc;
  const inv = db.sqlite.prepare("SELECT metadata_json FROM invoices WHERE id=?").get(invoiceId);
  if (!inv) return null;
  try {
    const meta = JSON.parse(inv.metadata_json || "{}");
    if (meta.service_id) {
      return db.sqlite.prepare("SELECT * FROM services WHERE id=?").get(meta.service_id);
    }
  } catch (_) { }
  return null;
}

function invoiceIdsForService(db, serviceId) {
  const ids = new Set();
  const svc = db.sqlite.prepare("SELECT invoice_id FROM services WHERE id=?").get(serviceId);
  if (svc && svc.invoice_id) ids.add(svc.invoice_id);
  const renewals = db.sqlite.prepare("SELECT id FROM invoices WHERE metadata_json LIKE ?")
    .all(`%"service_id":${serviceId}%`);
  for (const r of renewals) ids.add(r.id);
  return [...ids];
}

function deleteInvoiceHard(db, id) {
  db.sqlite.prepare("DELETE FROM invoice_items WHERE invoice_id=?").run(id);
  db.sqlite.prepare("DELETE FROM payments WHERE invoice_id=?").run(id);
  db.sqlite.prepare("DELETE FROM delivery_allocations WHERE invoice_id=?").run(id);
  db.sqlite.prepare("DELETE FROM invoices WHERE id=?").run(id);
}

function tickOnce(db) {
  ensureSchema(db);
  const stats = { suspended: 0, canceled: 0, deleted_invoices: 0, deleted_services: 0 };
  const enabled = db.getSetting("lifecycle_enabled", DEF.lifecycle_enabled) === "1";
  if (!enabled) return stats;

  const pMin = Math.max(1, parseInt(db.getSetting("lifecycle_pending_minutes", DEF.lifecycle_pending_minutes), 10));
  const sMin = Math.max(1, parseInt(db.getSetting("lifecycle_suspend_minutes", DEF.lifecycle_suspend_minutes), 10));
  const cMin = Math.max(1, parseInt(db.getSetting("lifecycle_cancel_minutes", DEF.lifecycle_cancel_minutes), 10));

  const now = new Date();
  const pCut = new Date(now.getTime() - pMin * 60000).toISOString();
  const sCut = new Date(now.getTime() - sMin * 60000).toISOString();
  const cCut = new Date(now.getTime() - cMin * 60000).toISOString();

  // 1) pending → suspended
  const pendInvs = db.sqlite.prepare(
    "SELECT id FROM invoices WHERE status='pending' AND datetime(COALESCE(state_changed_at, created_at)) <= datetime(?)"
  ).all(pCut);
  for (const r of pendInvs) {
    db.sqlite.prepare("UPDATE invoices SET status='suspended', state_changed_at=? WHERE id=?").run(db.now(), r.id);
    const svc = findServiceByInvoiceId(db, r.id);
    if (svc && svc.status !== "canceled" && svc.status !== "suspended") {
      db.sqlite.prepare("UPDATE services SET status='suspended', state_changed_at=? WHERE id=?").run(db.now(), svc.id);
    }
    stats.suspended++;
  }

  // 2) suspended → canceled
  const suspInvs = db.sqlite.prepare(
    "SELECT id FROM invoices WHERE status='suspended' AND datetime(COALESCE(state_changed_at, created_at)) <= datetime(?)"
  ).all(sCut);
  for (const r of suspInvs) {
    db.sqlite.prepare("UPDATE invoices SET status='canceled', state_changed_at=? WHERE id=?").run(db.now(), r.id);
    const svc = findServiceByInvoiceId(db, r.id);
    if (svc && svc.status !== "canceled") {
      db.sqlite.prepare("UPDATE services SET status='canceled', canceled_at=?, state_changed_at=? WHERE id=?")
        .run(db.now(), db.now(), svc.id);
    }
    stats.canceled++;
  }

  // 3) canceled → deleted (service + all invoices linked to it)
  const cancInvs = db.sqlite.prepare(
    "SELECT id FROM invoices WHERE status='canceled' AND datetime(COALESCE(state_changed_at, canceled_at, created_at)) <= datetime(?)"
  ).all(cCut);
  for (const r of cancInvs) {
    const exists = db.sqlite.prepare("SELECT id FROM invoices WHERE id=?").get(r.id);
    if (!exists) continue;
    const svc = findServiceByInvoiceId(db, r.id);
    if (svc) {
      const ids = invoiceIdsForService(db, svc.id);
      ids.push(r.id);
      const uniq = [...new Set(ids)];
      for (const iid of uniq) {
        deleteInvoiceHard(db, iid);
        stats.deleted_invoices++;
      }
      db.sqlite.prepare("DELETE FROM services WHERE id=?").run(svc.id);
      stats.deleted_services++;
    } else {
      deleteInvoiceHard(db, r.id);
      stats.deleted_invoices++;
    }
  }

  // 4) Canceled services without remaining canceled invoice still in the system
  const cancSvcs = db.sqlite.prepare(
    "SELECT id FROM services WHERE status='canceled' AND datetime(COALESCE(state_changed_at, canceled_at)) <= datetime(?)"
  ).all(cCut);
  for (const r of cancSvcs) {
    const still = db.sqlite.prepare("SELECT id FROM services WHERE id=?").get(r.id);
    if (!still) continue;
    const ids = invoiceIdsForService(db, r.id);
    for (const iid of ids) {
      deleteInvoiceHard(db, iid);
      stats.deleted_invoices++;
    }
    db.sqlite.prepare("DELETE FROM services WHERE id=?").run(r.id);
    stats.deleted_services++;
  }

  return stats;
}

function startWorker(ctx) {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(() => {
    try {
      const stats = tickOnce(ctx.db);
      lastRunAt = new Date().toISOString();
      lastRunStats = stats;
      const any = stats.suspended || stats.canceled || stats.deleted_invoices || stats.deleted_services;
      if (any) console.log(`[lifecycle] suspended=${stats.suspended} canceled=${stats.canceled} delInv=${stats.deleted_invoices} delSvc=${stats.deleted_services}`);
    } catch (e) {
      console.error("[lifecycle] error:", e.message);
    }
  }, 30 * 1000);
}

function h(ctx, v) { return ctx.layout.escapeHtml(v == null ? "" : v); }
function reg(ctx) { return require("../../core/pluginLoader").registry(ctx.db); }
function g(db, k) { return db.getSetting(k, DEF[k] || ""); }

function selectRow(ctx, k, title, desc, icon) {
  const sel = g(ctx.db, k);
  return `<div class="appr-row">
    <span class="appr-row-icon"><i class="${icon}"></i></span>
    <div class="appr-row-text"><b>${title}</b><small>${desc}</small></div>
    <div class="appr-row-control">
      <span class="appr-select"><select name="${k}">${OPTIONS.map(o => `<option value="${o[0]}" ${sel === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></span>
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

function router(ctx) {
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);

  ensureSchema(ctx.db);
  for (const [k, v] of Object.entries(DEF)) if (!ctx.db.getSetting(k, "")) ctx.db.setSetting(k, v);
  startWorker(ctx);

  r.post("/save", (req, res) => {
    ctx.db.setSetting("lifecycle_enabled", req.body.lifecycle_enabled === "1" ? "1" : "0");
    for (const key of ["lifecycle_pending_minutes", "lifecycle_suspend_minutes", "lifecycle_cancel_minutes"]) {
      const v = parseInt(req.body[key], 10);
      if (Number.isFinite(v) && v > 0) ctx.db.setSetting(key, String(v));
    }
    res.redirect("/admin/invoice-automation?saved=1");
  });

  r.post("/run-now", (req, res) => {
    try {
      const stats = tickOnce(ctx.db);
      lastRunAt = new Date().toISOString();
      lastRunStats = stats;
      const qs = new URLSearchParams({
        ran: "1",
        s: String(stats.suspended),
        c: String(stats.canceled),
        di: String(stats.deleted_invoices),
        ds: String(stats.deleted_services),
      }).toString();
      res.redirect(`/admin/invoice-automation?${qs}`);
    } catch (e) {
      res.redirect("/admin/invoice-automation?error=" + encodeURIComponent(e.message || "Error"));
    }
  });

  r.get("/", (req, res) => {
    const enabled = g(ctx.db, "lifecycle_enabled") === "1";
    const pending = ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM invoices WHERE status='pending'").get().c;
    const susp = ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM invoices WHERE status='suspended'").get().c;
    const canc = ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM invoices WHERE status='canceled'").get().c;

    let msg = "";
    if (req.query.saved) msg = `<div class="appr-notice success"><i class="ri-checkbox-circle-line"></i> Configuración guardada.</div>`;
    if (req.query.ran) {
      const s = req.query.s || "0", c = req.query.c || "0", di = req.query.di || "0", ds = req.query.ds || "0";
      msg = `<div class="appr-notice success"><i class="ri-flashlight-line"></i> Ciclo ejecutado: ${h(ctx, s)} suspendidas, ${h(ctx, c)} canceladas, ${h(ctx, di)} facturas eliminadas, ${h(ctx, ds)} servicios eliminados.</div>`;
    }
    if (req.query.error) msg = `<div class="appr-notice" style="background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.32)"><i class="ri-error-warning-line"></i> ${h(ctx, req.query.error)}</div>`;

    const lastRunHtml = lastRunAt
      ? `Última corrida: ${h(ctx, new Date(lastRunAt).toLocaleString())}${lastRunStats ? ` · ${lastRunStats.suspended} susp · ${lastRunStats.canceled} canc · ${lastRunStats.deleted_invoices} fact elim · ${lastRunStats.deleted_services} serv elim` : ""}`
      : "Aún no se ha ejecutado el ciclo desde el último arranque del servidor.";

    res.renderPage({
      title: "Automatización de facturas",
      area: "admin",
      registry: reg(ctx),
      content: `
<link rel="stylesheet" href="/public/css/admin-appearance-design.css?v=1">
<style>
  .la-counters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
  .la-last{margin-top:14px;color:rgba(233,242,255,.72);font-size:13px;display:flex;gap:8px;align-items:center}
  body.light .la-last{color:rgba(15,23,42,.7)}
  .la-help{margin:0;padding-left:18px;color:rgba(233,242,255,.85);line-height:1.7;font-size:14px}
  body.light .la-help{color:rgba(15,23,42,.85)}
  .la-warn{margin-top:14px;padding:14px 16px;border-radius:14px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.28);color:#fde68a;font-size:13px;display:flex;gap:10px;align-items:flex-start}
  body.light .la-warn{color:#92400e;background:rgba(245,158,11,.16)}
</style>
<div class="appr-page">
  <header class="appr-head">
    <p class="appr-eyebrow">Facturación</p>
    <h1>Automatización de facturas</h1>
    <p>Configura cuánto tiempo deben permanecer las facturas en cada estado para que el sistema las suspenda, cancele y elimine automáticamente. Útil para mantener limpia tu base de datos.</p>
  </header>
  ${msg}

  <section class="appr-card">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-pulse-line"></i> Estado actual</h2>
        <p>Resumen de las facturas en el sistema y de la última ejecución del ciclo.</p>
      </div>
      <form method="POST" action="/admin/invoice-automation/run-now" style="margin:0" onsubmit="return confirm('¿Ejecutar el ciclo de automatización ahora? Esto aplicará las reglas de tiempo inmediatamente.')">
        <button type="submit" class="appr-save-btn"><i class="ri-flashlight-line"></i> Forzar ciclo ahora</button>
      </form>
    </div>
    <div class="appr-card-body">
      <div class="la-counters">
        <div class="appr-row"><span class="appr-row-icon" style="background:rgba(245,158,11,.16);color:#fbbf24"><i class="ri-time-line"></i></span><div class="appr-row-text"><b>${pending}</b><small>Pendientes</small></div></div>
        <div class="appr-row"><span class="appr-row-icon" style="background:rgba(236,72,153,.16);color:#f9a8d4"><i class="ri-pause-circle-line"></i></span><div class="appr-row-text"><b>${susp}</b><small>Suspendidas</small></div></div>
        <div class="appr-row"><span class="appr-row-icon" style="background:rgba(239,68,68,.16);color:#fca5a5"><i class="ri-close-circle-line"></i></span><div class="appr-row-text"><b>${canc}</b><small>Canceladas</small></div></div>
      </div>
      <div class="la-last"><i class="ri-history-line"></i> ${lastRunHtml}</div>
    </div>
  </section>

  <form class="appr-card" method="POST" action="/admin/invoice-automation/save">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-timer-flash-line"></i> Reglas de tiempo</h2>
        <p>El worker corre cada 30 segundos y aplica estas transiciones a facturas y servicios.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar</button>
    </div>
    <div class="appr-card-body">
      ${toggleRow("lifecycle_enabled", "Activar automatización", "Cuando está activado el worker procesa los cambios automáticos. Desactívalo para hacer pausas.", "ri-power-line", enabled)}
      ${selectRow(ctx, "lifecycle_pending_minutes", "Pendiente → Suspendida", "Tiempo que una factura puede permanecer pendiente antes de pasar a suspendida (también suspende el servicio asociado).", "ri-time-line")}
      ${selectRow(ctx, "lifecycle_suspend_minutes", "Suspendida → Cancelada", "Tiempo que se mantiene suspendida antes de cancelarse automáticamente (también cancela el servicio).", "ri-pause-circle-line")}
      ${selectRow(ctx, "lifecycle_cancel_minutes", "Cancelada → Eliminada", "Tiempo que se mantiene cancelada antes de borrar el servicio y todas las facturas relacionadas.", "ri-delete-bin-2-line")}
    </div>
  </form>

  <section class="appr-card">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-information-line"></i> ¿Cómo funciona el ciclo?</h2>
        <p>El sistema gestiona el ciclo de vida completo de las facturas pendientes y de los servicios asociados.</p>
      </div>
    </div>
    <div class="appr-card-body">
      <ol class="la-help">
        <li><b>Pendiente → Suspendida.</b> Las facturas pendientes durante más tiempo del configurado pasan automáticamente a <em>suspendida</em>. Si la factura corresponde a un servicio activo (por ejemplo una renovación), el servicio también queda suspendido y la información privada deja de mostrarse al cliente.</li>
        <li><b>Suspendida → Cancelada.</b> Pasado el tiempo configurado, las facturas suspendidas se marcan como <em>canceladas</em>. El servicio asociado también queda cancelado.</li>
        <li><b>Cancelada → Eliminada.</b> Una vez transcurrido el tiempo configurado, se elimina el servicio cancelado <strong>y todas las facturas relacionadas con él</strong> (factura original y renovaciones) para liberar espacio.</li>
      </ol>
      <div class="la-warn"><i class="ri-error-warning-line"></i><span>Para hacer pruebas usa los tiempos cortos (5, 7, 10 minutos). En producción se recomienda 1 día, 3 días, 7 días, 15 días o 30 días según tu política comercial.</span></div>
    </div>
  </section>
</div>`
    });
  });

  return r;
}

module.exports = { config, router, tickOnce };
