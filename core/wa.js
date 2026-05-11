"use strict";

const fs = require("fs");
const path = require("path");

const SESSIONS_DIR = path.join(process.cwd(), "data", "wa-sessions");

let baileys = null;
let pino = null;
let sock = null;
let state = "disconnected"; // disconnected | starting | pairing | connected | error
let pairingCode = "";
let lastError = "";
let lastConnectedAt = null;
let lastDisconnectedAt = null;
let reconnectTimer = null;
let savedDb = null;
let autoStartTried = false;
let pairingTimer = null;

function digits(s) { return String(s || "").replace(/\D/g, ""); }
function isOnline() { return state === "connected" && !!sock; }

async function loadModules() {
  if (baileys && pino) return true;
  try {
    const mod = await import("@whiskeysockets/baileys");
    baileys = (mod.default && Object.keys(mod).length === 1) ? mod.default : mod;
    pino = require("pino");
    return true;
  } catch (e) {
    lastError = "Baileys no instalado. Corre `npm install` en el servidor: " + e.message;
    state = "error";
    return false;
  }
}

function setStatusInDb(db, value) {
  try { db.setSetting("wa_status", value); } catch (_) {}
}

async function start(db, opts = {}) {
  if (state === "connected" || state === "starting" || state === "pairing") {
    return { ok: false, error: "El bot ya está iniciando o conectado." };
  }
  savedDb = db;
  state = "starting";
  lastError = "";
  pairingCode = "";
  setStatusInDb(db, "starting");

  const ok = await loadModules();
  if (!ok) {
    setStatusInDb(db, "error");
    return { ok: false, error: lastError };
  }

  try {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

    const {
      default: makeWASocket,
      useMultiFileAuthState,
      makeCacheableSignalKeyStore,
      fetchLatestWaWebVersion,
      fetchLatestBaileysVersion,
    } = baileys;

    // Algunas versiones del fork exponen fetchLatestWaWebVersion en lugar de
    // fetchLatestBaileysVersion. Usamos la que esté disponible.
    const getWaVersion = typeof fetchLatestWaWebVersion === "function"
      ? fetchLatestWaWebVersion
      : fetchLatestBaileysVersion;

    const { state: authState, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
    let version;
    try { ({ version } = await getWaVersion()); } catch (_) { version = undefined; }

    const logger = pino({ level: "silent" });

    sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger),
      },
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      printQRInTerminal: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
      const { connection, lastDisconnect } = u || {};
      if (connection === "open") {
        state = "connected";
        lastConnectedAt = new Date().toISOString();
        pairingCode = "";
        try {
          db.setSetting("wa_status", "connected");
          db.setSetting("wa_last_connected_at", lastConnectedAt);
          db.setSetting("wa_pairing_code", "");
        } catch (_) {}
        console.log("[wa] conectado a WhatsApp");
      } else if (connection === "close") {
        lastDisconnectedAt = new Date().toISOString();
        const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode;
        const loggedOut = code === 401;
        state = "disconnected";
        sock = null;
        setStatusInDb(db, "disconnected");
        console.log(`[wa] conexión cerrada (code=${code}, loggedOut=${loggedOut})`);
        if (loggedOut) {
          // Borrar credenciales obsoletas para que el admin pueda reconectar limpio
          try { fs.rmSync(SESSIONS_DIR, { recursive: true, force: true }); } catch (_) {}
          return;
        }
        // Reconexión automática si el bot estaba habilitado
        if (db.getSetting("wa_bot_enabled", "0") === "1") {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            start(db).catch((e) => console.error("[wa] reconexión:", e.message));
          }, 5000);
        }
      } else if (connection === "connecting") {
        if (state !== "pairing") {
          state = "starting";
          setStatusInDb(db, "starting");
        }
      }
    });

    // Si no hay creds aún, pedimos código de emparejamiento de 8 dígitos
    if (!authState.creds.registered) {
      const phoneSetting = digits(opts.phoneNumber || db.getSetting("wa_bot_phone", ""));
      if (!phoneSetting) {
        state = "error";
        lastError = "Configura primero el número del bot en el plugin de WhatsApp.";
        setStatusInDb(db, "error");
        return { ok: false, error: lastError };
      }
      state = "pairing";
      setStatusInDb(db, "pairing");
      if (pairingTimer) clearTimeout(pairingTimer);
      pairingTimer = setTimeout(async () => {
        try {
          const raw = await sock.requestPairingCode(phoneSetting);
          const code = String(raw || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
          pairingCode = code.length === 8 ? code.match(/.{1,4}/g).join("-") : code;
          try { db.setSetting("wa_pairing_code", pairingCode); } catch (_) {}
          console.log("[wa] código de emparejamiento:", pairingCode);
        } catch (e) {
          state = "error";
          lastError = "No se pudo solicitar el código: " + (e.message || e);
          setStatusInDb(db, "error");
          console.error("[wa] requestPairingCode:", e.message);
        }
      }, 2500);
    }

    return { ok: true };
  } catch (e) {
    state = "error";
    lastError = e.message || String(e);
    setStatusInDb(db, "error");
    console.error("[wa] start error:", e);
    return { ok: false, error: lastError };
  }
}

