"use strict";
const express = require("express");
const config = { key: "admin_users", name: "Usuarios", icon: "ri-group-line", route: "/admin/users", area: "admin", category: "Usuarios", permission: "admin", order: 20 };

// Paises LATAM + algunos extras (codigo, nombre, bandera emoji)
const COUNTRIES = [
  ["+54","Argentina","🇦🇷"],
  ["+591","Bolivia","🇧🇴"],
  ["+55","Brasil","🇧🇷"],
  ["+56","Chile","🇨🇱"],
  ["+57","Colombia","🇨🇴"],
  ["+506","Costa Rica","🇨🇷"],
  ["+53","Cuba","🇨🇺"],
  ["+593","Ecuador","🇪🇨"],
  ["+503","El Salvador","🇸🇻"],
  ["+34","España","🇪🇸"],
  ["+1","Estados Unidos / Rep. Dominicana","🇺🇸"],
  ["+502","Guatemala","🇬🇹"],
  ["+504","Honduras","🇭🇳"],
  ["+52","México","🇲🇽"],
  ["+505","Nicaragua","🇳🇮"],
  ["+507","Panamá","🇵🇦"],
  ["+595","Paraguay","🇵🇾"],
  ["+51","Perú","🇵🇪"],
  ["+598","Uruguay","🇺🇾"],
  ["+58","Venezuela","🇻🇪"],
];
function findCountry(code){return COUNTRIES.find(c=>c[0]===code)||["+1","—","🌐"];}
function h(ctx,v){return ctx.layout.escapeHtml(v||"");}
function reg(ctx){return require("../../core/pluginLoader").registry(ctx.db);}
function initials(name){return String(name||"U").trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"U";}
function fmtDate(v){if(!v)return"";try{const d=new Date(v);return d.toLocaleDateString("es",{day:"2-digit",month:"short",year:"numeric"})+", "+d.toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});}catch{return"";}}
const CSS_LINK = `<link rel="stylesheet" href="/public/css/admin-users-design.css?v=1">`;

function tabs(id,active){
  const list=[
    ["edit","Información","ri-user-3-line",""],
    ["services","Servicios","ri-archive-stack-line","/services"],
    ["invoices","Facturas","ri-file-list-3-line","/invoices"],
    ["credits","Créditos","ri-coins-line","/credits"],
    ["tickets","Tickets","ri-customer-service-2-line","/tickets"],
  ];
  return `<div class="usr-tabs">${list.map(t=>`<a class="${active===t[0]?'active':''}" href="/admin/users/${id}${t[3]}"><i class="${t[2]}"></i>${t[1]}</a>`).join('')}</div>`;
}
function countrySelect(name,sel="+1"){
  return `<select name="${name}" data-country>${COUNTRIES.map(c=>`<option value="${c[0]}" data-flag="${c[2]}" ${sel===c[0]?'selected':''}>${c[2]} ${c[0]} (${c[1]})</option>`).join('')}</select>`;
}

function passwordStrengthScript(){
  return `<script>
function usrPwdStrength(input,wrap){
  var v=input.value||'';
  var score=0;
  if(v.length>=6)score++;
  if(v.length>=10)score++;
  if(/[A-Z]/.test(v)&&/[a-z]/.test(v))score++;
  if(/[0-9]/.test(v))score++;
  if(/[^A-Za-z0-9]/.test(v))score++;
  var level=score<=1?'weak':score<=3?'mid':'strong';
  var bars=wrap.querySelectorAll('.usr-pwd-bar');
  bars.forEach(function(b,i){b.classList.remove('on-weak','on-mid','on-strong');});
  var idx=level==='weak'?1:level==='mid'?2:3;
  for(var i=0;i<idx;i++){bars[i].classList.add('on-'+level);}
  var lbl=wrap.querySelector('.usr-pwd-label');
  lbl.classList.remove('l-weak','l-mid','l-strong');
  lbl.classList.add('l-'+level);
  lbl.textContent=level==='weak'?'Débil':level==='mid'?'Media':'Fuerte';
}
function usrPwdToggle(btn){
  var inp=btn.parentElement.querySelector('input');
  if(inp.type==='password'){inp.type='text';btn.querySelector('i').className='ri-eye-off-line';}
  else{inp.type='password';btn.querySelector('i').className='ri-eye-line';}
}
function usrFilter(){
  var q=(document.getElementById('usrSearch').value||'').toLowerCase();
  var role=document.getElementById('usrRole').value;
  document.querySelectorAll('.usr-list .usr-card').forEach(function(c){
    var ok=c.innerText.toLowerCase().indexOf(q)>=0&&(role==='all'||c.dataset.role===role);
    c.style.display=ok?'':'none';
  });
}
</script>`;
}

