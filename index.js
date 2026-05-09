"use strict";

const express = require("express");
const session = require("express-session");
const BetterSQLiteStore = require("better-sqlite3-session-store")(session);
const helmet = require("helmet");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");

const db = require("./core/db");
const auth = require("./core/auth");
const mailer = require("./core/mailer");
const { registerForm } = require("./core/registerPage");
const layout = require("./core/layout");
const billing = require("./core/billing");
const { loadPlugins } = require("./core/pluginLoader");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

const uploadDir = path.join(__dirname, "uploads");
const tempUploadDir = path.join(uploadDir, ".tmp");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(tempUploadDir)) fs.mkdirSync(tempUploadDir, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true, limit: "1024mb" }));
app.use(express.json({ limit: "1024mb" }));
app.use(fileUpload({
  createParentPath: true,
  uploadDir,
  useTempFiles: true,
  tempFileDir: tempUploadDir,
  preserveExtension: 8,
  // Limite muy alto (1 GB) y sin abortar para que cualquier imagen pueda subirse
  limits: { fileSize: 1024 * 1024 * 1024 },
  abortOnLimit: false,
  parseNested: true,
  safeFileNames: false,
}));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));

app.use(session({
  secret: process.env.SESSION_SECRET || "skyultraplus_shop_v2_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 },
  store: new BetterSQLiteStore({ client: db.sqlite, expired: { clear: true, intervalMs: 900000 } })
}));

app.use((req, res, next) => {
  req.db = db;
  req.auth = auth;
  res.renderPage = (opts) => res.send(layout.render({ req, db, ...opts }));
  next();
});

// ===== Helper: send verification email (link + 6-digit code) =====
async function sendVerificationEmail(req, user) {
  const h = layout.escapeHtml;
  const { token, code } = db.createEmailToken(user.id, "verify");
  const baseUrl = req.protocol + "://" + req.get("host");
  const verifyLink = `${baseUrl}/verify-email?token=${token}`;
  const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
  const result = await mailer.sendMail(db, {
    to: user.email,
    toName: user.first_name || user.username,
    subject: `Verifica tu cuenta - ${siteName}`,
    bodyHtml: `<p style="margin:0 0 16px;">Hola <strong>${h(user.first_name || user.username)}</strong>,</p>
<p style="margin:0 0 16px;">Verifica tu correo electrónico para activar tu cuenta en <strong>${h(siteName)}</strong>.</p>
<p style="text-align:center;margin:28px 0;">
  <a href="${h(verifyLink)}" style="display:inline-block;background:linear-gradient(135deg,#4c1d95,#7c3aed);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">✓ Verificar mi cuenta</a>
</p>
<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Si el botón no funciona, copia este enlace:</p>
<p style="margin:0 0 24px;word-break:break-all;"><a href="${h(verifyLink)}" style="color:#a78bfa;">${h(verifyLink)}</a></p>
<div style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:12px;padding:18px;text-align:center;">
  <p style="margin:0 0 6px;color:#9ca3af;font-size:13px;">Código de verificación alternativo:</p>
  <p style="margin:0;font-size:30px;font-weight:900;color:#c4b5fd;letter-spacing:0.25em;">${code}</p>
</div>
<p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Este enlace y código expiran en 24 horas.</p>`,
    baseUrl,
  });
  return result;
}