async function stop() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (pairingTimer) { clearTimeout(pairingTimer); pairingTimer = null; }
  try {
    if (sock) {
      try { sock.ev?.removeAllListeners?.(); } catch (_) {}
      try { await sock.logout?.(); } catch (_) {}
      try { sock.end?.(undefined); } catch (_) {}
      try { sock.ws?.close?.(); } catch (_) {}
    }
  } catch (_) {}
  sock = null;
  state = "disconnected";
  pairingCode = "";
  if (savedDb) {
    setStatusInDb(savedDb, "disconnected");
    try { savedDb.setSetting("wa_pairing_code", ""); } catch (_) {}
  }
}

async function resetSession(db) {
  await stop();
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
  try {
    db.setSetting("wa_status", "disconnected");
    db.setSetting("wa_pairing_code", "");
    db.setSetting("wa_last_connected_at", "");
  } catch (_) {}
  return { ok: true };
}

function status() {
  return {
    state,
    pairingCode,
    lastError,
    lastConnectedAt,
    lastDisconnectedAt,
    hasSession: fs.existsSync(path.join(SESSIONS_DIR, "creds.json")),
  };
}

async function sendMessageToNumber(phone, text) {
  if (!isOnline()) return { ok: false, error: "WhatsApp no está conectado." };
  const d = digits(phone);
  if (!d || d.length < 7) return { ok: false, error: "Número inválido: " + phone };
  const jid = `${d}@s.whatsapp.net`;
  try {
    await sock.sendMessage(jid, { text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function siteUrl(db) {
  const manual = (db.getSetting("wa_site_url", "") || "").trim();
  if (manual) return manual.replace(/\/+$/, "");
  const detected = (db.getSetting("wa_detected_site_url", "") || "").trim();
  if (detected) return detected.replace(/\/+$/, "");
  const seed = (db.getSetting("site_url", "") || "").trim();
  if (seed) return seed.replace(/\/+$/, "");
  return "";
}

function fmtMoney(n) { return Number(n || 0).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function clientGreeting(user) {
  const name = (user.first_name || user.username || "").trim();
  return name ? `Hola *${name}*` : "Hola";
}

function clientPhoneFromUser(user) {
  // Prioriza whatsapp_country + whatsapp_number; cae a phone si no
  const cc = digits(user.whatsapp_country);
  const num = digits(user.whatsapp_number);
  if (cc && num) return cc + num;
  if (num) return num;
  return digits(user.phone);
}

function adminPhone(db) {
  return digits(db.getSetting("wa_admin_phone", ""));
}

function buildClientMessage(siteName, event, payload, url) {
  const greet = clientGreeting(payload.user);
  const inv = payload.invoice || {};
  const prod = payload.product || {};
  const link = url ? `\n\n🔗 ${url}/invoices/${inv.id}` : "";
  const home = url ? `\n\n🔗 ${url}` : "";
  switch (event) {
    case "invoice_pending":
      return `🛒 *${siteName}*\n\n📩 *Nueva factura pendiente*\n\n${greet}, tienes una factura pendiente.\n\nFactura: *${inv.number || "—"}*\nProducto: *${prod.name || "—"}*\nMonto: *${inv.currency || ""} $${fmtMoney(inv.total)}*${link}\n\nPaga la factura para activar / mantener tu servicio.`;
    case "invoice_paid":
      return `🛒 *${siteName}*\n\n✅ *Pago confirmado*\n\n${greet}, recibimos tu pago. ¡Gracias!\n\nFactura: *${inv.number || "—"}*\nProducto: *${prod.name || "—"}*\nMonto: *${inv.currency || ""} $${fmtMoney(inv.total)}*${link}`;
    case "invoice_suspended":
      return `🛒 *${siteName}*\n\n⚠️ *Factura suspendida*\n\n${greet}, tu factura *${inv.number || "—"}* fue suspendida por falta de pago.\n\nProducto: *${prod.name || "—"}*\nMonto: *${inv.currency || ""} $${fmtMoney(inv.total)}*\n\nAún puedes pagarla para reactivar tu servicio.${link}`;
    case "invoice_canceled":
      return `🛒 *${siteName}*\n\n❌ *Factura cancelada*\n\n${greet}, tu factura *${inv.number || "—"}* fue cancelada.\n\nProducto: *${prod.name || "—"}*\n\nSi crees que es un error, contacta al soporte.${home}`;
    case "service_suspended":
      return `🛒 *${siteName}*\n\n⚠️ *Servicio suspendido*\n\n${greet}, tu servicio *${prod.name || "—"}* fue suspendido por factura pendiente.\n\nPaga la factura para reactivarlo.${link}`;
    case "service_canceled":
      return `🛒 *${siteName}*\n\n❌ *Servicio cancelado*\n\n${greet}, tu servicio *${prod.name || "—"}* fue cancelado.\n\nLa información privada ya no está disponible desde tu cuenta.${home}`;
    default:
      return null;
  }
}

function buildAdminMessage(siteName, event, payload, url) {
  const u = payload.user || {};
  const inv = payload.invoice || {};
  const prod = payload.product || {};
  const clientName = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.email || "—";
  const phone = u.whatsapp_country && u.whatsapp_number
    ? `${u.whatsapp_country} ${u.whatsapp_number}`
    : (u.phone || "—");
  const title = {
    invoice_pending:   "📩 *Nueva factura pendiente*",
    invoice_paid:      "✅ *Pago recibido*",
    invoice_suspended: "⚠️ *Factura suspendida automáticamente*",
    invoice_canceled:  "❌ *Factura cancelada*",
    service_suspended: "⚠️ *Servicio suspendido automáticamente*",
    service_canceled:  "❌ *Servicio cancelado*",
  }[event] || `Evento: ${event}`;

  const lines = [
    `🛒 *${siteName}* — Aviso admin`,
    "",
    title,
    "",
    `Cliente: *${clientName}*`,
    `Correo: ${u.email || "—"}`,
    `Teléfono: ${phone}`,
  ];
  if (inv && inv.number) {
    lines.push(`Factura: ${inv.number}`);
    lines.push(`Monto: ${inv.currency || ""} $${fmtMoney(inv.total)}`);
    if (inv.status) lines.push(`Estado: ${inv.status}`);
  }
  if (prod && prod.name) lines.push(`Producto: ${prod.name}`);
  if (url) {
    lines.push("");
    if (inv && inv.id) lines.push(`🔗 ${url}/admin/invoices/${inv.id}`);
    else lines.push(`🔗 ${url}/admin`);
  }
  return lines.join("\n");
}

async function notify(db, event, payload = {}) {
  try {
    if (!isOnline()) return { ok: false, error: "WA no conectado." };
    if (db.getSetting("wa_bot_enabled", "0") !== "1") return { ok: false, skipped: true };
    if (db.getSetting(`wa_notify_${event}`, "1") !== "1") return { ok: true, skipped: true };

    const siteName = db.getSetting("site_name", "SKY ULTRA PLUS shop");
    const url = siteUrl(db);

    // Cliente
    const clientMsg = buildClientMessage(siteName, event, payload, url);
    const cphone = clientPhoneFromUser(payload.user || {});
    if (clientMsg && cphone) {
      await sendMessageToNumber(cphone, clientMsg).catch((e) => console.error("[wa] notify client:", e.message));
    }

    // Admin
    const aphone = adminPhone(db);
    if (aphone) {
      const adminMsg = buildAdminMessage(siteName, event, payload, url);
      await sendMessageToNumber(aphone, adminMsg).catch((e) => console.error("[wa] notify admin:", e.message));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function notifyByInvoiceId(db, event, invoiceId) {
  try {
    const inv = db.sqlite.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId);
    if (!inv) return;
    const user = db.getUserById(inv.user_id);
    if (!user) return;
    const item = db.sqlite.prepare("SELECT * FROM invoice_items WHERE invoice_id=? AND item_type='product' LIMIT 1").get(invoiceId)
              || db.sqlite.prepare("SELECT * FROM invoice_items WHERE invoice_id=? LIMIT 1").get(invoiceId);
    let product = null;
    if (item && item.reference_id) {
      product = db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(item.reference_id);
    }
    if (!product) product = { name: item?.name || "—" };
    notify(db, event, { user, invoice: inv, product }).catch(() => {});
  } catch (_) {}
}

function notifyByServiceId(db, event, serviceId) {
  try {
    const svc = db.sqlite.prepare("SELECT * FROM services WHERE id=?").get(serviceId);
    if (!svc) return;
    const user = db.getUserById(svc.user_id);
    if (!user) return;
    const product = db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(svc.product_id) || { name: "—" };
    const invoice = svc.invoice_id ? db.sqlite.prepare("SELECT * FROM invoices WHERE id=?").get(svc.invoice_id) : null;
    notify(db, event, { user, invoice, product, service: svc }).catch(() => {});
  } catch (_) {}
}

async function autoStartIfEnabled(db) {
  if (autoStartTried) return;
  autoStartTried = true;
  try {
    if (db.getSetting("wa_bot_enabled", "0") !== "1") return;
    const phone = digits(db.getSetting("wa_bot_phone", ""));
    if (!phone) return;
    // Solo intenta iniciar si hay sesión guardada o si el admin ya configuró el número
    await start(db).catch((e) => console.error("[wa] autoStart:", e.message));
  } catch (e) {
    console.error("[wa] autoStartIfEnabled:", e.message);
  }
}

module.exports = {
  start,
  stop,
  resetSession,
  status,
  notify,
  notifyByInvoiceId,
  notifyByServiceId,
  sendMessageToNumber,
  autoStartIfEnabled,
  SESSIONS_DIR,
};
