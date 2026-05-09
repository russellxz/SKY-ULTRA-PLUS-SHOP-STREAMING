"use strict";

const express = require("express");
const mailer  = require("../../core/mailer");

const config = {
  key: "admin_mail", name: "Correo SMTP", icon: "ri-mail-send-line",
  route: "/admin/mail", area: "admin", category: "Sistema",
  permission: "admin", order: 20,
};

const CSS = `<link rel="stylesheet" href="/public/css/admin-mail-design.css?v=4">`;

function h(ctx, v) { return ctx.layout.escapeHtml(v || ""); }
function reg(ctx)  { return require("../../core/pluginLoader").registry(ctx.db); }

function getBaseUrl(req) {
  return req.protocol + "://" + req.get("host");
}

function statusBadge(cfg) {
  if (!mailer.isConfigured(cfg))
    return `<div class="ml-status pending"><i class="ri-loader-4-line"></i> Pendiente</div>`;
  return `<div class="ml-status checking" id="mlStatusBadge"><i class="ri-loader-4-line ml-spin"></i> Verificando...</div>`;
}

/* ════════════════════════════════
   TAB 1 — Configuración SMTP
════════════════════════════════ */
function smtpConfigTab(ctx, cfg, req) {
  const requireVerify = ctx.db.getSetting("require_email_verification", "0") === "1";
  const colorFrom     = ctx.db.getSetting("mail_header_color_from", "#4c1d95");
  const colorTo       = ctx.db.getSetting("mail_header_color_to",   "#7c3aed");

  const saved = req.query.saved
    ? `<div class="ml-notice success"><i class="ri-checkbox-circle-line"></i> Configuración guardada correctamente.</div>` : "";
  const err = req.query.error
    ? `<div class="ml-notice error"><i class="ri-error-warning-line"></i> ${h(ctx, req.query.error)}</div>` : "";

  return `
  <!-- Verify toggle -->
  <div class="ml-verify-toggle">
    <div class="ml-verify-icon"><i class="ri-shield-check-line"></i></div>
    <div class="ml-verify-text">
      <strong>Verificación de correo para iniciar sesión</strong>
      <p>Cuando está activo, los nuevos usuarios deben verificar su correo antes de acceder.</p>
    </div>
    <form method="POST" action="/admin/mail/toggle-verify" style="margin:0">
      <label class="ml-toggle">
        <input type="checkbox" name="enabled" value="1" ${requireVerify ? "checked" : ""} onchange="this.form.submit()">
        <em></em>
      </label>
    </form>
  </div>

  ${saved}${err}

  <div class="ml-grid">

    <!-- SMTP Config form -->
    <section class="ml-card">
      <header class="ml-card-head">
        <div class="ml-card-head-icon"><i class="ri-server-line"></i></div>
        <div>
          <h3>Configuración del servidor SMTP</h3>
          <p>Conecta tu proveedor de correo para enviar emails.</p>
        </div>
      </header>

      <form method="POST" action="/admin/mail/save-smtp" class="ml-form">
        <div class="ml-two">
          <label class="ml-field">
            <span>Nombre del remitente</span>
            <input name="smtp_from_name" placeholder="Mi Plataforma" value="${h(ctx, cfg.fromName)}">
          </label>
          <label class="ml-field">
            <span>Correo del remitente</span>
            <input name="smtp_from_email" type="email" placeholder="no-reply@mitienda.com" value="${h(ctx, cfg.fromEmail)}">
          </label>
          <label class="ml-field">
            <span>Host SMTP</span>
            <input name="smtp_host" placeholder="smtp.gmail.com" value="${h(ctx, cfg.host)}">
          </label>
          <label class="ml-field">
            <span>Puerto</span>
            <input name="smtp_port" type="number" placeholder="587" value="${h(ctx, String(cfg.port || 587))}">
          </label>
          <label class="ml-field">
            <span>Seguridad</span>
            <select name="smtp_security">
              <option value="STARTTLS" ${cfg.security === "STARTTLS" ? "selected" : ""}>STARTTLS</option>
              <option value="SSL"      ${cfg.security === "SSL"      ? "selected" : ""}>SSL / TLS</option>
              <option value="NONE"     ${cfg.security === "NONE"     ? "selected" : ""}>Sin cifrado</option>
            </select>
          </label>
          <label class="ml-field">
            <span>Usuario SMTP</span>
            <input name="smtp_user" placeholder="usuario@correo.com" value="${h(ctx, cfg.user)}">
          </label>
          <label class="ml-field" style="grid-column:1/-1">
            <span>Contraseña SMTP</span>
            <div class="ml-pwd-wrap">
              <input id="smtpPass" name="smtp_pass" type="password" placeholder="••••••••" value="${h(ctx, cfg.pass)}">
              <button type="button" class="ml-pwd-eye" onclick="mlTogglePwd()" tabindex="-1">
                <i id="smtpEyeIcon" class="ri-eye-line"></i>
              </button>
            </div>
          </label>
        </div>

        <p class="ml-section-label">Color del encabezado del correo</p>
        <div class="ml-color-row">
          <label class="ml-field">
            <span>Color inicial</span>
            <div class="ml-color-preview">
              <input type="color" name="mail_header_color_from" id="colorFrom"
                value="${h(ctx, colorFrom)}" oninput="mlUpdateColorPreview()">
              <input type="text" id="colorFromText" value="${h(ctx, colorFrom)}"
                oninput="document.getElementById('colorFrom').value=this.value;mlUpdateColorPreview()">
            </div>
          </label>
          <label class="ml-field">
            <span>Color final</span>
            <div class="ml-color-preview">
              <input type="color" name="mail_header_color_to" id="colorTo"
                value="${h(ctx, colorTo)}" oninput="mlUpdateColorPreview()">
              <input type="text" id="colorToText" value="${h(ctx, colorTo)}"
                oninput="document.getElementById('colorTo').value=this.value;mlUpdateColorPreview()">
            </div>
          </label>
        </div>

        <!-- Color preview pill -->
        <div id="mlColorPreviewBar" style="height:44px;border-radius:11px;margin-top:6px;margin-bottom:14px;
          background:linear-gradient(135deg,${h(ctx,colorFrom)},${h(ctx,colorTo)});
          display:flex;align-items:center;justify-content:center;
          font-weight:900;color:#fff;font-size:13px;letter-spacing:.04em;">
          Vista previa del encabezado
        </div>

        <button class="ml-btn primary" type="submit" style="margin-top:0">
          <i class="ri-save-3-line"></i> Guardar configuración
        </button>
      </form>
    </section>

    <!-- Test SMTP -->
    <section class="ml-card">
      <header class="ml-card-head">
        <div class="ml-card-head-icon" style="background:rgba(34,197,94,.14);color:#4ade80">
          <i class="ri-signal-wifi-line"></i>
        </div>
        <div>
          <h3>Probar conexión SMTP</h3>
          <p>Envía un correo de prueba para verificar la configuración.</p>
        </div>
      </header>

      <div class="ml-test-result" id="mlTestResult"></div>

      <div class="ml-test-preview">
        <div class="ml-preview-row"><span class="ml-preview-label">Servidor</span><span>${h(ctx, cfg.host || "—")}</span></div>
        <div class="ml-preview-row"><span class="ml-preview-label">Puerto</span><span>${h(ctx, String(cfg.port || "—"))}</span></div>
        <div class="ml-preview-row"><span class="ml-preview-label">Seguridad</span><span>${h(ctx, cfg.security || "—")}</span></div>
        <div class="ml-preview-row"><span class="ml-preview-label">Usuario</span><span>${h(ctx, cfg.user || "—")}</span></div>
        <div class="ml-preview-row"><span class="ml-preview-label">Remitente</span><span>${h(ctx, cfg.fromEmail || "—")}</span></div>
      </div>

      <label class="ml-field" style="margin-top:8px">
        <span>Enviar correo de prueba a</span>
        <input id="mlTestEmail" type="email" placeholder="admin@mitienda.com">
      </label>
      <button class="ml-btn success" type="button" id="mlTestBtn" onclick="mlTestSMTP()" style="margin-top:10px;width:100%">
        <i class="ri-send-plane-line"></i> Probar conexión
      </button>
    </section>

  </div>

  <script>
  /* password toggle */
  function mlTogglePwd(){
    var i=document.getElementById('smtpPass'),ico=document.getElementById('smtpEyeIcon');
    if(i.type==='password'){i.type='text';ico.className='ri-eye-off-line';}
    else{i.type='password';ico.className='ri-eye-line';}
  }
  /* color sync */
  function mlUpdateColorPreview(){
    var f=document.getElementById('colorFrom').value;
    var t=document.getElementById('colorTo').value;
    document.getElementById('colorFromText').value=f;
    document.getElementById('colorToText').value=t;
    document.getElementById('mlColorPreviewBar').style.background='linear-gradient(135deg,'+f+','+t+')';
  }
  document.getElementById('colorFrom').addEventListener('input',function(){document.getElementById('colorFromText').value=this.value;mlUpdateColorPreview();});
  document.getElementById('colorTo').addEventListener('input',function(){document.getElementById('colorToText').value=this.value;mlUpdateColorPreview();});

  /* SMTP test */
  async function mlTestSMTP(){
    var btn=document.getElementById('mlTestBtn');
    var email=document.getElementById('mlTestEmail').value.trim();
    var res=document.getElementById('mlTestResult');
    btn.disabled=true;
    btn.innerHTML='<i class="ri-loader-4-line ml-spin"></i> Probando...';
    res.className='ml-test-result';res.innerHTML='';
    try{
      const r=await fetch('/admin/mail/test-smtp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      const d=await r.json();
      res.classList.add('show');
      if(d.ok){
        res.classList.add('ok');
        res.innerHTML='<i class="ri-checkbox-circle-fill"></i> Conexión exitosa.'+(email?' Prueba enviada a '+email:'');
        var badge=document.getElementById('mlStatusBadge');
        if(badge){badge.className='ml-status connected';badge.innerHTML='<i class="ri-checkbox-circle-fill"></i> Conectado';}
      } else {
        res.classList.add('err');
        res.innerHTML='<i class="ri-close-circle-fill"></i> '+d.error;
        var badge=document.getElementById('mlStatusBadge');
        if(badge){badge.className='ml-status error';badge.innerHTML='<i class="ri-close-circle-fill"></i> Error';}
      }
    } catch(e){
      res.classList.add('show','err');
      res.innerHTML='<i class="ri-close-circle-fill"></i> Error de red.';
    }
    btn.disabled=false;
    btn.innerHTML='<i class="ri-send-plane-line"></i> Probar conexión';
  }
  /* auto-check on load */
  ${mailer.isConfigured(mailer.getSmtpConfig(ctx.db)) ? `
  (async function(){
    try{
      const r=await fetch('/admin/mail/status');
      const d=await r.json();
      var b=document.getElementById('mlStatusBadge');if(!b)return;
      if(d.ok){b.className='ml-status connected';b.innerHTML='<i class="ri-checkbox-circle-fill"></i> Conectado';}
      else{b.className='ml-status error';b.innerHTML='<i class="ri-close-circle-fill"></i> Error';}
    }catch{}
  })();` : ""}
  </script>`;
}