// ===== Helper: HTML for "check your email" page =====
function buildCheckEmailPage(email, emailSent, errorMsg) {
  const h = layout.escapeHtml;
  const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
  const logo = db.getSetting("site_logo", "");
  const logoHtml = logo
    ? `<img class="ac-brand-img" src="${h(logo)}" alt="">`
    : `<div class="ac-brand-avatar"><i class="ri-mail-check-line" style="font-size:28px;"></i></div>`;
  const failBox = !emailSent ? `<div class="ac-error" style="margin:0 0 16px;"><i class="ri-error-warning-line"></i> No se pudo enviar el correo${errorMsg?": "+h(errorMsg):""}. Reintenta o contacta soporte.</div>` : "";
  return `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">¡Revisa tu correo!</h2>
  <p class="ac-sub">Te enviamos un enlace y un código de verificación a <strong>${h(email)}</strong>.</p>
  ${failBox}
  <div class="ac-info-box"><i class="ri-information-line"></i><span>Haz clic en el enlace del correo o usa el código abajo. Si no lo ves, revisa la carpeta de spam.</span></div>
  <div class="ac-divider-text">¿Ya tienes el código?</div>
  <form method="POST" action="/verify-email" novalidate>
    <input type="hidden" name="email" value="${h(email)}">
    <div class="ac-field"><i class="ri-key-2-line"></i><input name="code" type="text" placeholder="Código de 6 dígitos" required maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" autofocus></div>
    <button type="submit" class="ac-btn"><i class="ri-shield-check-line"></i> Verificar código</button>
  </form>
  <div class="ac-alt" style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap;">
    <a href="/login" class="ac-link">← Inicio de sesión</a>
    <a href="/resend-verification?email=${encodeURIComponent(email)}" class="ac-link">Reenviar correo</a>
  </div>
</div>`;
}

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  const success = req.query.reset === "1" ? "¡Contraseña restablecida! Ya puedes iniciar sesión." : "";
  res.send(layout.authPage({ title: "Iniciar sesión", body: auth.loginForm(), db, success }));
});

app.post("/login", (req, res) => {
  const out = auth.login(req.body.email, req.body.password);
  if (!out.ok) {
    if (out.needsVerification && out.userEmail) {
      return res.redirect(`/resend-verification?email=${encodeURIComponent(out.userEmail)}&from=login`);
    }
    return res.send(layout.authPage({ title: "Iniciar sesión", error: out.error, body: auth.loginForm(), db }));
  }
  req.session.user = out.user;
  res.redirect("/");
});

app.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.send(layout.authPage({ title: "Crear cuenta", body: registerForm(), db }));
});

app.post("/register", async (req, res) => {
  if (req.body.password !== req.body.password_confirm) {
    return res.send(layout.authPage({ title: "Crear cuenta", error: "Las contraseñas no coinciden.", body: registerForm(), db }));
  }
  const out = auth.register(req.body);
  if (!out.ok) return res.send(layout.authPage({ title: "Crear cuenta", error: out.error, body: registerForm(), db }));

  // Always try to send verification email (even when verification not required)
  const fullUser = db.getUserById(out.user.id);
  let emailResult = { ok: false, error: "" };
  try { emailResult = await sendVerificationEmail(req, fullUser); } catch (e) { emailResult = { ok: false, error: e.message }; }

  const requireVerify = db.getSetting("require_email_verification", "0") === "1";

  if (requireVerify) {
    // Block login until verified - show the check-email page
    return res.send(layout.authPage({ title: "Verifica tu correo", db, body: buildCheckEmailPage(out.user.email, emailResult.ok, emailResult.error) }));
  }

  // Verification not required - log them in. Banner in dashboard will prompt them to verify.
  req.session.user = out.user;
  res.redirect("/?welcome=1");
});

