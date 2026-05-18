"use strict";
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const config = {
  key: "admin_tickets",
  name: "Tickets",
  icon: "ri-customer-service-2-line",
  route: "/admin/tickets",
  area: "admin",
  category: "Usuarios",
  permission: "admin",
  order: 25,
};

const ALLOWED_IMG = [".jpg",".jpeg",".png",".gif",".webp"];
const ALLOWED_VID = [".mp4",".webm",".mov",".m4v"];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

function migrate(db){
  const cols = db.sqlite.prepare("PRAGMA table_info(tickets)").all().map(c=>c.name);
  if(!cols.includes("priority")) db.sqlite.exec("ALTER TABLE tickets ADD COLUMN priority TEXT DEFAULT 'normal'");
  if(!cols.includes("category")) db.sqlite.exec("ALTER TABLE tickets ADD COLUMN category TEXT DEFAULT 'general'");
  if(!cols.includes("last_activity_at")) db.sqlite.exec("ALTER TABLE tickets ADD COLUMN last_activity_at TEXT");
  db.sqlite.exec(`CREATE TABLE IF NOT EXISTS ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    body TEXT NOT NULL DEFAULT '',
    attachment_path TEXT DEFAULT '',
    attachment_type TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`);
  db.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id)`);
}

function h(ctx,v){return ctx.layout.escapeHtml(v||"");}
function reg(ctx){return require("../../core/pluginLoader").registry(ctx.db);}
function initials(name){return String(name||"U").trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"U";}
function fmtDate(v){if(!v)return"";try{const d=new Date(v);return d.toLocaleDateString("es",{day:"2-digit",month:"short",year:"numeric"})+", "+d.toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});}catch{return"";}}
function fmtRelative(v){
  if(!v)return"";
  try{
    const d = new Date(v); const now = new Date();
    const diff = (now - d)/1000;
    if(diff < 60) return "hace un momento";
    if(diff < 3600) return "hace "+Math.round(diff/60)+" min";
    if(diff < 86400) return "hace "+Math.round(diff/3600)+" h";
    if(diff < 604800) return "hace "+Math.round(diff/86400)+" d";
    return d.toLocaleDateString("es",{day:"2-digit",month:"short"});
  }catch{return"";}
}

function saveAttachment(file){
  if(!file||!file.name) return null;
  if(file.size > MAX_SIZE) throw new Error("Archivo demasiado grande (max 50MB)");
  const ext = (path.extname(file.name)||"").toLowerCase();
  let type = "";
  if(ALLOWED_IMG.includes(ext)) type = "image";
  else if(ALLOWED_VID.includes(ext)) type = "video";
  else throw new Error("Tipo de archivo no permitido");
  const dir = path.join(process.cwd(),"uploads","tickets");
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  const name = Date.now()+"-"+crypto.randomBytes(4).toString("hex")+ext;
  const dest = path.join(dir,name);
  if (file.tempFilePath) {
    try { fs.renameSync(file.tempFilePath, dest); }
    catch(e){ fs.copyFileSync(file.tempFilePath, dest); try{ fs.unlinkSync(file.tempFilePath); }catch(_){} }
  } else if (file.data && file.data.length) {
    fs.writeFileSync(dest, file.data);
  } else {
    return null;
  }
  return { path: "/uploads/tickets/"+name, type };
}

const ASSETS = `<link rel="stylesheet" href="/public/css/tickets-design.css?v=2"><script src="/public/js/tickets.js?v=1" defer></script>
<style>
  .tk-modal{position:fixed;inset:0;background:rgba(2,6,15,.7);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;z-index:9999;padding:18px}
  .tk-modal.open{display:flex}
  .tk-modal-box{background:linear-gradient(145deg,rgba(13,18,38,.96),rgba(10,14,28,.92));border:1px solid rgba(139,92,246,.32);border-radius:22px;padding:26px;max-width:520px;width:100%;color:#e9f2ff;position:relative;box-shadow:0 30px 80px rgba(0,0,0,.5)}
  body.light .tk-modal-box{background:rgba(255,255,255,.98);color:#102033;border-color:rgba(99,102,241,.32)}
  .tk-modal-x{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:10px;background:rgba(244,63,94,.16);border:1px solid rgba(244,63,94,.32);color:#fb7185;display:grid;place-items:center;cursor:pointer;font-size:18px}
  .tk-modal-box h2{margin:0 0 4px;font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px}
  .tk-new-form{display:flex;flex-direction:column;gap:12px;margin-top:8px}
  .tk-field{display:flex;flex-direction:column;gap:6px}
  .tk-field>span{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;opacity:.75}
  .tk-field input[type=text],.tk-field select,.tk-field textarea{background:rgba(15,23,42,.6);border:1px solid rgba(139,92,246,.32);color:inherit;border-radius:11px;padding:10px 14px;font-family:inherit;font-size:14px;font-weight:600;width:100%;box-sizing:border-box}
  body.light .tk-field input[type=text],body.light .tk-field select,body.light .tk-field textarea{background:rgba(255,255,255,.9);border-color:rgba(99,102,241,.32)}
  .tk-field textarea{min-height:90px;resize:vertical;line-height:1.5}
  .tk-new-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:6px}
  .tk-modal-cancel{background:rgba(148,163,184,.18);color:inherit;border:1px solid rgba(148,163,184,.32);padding:9px 16px;border-radius:11px;font-weight:800;cursor:pointer}
  .tk-create-btn{background:linear-gradient(135deg,#4338ca,#7c3aed);color:#fff;border:0;padding:10px 16px;border-radius:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
  .tk-create-btn:hover{filter:brightness(1.07)}
</style>`;

function statusLabel(s){return ({open:"Abierto",pending:"En proceso",solved:"Resuelto",closed:"Cerrado"})[s]||s;}

function router(ctx){
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);
  migrate(ctx.db);

  // Crear ticket en nombre de un usuario
  r.post("/create-for", (req,res)=>{
    const userId = Number(req.body.user_id || 0);
    const subject = String(req.body.subject || "").trim();
    const body = String(req.body.body || "").trim();
    if (!userId || !subject) return res.redirect("/admin/tickets?error=" + encodeURIComponent("Selecciona un usuario y escribe el asunto."));
    const u = ctx.db.getUserById(userId);
    if (!u) return res.redirect("/admin/tickets?error=" + encodeURIComponent("Usuario no encontrado."));
    let attach = null;
    try {
      if (req.files && req.files.attachment) attach = saveAttachment(req.files.attachment);
    } catch (e) {
      return res.redirect("/admin/tickets?error=" + encodeURIComponent(e.message));
    }
    const now = ctx.db.now();
    const info = ctx.db.sqlite.prepare(
      "INSERT INTO tickets (user_id,subject,status,created_at,last_activity_at) VALUES (?,?,?,?,?)"
    ).run(userId, subject, "open", now, now);
    const ticketId = info.lastInsertRowid;
    if (body || attach) {
      ctx.db.sqlite.prepare(
        "INSERT INTO ticket_messages (ticket_id,user_id,role,body,attachment_path,attachment_type,created_at) VALUES (?,?,?,?,?,?,?)"
      ).run(ticketId, req.session.user.id, "admin", body, attach ? attach.path : "", attach ? attach.type : "", now);
    }
    res.redirect(`/admin/tickets/${ticketId}?created=1`);
  });

  r.post("/:id/message", (req,res)=>{
    const id = req.params.id;
    const t = ctx.db.sqlite.prepare("SELECT * FROM tickets WHERE id=?").get(id);
    if(!t) return res.status(404).json({ok:false,error:"No existe"});
    let attach = null;
    try{
      if(req.files && req.files.attachment) attach = saveAttachment(req.files.attachment);
    }catch(e){
      return res.status(400).json({ok:false,error:e.message});
    }
    const body = String(req.body.body||"").trim();
    if(!body && !attach) return res.status(400).json({ok:false,error:"Mensaje vacio"});
    const now = ctx.db.now();
    ctx.db.sqlite.prepare("INSERT INTO ticket_messages (ticket_id,user_id,role,body,attachment_path,attachment_type,created_at) VALUES (?,?,?,?,?,?,?)").run(id,req.session.user.id,"admin",body,attach?attach.path:"",attach?attach.type:"",now);
    ctx.db.sqlite.prepare("UPDATE tickets SET last_activity_at=?, status=CASE WHEN status='solved' OR status='closed' THEN 'open' ELSE status END WHERE id=?").run(now,id);
    if(req.headers["x-requested-with"]==="fetch") return res.json({ok:true});
    res.redirect(`/admin/tickets/${id}`);
  });

  r.post("/:id/status", (req,res)=>{
    const id = req.params.id;
    const status = String(req.body.status||"open");
    if(!["open","pending","solved","closed"].includes(status)) return res.redirect(`/admin/tickets/${id}`);
    ctx.db.sqlite.prepare("UPDATE tickets SET status=? WHERE id=?").run(status,id);
    res.redirect(`/admin/tickets/${id}?ok=status`);
  });

  r.post("/:id/delete",(req,res)=>{
    const id = req.params.id;
    ctx.db.sqlite.prepare("DELETE FROM ticket_messages WHERE ticket_id=?").run(id);
    ctx.db.sqlite.prepare("DELETE FROM tickets WHERE id=?").run(id);
    res.redirect("/admin/tickets?ok=delete");
  });

  r.get("/:id", (req,res)=>{
    const t = ctx.db.sqlite.prepare(`
      SELECT t.*, u.email, u.first_name, u.last_name, u.username
      FROM tickets t
      JOIN users u ON u.id=t.user_id
      WHERE t.id=?
    `).get(req.params.id);
    if(!t) return res.redirect("/admin/tickets");
    const messages = ctx.db.sqlite.prepare(`
      SELECT m.*, u.username, u.first_name, u.last_name
      FROM ticket_messages m
      LEFT JOIN users u ON u.id=m.user_id
      WHERE m.ticket_id=?
      ORDER BY m.id ASC
    `).all(t.id);
    const fullName = `${t.first_name||t.username||""} ${t.last_name||""}`.trim()||t.email;
    const msgsHtml = messages.map(m=>{
      const isAdmin = m.role==="admin";
      const author = `${m.first_name||m.username||""} ${m.last_name||""}`.trim()||"Usuario";
      const cls = isAdmin ? "from-self" : "from-other";
      const att = m.attachment_path ? (
        m.attachment_type==="image"
          ? `<a class="tk-msg-attach" href="${h(ctx,m.attachment_path)}" target="_blank"><img src="${h(ctx,m.attachment_path)}" alt=""></a>`
          : `<div class="tk-msg-attach"><video controls preload="metadata" src="${h(ctx,m.attachment_path)}"></video></div>`
      ) : "";
      return `<div class="tk-msg ${cls}">
        <div class="tk-msg-avatar">${h(ctx,initials(isAdmin?"Admin":author))}</div>
        <div>
          ${!isAdmin?`<span class="tk-msg-author">${h(ctx,author)}</span>`:""}
          <div class="tk-msg-bubble">${m.body?h(ctx,m.body).replace(/\n/g,"<br>"):""}${att}<span class="tk-msg-time">${h(ctx,fmtDate(m.created_at))}</span></div>
        </div>
      </div>`;
    }).join("");
    res.renderPage({title:`Ticket #${t.id}`,area:"admin",registry:reg(ctx),content:`${ASSETS}
<div class="tk-admin">
  <div class="tk-crumb"><a href="/admin/tickets">Tickets</a> &gt; <span class="now">#${t.id}</span></div>
  <div class="tk-head">
    <div>
      <h1>${h(ctx,t.subject)}</h1>
      <p>Conversación con ${h(ctx,fullName)}</p>
    </div>
    <form method="POST" action="/admin/tickets/${t.id}/delete" onsubmit="return confirm('Eliminar este ticket y todos sus mensajes?')" style="margin:0">
      <button class="tk-create-btn" style="background:linear-gradient(135deg,#f43f5e,#be123c)!important"><i class="ri-delete-bin-line"></i> Eliminar ticket</button>
    </form>
  </div>
  <div class="tk-chat-wrap">
    <aside class="tk-chat-aside">
      <div class="tk-chat-aside-head"><h2>Detalles</h2><p>Información del ticket</p></div>
      <div class="tk-chat-aside-body">
        <div class="tk-info-row"><i class="ri-hashtag"></i> ID <b>#${t.id}</b></div>
        <div class="tk-info-row"><i class="ri-user-3-line"></i> Cliente <b>${h(ctx,fullName)}</b></div>
        <div class="tk-info-row"><i class="ri-mail-line"></i> Email <b style="font-size:11px">${h(ctx,t.email)}</b></div>
        <div class="tk-info-row"><i class="ri-pulse-line"></i> Estado <b><span class="tk-pill ${h(ctx,t.status)}">${h(ctx,statusLabel(t.status))}</span></b></div>
        <div class="tk-info-row"><i class="ri-calendar-line"></i> Creado <b style="font-size:11px">${h(ctx,fmtDate(t.created_at))}</b></div>
        ${t.last_activity_at?`<div class="tk-info-row"><i class="ri-time-line"></i> Última <b style="font-size:11px">${h(ctx,fmtRelative(t.last_activity_at))}</b></div>`:""}
        <form class="tk-status-form" method="POST" action="/admin/tickets/${t.id}/status">
          <select name="status">
            <option value="open" ${t.status==='open'?'selected':''}>Abierto</option>
            <option value="pending" ${t.status==='pending'?'selected':''}>En proceso</option>
            <option value="solved" ${t.status==='solved'?'selected':''}>Resuelto</option>
            <option value="closed" ${t.status==='closed'?'selected':''}>Cerrado</option>
          </select>
          <button><i class="ri-check-line"></i> Actualizar estado</button>
        </form>
      </div>
    </aside>
    <main class="tk-chat-main">
      <header class="tk-chat-head">
        <div class="tk-chat-head-avatar">${h(ctx,initials(fullName))}</div>
        <div class="tk-chat-head-info"><b>${h(ctx,fullName)}</b><small>${h(ctx,t.email)}</small></div>
        <span class="tk-pill ${h(ctx,t.status)}">${h(ctx,statusLabel(t.status))}</span>
      </header>
      <div class="tk-chat-body">
        ${msgsHtml||'<div class="tk-empty"><i class="ri-chat-3-line"></i><h3>Sin mensajes aún</h3><p>Comienza la conversación con el cliente.</p></div>'}
      </div>
      <div class="tk-chat-input">
        <div class="tk-attach-preview" id="tkAttachPreview">
          <i class="ri-attachment-line"></i>
          <span class="tk-attach-preview-name" id="tkAttachPreviewName"></span>
          <button type="button" id="tkAttachClear"><i class="ri-close-line"></i></button>
        </div>
        <div class="tk-progress" id="tkProgress"><div class="tk-progress-bar" id="tkProgressBar"></div></div>
        <div class="tk-progress-label" id="tkProgressLabel" style="display:none"></div>
        <form id="tkChatForm" class="tk-chat-form" method="POST" action="/admin/tickets/${t.id}/message" enctype="multipart/form-data">
          <label class="tk-attach-btn" title="Adjuntar imagen o video">
            <i class="ri-attachment-2"></i>
            <input type="file" name="attachment" accept="image/*,video/*">
          </label>
          <textarea class="tk-chat-textarea" name="body" placeholder="Escribe tu respuesta..." rows="1"></textarea>
          <button type="submit" class="tk-send-btn" title="Enviar"><i class="ri-send-plane-fill"></i></button>
        </form>
      </div>
    </main>
  </div>
</div>`});
  });

  r.get("/", (req,res)=>{
    const list = ctx.db.sqlite.prepare(`
      SELECT t.*, u.email, u.first_name, u.last_name, u.username,
        (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id=t.id) msg_count,
        (SELECT body FROM ticket_messages WHERE ticket_id=t.id ORDER BY id DESC LIMIT 1) last_msg
      FROM tickets t
      JOIN users u ON u.id=t.user_id
      ORDER BY COALESCE(t.last_activity_at,t.created_at) DESC
    `).all();
    const stats = {
      open: list.filter(t=>t.status==='open').length,
      pending: list.filter(t=>t.status==='pending').length,
      solved: list.filter(t=>t.status==='solved').length,
      closed: list.filter(t=>t.status==='closed').length,
    };
    let msg = "";
    if(req.query.ok==="delete") msg = `<div class="notice success" style="margin:0">Ticket eliminado.</div>`;
    if(req.query.error) msg = `<div class="notice error" style="margin:0">${h(ctx,req.query.error)}</div>`;
    // Lista de usuarios para el modal "crear ticket en nombre de"
    const users = ctx.db.sqlite.prepare("SELECT id, first_name, last_name, email, username FROM users WHERE role='user' ORDER BY first_name, last_name, email LIMIT 500").all();
    const userOpts = users.map(u=>{
      const name = `${u.first_name||""} ${u.last_name||""}`.trim() || u.username || u.email;
      return `<option value="${u.id}">${h(ctx,name)} — ${h(ctx,u.email)}</option>`;
    }).join("");
    const cards = list.map(t=>{
      const fullName = `${t.first_name||t.username||""} ${t.last_name||""}`.trim()||t.email;
      const last = (t.last_msg||"").slice(0,80) + ((t.last_msg||"").length>80?"…":"");
      return `<a class="tk-card" href="/admin/tickets/${t.id}" data-status="${h(ctx,t.status)}">
        <div class="tk-card-avatar">${h(ctx,initials(fullName))}</div>
        <div class="tk-card-info">
          <div class="tk-card-top">
            <span class="tk-card-id">#${t.id}</span>
            <span class="tk-pill ${h(ctx,t.status)}">${h(ctx,statusLabel(t.status))}</span>
            <span class="tk-card-subject">${h(ctx,t.subject)}</span>
          </div>
          <div class="tk-card-meta">
            <span><i class="ri-user-3-line"></i> ${h(ctx,fullName)}</span>
            <span><i class="ri-message-3-line"></i> ${t.msg_count} mensaje${t.msg_count===1?"":"s"}</span>
            ${last?`<span style="opacity:.8"><i class="ri-chat-quote-line"></i> ${h(ctx,last)}</span>`:""}
          </div>
        </div>
        <div class="tk-card-side">
          <span class="tk-card-time">${h(ctx,fmtRelative(t.last_activity_at||t.created_at))}</span>
        </div>
      </a>`;
    }).join("");
    res.renderPage({title:"Tickets",area:"admin",registry:reg(ctx),content:`${ASSETS}
<div class="tk-admin">
  <div class="tk-crumb">Tickets &gt; <span class="now">Listado</span></div>
  <div class="tk-head">
    <div>
      <h1>Tickets de soporte</h1>
      <p>Gestiona las conversaciones con tus clientes.</p>
    </div>
    <button type="button" class="tk-create-btn" onclick="document.getElementById('tkNewModal').classList.add('open')"><i class="ri-add-circle-line"></i> Nuevo ticket</button>
  </div>
  ${msg}
  <div class="tk-stats">
    <div class="tk-stat open"><div class="tk-stat-icon"><i class="ri-inbox-line"></i></div><div class="tk-stat-text"><span>Abiertos</span><b>${stats.open}</b></div></div>
    <div class="tk-stat pending"><div class="tk-stat-icon"><i class="ri-time-line"></i></div><div class="tk-stat-text"><span>En proceso</span><b>${stats.pending}</b></div></div>
    <div class="tk-stat solved"><div class="tk-stat-icon"><i class="ri-checkbox-circle-line"></i></div><div class="tk-stat-text"><span>Resueltos</span><b>${stats.solved}</b></div></div>
    <div class="tk-stat closed"><div class="tk-stat-icon"><i class="ri-archive-line"></i></div><div class="tk-stat-text"><span>Cerrados</span><b>${stats.closed}</b></div></div>
  </div>
  <div class="tk-toolbar">
    <label class="tk-search-wrap"><i class="ri-search-line"></i><input id="tkSearch" placeholder="Buscar tickets..." oninput="tkFilter()"></label>
    <label class="tk-filter-wrap"><i class="ri-filter-3-line"></i><select id="tkStatus" onchange="tkFilter()"><option value="all">Todos los estados</option><option value="open">Abiertos</option><option value="pending">En proceso</option><option value="solved">Resueltos</option><option value="closed">Cerrados</option></select><i class="ri-arrow-down-s-line caret"></i></label>
  </div>
  <div class="tk-list">
    ${cards||'<div class="tk-empty"><i class="ri-customer-service-2-line"></i><h3>No hay tickets aún</h3><p>Cuando un cliente abra un ticket, aparecerá aquí.</p></div>'}
  </div>
</div>
<div class="tk-modal" id="tkNewModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="tk-modal-box">
    <button type="button" class="tk-modal-x" onclick="document.getElementById('tkNewModal').classList.remove('open')"><i class="ri-close-line"></i></button>
    <h2><i class="ri-add-circle-line"></i> Crear ticket en nombre de un usuario</h2>
    <p style="margin:6px 0 14px;opacity:.7;font-size:13px">Útil para iniciar tú la conversación con un cliente concreto: aviso de pago, recordatorios, soporte proactivo, etc.</p>
    <form method="POST" action="/admin/tickets/create-for" enctype="multipart/form-data" class="tk-new-form">
      <label class="tk-field"><span>Usuario destinatario <em style="color:#f43f5e">*</em></span>
        <select name="user_id" required>
          <option value="">— Selecciona un usuario —</option>
          ${userOpts}
        </select>
      </label>
      <label class="tk-field"><span>Asunto <em style="color:#f43f5e">*</em></span>
        <input type="text" name="subject" required placeholder="Ej: Te confirmamos el pago" maxlength="120">
      </label>
      <label class="tk-field"><span>Mensaje inicial (opcional)</span>
        <textarea name="body" rows="4" placeholder="Hola, te escribo desde soporte para..."></textarea>
      </label>
      <label class="tk-field"><span>Adjunto (opcional)</span>
        <input type="file" name="attachment" accept="image/*,video/*">
      </label>
      <div class="tk-new-actions">
        <button type="button" class="tk-modal-cancel" onclick="document.getElementById('tkNewModal').classList.remove('open')">Cancelar</button>
        <button type="submit" class="tk-create-btn"><i class="ri-send-plane-fill"></i> Crear ticket</button>
      </div>
    </form>
  </div>
</div>`});
  });
  return r;
}
module.exports = { config, router };