/* ════════════════════════════════
   TAB 2 — Enviar correos
════════════════════════════════ */
function sendMailTab(ctx, req) {
  const users  = ctx.db.sqlite.prepare("SELECT id,username,first_name,last_name,email FROM users ORDER BY id ASC").all();
  const colorFrom = ctx.db.getSetting("mail_header_color_from", "#4c1d95");
  const colorTo   = ctx.db.getSetting("mail_header_color_to",   "#7c3aed");

  const err = req.query.error
    ? `<div class="ml-notice error"><i class="ri-error-warning-line"></i> ${h(ctx, req.query.error)}</div>` : "";
  const ok = req.query.sent
    ? `<div class="ml-notice success"><i class="ri-checkbox-circle-line"></i> Correos enviados exitosamente: <strong>${h(ctx, req.query.sent)}</strong></div>` : "";

  const userOpts = users.map(u => {
    const name = `${u.first_name || u.username || ""} ${u.last_name || ""}`.trim() || u.email;
    return `<option value="${h(ctx, u.email)}" data-name="${h(ctx, name)}">${h(ctx, name)} — ${h(ctx, u.email)}</option>`;
  }).join("");

  return `
  ${err}${ok}
  <div class="ml-send-grid">

    <!-- Compose form -->
    <section class="ml-card">
      <header class="ml-card-head">
        <div class="ml-card-head-icon" style="background:rgba(139,92,246,.18);color:#a78bfa">
          <i class="ri-mail-send-line"></i>
        </div>
        <div><h3>Redactar correo</h3><p>Envía un correo personalizado a tus usuarios.</p></div>
      </header>

      <form method="POST" action="/admin/mail/send" id="mlSendForm" onsubmit="return mlPrepareSubmit(event)">

        <!-- Target selector -->
        <div class="ml-send-target-tabs">
          <button type="button" class="ml-target-tab active" id="tabAll"
            onclick="mlSwitchTarget('all')">
            <i class="ri-group-line"></i> Todos los usuarios
          </button>
          <button type="button" class="ml-target-tab" id="tabSelect"
            onclick="mlSwitchTarget('select')">
            <i class="ri-user-search-line"></i> Usuarios específicos
          </button>
        </div>
        <input type="hidden" name="target" id="mlTarget" value="all">

        <div id="mlUserSelectWrap" style="display:none;margin-bottom:10px">
          <div class="ml-user-search-wrap">
            <div class="ml-user-search-bar">
              <i class="ri-search-line"></i>
              <input type="text" id="mlUserSearch" placeholder="Buscar usuario por nombre o correo..." oninput="mlFilterUsers()" autocomplete="off">
            </div>
            <div class="ml-user-select-actions">
              <button type="button" onclick="mlSelectAll(true)"><i class="ri-checkbox-line"></i> Todos</button>
              <button type="button" onclick="mlSelectAll(false)"><i class="ri-checkbox-blank-line"></i> Ninguno</button>
              <span id="mlSelCount" class="ml-sel-count">0 seleccionados</span>
            </div>
            <div class="ml-user-list" id="mlUserList">
              ${users.map(u => {
                const name = `${u.first_name || u.username || ""} ${u.last_name || ""}`.trim() || u.email;
                const initials = name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
                return `<label class="ml-user-item" data-name="${h(ctx,name.toLowerCase())}" data-email="${h(ctx,u.email.toLowerCase())}">
                  <input type="checkbox" name="recipients" value="${h(ctx,u.email)}" onchange="mlSelChanged()">
                  <span class="ml-user-avatar">${h(ctx,initials)}</span>
                  <span class="ml-user-info">
                    <b>${h(ctx,name)}</b>
                    <small>${h(ctx,u.email)}</small>
                  </span>
                  <i class="ri-checkbox-circle-fill ml-check-icon"></i>
                </label>`;
              }).join("")}
            </div>
          </div>
        </div>

        <label class="ml-field">
          <span>Asunto <em style="color:#f87171">*</em></span>
          <input name="subject" id="mlSubject" placeholder="Ej: Bienvenido a la plataforma"
            oninput="mlUpdatePreview()">
        </label>

        <!-- Rich-text editor -->
        <div style="margin-top:10px">
          <span style="font-size:12px;font-weight:700;color:#8b93a8;letter-spacing:.02em;display:block;margin-bottom:6px">
            Mensaje <em style="color:#f87171">*</em>
          </span>
          <div class="ml-editor-toolbar" id="mlToolbar">
            <button type="button" onmousedown="event.preventDefault()" onclick="mlFmt('bold')"    title="Negrita"><i class="ri-bold"></i></button>
            <button type="button" onmousedown="event.preventDefault()" onclick="mlFmt('italic')"  title="Cursiva"><i class="ri-italic"></i></button>
            <button type="button" onmousedown="event.preventDefault()" onclick="mlFmt('underline')" title="Subrayado"><i class="ri-underline"></i></button>
            <div class="ml-toolbar-sep"></div>
            <button type="button" onmousedown="event.preventDefault()" onclick="mlFmtBlock('h2')" title="Título"><i class="ri-heading"></i></button>
            <button type="button" onmousedown="event.preventDefault()" onclick="mlFmtBlock('p')"  title="Párrafo"><i class="ri-paragraph"></i></button>
            <div class="ml-toolbar-sep"></div>
            <button type="button" onmousedown="event.preventDefault()" onclick="mlFmt('insertUnorderedList')" title="Lista"><i class="ri-list-unordered"></i></button>
            <button type="button" onmousedown="event.preventDefault()" onclick="mlFmtLink()" title="Enlace"><i class="ri-link"></i></button>
            <div class="ml-toolbar-sep"></div>
            <button type="button" onmousedown="event.preventDefault()" onclick="mlClearEditor()" title="Limpiar" style="margin-left:auto"><i class="ri-delete-bin-line"></i></button>
          </div>
          <div class="ml-editor" id="mlEditor"
            contenteditable="true"
            tabindex="0"
            data-placeholder="Escribe aquí el contenido del correo..."
            oninput="mlUpdatePreview()"
            onkeyup="mlUpdatePreview()"></div>
          <input type="hidden" name="body" id="mlBody">
        </div>

        <div class="ml-send-actions">
          <button class="ml-btn secondary" type="button" onclick="document.getElementById('mlEmailPreview').scrollIntoView({behavior:'smooth'})">
            <i class="ri-eye-line"></i> Vista previa
          </button>
          <button class="ml-btn primary" type="submit">
            <i class="ri-send-plane-fill"></i> Enviar correo
          </button>
        </div>
      </form>
    </section>

    <!-- Right sidebar -->
    <aside class="ml-send-aside">

      <!-- Email preview -->
      <section class="ml-card">
        <header class="ml-card-head">
          <div class="ml-card-head-icon" style="background:rgba(245,158,11,.14);color:#f59e0b">
            <i class="ri-eye-line"></i>
          </div>
          <div><h3>Vista previa</h3><p>Así verán el correo tus usuarios.</p></div>
        </header>
        <div id="mlEmailPreview" class="ml-email-preview"
          style="--ml-header-gradient:linear-gradient(135deg,${h(ctx,colorFrom)},${h(ctx,colorTo)})">
          <div class="ml-ep-header">
            <span class="ml-ep-logo-text">LOGO DE TU TIENDA</span>
          </div>
          <div class="ml-ep-subject" id="mlEpSubject">Sin asunto</div>
          <div class="ml-ep-body"    id="mlEpBody">
            <span style="opacity:.5;font-style:italic">El mensaje aparecerá aquí...</span>
          </div>
        </div>
      </section>

      <!-- Recipients counter -->
      <section class="ml-card">
        <header class="ml-card-head">
          <div class="ml-card-head-icon" style="background:rgba(139,92,246,.14);color:#a78bfa">
            <i class="ri-team-line"></i>
          </div>
          <div><h3>Destinatarios</h3><p>Resumen del envío.</p></div>
        </header>
        <div class="ml-dest-stats">
          <div class="ml-dest-stat">
            <span class="ml-dest-num">${users.length}</span>
            <span>Total usuarios</span>
          </div>
          <div class="ml-dest-stat">
            <span class="ml-dest-num" id="mlDestSelected">${users.length}</span>
            <span>Recibirán</span>
          </div>
        </div>
      </section>

    </aside>
  </div>

  <script>
  var mlMode='all';

  /* target tabs */
  function mlSwitchTarget(t){
    mlMode=t;
    document.getElementById('mlTarget').value=t;
    document.getElementById('tabAll').classList.toggle('active',t==='all');
    document.getElementById('tabSelect').classList.toggle('active',t==='select');
    document.getElementById('mlUserSelectWrap').style.display=t==='select'?'block':'none';
    mlUpdateDestCount();
  }
  function mlUpdateDestCount(){
    var dest=document.getElementById('mlDestSelected');
    if(mlMode==='all'){dest.textContent=${users.length};}
    else{dest.textContent=document.querySelectorAll('#mlUserList input[type=checkbox]:checked').length;}
  }
  function mlFilterUsers(){
    var q=(document.getElementById('mlUserSearch').value||'').toLowerCase().trim();
    document.querySelectorAll('#mlUserList .ml-user-item').forEach(function(item){
      var match=!q||item.dataset.name.includes(q)||item.dataset.email.includes(q);
      item.style.display=match?'':'none';
    });
  }
  function mlSelectAll(checked){
    document.querySelectorAll('#mlUserList .ml-user-item').forEach(function(item){
      if(item.style.display!=='none'){
        var cb=item.querySelector('input[type=checkbox]');
        if(cb)cb.checked=checked;
        item.classList.toggle('selected',checked);
      }
    });
    mlSelChanged();
  }
  function mlSelChanged(){
    var count=document.querySelectorAll('#mlUserList input[type=checkbox]:checked').length;
    document.getElementById('mlSelCount').textContent=count+' seleccionado'+(count!==1?'s':'');
    mlUpdateDestCount();
  }

  /* rich text */
  function mlFmt(cmd){ document.getElementById('mlEditor').focus(); document.execCommand(cmd,false,null); mlUpdatePreview(); }
  function mlFmtBlock(tag){ document.getElementById('mlEditor').focus(); document.execCommand('formatBlock',false,'<'+tag+'>'); mlUpdatePreview(); }
  function mlFmtLink(){
    document.getElementById('mlEditor').focus();
    var url=prompt('URL del enlace (ej: https://mitienda.com):');
    if(url) document.execCommand('createLink',false,url);
    mlUpdatePreview();
  }
  function mlClearEditor(){
    if(confirm('¿Limpiar el editor?')){
      document.getElementById('mlEditor').innerHTML='';
      mlUpdatePreview();
    }
  }

  /* live preview */
  function mlUpdatePreview(){
    var sub=document.getElementById('mlSubject').value||'Sin asunto';
    document.getElementById('mlEpSubject').textContent=sub;
    var body=document.getElementById('mlEditor').innerHTML;
    var epBody=document.getElementById('mlEpBody');
    epBody.innerHTML=body.trim()?body:'<span style="opacity:.5;font-style:italic">El mensaje aparecerá aquí...</span>';
  }

  /* submit validation — attached to form onsubmit */
  function mlPrepareSubmit(e){
    var editor = document.getElementById('mlEditor');
    var subject = (document.getElementById('mlSubject').value||'').trim();
    /* use innerText/textContent to check actual visible text, not HTML tags */
    var textContent = (editor.innerText || editor.textContent || '').trim();
    if(!subject){
      e.preventDefault();
      document.getElementById('mlSubject').focus();
      alert('El asunto no puede estar vacío.');
      return false;
    }
    if(!textContent){
      e.preventDefault();
      editor.focus();
      alert('El mensaje no puede estar vacío.');
      return false;
    }
    /* populate hidden input with HTML content */
    document.getElementById('mlBody').value = editor.innerHTML;
    if(mlMode==='select'){
      var checked=document.querySelectorAll('#mlUserList input[type=checkbox]:checked');
      if(!checked.length){
        e.preventDefault();
        alert('Selecciona al menos un usuario destinatario.');
        return false;
      }
    }
    return true;
  }

  /* checkbox items toggle selected class */
  document.querySelectorAll('#mlUserList .ml-user-item').forEach(function(item){
    item.addEventListener('change',function(){
      var cb=item.querySelector('input[type=checkbox]');
      item.classList.toggle('selected',cb&&cb.checked);
    });
  });

  /* focus editor on click */
  document.getElementById('mlEditor').addEventListener('click',function(){this.focus();});
  </script>`;
}

