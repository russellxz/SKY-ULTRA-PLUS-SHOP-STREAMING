"use strict";
const db = require("./db");
const { countryOptions } = require("./auth");

function esc(v) { return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

function registerForm() {
  const siteName = db.getSetting("site_name","SKY ULTRA PLUS shop");
  const logo = db.getSetting("site_logo","");
  const logoHtml = logo
    ? `<img class="ac-brand-img" src="${esc(logo)}" alt="Logo">`
    : `<div class="ac-brand-avatar">${esc(String(siteName).charAt(0).toUpperCase())}</div>`;

  const features = [
    { icon: "ri-gift-2-line",       label: "Ofertas exclusivas" },
    { icon: "ri-flashlight-line",   label: "Entrega inmediata" },
    { icon: "ri-customer-service-2-line", label: "Soporte 24/7" },
  ];
  const featsHtml = features.map(f =>
    `<div class="ac-feat"><i class="${f.icon}"></i><span>${f.label}</span></div>`
  ).join("");

  return `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${esc(siteName)}</span></div>
  <h2 class="ac-title">Crear cuenta</h2>
  <p class="ac-sub">Regístrate y accede a todos los beneficios</p>
  <div class="ac-features">${featsHtml}</div>
  <form method="POST" action="/register" novalidate>
    <div class="ac-field-row">
      <div class="ac-field"><i class="ri-user-3-line"></i><input name="first_name" type="text" placeholder="Nombre" required autocomplete="given-name"></div>
      <div class="ac-field"><i class="ri-user-3-line"></i><input name="last_name" type="text" placeholder="Apellido" autocomplete="family-name"></div>
    </div>
    <div class="ac-field"><i class="ri-mail-line"></i><input name="email" type="email" placeholder="Correo electrónico" required autocomplete="email"></div>
    <div class="ac-field ac-wa"><i class="ri-whatsapp-line"></i><select name="whatsapp_country" class="ac-country">${countryOptions("+1")}</select><input name="whatsapp_number" type="tel" placeholder="WhatsApp (opcional)" autocomplete="tel"></div>
    <div class="ac-field"><i class="ri-lock-2-line"></i><input name="password" id="rPwd" type="password" placeholder="Contraseña (mín. 6 caracteres)" required autocomplete="new-password"><button type="button" class="ac-eye" onclick="acEye('rPwd',this)" tabindex="-1"><i class="ri-eye-line"></i></button></div>
    <div class="ac-field"><i class="ri-lock-2-line"></i><input name="password_confirm" id="rPwd2" type="password" placeholder="Confirmar contraseña" required autocomplete="new-password"><button type="button" class="ac-eye" onclick="acEye('rPwd2',this)" tabindex="-1"><i class="ri-eye-line"></i></button></div>
    <button type="submit" class="ac-btn"><i class="ri-user-add-line"></i> Crear cuenta</button>
    <div class="ac-alt">¿Ya tienes cuenta? <a href="/login" class="ac-link bold">Iniciar sesión</a></div>
  </form>
</div>`;
}

module.exports = { registerForm };
