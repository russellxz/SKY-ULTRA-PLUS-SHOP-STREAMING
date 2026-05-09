"use strict";
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const config = {
  key: "client_tickets",
  name: "Mis tickets",
  icon: "ri-customer-service-2-line",
  route: "/tickets",
  area: "client",
  category: "Cuenta",
  permission: "user",
  order: 30,
};

const ALLOWED_IMG = [".jpg",".jpeg",".png",".gif",".webp"];
const ALLOWED_VID = [".mp4",".webm",".mov",".m4v"];
const MAX_SIZE = 50 * 1024 * 1024;

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
function statusLabel(s){return ({open:"Abierto",pending:"En proceso",solved:"Resuelto",closed:"Cerrado"})[s]||s;}

const ASSETS = `<link rel="stylesheet" href="/public/css/tickets-design.css?v=1"><script src="/public/js/tickets.js?v=1" defer></script>`;

function router(ctx){
  const r = express.Router();
  r.use(ctx.auth.requireUser);
  migrate(ctx.db);

  r.post("/create", (req,res)=>{
    const subject = String(req.body.subject||"").trim();
    if(!subject) return res.redirect("/tickets?error=subject");
    const now = ctx.db.now();
    const info = ctx.db.sqlite.prepare("INSERT INTO tickets (user_id,subject,status,created_at,last_activity_at) VALUES (?,?,?,?,?)").run(req.session.user.id,subject,"open",now,now);
    const body = String(req.body.body||"").trim();
    let attach = null;
    try{ if(req.files && req.files.attachment) attach = saveAttachment(req.files.attachment); }catch{}
    if(body || attach){
      ctx.db.sqlite.prepare("INSERT INTO ticket_messages (ticket_id,user_id,role,body,attachment_path,attachment_type,created_at) VALUES (?,?,?,?,?,?,?)").run(info.lastInsertRowid,req.session.user.id,"user",body,attach?attach.path:"",attach?attach.type:"",now);
    }
    res.redirect(`/tickets/${info.lastInsertRowid}`);
  });

  r.post("/:id/message", (req,res)=>{
    const id = req.params.id;
    const t = ctx.db.sqlite.prepare("SELECT * FROM tickets WHERE id=? AND user_id=?").get(id,req.session.user.id);
    if(!t) return res.status(404).json({ok:false,error:"No existe"});
    if(t.status==="closed") return res.status(403).json({ok:false,error:"Ticket cerrado"});
    let attach = null;
    try{ if(req.files && req.files.attachment) attach = saveAttachment(req.files.attachment); }catch(e){
      return res.status(400).json({ok:false,error:e.message});
    }
    const body = String(req.body.body||"").trim();
    if(!body && !attach) return res.status(400).json({ok:false,error:"Mensaje vacio"});
    const now = ctx.db.now();
    ctx.db.sqlite.prepare("INSERT INTO ticket_messages (ticket_id,user_id,role,body,attachment_path,attachment_type,created_at) VALUES (?,?,?,?,?,?,?)").run(id,req.session.user.id,"user",body,attach?attach.path:"",attach?attach.type:"",now);
    ctx.db.sqlite.prepare("UPDATE tickets SET last_activity_at=?, status=CASE WHEN status='solved' OR status='closed' THEN 'open' ELSE status END WHERE id=?").run(now,id);
    if(req.headers["x-requested-with"]==="fetch") return res.json({ok:true});
    res.redirect(`/tickets/${id}`);
  });

  r.get("/:id", (req,res)=>{
    const t = ctx.db.sqlite.prepare("SELECT * FROM tickets WHERE id=? AND user_id=?").get(req.params.id,req.session.user.id);
    if(!t) return res.redirect("/tickets");
    const messages = ctx.db.sqlite.prepare(`
      SELECT m.*, u.username, u.first_name, u.last_name
      FROM ticket_messages m
      LEFT JOIN users u ON u.id=m.user_id
      WHERE m.ticket_id=?
      ORDER BY m.id ASC
    `).all(t.id);
    const u = ctx.db.getUserById(req.session.user.id);
    const myName = `${u.first_name||u.username||""} ${u.last_name||""}`.trim()||u.email;
    const msgsHtml = messages.map(m=>{
      const isMe = m.role==="user";
      const cls = isMe ? "from-self" : "from-other";
      const author = isMe ? myName : "Soporte";
      const att = m.attachment_path ? (
        m.attachment_type==="image"
          ? `<a class="tk-msg-attach" href="${h(ctx,m.attachment_path)}" target="_blank"><img src="${h(ctx,m.attachment_path)}" alt=""></a>`
          : `<div class="tk-msg-attach"><video controls preload="metadata" src="${h(ctx,m.attachment_path)}"></video></div>`
      ) : "";
      return `<div class="tk-msg ${cls}">
        <div class="tk-msg-avatar">${h(ctx,initials(author))}</div>
        <div>
          ${!isMe?`<span class="tk-msg-author">${h(ctx,author)}</span>`:""}
          <div class="tk-msg-bubble">${m.body?h(ctx,m.body).replace(/\n/g,"<br>"):""}${att}<span class="tk-msg-time">${h(ctx,fmtDate(m.created_at))}</span></div>
        </div>
      </div>`;
    }).join("");
    const closed = t.status==="closed";
    res.renderPage({title:`Ticket #${t.id}`,area:"client",registry:reg(ctx),content:`${ASSETS}
<div class="tk-admin">
  <div class="tk-crumb"><a href="/tickets">Mis tickets</a> &gt; <span class="now">#${t.id}</span></div>
  <div class="tk-head">
    <div>
      <h1>${h(ctx,t.subject)}</h1>
      <p>Conversación con el equipo de soporte</p>
    </div>
  </div>
  <div class="tk-chat-wrap">
    <aside class="tk-chat-aside">
      <div class="tk-chat-aside-head"><h2>Detalles</h2><p>Información del ticket</p></div>
      <div class="tk-chat-aside-body">
        <div class="tk-info-row"><i class="ri-hashtag"></i> ID <b>#${t.id}</b></div>
        <div class="tk-info-row"><i class="ri-pulse-line"></i> Estado <b><span class="tk-pill ${h(ctx,t.status)}">${h(ctx,statusLabel(t.status))}</span></b></div>
        <div class="tk-info-row"><i class="ri-calendar-line"></i> Creado <b style="font-size:11px">${h(ctx,fmtDate(t.created_at))}</b></div>
        ${t.last_activity_at?`<div class="tk-info-row"><i class="ri-time-line"></i> Última <b style="font-size:11px">${h(ctx,fmtRelative(t.last_activity_at))}</b></div>`:""}
      </div>
    </aside>
    <main class="tk-chat-main">
      <header class="tk-chat-head">
        <div class="tk-chat-head-avatar"><i class="ri-customer-service-2-line"></i></div>
        <div class="tk-chat-head-info"><b>Soporte</b><small>Equipo de atención</small></div>
        <span class="tk-pill ${h(ctx,t.status)}">${h(ctx,statusLabel(t.status))}</span>
      </header>
      <div class="tk-chat-body">
        ${msgsHtml||'<div class="tk-empty"><i class="ri-chat-3-line"></i><h3>Sin mensajes aún</h3><p>Envía tu primer mensaje al equipo de soporte.</p></div>'}
      </div>
      <div class="tk-chat-input">
        ${closed?`<p style="margin:0;text-align:center;color:rgba(233,242,255,.55);font-size:13px">Este ticket está cerrado. Si necesitas algo, abre uno nuevo.</p>`:`
        <div class="tk-attach-preview" id="tkAttachPreview">
          <i class="ri-attachment-line"></i>
          <span class="tk-attach-preview-name" id="tkAttachPreviewName"></span>
          <button type="button" id="tkAttachClear"><i class="ri-close-line"></i></button>
        </div>
        <div class="tk-progress" id="tkProgress"><div class="tk-progress-bar" id="tkProgressBar"></div></div>
        <div class="tk-progress-label" id="tkProgressLabel" style="display:none"></div>
        <form id="tkChatForm" class="tk-chat-form" method="POST" action="/tickets/${t.id}/message" enctype="multipart/form-data">
          <label class="tk-attach-btn" title="Adjuntar imagen o video">
            <i class="ri-attachment-2"></i>
            <input type="file" name="attachment" accept="image/*,video/*">
          </label>
          <textarea class="tk-chat-textarea" name="body" placeholder="Escribe tu mensaje..." rows="1"></textarea>
          <button type="submit" class="tk-send-btn" title="Enviar"><i class="ri-send-plane-fill"></i></button>
        </form>`}
      </div>
    </main>
  </div>
</div>`});
  });

  r.get("/", (req,res)=>{
    const list = ctx.db.sqlite.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id=t.id) msg_count,
        (SELECT body FROM ticket_messages WHERE ticket_id=t.id ORDER BY id DESC LIMIT 1) last_msg
      FROM tickets t
      WHERE t.user_id=?
      ORDER BY COALESCE(t.last_activity_at,t.created_at) DESC
    `).all(req.session.user.id);
    let msg = "";
    if(req.query.error==="subject") msg = `<div class="notice error" style="margin:0">El asunto es obligatorio.</div>`;
    const cards = list.map(t=>{
      const last = (t.last_msg||"").slice(0,80) + ((t.last_msg||"").length>80?"…":"");
      return `<a class="tk-card" href="/tickets/${t.id}" data-status="${h(ctx,t.status)}">
        <div class="tk-card-avatar"><i class="ri-message-3-line"></i></div>
        <div class="tk-card-info">
          <div class="tk-card-top">
            <span class="tk-card-id">#${t.id}</span>
            <span class="tk-pill ${h(ctx,t.status)}">${h(ctx,statusLabel(t.status))}</span>
            <span class="tk-card-subject">${h(ctx,t.subject)}</span>
          </div>
          <div class="tk-card-meta">
            <span><i class="ri-message-3-line"></i> ${t.msg_count} mensaje${t.msg_count===1?"":"s"}</span>
            ${last?`<span style="opacity:.8"><i class="ri-chat-quote-line"></i> ${h(ctx,last)}</span>`:""}
          </div>
        </div>
        <div class="tk-card-side">
          <span class="tk-card-time">${h(ctx,fmtRelative(t.last_activity_at||t.created_at))}</span>
        </div>
      </a>`;
    }).join("");
    res.renderPage({title:"Mis tickets",area:"client",registry:reg(ctx),content:`${ASSETS}
<div class="tk-admin">
  <div class="tk-crumb">Mis tickets &gt; <span class="now">Listado</span></div>
  <div class="tk-head">
    <div>
      <h1>Mis tickets</h1>
      <p>Conversaciones con el equipo de soporte. Aqui puedes pedir ayuda o reportar problemas.</p>
    </div>
    <button class="tk-create-btn" onclick="tkOpenNew()"><i class="ri-add-line"></i> Crear ticket</button>
  </div>
  ${msg}
  <div class="tk-toolbar">
    <label class="tk-search-wrap"><i class="ri-search-line"></i><input id="tkSearch" placeholder="Buscar mis tickets..." oninput="tkFilter()"></label>
    <label class="tk-filter-wrap"><i class="ri-filter-3-line"></i><select id="tkStatus" onchange="tkFilter()"><option value="all">Todos los estados</option><option value="open">Abiertos</option><option value="pending">En proceso</option><option value="solved">Resueltos</option><option value="closed">Cerrados</option></select><i class="ri-arrow-down-s-line caret"></i></label>
    <span></span>
  </div>
  <div class="tk-list">
    ${cards||'<div class="tk-empty"><i class="ri-customer-service-2-line"></i><h3>No tienes tickets aún</h3><p>Si necesitas ayuda con algo, crea un nuevo ticket y nuestro equipo te responderá pronto.</p></div>'}
  </div>
</div>
<div id="tkNewModal" class="tk-modal">
  <form class="tk-modal-box" method="POST" action="/tickets/create" enctype="multipart/form-data">
    <header class="tk-modal-head">
      <h3><i class="ri-message-3-line"></i> Nuevo ticket</h3>
      <button type="button" class="tk-modal-close" onclick="tkCloseNew()">×</button>
    </header>
    <div class="tk-modal-body">
      <label class="tk-field"><span>Asunto *</span><input name="subject" placeholder="Ej. Problema con mi servicio" required></label>
      <label class="tk-field"><span>Mensaje inicial</span><textarea name="body" placeholder="Cuéntanos que necesitas..."></textarea></label>
      <label class="tk-field"><span>Adjuntar imagen o video <em style="color:rgba(233,242,255,.45);font-style:normal;font-weight:600">(opcional)</em></span><input type="file" name="attachment" accept="image/*,video/*"></label>
    </div>
    <footer class="tk-modal-foot">
      <button type="button" class="tk-create-btn" style="background:rgba(148,163,184,.16)!important;color:#cbd5e1!important;box-shadow:none!important" onclick="tkCloseNew()">Cancelar</button>
      <button class="tk-create-btn"><i class="ri-send-plane-fill"></i> Crear ticket</button>
    </footer>
  </form>
</div>`});
  });
  return r;
}
module.exports = { config, router };
