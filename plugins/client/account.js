"use strict";
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const config = {
  key: "client_account",
  name: "Mi cuenta",
  icon: "ri-user-settings-line",
  route: "/account",
  area: "client",
  category: "Cuenta",
  permission: "user",
  order: 99,
};

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
const ALLOWED_IMG = [".jpg",".jpeg",".png",".gif",".webp"];
const MAX_AVATAR_SIZE = 6 * 1024 * 1024; // 6 MB

function migrate(db){
  const cols = db.sqlite.prepare("PRAGMA table_info(users)").all().map(c=>c.name);
  if(!cols.includes("avatar_path")) db.sqlite.exec("ALTER TABLE users ADD COLUMN avatar_path TEXT DEFAULT ''");
}
function h(ctx,v){return ctx.layout.escapeHtml(v||"");}
function reg(ctx){return require("../../core/pluginLoader").registry(ctx.db);}
function saveAvatar(file){
  if(!file||!file.name) return null;
  if(file.size > MAX_AVATAR_SIZE) throw new Error("Imagen demasiado grande (max 6MB)");
  const ext = (path.extname(file.name)||"").toLowerCase();
  if(!ALLOWED_IMG.includes(ext)) throw new Error("Solo se permiten imágenes (jpg, png, gif, webp)");
  const dir = path.join(process.cwd(),"uploads","avatars");
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
  return "/uploads/avatars/"+name;
}
function countrySelect(name,sel){
  return `<select name="${name}">${COUNTRIES.map(c=>`<option value="${c[0]}" ${sel===c[0]?'selected':''}>${c[2]} ${c[0]} (${c[1]})</option>`).join("")}</select>`;
}
function initials(name){return String(name||"U").trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"U";}

const ASSETS = `<link rel="stylesheet" href="/public/css/account-page.css?v=1"><script src="/public/js/account.js?v=1" defer></script>`;