app.get("/forgot-password", (req, res) => {
  if (req.session.user) return res.redirect("/");
  const h = layout.escapeHtml;
  const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
  const logo = db.getSetting("site_logo", "");
  const logoHtml = logo
    ? `<img class="ac-brand-img" src="${h(logo)}" alt="">`
    : `<div class="ac-brand-avatar"><i class="ri-lock-2-line" style="font-size:28px;"></i></div>`;

  if (req.query.sent === "1") {
    const email = req.query.email || "";
    const body = `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Correo enviado</h2>
  <p class="ac-sub">Enviamos instrucciones a <strong>${h(email)}</strong>. Revisa tu bandeja de entrada y spam.</p>
  <div class="ac-divider-text">¿Ya tienes el código?</div>
  <form method="GET" action="/reset-password" novalidate>
    <div class="ac-field"><i class="ri-key-2-line"></i><input name="code" type="text" placeholder="Código de 6 dígitos" required maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code"></div>
    <button type="submit" class="ac-btn"><i class="ri-shield-check-line"></i> Verificar código</button>
  </form>
  <div class="ac-alt" style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap;">
    <a href="/forgot-password" class="ac-link">← Volver</a>
    <a href="/forgot-password?email=${encodeURIComponent(email)}" class="ac-link">Reenviar correo</a>
  </div>
</div>`;
    return res.send(layout.authPage({ title: "Correo enviado", body, db }));
  }

  const prefillEmail = req.query.email ? h(req.query.email) : "";
  const body = `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Recuperar contraseña</h2>
  <p class="ac-sub">Escribe tu correo y te enviaremos instrucciones para restablecer tu contraseña</p>
  <form method="POST" action="/forgot-password" novalidate>
    <div class="ac-field"><i class="ri-mail-line"></i><input name="email" type="email" placeholder="Correo electrónico" required autocomplete="email" value="${prefillEmail}"></div>
    <div class="ac-field-hint"><i class="ri-information-line"></i> ¿Ya tienes un código? <a href="/reset-password" class="ac-link" style="margin-left:4px;">Ingrésalo aquí</a></div>
    <button type="submit" class="ac-btn"><i class="ri-send-plane-line"></i> Enviar instrucciones</button>
  </form>
  <div class="ac-alt"><a href="/login" class="ac-link bold">← Volver al inicio de sesión</a></div>
</div>`;
  res.send(layout.authPage({ title: "Recuperar contraseña", body, db }));
});

app.post("/forgot-password", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email) return res.redirect("/forgot-password");

  const user = db.getUserByEmail(email);
  if (user) {
    const { token, code } = db.createEmailToken(user.id, "reset");
    const baseUrl = req.protocol + "://" + req.get("host");
    const resetLink = `${baseUrl}/reset-password?token=${token}`;
    const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
    const h = layout.escapeHtml;
    await mailer.sendMail(db, {
      to: user.email,
      toName: user.first_name || user.username,
      subject: `Restablecer contraseña - ${siteName}`,
      bodyHtml: `<p style="margin:0 0 16px;">Hola <strong>${h(user.first_name || user.username)}</strong>,</p>
<p style="margin:0 0 16px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>${h(siteName)}</strong>.</p>
<p style="text-align:center;margin:28px 0;">
  <a href="${h(resetLink)}" style="display:inline-block;background:linear-gradient(135deg,#4c1d95,#7c3aed);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">🔑 Restablecer contraseña</a>
</p>
<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Si el botón no funciona, copia este enlace:</p>
<p style="margin:0 0 24px;word-break:break-all;"><a href="${h(resetLink)}" style="color:#a78bfa;">${h(resetLink)}</a></p>
<div style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:12px;padding:18px;text-align:center;">
  <p style="margin:0 0 6px;color:#9ca3af;font-size:13px;">Código de verificación alternativo:</p>
  <p style="margin:0;font-size:30px;font-weight:900;color:#c4b5fd;letter-spacing:0.25em;">${code}</p>
</div>
<p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Este enlace y código expiran en 24 horas. Si no solicitaste esto, ignora este correo.</p>`,
      baseUrl,
    });
  }

  res.redirect(`/forgot-password?sent=1&email=${encodeURIComponent(email)}`);
});