/* ════════════════════════════════
   TAB 3 — Historial
════════════════════════════════ */
function historyTab(ctx) {
  const logs = ctx.db.sqlite.prepare(
    "SELECT ml.*, u.username admin_username FROM mail_log ml LEFT JOIN users u ON u.id=ml.admin_id ORDER BY ml.id DESC LIMIT 200"
  ).all();

  function fmtDate(v) {
    if (!v) return "—";
    try {
      const d = new Date(v);
      return d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })
        + ", " + d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    } catch { return v; }
  }

  const rows = logs.map(l => `
    <tr>
      <td><span class="ml-log-status ${h(ctx,l.status)}">${l.status === "sent"
        ? '<i class="ri-checkbox-circle-fill"></i> Enviado'
        : '<i class="ri-close-circle-fill"></i> Error'}</span></td>
      <td class="ml-log-email">${h(ctx, l.recipient_email)}</td>
      <td>${h(ctx, l.recipient_name || "—")}</td>
      <td class="ml-log-subject">${h(ctx, l.subject)}</td>
      <td>${l.status === "failed"
        ? `<span class="ml-log-err" title="${h(ctx, l.error_msg)}">${h(ctx, (l.error_msg||"").substring(0,45))}…</span>`
        : "—"}</td>
      <td class="ml-log-date">${h(ctx, fmtDate(l.sent_at))}</td>
    </tr>`).join("");

  return `
  <section class="ml-card">
    <header class="ml-card-head">
      <div class="ml-card-head-icon" style="background:rgba(99,102,241,.14);color:#818cf8">
        <i class="ri-history-line"></i>
      </div>
      <div>
        <h3>Historial de envíos</h3>
        <p>Últimos 200 correos enviados por el sistema.</p>
      </div>
    </header>
    ${logs.length === 0
      ? `<div class="ml-empty"><i class="ri-mail-line"></i><p>Aún no se han enviado correos desde este panel.</p></div>`
      : `<div class="ml-table-wrap">
          <table class="ml-table">
            <thead>
              <tr>
                <th>Estado</th><th>Destinatario</th><th>Nombre</th>
                <th>Asunto</th><th>Error</th><th>Fecha</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}
  </section>`;
}

/* ════════════════════════════════
   ROUTER
════════════════════════════════ */
function router(ctx) {
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);

  r.get("/status", async (req, res) => {
    res.json(await mailer.testConnection(ctx.db));
  });

  r.post("/test-smtp", express.json(), async (req, res) => {
    const result = await mailer.testConnection(ctx.db);
    if (!result.ok) return res.json(result);
    const testEmail = String(req.body?.email || "").trim();
    if (testEmail) {
      const send = await mailer.sendMail(ctx.db, {
        to: testEmail,
        subject: `Prueba SMTP — ${ctx.db.getSetting("site_name","SKY ULTRA PLUS shop")}`,
        bodyHtml: `<p>¡Hola! Esta es una prueba de conexión SMTP.</p>