function router(ctx){
  const r = express.Router();
  r.use(ctx.auth.requireUser);
  migrate(ctx.db);

  // Update profile (nombre, apellido, email, whatsapp)
  r.post("/profile",(req,res)=>{
    const uid = req.session.user.id;
    const out = ctx.db.updateUser(uid, {
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      whatsapp_country: req.body.whatsapp_country,
      whatsapp_number: req.body.whatsapp_number,
      role: req.session.user.role,
      email_verified: req.session.user.email_verified || 1,
    });
    if(!out.ok) return res.redirect("/account?error="+encodeURIComponent(out.error||"Error al actualizar"));
    // Refrescar sesion
    const u = ctx.db.getUserById(uid);
    if(u){
      req.session.user = { id:u.id, username:u.username, email:u.email, role:u.role, email_verified:u.email_verified };
    }
    res.redirect("/account?ok=profile");
  });

  // Cambiar contrasena
  r.post("/password",(req,res)=>{
    const uid = req.session.user.id;
    const u = ctx.db.sqlite.prepare("SELECT * FROM users WHERE id=?").get(uid);
    if(!u) return res.redirect("/account?error=Usuario no encontrado");
    const cur = String(req.body.current||"");
    const np = String(req.body.new_password||"");
    const np2 = String(req.body.new_password2||"");
    if(!cur || !bcrypt.compareSync(cur, u.password_hash)) return res.redirect("/account?error="+encodeURIComponent("La contraseña actual es incorrecta"));
    if(np.length < 6) return res.redirect("/account?error="+encodeURIComponent("La nueva contraseña debe tener al menos 6 caracteres"));
    if(np !== np2) return res.redirect("/account?error="+encodeURIComponent("Las contraseñas no coinciden"));
    ctx.db.sqlite.prepare("UPDATE users SET password_hash=? WHERE id=?").run(bcrypt.hashSync(np,10), uid);
    res.redirect("/account?ok=password");
  });

  // Subir avatar
  r.post("/avatar",(req,res)=>{
    const uid = req.session.user.id;
    let p;
    try{ p = saveAvatar(req.files?.avatar); }
    catch(e){
      if(req.headers["x-requested-with"]==="fetch") return res.status(400).json({ok:false,error:e.message});
      return res.redirect("/account?error="+encodeURIComponent(e.message));
    }
    if(!p){
      if(req.headers["x-requested-with"]==="fetch") return res.status(400).json({ok:false,error:"Sin archivo"});
      return res.redirect("/account?error=Sin archivo");
    }
    ctx.db.sqlite.prepare("UPDATE users SET avatar_path=? WHERE id=?").run(p, uid);
    if(req.headers["x-requested-with"]==="fetch") return res.json({ok:true, path:p});
    res.redirect("/account?ok=avatar");
  });

  // Quitar avatar
  r.post("/avatar/remove",(req,res)=>{
    ctx.db.sqlite.prepare("UPDATE users SET avatar_path='' WHERE id=?").run(req.session.user.id);
    res.redirect("/account?ok=avatar_remove");
  });

  // Vista
  r.get("/",(req,res)=>{
    const u = ctx.db.getUserById(req.session.user.id);
    if(!u) return res.redirect("/login");
    const fullName = `${u.first_name||""} ${u.last_name||""}`.trim()||u.username||u.email;
    const ini = h(ctx,initials(fullName));
    const area = req.session.user.role === "admin" ? "admin" : "client";
    let banner = "";
    if(req.query.ok==="profile") banner = `<div class="acc-banner success"><i class="ri-checkbox-circle-line"></i> Perfil actualizado correctamente.</div>`;
    else if(req.query.ok==="password") banner = `<div class="acc-banner success"><i class="ri-checkbox-circle-line"></i> Contraseña actualizada correctamente.</div>`;
    else if(req.query.ok==="avatar") banner = `<div class="acc-banner success"><i class="ri-checkbox-circle-line"></i> Foto de perfil actualizada.</div>`;
    else if(req.query.ok==="avatar_remove") banner = `<div class="acc-banner success"><i class="ri-checkbox-circle-line"></i> Foto de perfil eliminada.</div>`;
    else if(req.query.error) banner = `<div class="acc-banner error"><i class="ri-error-warning-line"></i> ${h(ctx,req.query.error)}</div>`;
    res.renderPage({title:"Mi cuenta",area,registry:reg(ctx),content:`${ASSETS}
<div class="acc-page">
  <div class="acc-head">
    <h1>Mi cuenta</h1>
    <p>Actualiza tu información personal, foto de perfil y la seguridad de tu cuenta.</p>
  </div>
  ${banner}

  <section class="acc-card">
    <header class="acc-card-head">
      <i class="ri-image-line"></i>
      <div><h3>Foto de perfil</h3><p>Sube una imagen para que se vea arriba a la derecha y en el panel.</p></div>
    </header>
    <div class="acc-card-body">
      <div class="acc-avatar-row">
        <div class="acc-avatar-display" id="accAvatarDisplay">
          ${u.avatar_path?`<img src="${h(ctx,u.avatar_path)}" alt="">`:`<span>${ini}</span>`}
        </div>
        <div class="acc-avatar-actions">
          <p>Imagen cuadrada o redonda. PNG, JPG o WEBP. Máximo 6MB.</p>
          <div class="acc-avatar-buttons">
            <form id="avatarForm" method="POST" action="/account/avatar" enctype="multipart/form-data" style="margin:0">
              <label class="acc-btn-primary">
                <i class="ri-upload-cloud-2-line"></i> ${u.avatar_path?"Cambiar foto":"Subir foto"}
                <input type="file" name="avatar" accept="image/*" id="avatarInput">
              </label>
            </form>
            ${u.avatar_path?`<form method="POST" action="/account/avatar/remove" style="margin:0" onsubmit="return confirm('¿Quitar foto de perfil?')"><button class="acc-btn-ghost"><i class="ri-delete-bin-line"></i> Quitar</button></form>`:""}
          </div>
          <div class="acc-progress" id="avatarProgress">
            <div class="acc-progress-bar" id="avatarProgressBar"></div>
          </div>
          <div class="acc-progress-label" id="avatarProgressLabel"></div>
        </div>
      </div>
    </div>
  </section>

  <form class="acc-card" method="POST" action="/account/profile">
    <header class="acc-card-head">
      <i class="ri-user-3-line"></i>
      <div><h3>Información personal</h3><p>Tus datos básicos. Estos datos los verán los administradores.</p></div>
    </header>
    <div class="acc-card-body">
      <div class="acc-grid two">
        <label class="acc-field"><span>Nombre <em>*</em></span><input name="first_name" value="${h(ctx,u.first_name||"")}" placeholder="Tu nombre" required></label>
        <label class="acc-field"><span>Apellido</span><input name="last_name" value="${h(ctx,u.last_name||"")}" placeholder="Tu apellido"></label>
        <label class="acc-field full"><span>Email <em>*</em></span><div class="acc-input-with-icon"><input name="email" type="email" value="${h(ctx,u.email)}" required><i class="ri-mail-line"></i></div></label>
      </div>
      <div class="acc-wa">
        <header><i class="ri-whatsapp-line"></i><div><b>Número de WhatsApp</b><small>Para que el equipo de soporte te pueda contactar.</small></div></header>
        <div class="acc-wa-row">
          <label class="acc-field"><span>Código de país</span>${countrySelect("whatsapp_country", u.whatsapp_country||"+51")}</label>
          <label class="acc-field"><span>Número</span><input name="whatsapp_number" value="${h(ctx,u.whatsapp_number||"")}" placeholder="999 999 999"></label>
        </div>
      </div>
    </div>
    <footer class="acc-card-foot">
      <button class="acc-btn-primary"><i class="ri-save-3-line"></i> Guardar cambios</button>
    </footer>
  </form>

  <form class="acc-card" method="POST" action="/account/password">
    <header class="acc-card-head">
      <i class="ri-lock-line"></i>
      <div><h3>Cambiar contraseña</h3><p>Mantén tu cuenta segura usando una contraseña fuerte y única.</p></div>
    </header>
    <div class="acc-card-body">
      <div class="acc-grid two">
        <label class="acc-field full">
          <span>Contraseña actual <em>*</em></span>
          <div class="acc-input-pwd">
            <input name="current" type="password" placeholder="Tu contraseña actual" required>
            <button type="button" class="acc-pwd-eye" onclick="accPwdToggle(this)"><i class="ri-eye-line"></i></button>
          </div>
        </label>
        <label class="acc-field">
          <span>Nueva contraseña <em>*</em></span>
          <div class="acc-input-pwd">
            <input name="new_password" type="password" placeholder="Mínimo 6 caracteres" required oninput="accPwdStrength(this,this.parentElement.parentElement)">
            <button type="button" class="acc-pwd-eye" onclick="accPwdToggle(this)"><i class="ri-eye-line"></i></button>
          </div>
          <div class="acc-pwd-strength"><span class="acc-pwd-bar"></span><span class="acc-pwd-bar"></span><span class="acc-pwd-bar"></span><span class="acc-pwd-label">Sin evaluar</span></div>
        </label>
        <label class="acc-field">
          <span>Repetir nueva contraseña <em>*</em></span>
          <div class="acc-input-pwd">
            <input name="new_password2" type="password" placeholder="Repite la nueva contraseña" required oninput="accPwdMatch()">
            <button type="button" class="acc-pwd-eye" onclick="accPwdToggle(this)"><i class="ri-eye-line"></i></button>
          </div>
          <small class="acc-pwd-match" id="accPwdMatchMsg"></small>
        </label>
      </div>
    </div>
    <footer class="acc-card-foot">
      <button class="acc-btn-primary"><i class="ri-shield-keyhole-line"></i> Cambiar contraseña</button>
    </footer>
  </form>
</div>`});
  });
  return r;
}
module.exports = { config, router };