function passwordField(req){
  return `<label class="usr-field full">
    <span>Password ${req?'<em>*</em>':'<em style="color:rgba(233,242,255,.45);font-style:normal;font-weight:600">(dejar vacío para no cambiar)</em>'}</span>
    <div class="usr-field-with-icon" data-pwd>
      <input name="password" type="password" placeholder="Crea una contraseña segura" ${req?'required':''} oninput="usrPwdStrength(this,this.parentElement.parentElement)">
      <button type="button" class="usr-pwd-toggle" onclick="usrPwdToggle(this)"><i class="ri-eye-line"></i></button>
    </div>
    <div class="usr-pwd-strength"><span class="usr-pwd-bar"></span><span class="usr-pwd-bar"></span><span class="usr-pwd-bar"></span><span class="usr-pwd-label">Sin evaluar</span></div>
    <div class="usr-strength-row"><span>Seguridad</span><span style="display:flex;gap:18px"><span style="opacity:.6">Débil</span><span style="opacity:.6">Media</span><span style="opacity:.6">Fuerte</span></span></div>
  </label>`;
}

function router(ctx){
  const r=express.Router();
  r.use(ctx.auth.requireAdmin);

  r.post("/create",(req,res)=>{
    const out=ctx.db.createUser(req.body);
    res.redirect(out.ok?`/admin/users/${out.user.id}?saved=1`:`/admin/users/new?error=${encodeURIComponent(out.error)}`);
  });
  r.post("/:id/update",(req,res)=>{
    const out=ctx.db.updateUser(req.params.id,req.body);
    res.redirect(out.ok?`/admin/users/${req.params.id}?saved=1`:`/admin/users/${req.params.id}?error=${encodeURIComponent(out.error)}`);
  });
  r.post("/:id/delete",(req,res)=>{
    const out=ctx.db.deleteUser(req.params.id,req.session.user.id);
    res.redirect(out.ok?"/admin/users?deleted=1":`/admin/users?error=${encodeURIComponent(out.error)}`);
  });
  r.post("/:id/credits/set",(req,res)=>{
    const out=ctx.db.setWalletBalance({userId:req.params.id,currency:req.body.currency,balance:req.body.balance,adminId:req.session.user.id,note:req.body.note||"Admin edit"});
    res.redirect(out.ok?`/admin/users/${req.params.id}/credits?saved=1`:`/admin/users/${req.params.id}/credits?error=${encodeURIComponent(out.error)}`);
  });
  r.post("/:id/credits/add",(req,res)=>{
    const out=ctx.db.adjustWallet({userId:req.params.id,currency:req.body.currency,amount:req.body.amount,adminId:req.session.user.id,note:req.body.note||"Admin adjustment"});
    res.redirect(out.ok?`/admin/users/${req.params.id}/credits?saved=1`:`/admin/users/${req.params.id}/credits?error=${encodeURIComponent(out.error)}`);
  });

  r.get("/new",(req,res)=>{
    const err=req.query.error?`<div class="notice error" style="margin-bottom:0"><i class="ri-error-warning-line"></i> ${h(ctx,req.query.error)}</div>`:"";
    res.renderPage({title:"Crear usuario",area:"admin",registry:reg(ctx),content:`${CSS_LINK}
<div class="usr-admin">
  <div class="usr-crumb"><a href="/admin/users">Usuarios</a> &gt; <span class="now">Crear</span></div>
  <div class="usr-form-head">
    <div class="usr-head-text">
      <h1>Crear usuario</h1>
      <p>Completa la información para registrar un nuevo usuario.</p>
    </div>
    <span class="usr-required-note"><i class="ri-information-line"></i> Los campos con * son obligatorios</span>
  </div>
  ${err}
  <form method="POST" action="/admin/users/create" style="display:grid;gap:18px;margin:0">
    <section class="usr-card-form">
      <header class="usr-card-head"><i class="ri-user-3-line"></i><div><h3>Información personal</h3><p>Datos básicos del usuario.</p></div></header>
      <div class="usr-card-body">
        <div class="usr-grid two">
          <label class="usr-field"><span>Nombre <em>*</em></span><input name="first_name" placeholder="Ingresa el nombre" required></label>
          <label class="usr-field"><span>Apellido</span><input name="last_name" placeholder="Ingresa el apellido"></label>
          <label class="usr-field full"><span>Email <em>*</em></span><div class="usr-field-with-icon"><input name="email" type="email" placeholder="ejemplo@correo.com" required><i class="usr-field-icon ri-mail-line"></i></div></label>
          ${passwordField(true)}
        </div>
      </div>
    </section>
    <section class="usr-card-form">
      <header class="usr-card-head" style="background:rgba(34,197,94,.06)"><i class="ri-whatsapp-line" style="background:rgba(34,197,94,.18);color:#22c55e"></i><div><h3>WhatsApp</h3><p>Número de WhatsApp para contacto.</p></div></header>
      <div class="usr-card-body">
        <div class="usr-wa-row">
          <label class="usr-field"><span>Código de país</span>${countrySelect("whatsapp_country","+51")}</label>
          <label class="usr-field"><span>Número</span><div class="usr-field-with-icon"><input name="whatsapp_number" placeholder="999 999 999"><i class="usr-field-icon wa ri-whatsapp-line"></i></div></label>
        </div>
      </div>
    </section>
    <section class="usr-card-form">
      <header class="usr-card-head"><i class="ri-shield-user-line"></i><div><h3>Rol y permisos</h3><p>Define el rol que tendrá el usuario en la plataforma.</p></div></header>
      <div class="usr-card-body">
        <label class="usr-field"><span>Rol <em>*</em></span><select name="role"><option value="user">user</option><option value="admin">admin</option></select></label>
      </div>
    </section>
    <div class="usr-form-actions">
      <a href="/admin/users" class="usr-cancel-btn"><i class="ri-close-line"></i> Cancelar</a>
      <button class="usr-submit-btn"><i class="ri-user-add-line"></i> Crear usuario</button>
    </div>
  </form>
</div>
${passwordStrengthScript()}`});
  });

  r.get("/",(req,res)=>{
    const users=ctx.db.sqlite.prepare("SELECT * FROM users ORDER BY id DESC").all();
    let msg="";
    if(req.query.error)msg=`<div class="notice error" style="margin-bottom:0"><i class="ri-error-warning-line"></i> ${h(ctx,req.query.error)}</div>`;
    else if(req.query.deleted)msg=`<div class="notice success" style="margin-bottom:0">Usuario eliminado correctamente.</div>`;
    const cards=users.map(u=>{
      const country=findCountry(u.whatsapp_country||"+1");
      const phone=u.whatsapp_number?(country[0]+" "+u.whatsapp_number):(u.phone||"—");
      const fullName=`${u.first_name||u.username||""} ${u.last_name||""}`.trim()||u.email;
      const reg=fmtDate(u.created_at);
      return `<div class="usr-card" data-role="${h(ctx,u.role)}">
        <div class="usr-card-top">
          <div class="usr-avatar">${h(ctx,initials(fullName))}</div>
          <div class="usr-name-block">
            <span class="usr-name">${h(ctx,fullName)}</span>
            <span class="usr-role-pill ${h(ctx,u.role)}">${h(ctx,u.role)}</span>
            ${u.email_verified?'<span class="usr-verified-badge"><i class="ri-checkbox-circle-fill"></i> Verificado</span>':''}
          </div>
        </div>
        <a class="usr-card-menu" href="/admin/users/${u.id}" title="Editar"><i class="ri-pencil-line"></i></a>
        <div class="usr-fields">
          <div class="usr-field-block">
            <span class="usr-field-label">País</span>
            <span class="usr-field-value"><span class="flag">${country[2]}</span>${h(ctx,country[1])}</span>
          </div>
          <div class="usr-field-block">
            <span class="usr-field-label">Teléfono</span>
            <span class="usr-field-value"><i class="ri-whatsapp-line" style="color:#22c55e"></i>${h(ctx,phone)}</span>
          </div>
          <div class="usr-field-block">
            <span class="usr-field-label">Email</span>
            <span class="usr-field-value" title="${h(ctx,u.email)}"><i class="ri-mail-line"></i>${h(ctx,u.email)}</span>
          </div>
          <div class="usr-field-block">
            <span class="usr-field-label">Registrado</span>
            <span class="usr-field-value"><i class="ri-calendar-line"></i>${h(ctx,reg||"—")}</span>
          </div>
        </div>
        <div class="usr-card-actions">
          <a class="usr-btn-ghost" href="/admin/users/${u.id}"><i class="ri-eye-line"></i> Ver detalles</a>
          <a class="usr-btn-primary" href="/admin/users/${u.id}"><i class="ri-pencil-line"></i> Editar usuario</a>
        </div>
      </div>`;
    }).join("");
    res.renderPage({title:"Usuarios",area:"admin",registry:reg(ctx),content:`${CSS_LINK}
<div class="usr-admin">
  <div class="usr-crumb">Usuarios &gt; <span class="now">Listado</span></div>
  <div class="usr-head">
    <div class="usr-head-text">
      <h1>Usuarios</h1>
      <p>Administra y gestiona los usuarios registrados en la plataforma.</p>
    </div>
    <a class="usr-create-btn" href="/admin/users/new"><i class="ri-user-add-line"></i> Crear usuario</a>
  </div>
  ${msg}
  <div class="usr-toolbar">
    <label class="usr-search-wrap"><i class="ri-search-line"></i><input id="usrSearch" placeholder="Buscar usuarios..." oninput="usrFilter()"></label>
    <label class="usr-filter-wrap"><i class="ri-filter-3-line"></i><select id="usrRole" onchange="usrFilter()"><option value="all">Filtrar por rol</option><option value="admin">Admin</option><option value="user">User</option></select><i class="ri-arrow-down-s-line caret"></i></label>
  </div>
  <div class="usr-count">${users.length} usuario${users.length===1?"":"s"} en total</div>
  <div class="usr-list">
    ${cards||'<div class="usr-card"><p style="margin:0;color:rgba(233,242,255,.6);text-align:center;padding:40px">No hay usuarios todavía.</p></div>'}
  </div>
</div>
${passwordStrengthScript()}`});
  });

  r.get("/:id",(req,res)=>{
    const u=ctx.db.getUserById(req.params.id);
    if(!u)return res.redirect('/admin/users');
    let msg="";
    if(req.query.error)msg=`<div class="notice error" style="margin-bottom:0"><i class="ri-error-warning-line"></i> ${h(ctx,req.query.error)}</div>`;
    else if(req.query.saved)msg=`<div class="notice success" style="margin-bottom:0"><i class="ri-checkbox-circle-line"></i> Cambios guardados correctamente.</div>`;
    res.renderPage({title:"Editar usuario",area:"admin",registry:reg(ctx),content:`${CSS_LINK}
<div class="usr-admin">
  <div class="usr-crumb"><a href="/admin/users">Usuarios</a> &gt; <span class="now">Editar</span></div>
  <div class="usr-form-head">
    <div class="usr-head-text">
      <h1>Editar usuario</h1>
      <p>Actualiza la información del usuario y administra sus permisos y accesos.</p>
    </div>
    <form method="POST" action="/admin/users/${u.id}/delete" onsubmit="return confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')" style="margin:0">
      <button class="usr-delete-btn"><i class="ri-delete-bin-line"></i> Eliminar usuario</button>
    </form>
  </div>
  ${tabs(u.id,'edit')}
  ${msg}
  <form method="POST" action="/admin/users/${u.id}/update" style="display:grid;gap:18px;margin:0">
    <section class="usr-card-form">
      <header class="usr-card-head"><i class="ri-user-3-line"></i><div><h3>Información personal</h3><p>Datos basicos del usuario.</p></div></header>
      <div class="usr-card-body">
        <div class="usr-grid two">
          <label class="usr-field"><span>Nombre <em>*</em></span><input name="first_name" value="${h(ctx,u.first_name||u.username||"")}" required></label>
          <label class="usr-field"><span>Apellido</span><input name="last_name" value="${h(ctx,u.last_name||"")}"></label>
          <label class="usr-field full"><span>Email <em>*</em></span><div class="usr-field-with-icon"><input name="email" type="email" value="${h(ctx,u.email)}" required><i class="usr-field-icon ri-mail-line"></i></div></label>
          ${passwordField(false)}
        </div>
      </div>
    </section>
    <section class="usr-card-form">
      <header class="usr-card-head" style="background:rgba(34,197,94,.06)"><i class="ri-whatsapp-line" style="background:rgba(34,197,94,.18);color:#22c55e"></i><div><h3>WhatsApp</h3><p>Número de WhatsApp para contacto.</p></div></header>
      <div class="usr-card-body">
        <div class="usr-wa-row">
          <label class="usr-field"><span>Código de país</span>${countrySelect("whatsapp_country",u.whatsapp_country||"+51")}</label>
          <label class="usr-field"><span>Número</span><div class="usr-field-with-icon"><input name="whatsapp_number" value="${h(ctx,u.whatsapp_number||"")}" placeholder="999 999 999"><i class="usr-field-icon wa ri-whatsapp-line"></i></div></label>
        </div>
      </div>
    </section>
    <section class="usr-card-form">
      <header class="usr-card-head"><i class="ri-shield-user-line"></i><div><h3>Rol y permisos</h3><p>Define el rol que tiene el usuario en la plataforma.</p></div></header>
      <div class="usr-card-body">
        <label class="usr-field"><span>Rol <em>*</em></span><select name="role"><option value="user" ${u.role==='user'?'selected':''}>user</option><option value="admin" ${u.role==='admin'?'selected':''}>admin</option></select></label>
      </div>
    </section>
    <section class="usr-card-form">
      <header class="usr-card-head"><i class="ri-shield-check-line"></i><div><h3>Estado de la cuenta</h3><p>Verificación de email y estado del usuario.</p></div></header>
      <div class="usr-card-body">
        <div class="usr-toggle-row">
          <div>
            <strong>Email verificado</strong>
            <p>${u.email_verified?"El correo del usuario ha sido verificado.":"Marcar como verificado para que el usuario pueda iniciar sesión sin restricciones."}</p>
          </div>
          <div class="right">
            ${u.email_verified?'<span class="usr-verified-badge"><i class="ri-checkbox-circle-fill"></i> Verificado</span>':'<span class="usr-verified-badge" style="background:rgba(245,158,11,.16);color:#f59e0b"><i class="ri-time-line"></i> No verificado</span>'}
            <label class="usr-toggle"><input type="checkbox" name="email_verified" value="1" ${u.email_verified?"checked":""}><em></em></label>
          </div>
        </div>
      </div>
    </section>
    <div class="usr-form-actions">
      <a href="/admin/users" class="usr-cancel-btn"><i class="ri-close-line"></i> Cancelar</a>
      <button class="usr-submit-btn"><i class="ri-save-3-line"></i> Guardar cambios</button>
    </div>
  </form>
</div>
${passwordStrengthScript()}`});
  });

  r.get("/:id/credits",(req,res)=>{
    const u=ctx.db.getUserById(req.params.id);
    if(!u)return res.redirect('/admin/users');
    const usd=ctx.db.getWallet(u.id,'USD'),mxn=ctx.db.getWallet(u.id,'MXN');
    let msg="";
    if(req.query.error)msg=`<div class="notice error" style="margin-bottom:0"><i class="ri-error-warning-line"></i> ${h(ctx,req.query.error)}</div>`;
    else if(req.query.saved)msg=`<div class="notice success" style="margin-bottom:0"><i class="ri-checkbox-circle-line"></i> Crédito actualizado.</div>`;
    const wallet=(w,cls,icon,label,sub)=>`<div class="usr-wallet ${cls}">
      <div class="usr-wallet-head">
        <div class="usr-wallet-icon"><i class="${icon}"></i></div>
        <div><div class="usr-wallet-title">${label}</div><div class="usr-wallet-sub">${sub}</div></div>
      </div>
      <div class="usr-wallet-amount">${w.currency} ${Number(w.balance).toFixed(2)}</div>
      <form class="usr-wallet-form" method="POST" action="/admin/users/${u.id}/credits/set">
        <input type="hidden" name="currency" value="${w.currency}">
        <input name="balance" type="number" step="0.01" value="${Number(w.balance).toFixed(2)}">
        <button class="usr-wallet-btn save"><i class="ri-save-line"></i> Guardar</button>
        <button type="submit" formaction="/admin/users/${u.id}/credits/set" class="usr-wallet-btn zero" onclick="this.previousElementSibling.previousElementSibling.value=0;return true" title="Poner en 0"><i class="ri-eraser-line"></i></button>
      </form>
    </div>`;
    res.renderPage({title:"Créditos del usuario",area:"admin",registry:reg(ctx),content:`${CSS_LINK}
<div class="usr-admin">
  <div class="usr-crumb"><a href="/admin/users">Usuarios</a> &gt; <span class="now">Créditos</span></div>
  <div class="usr-form-head"><div class="usr-head-text"><h1>Créditos del usuario</h1><p>${h(ctx,u.email)}</p></div></div>
  ${tabs(u.id,'credits')}
  ${msg}
  <div class="usr-credits-actions">
    <button type="button" onclick="document.getElementById('creditModal').classList.add('show')"><i class="ri-add-circle-line"></i> Crear crédito</button>
  </div>
  <div class="usr-wallets">
    ${wallet(usd,"usd","ri-money-dollar-circle-line","Saldo en USD","Dólares estadounidenses")}
    ${wallet(mxn,"mxn","ri-money-cny-circle-line","Saldo en MXN","Pesos mexicanos")}
  </div>
</div>
<div id="creditModal" class="usr-modal">
  <form class="usr-modal-box" method="POST" action="/admin/users/${u.id}/credits/add">
    <header class="usr-modal-head">
      <h3><i class="ri-add-circle-line"></i> Crear crédito</h3>
      <button type="button" class="usr-modal-close" onclick="document.getElementById('creditModal').classList.remove('show')">×</button>
    </header>
    <div class="usr-modal-body">
      <label class="usr-field"><span>Moneda <em>*</em></span><select name="currency"><option value="USD">USD - Dólares</option><option value="MXN">MXN - Pesos</option></select></label>
      <label class="usr-field"><span>Monto <em>*</em></span><input name="amount" type="number" step="0.01" placeholder="0.00" required></label>
      <label class="usr-field"><span>Nota <em style="color:rgba(233,242,255,.45);font-style:normal;font-weight:600">(opcional)</em></span><input name="note" placeholder="Motivo del ajuste"></label>
    </div>
    <footer class="usr-modal-foot">
      <button type="button" class="usr-cancel-btn" onclick="document.getElementById('creditModal').classList.remove('show')">Cancelar</button>
      <button class="usr-submit-btn"><i class="ri-add-line"></i> Crear crédito</button>
    </footer>
  </form>
</div>`});
  });

  r.get("/:id/services",(req,res)=>{
    const u=ctx.db.getUserById(req.params.id);
    if(!u)return res.redirect('/admin/users');
    const list=ctx.db.sqlite.prepare("SELECT s.*,p.name product_name,p.image_path product_image,p.price product_price,p.currency product_currency,i.number invoice_number FROM services s JOIN products p ON p.id=s.product_id LEFT JOIN invoices i ON i.id=s.invoice_id WHERE s.user_id=? ORDER BY s.id DESC").all(u.id);
    const cards=list.map(s=>{
      const next=s.next_invoice_at?fmtDate(s.next_invoice_at):"—";
      const created=fmtDate(s.created_at)||"—";
      const status=({active:"Activo",pending:"Pendiente",suspended:"Suspendido",canceled:"Cancelado"})[s.status]||s.status;
      return `<div class="usr-svc-card">
        <div class="usr-svc-icon">${s.product_image?`<img src="${h(ctx,s.product_image)}" alt="" style="width:100%;height:100%;border-radius:13px;object-fit:cover">`:`<i class="ri-archive-stack-line"></i>`}</div>
        <div class="usr-svc-info">
          <div class="usr-svc-info-top">
            <span class="usr-svc-num">#${s.id}</span>
            <span class="usr-pill ${h(ctx,s.status)}">${h(ctx,status)}</span>
          </div>
          <span class="usr-svc-product">${h(ctx,s.product_name)}</span>
          <div class="usr-svc-meta">
            ${s.invoice_number?`<span><i class="ri-file-list-3-line"></i> ${h(ctx,s.invoice_number)}</span>`:""}
            <span><i class="ri-calendar-line"></i> Creado: ${h(ctx,created)}</span>
            ${s.status==='active'?`<span><i class="ri-refresh-line"></i> Próximo cobro: ${h(ctx,next)}</span>`:""}
          </div>
        </div>
        <div class="usr-svc-side">
          <span class="usr-inv-amount">${h(ctx,s.product_currency)} ${Number(s.product_price).toFixed(2)}</span>
          <a class="usr-btn-ghost" href="/admin/services" title="Ir a servicios"><i class="ri-external-link-line"></i> Ver</a>
        </div>
      </div>`;
    }).join("");
    const empty=`<div class="usr-empty-state"><i class="ri-archive-stack-line"></i><h3>Sin servicios</h3><p>Este usuario aun no tiene servicios contratados.</p></div>`;
    res.renderPage({title:"Servicios del usuario",area:"admin",registry:reg(ctx),content:`${CSS_LINK}
<div class="usr-admin">
  <div class="usr-crumb"><a href="/admin/users">Usuarios</a> &gt; <span class="now">Servicios</span></div>
  <div class="usr-form-head"><div class="usr-head-text"><h1>Servicios del usuario</h1><p>${h(ctx,u.email)}</p></div></div>
  ${tabs(u.id,'services')}
  <div class="usr-svc-list">${cards||empty}</div>
</div>`});
  });

  r.get("/:id/invoices",(req,res)=>{
    const u=ctx.db.getUserById(req.params.id);
    if(!u)return res.redirect('/admin/users');
    const list=ctx.db.sqlite.prepare("SELECT i.*, (SELECT it.name FROM invoice_items it WHERE it.invoice_id=i.id ORDER BY it.id LIMIT 1) item_name FROM invoices i WHERE i.user_id=? ORDER BY i.id DESC").all(u.id);
    const typeLabel=t=>({renewal:"Renovación",product:"Producto",topup:"Recarga",manual:"Manual"})[t]||t;
    const statusLabel=s=>({paid:"Pagada",pending:"Pendiente",suspended:"Suspendida",canceled:"Cancelada"})[s]||s;
    const cards=list.map(i=>{
      const productName=i.item_name||typeLabel(i.type)||"Factura";
      const created=fmtDate(i.created_at)||"—";
      return `<div class="usr-inv-card">
        <div class="usr-inv-icon"><i class="ri-file-list-3-line"></i></div>
        <div class="usr-inv-info">
          <div class="usr-inv-info-top">
            <a class="usr-inv-num" href="/admin/invoices/${i.id}">${h(ctx,i.number)}</a>
            <span class="usr-pill ${h(ctx,i.status)}">${h(ctx,statusLabel(i.status))}</span>
          </div>
          <span class="usr-inv-product"><i class="ri-box-3-line" style="color:#a78bfa"></i> ${h(ctx,productName)}</span>
          <div class="usr-inv-meta">
            <span><i class="ri-price-tag-3-line"></i> ${h(ctx,typeLabel(i.type))}</span>
            <span><i class="ri-calendar-line"></i> ${h(ctx,created)}</span>
          </div>
        </div>
        <div class="usr-inv-side">
          <span class="usr-inv-amount">${h(ctx,i.currency)} ${Number(i.total).toFixed(2)}</span>
          <a class="usr-btn-ghost" href="/admin/invoices/${i.id}"><i class="ri-eye-line"></i> Ver</a>
        </div>
      </div>`;
    }).join("");
    const empty=`<div class="usr-empty-state"><i class="ri-file-list-3-line"></i><h3>Sin facturas</h3><p>Este usuario aun no tiene facturas registradas.</p></div>`;
    res.renderPage({title:"Facturas del usuario",area:"admin",registry:reg(ctx),content:`${CSS_LINK}
<div class="usr-admin">
  <div class="usr-crumb"><a href="/admin/users">Usuarios</a> &gt; <span class="now">Facturas</span></div>
  <div class="usr-form-head"><div class="usr-head-text"><h1>Facturas del usuario</h1><p>${h(ctx,u.email)}</p></div></div>
  ${tabs(u.id,'invoices')}
  <div class="usr-inv-list">${cards||empty}</div>
</div>`});
  });

  r.get("/:id/tickets",(req,res)=>{
    const u=ctx.db.getUserById(req.params.id);
    if(!u)return res.redirect('/admin/users');
    res.renderPage({title:"Tickets del usuario",area:"admin",registry:reg(ctx),content:`${CSS_LINK}
<div class="usr-admin">
  <div class="usr-crumb"><a href="/admin/users">Usuarios</a> &gt; <span class="now">Tickets</span></div>
  <div class="usr-form-head"><div class="usr-head-text"><h1>Tickets del usuario</h1><p>${h(ctx,u.email)}</p></div></div>
  ${tabs(u.id,'tickets')}
  <div class="usr-empty-state"><i class="ri-customer-service-2-line"></i><h3>Sin tickets</h3><p>Este usuario aun no ha abierto ningun ticket de soporte.</p></div>
</div>`});
  });

  return r;
}
module.exports={config,router};