function verifyEmailRender(req, res, lookup) {
  const h = layout.escapeHtml;
  const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
  const logo = db.getSetting("site_logo", "");
  const logoHtml = logo ? `<img class="ac-brand-img" src="${h(logo)}" alt="">` : `<div class="ac-brand-avatar"><i class="ri-mail-check-line" style="font-size:28px;"></i></div>`;

  if (!lookup) {
    // Show code entry form
    return res.send(layout.authPage({ title: "Verificar correo", db, body: `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Verificar correo</h2>
  <p class="ac-sub">Ingresa el código que recibiste por correo</p>
  <form method="POST" action="/verify-email" novalidate>
    <div class="ac-field"><i class="ri-key-2-line"></i><input name="code" type="text" placeholder="Código de 6 dígitos" required maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" autofocus></div>
    <button type="submit" class="ac-btn"><i class="ri-shield-check-line"></i> Verificar</button>
  </form>
  <div class="ac-alt" style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap;">
    <a href="/login" class="ac-link">← Inicio de sesión</a>
    <a href="/resend-verification" class="ac-link">Reenviar correo</a>
  </div>
</div>` }));
  }

  const t = db.verifyEmailToken(lookup, "verify");
  if (!t) {
    return res.send(layout.authPage({ title: "Enlace inválido", db, body: `<div class="auth-card">
  <div class="ac-brand"><div class="ac-brand-avatar" style="background:linear-gradient(135deg,#dc2626,#ef4444);"><i class="ri-close-circle-line" style="font-size:28px;"></i></div><span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Enlace o código inválido</h2>
  <p class="ac-sub">El enlace o código es inválido o ya expiró. Solicita uno nuevo.</p>
  <a href="/resend-verification" class="ac-btn" style="margin-top:8px;text-decoration:none;"><i class="ri-mail-send-line"></i> Reenviar correo</a>
  <div class="ac-alt"><a href="/login" class="ac-link bold">← Volver al inicio de sesión</a></div>
</div>` }));
  }

  db.sqlite.prepare("UPDATE users SET email_verified=1 WHERE id=?").run(t.user_id);
  db.useEmailToken(t.id);

  // Auto-login the user after verification
  const verifiedUser = db.getUserById(t.user_id);
  if (verifiedUser && req.session) {
    req.session.user = { id: verifiedUser.id, username: verifiedUser.username, first_name: verifiedUser.first_name||"", last_name: verifiedUser.last_name||"", email: verifiedUser.email, phone: verifiedUser.phone||"", role: verifiedUser.role, email_verified: 1 };
  }

  return res.send(layout.authPage({ title: "¡Cuenta verificada!", db, body: `<div class="auth-card">
  <div class="ac-brand"><div class="ac-brand-avatar" style="background:linear-gradient(135deg,#059669,#10b981);"><i class="ri-checkbox-circle-line" style="font-size:28px;"></i></div><span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">¡Cuenta verificada!</h2>
  <p class="ac-sub">Tu cuenta fue verificada exitosamente.</p>
  <a href="/" class="ac-btn" style="margin-top:8px;text-decoration:none;"><i class="ri-home-5-line"></i> Ir al inicio</a>
</div>` }));
}

app.get("/verify-email", (req, res) => {
  const lookup = req.query.token || req.query.code || "";
  return verifyEmailRender(req, res, lookup);
});

app.post("/verify-email", (req, res) => {
  const lookup = String(req.body.code || req.body.token || "").trim();
  return verifyEmailRender(req, res, lookup);
});

app.get("/resend-verification", (req, res) => {
  const h = layout.escapeHtml;
  const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
  const logo = db.getSetting("site_logo", "");
  const logoHtml = logo
    ? `<img class="ac-brand-img" src="${h(logo)}" alt="">`
    : `<div class="ac-brand-avatar"><i class="ri-mail-send-line" style="font-size:28px;"></i></div>`;

  if (req.query.sent === "1") {
    const email = req.query.email || "";
    return res.send(layout.authPage({ title: "Correo reenviado", db, body: buildCheckEmailPage(email, true, "") }));
  }

  const fromLogin = req.query.from === "login";
  const noticeBox = fromLogin
    ? `<div class="ac-info-box"><i class="ri-information-line"></i><span>Tu cuenta no está verificada. Reenvía el correo de verificación o ingresa el código que recibiste anteriormente.</span></div>`
    : "";
  const prefillEmail = req.query.email ? h(req.query.email) : "";

  const body = `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Reenviar verificación</h2>
  <p class="ac-sub">Te enviaremos un nuevo enlace y código a tu correo</p>
  ${noticeBox}
  <form method="POST" action="/resend-verification" novalidate>
    <div class="ac-field"><i class="ri-mail-line"></i><input name="email" type="email" placeholder="Correo electrónico" required autocomplete="email" value="${prefillEmail}"></div>
    <button type="submit" class="ac-btn"><i class="ri-send-plane-line"></i> Enviar correo de verificación</button>
  </form>
  <div class="ac-divider-text">¿Ya tienes el código?</div>
  <a href="/verify-email" class="ac-btn" style="background:rgba(139,92,246,.14);box-shadow:none;text-decoration:none;color:#c4b5fd;"><i class="ri-key-2-line"></i> Ingresar código</a>
  <div class="ac-alt"><a href="/login" class="ac-link bold">← Volver al inicio de sesión</a></div>
</div>`;
  res.send(layout.authPage({ title: "Reenviar verificación", body, db }));
});

