"use strict";

const bcrypt = require("bcryptjs");
const db = require("./db");

function esc(v) { return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

function publicUser(u) {
  return { id: u.id, username: u.username, first_name: u.first_name || "", last_name: u.last_name || "", email: u.email, phone: u.phone || "", role: u.role, email_verified: u.email_verified ? 1 : 0 };
}

function login(identifier, password) {
  let user = db.getUserByEmail(identifier);
  if (!user) user = db.sqlite.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(String(identifier || "").trim());
  if (!user || !bcrypt.compareSync(String(password || ""), user.password_hash)) return { ok: false, error: "Correo/usuario o contraseña incorrectos." };
  const requireVerify = db.getSetting("require_email_verification","0") === "1";
  if (requireVerify && !user.email_verified) return { ok: false, error: "Tu cuenta no está verificada. Revisa tu correo o solicita un nuevo enlace.", needsVerification: true, userEmail: user.email };
  return { ok: true, user: publicUser(user) };
}

function register(body) {
  // Always create new public-registered users as unverified (email_verified=0).
  // Whether login is blocked depends on the require_email_verification setting (handled in login()).
  const out = db.createUser({ first_name: body.first_name || body.username, last_name: body.last_name || "", email: body.email, password: body.password, whatsapp_country: body.whatsapp_country || "+1", whatsapp_number: body.whatsapp_number || body.phone || "", role: "user", emailVerified: 0 });
  if (!out.ok) return out;
  return { ok: true, user: publicUser(out.user) };
}

function isPublicGet(req) {
  if (req.method !== "GET") return false;
  const p = req.path || "";
  if (p === "/") return true;
  if (p === "/store" || p.startsWith("/store/")) {
    // Block any /store sub-path that performs a write-like action
    if (/\/buy(-|$)/.test(p)) return false;
    return true;
  }
  return false;
}

function requireUser(req, res, next) {
  if (req.session.user) {
    const u = db.getUserById(req.session.user.id);
    if (!u) return req.session.destroy(() => res.redirect("/login"));
    req.session.user = publicUser(u);
    return next();
  }
  if (isPublicGet(req)) return next();
  return res.redirect("/login");
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role !== "admin") return res.status(403).send("403 - Solo admin");
  next();
}

function countryOptions(selected) {
  const list = [["+1","USA / Rep. Dom. / Puerto Rico"],["+54","Argentina"],["+591","Bolivia"],["+55","Brasil"],["+56","Chile"],["+57","Colombia"],["+506","Costa Rica"],["+53","Cuba"],["+593","Ecuador"],["+503","El Salvador"],["+34","España"],["+502","Guatemala"],["+509","Haití"],["+504","Honduras"],["+52","México"],["+505","Nicaragua"],["+507","Panamá"],["+595","Paraguay"],["+51","Perú"],["+598","Uruguay"],["+58","Venezuela"]];
  return list.map(([v,t])=>`<option value="${v}"${selected===v?" selected":""}>${v} ${t}</option>`).join("");
}

function loginForm() {
  const siteName = db.getSetting("site_name","SKY ULTRA PLUS shop");
  const logo = db.getSetting("site_logo","");
  const hasSupport = !!(db.getSetting("support_email") || db.getSetting("support_whatsapp_number") || db.getSetting("support_whatsapp_group"));
  const logoHtml = logo
    ? `<img class="ac-brand-img" src="${esc(logo)}" alt="Logo">`
    : `<div class="ac-brand-avatar">${esc(String(siteName).charAt(0).toUpperCase())}</div>`;
  const supBtn = hasSupport ? `<button type="button" class="ac-sup-inline" onclick="atSupOpen()"><i class="ri-customer-service-2-line"></i> Soporte</button>` : "";
  return `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${esc(siteName)}</span></div>
  <h2 class="ac-title">Iniciar sesión</h2>
  <p class="ac-sub">Usa tu correo o nombre de usuario</p>
  <form method="POST" action="/login" novalidate>
    <div class="ac-field"><i class="ri-user-3-line"></i><input name="email" type="text" placeholder="Correo o usuario" required autocomplete="username"></div>
    <div class="ac-field"><i class="ri-lock-2-line"></i><input name="password" id="lPwd" type="password" placeholder="Contraseña" required autocomplete="current-password"><button type="button" class="ac-eye" onclick="acEye('lPwd',this)" tabindex="-1"><i class="ri-eye-line"></i></button></div>
    <div class="ac-links-row"><a href="/forgot-password" class="ac-link">¿Olvidaste tu contraseña?</a>${supBtn}</div>
    <button type="submit" class="ac-btn"><i class="ri-login-circle-line"></i> Iniciar sesión</button>
    <div class="ac-alt">¿No tienes cuenta? <a href="/register" class="ac-link bold">Crear cuenta</a></div>
  </form>
</div>`;
}

module.exports = { login, register, requireUser, requireAdmin, loginForm, countryOptions };
