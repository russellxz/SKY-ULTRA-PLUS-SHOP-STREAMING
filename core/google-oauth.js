"use strict";

const crypto = require("crypto");

function isEnabled(db) {
  return db.getSetting("google_oauth_enabled", "0") === "1"
    && !!db.getSetting("google_oauth_client_id", "")
    && !!db.getSetting("google_oauth_client_secret", "");
}

function callbackUrl(req) {
  const host = req.get("host");
  const proto = req.protocol;
  return `${proto}://${host}/auth/google/callback`;
}

function buildAuthUrl(db, req, state) {
  const cid = db.getSetting("google_oauth_client_id", "");
  const params = new URLSearchParams({
    client_id: cid,
    redirect_uri: callbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(db, req, code) {
  const cid = db.getSetting("google_oauth_client_id", "");
  const sec = db.getSetting("google_oauth_client_secret", "");
  const body = new URLSearchParams({
    code,
    client_id: cid,
    client_secret: sec,
    redirect_uri: callbackUrl(req),
    grant_type: "authorization_code",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error_description || data.error || "Error al obtener token");
  return data;
}

async function fetchUserInfo(accessToken) {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error("Error al obtener perfil de Google");
  return r.json();
  // { sub, email, email_verified, name, given_name, family_name, picture, locale }
}

function newState() {
  return crypto.randomBytes(16).toString("hex");
}

module.exports = { isEnabled, callbackUrl, buildAuthUrl, exchangeCode, fetchUserInfo, newState };