app.post("/resend-verification", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email) return res.redirect("/resend-verification");

  const user = db.getUserByEmail(email);
  if (user && !user.email_verified) {
    try { await sendVerificationEmail(req, user); } catch (e) { /* ignore */ }
  }
  // Always show success to avoid leaking which emails exist
  res.redirect(`/resend-verification?sent=1&email=${encodeURIComponent(email)}`);
});

app.get("/reset-password", (req, res) => {
  const h = layout.escapeHtml;
  const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
  const logo = db.getSetting("site_logo", "");
  const logoHtml = logo
    ? `<img class="ac-brand-img" src="${h(logo)}" alt="">`
    : `<div class="ac-brand-avatar"><i class="ri-lock-2-line" style="font-size:28px;"></i></div>`;

  const lookup = req.query.token || req.query.code || "";
  if (!lookup) {
    const body = `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Verificar código</h2>
  <p class="ac-sub">Ingresa el código de 6 dígitos que recibiste por correo</p>
  <form method="GET" action="/reset-password" novalidate>
    <div class="ac-field"><i class="ri-key-2-line"></i><input name="code" type="text" placeholder="Código de 6 dígitos" required maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" autofocus></div>
    <button type="submit" class="ac-btn"><i class="ri-shield-check-line"></i> Verificar</button>
  </form>
  <div class="ac-alt"><a href="/forgot-password" class="ac-link bold">← Volver</a></div>
</div>`;
    return res.send(layout.authPage({ title: "Verificar código", body, db }));
  }

  const t = db.verifyEmailToken(lookup, "reset");
  if (!t) {
    const body = `<div class="auth-card">
  <div class="ac-brand"><div class="ac-brand-avatar" style="background:linear-gradient(135deg,#dc2626,#ef4444);"><i class="ri-close-circle-line" style="font-size:28px;"></i></div><span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Enlace inválido</h2>
  <p class="ac-sub">El enlace o código es inválido o ya expiró. Solicita uno nuevo.</p>
  <a href="/forgot-password" class="ac-btn" style="margin-top:8px;text-decoration:none;"><i class="ri-mail-send-line"></i> Solicitar nuevo enlace</a>
  <div class="ac-alt"><a href="/login" class="ac-link bold">← Volver al inicio de sesión</a></div>
</div>`;
    return res.send(layout.authPage({ title: "Enlace inválido", body, db }));
  }

  const body = `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Nueva contraseña</h2>
  <p class="ac-sub">Elige una contraseña segura para tu cuenta</p>
  <form method="POST" action="/reset-password" novalidate>
    <input type="hidden" name="token" value="${h(t.token)}">
    <div class="ac-field"><i class="ri-lock-2-line"></i><input name="password" id="rp1" type="password" placeholder="Nueva contraseña (mín. 6 caracteres)" required autocomplete="new-password"><button type="button" class="ac-eye" onclick="acEye('rp1',this)" tabindex="-1"><i class="ri-eye-line"></i></button></div>
    <div class="ac-field"><i class="ri-lock-2-line"></i><input name="password_confirm" id="rp2" type="password" placeholder="Confirmar nueva contraseña" required autocomplete="new-password"><button type="button" class="ac-eye" onclick="acEye('rp2',this)" tabindex="-1"><i class="ri-eye-line"></i></button></div>
    <button type="submit" class="ac-btn"><i class="ri-lock-unlock-line"></i> Guardar contraseña</button>
  </form>
</div>`;
  res.send(layout.authPage({ title: "Nueva contraseña", body, db }));
});