<p>Si recibes este correo, la configuración es correcta.</p>
<p style="margin-top:16px">— Equipo de <strong>${ctx.db.getSetting("site_name","SKY ULTRA PLUS shop")}</strong></p>`,
        baseUrl: getBaseUrl(req),
      });
      if (!send.ok) return res.json(send);
    }
    res.json({ ok: true });
  });

  r.post("/toggle-verify", (req, res) => {
    ctx.db.setSetting("require_email_verification", req.body.enabled === "1" ? "1" : "0");
    res.redirect("/admin/mail?saved=1");
  });

  r.post("/save-smtp", (req, res) => {
    const fields = [
      "smtp_host","smtp_port","smtp_security","smtp_user",
      "smtp_from_name","smtp_from_email",
      "mail_header_color_from","mail_header_color_to",
    ];
    for (const f of fields) {
      const val = String(req.body[f] || "").trim();
      ctx.db.setSetting(f, val);
    }
    // Save password only if provided
    const pass = String(req.body.smtp_pass || "").trim();
    if (pass) ctx.db.setSetting("smtp_pass", pass);
    res.redirect("/admin/mail?saved=1");
  });

  r.post("/send", async (req, res) => {
    const subject = String(req.body.subject || "").trim();
    const body    = String(req.body.body    || "").trim();
    const target  = req.body.target === "select" ? "select" : "all";
    if (!subject || !body)
      return res.redirect("/admin/mail?tab=send&error=" + encodeURIComponent("Asunto y mensaje son obligatorios."));

    let recipients = [];
    if (target === "all") {
      recipients = ctx.db.sqlite.prepare("SELECT email,username,first_name,last_name FROM users").all();
    } else {
      const emails = Array.isArray(req.body.recipients)
        ? req.body.recipients : [req.body.recipients].filter(Boolean);
      recipients = emails.map(e => ctx.db.getUserByEmail(e) || { email: e, username: "", first_name: "", last_name: "" });
    }
    if (!recipients.length)
      return res.redirect("/admin/mail?tab=send&error=" + encodeURIComponent("No hay destinatarios."));

    const base = getBaseUrl(req);
    let sent = 0;
    for (const u of recipients) {
      const name   = `${u.first_name || u.username || ""} ${u.last_name || ""}`.trim() || u.email;
      const result = await mailer.sendMail(ctx.db, { to: u.email, toName: name, subject, bodyHtml: body, baseUrl: base });
      mailer.logMail(ctx.db, {
        adminId: req.session.user.id,
        recipientEmail: u.email, recipientName: name,
        subject, status: result.ok ? "sent" : "failed",
        errorMsg: result.ok ? "" : result.error,
      });
      if (result.ok) sent++;
    }
    res.redirect(`/admin/mail?tab=send&sent=${sent}`);
  });

  r.get("/", (req, res) => {
    const tab = req.query.tab || "config";
    const cfg = mailer.getSmtpConfig(ctx.db);

    let tabContent = "";
    if      (tab === "send")    tabContent = sendMailTab(ctx, req);
    else if (tab === "history") tabContent = historyTab(ctx);
    else                        tabContent = smtpConfigTab(ctx, cfg, req);

    res.renderPage({
      title: "Correo SMTP",
      area: "admin",
      registry: reg(ctx),
      content: `${CSS}
<div class="ml-page">

  <div class="ml-head">
    <div class="ml-head-icon"><i class="ri-mail-send-line"></i></div>
    <div class="ml-head-text">
      <p class="ml-eyebrow">Sistema de correo</p>
      <h1>SMTP Mail</h1>
      <p>Configura el servicio SMTP para el envío de correos del sistema.</p>
    </div>
    ${statusBadge(cfg)}
  </div>

  <div class="ml-tabs">
    <a class="ml-tab ${tab === "config"  ? "active" : ""}" href="/admin/mail?tab=config">
      <i class="ri-settings-3-line"></i> Configuración SMTP
    </a>
    <a class="ml-tab ${tab === "send"    ? "active" : ""}" href="/admin/mail?tab=send">
      <i class="ri-send-plane-line"></i> Enviar correos
    </a>
    <a class="ml-tab ${tab === "history" ? "active" : ""}" href="/admin/mail?tab=history">
      <i class="ri-history-line"></i> Historial de envíos
    </a>
  </div>

  <div class="ml-tab-content">
    ${tabContent}
  </div>

</div>`,
    });
  });

  return r;
}

module.exports = { config, router };