app.post("/reset-password", (req, res) => {
  const h = layout.escapeHtml;
  const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
  const logo = db.getSetting("site_logo", "");
  const logoHtml = logo
    ? `<img class="ac-brand-img" src="${h(logo)}" alt="">`
    : `<div class="ac-brand-avatar"><i class="ri-lock-2-line" style="font-size:28px;"></i></div>`;

  const lookup = req.body.token || req.body.code || "";
  if (!lookup) return res.redirect("/forgot-password");

  const t = db.verifyEmailToken(lookup, "reset");
  if (!t) {
    return res.send(layout.authPage({ title: "Enlace inválido", db, error: "El enlace o código es inválido o ya expiró.", body: `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Enlace inválido</h2>
  <a href="/forgot-password" class="ac-btn" style="margin-top:8px;text-decoration:none;"><i class="ri-mail-send-line"></i> Solicitar nuevo enlace</a>
</div>` }));
  }

  const { password, password_confirm } = req.body;
  const resetForm = `<div class="auth-card">
  <div class="ac-brand">${logoHtml}<span class="ac-brand-name">${h(siteName)}</span></div>
  <h2 class="ac-title">Nueva contraseña</h2>
  <form method="POST" action="/reset-password" novalidate>
    <input type="hidden" name="token" value="${h(t.token)}">
    <div class="ac-field"><i class="ri-lock-2-line"></i><input name="password" id="rp1" type="password" placeholder="Nueva contraseña" required><button type="button" class="ac-eye" onclick="acEye('rp1',this)" tabindex="-1"><i class="ri-eye-line"></i></button></div>
    <div class="ac-field"><i class="ri-lock-2-line"></i><input name="password_confirm" id="rp2" type="password" placeholder="Confirmar contraseña" required><button type="button" class="ac-eye" onclick="acEye('rp2',this)" tabindex="-1"><i class="ri-eye-line"></i></button></div>
    <button type="submit" class="ac-btn"><i class="ri-lock-unlock-line"></i> Guardar contraseña</button>
  </form>
</div>`;

  if (!password || password.length < 6) {
    return res.send(layout.authPage({ title: "Nueva contraseña", db, error: "La contraseña debe tener mínimo 6 caracteres.", body: resetForm }));
  }
  if (password !== password_confirm) {
    return res.send(layout.authPage({ title: "Nueva contraseña", db, error: "Las contraseñas no coinciden.", body: resetForm }));
  }

  const result = db.resetPassword(t.user_id, password);
  if (!result.ok) {
    return res.send(layout.authPage({ title: "Nueva contraseña", db, error: result.error, body: resetForm }));
  }
  db.useEmailToken(t.id);
  res.redirect("/login?reset=1");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.use(auth.requireUser);

try {
  const appearance = require("./plugins/admin/appearance");
  app.use(appearance.config.route, appearance.router({ db, auth, layout, rootDir: __dirname }));
  db.sqlite.prepare("DELETE FROM plugins WHERE area='admin' AND route='/admin/appearance' AND plugin_key!='admin_appearance'").run();
} catch (e) {
  console.error("No se pudo montar Apariencia nueva:", e.message);
}

const registry = loadPlugins(app, { db, auth, layout, rootDir: __dirname });

setInterval(() => {
  try {
    const made = billing.generateRecurringInvoices(db);
    if (made) console.log(`[billing] facturas recurrentes generadas: ${made}`);
  } catch (e) {
    console.error("[billing] error:", e.message);
  }
}, 30000);

app.get("/", (req, res) => {
  const user = req.session.user;
  const dbu = db.getUserById(user.id) || user;
  const fullName = `${dbu.first_name||dbu.username||""} ${dbu.last_name||""}`.trim() || dbu.email || "amigo";
  const initial = String(fullName).trim().charAt(0).toUpperCase() || "U";
  const h = (v)=>layout.escapeHtml(v||"");

  // Stats personales
  let svcActive=0,invPending=0,wallet=0,tkOpen=0;
  try{
    svcActive = db.sqlite.prepare("SELECT COUNT(*) c FROM services WHERE user_id=? AND status='active'").get(user.id).c;
  }catch{}
  try{
    invPending = db.sqlite.prepare("SELECT COUNT(*) c FROM invoices WHERE user_id=? AND status='pending'").get(user.id).c;
  }catch{}
  try{
    const w = db.getWallet(user.id, "USD");
    wallet = Number(w.balance||0);
  }catch{}
  try{
    tkOpen = db.sqlite.prepare("SELECT COUNT(*) c FROM tickets WHERE user_id=? AND status IN ('open','pending')").get(user.id).c;
  }catch{}

  // Servicios recientes
  let recentServices = [];
  try{
    recentServices = db.sqlite.prepare(`
      SELECT s.id, s.status, s.next_invoice_at, p.name product_name, p.image_path, p.price, p.currency
      FROM services s JOIN products p ON p.id=s.product_id
      WHERE s.user_id=? ORDER BY s.id DESC LIMIT 5
    `).all(user.id);
  }catch{}

  // Facturas recientes
  let recentInvoices = [];
  try{
    recentInvoices = db.sqlite.prepare(`
      SELECT i.id, i.number, i.status, i.total, i.currency, i.created_at,
        (SELECT it.name FROM invoice_items it WHERE it.invoice_id=i.id LIMIT 1) item_name
      FROM invoices i WHERE i.user_id=? ORDER BY i.id DESC LIMIT 5
    `).all(user.id);
  }catch{}

  const fmtMoney = (n)=>Number(n||0).toLocaleString("es",{minimumFractionDigits:2,maximumFractionDigits:2});
  const svcStatus = (s)=>({active:'ok',pending:'pending',suspended:'err',canceled:'err'})[s]||'muted';
  const invStatus = (s)=>({paid:'ok',pending:'pending',suspended:'err',canceled:'err'})[s]||'muted';

  const svcRows = recentServices.map(s=>`<a class="cd-list-row" href="/services">
    <div class="cd-list-icon">${s.image_path?`<img src="${h(s.image_path)}" alt="">`:`<i class="ri-archive-stack-line"></i>`}</div>
    <div class="cd-list-text"><b>${h(s.product_name)}</b><small>#${s.id}</small></div>
    <div class="cd-list-side"><b>${h(s.currency)} ${fmtMoney(s.price)}</b><small class="${svcStatus(s.status)}">${h(s.status)}</small></div>
  </a>`).join("") || '<div class="cd-empty-mini">Aún no tienes servicios contratados.</div>';

  const invRows = recentInvoices.map(i=>`<a class="cd-list-row" href="/invoices">
    <div class="cd-list-icon"><i class="ri-file-list-3-line"></i></div>
    <div class="cd-list-text"><b>${h(i.number)}</b><small>${h(i.item_name||"Factura")}</small></div>
    <div class="cd-list-side"><b>${h(i.currency)} ${fmtMoney(i.total)}</b><small class="${invStatus(i.status)}">${h(i.status)}</small></div>
  </a>`).join("") || '<div class="cd-empty-mini">Aún no tienes facturas.</div>';

  const greetHour = new Date().getHours();
  const greet = greetHour < 12 ? "Buenos días" : greetHour < 19 ? "Buenas tardes" : "Buenas noches";

  // Unverified email banner (when verification is OFF in admin but user hasn't verified)
  const isVerified = !!dbu.email_verified;
  const verifyBanner = !isVerified ? `
  <section class="cd-verify-banner">
    <div class="cd-verify-icon"><i class="ri-mail-lock-line"></i></div>
    <div class="cd-verify-text">
      <strong>Verifica tu correo electrónico</strong>
      <span>Te enviamos un correo a <b>${h(dbu.email)}</b>. Revísalo para confirmar tu cuenta y desbloquear todas las funciones.</span>
    </div>
    <div class="cd-verify-actions">
      <a href="/verify-email" class="cd-verify-btn primary"><i class="ri-key-2-line"></i> Ingresar código</a>
      <a href="/resend-verification?email=${encodeURIComponent(dbu.email)}" class="cd-verify-btn secondary"><i class="ri-send-plane-line"></i> Reenviar correo</a>
    </div>
  </section>` : "";

  const welcomeNotice = req.query.welcome === "1" ? `
  <section class="cd-welcome-notice">
    <i class="ri-checkbox-circle-line"></i>
    <span>¡Bienvenido! Tu cuenta fue creada exitosamente.${!isVerified?" Revisa tu correo para verificar.":""}</span>
  </section>` : "";

  res.renderPage({
    title: "Inicio",
    area: "client",
    registry,
    content: `
<link rel="stylesheet" href="/public/css/client-dashboard.css?v=2">
<div class="cd-dash">
  ${welcomeNotice}
  ${verifyBanner}
  <section class="cd-hero">
    <div class="cd-hero-avatar">${h(initial)}</div>
    <div class="cd-hero-text">
      <span class="greet"><i class="ri-sparkling-2-line"></i> ${greet}</span>
      <h1>Hola, ${h(fullName.split(" ")[0])} 👋</h1>
      <p>Bienvenido de vuelta. Aquí tienes un resumen de tu cuenta.</p>
    </div>
  </section>

  <section class="cd-stats">
    <div class="cd-stat svc"><div class="cd-stat-icon"><i class="ri-archive-stack-line"></i></div><div class="cd-stat-value">${svcActive}</div><div class="cd-stat-label">Servicios activos</div></div>
    <div class="cd-stat inv"><div class="cd-stat-icon"><i class="ri-file-list-3-line"></i></div><div class="cd-stat-value">${invPending}</div><div class="cd-stat-label">Facturas pendientes</div></div>
    <div class="cd-stat cred"><div class="cd-stat-icon"><i class="ri-wallet-3-line"></i></div><div class="cd-stat-value">$${fmtMoney(wallet)}</div><div class="cd-stat-label">Crédito disponible</div></div>
    <div class="cd-stat tk"><div class="cd-stat-icon"><i class="ri-customer-service-2-line"></i></div><div class="cd-stat-value">${tkOpen}</div><div class="cd-stat-label">Tickets abiertos</div></div>
  </section>

  <section class="cd-quick">
    <a class="cd-quick-card" href="/products"><div class="cd-quick-icon"><i class="ri-shopping-bag-3-line"></i></div><div class="cd-quick-text"><strong>Comprar</strong><small>Explora la tienda</small></div></a>
    <a class="cd-quick-card" href="/services"><div class="cd-quick-icon"><i class="ri-archive-stack-line"></i></div><div class="cd-quick-text"><strong>Mis servicios</strong><small>Estado y renovación</small></div></a>
    <a class="cd-quick-card" href="/invoices"><div class="cd-quick-icon"><i class="ri-file-list-3-line"></i></div><div class="cd-quick-text"><strong>Mis facturas</strong><small>Histórico y pagos</small></div></a>
    <a class="cd-quick-card" href="/tickets"><div class="cd-quick-icon"><i class="ri-customer-service-2-line"></i></div><div class="cd-quick-text"><strong>Soporte</strong><small>Habla con nosotros</small></div></a>
  </section>

  <div class="cd-row">
    <section class="cd-block">
      <header class="cd-block-head">
        <h3><i class="ri-archive-stack-line"></i> Servicios recientes</h3>
        <a href="/services">Ver todos <i class="ri-arrow-right-s-line"></i></a>
      </header>
      <div class="cd-list">${svcRows}</div>
    </section>
    <section class="cd-block">
      <header class="cd-block-head">
        <h3><i class="ri-file-list-3-line"></i> Facturas recientes</h3>
        <a href="/invoices">Ver todas <i class="ri-arrow-right-s-line"></i></a>
      </header>
      <div class="cd-list">${invRows}</div>
    </section>
  </div>
</div>`
  });
});

app.use((req, res) => res.status(404).renderPage({ title: "404", area: req.session.user?.role === "admin" ? "admin" : "client", registry, content: "<div class='card'><h2>404</h2><p>Página no encontrada.</p></div>" }));

app.listen(PORT, "0.0.0.0", () => console.log(`SKYULTRAPLUS-SHOP v2 online en puerto ${PORT}`));
