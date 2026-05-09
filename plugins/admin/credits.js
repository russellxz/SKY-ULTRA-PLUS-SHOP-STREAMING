"use strict";
const express = require("express");

const config = {
  key: "admin_credits",
  name: "Créditos",
  icon: "ri-wallet-3-line",
  route: "/admin/credits",
  area: "admin",
  category: "Usuarios",
  permission: "admin",
  order: 30,
  showInMenu: false,
};

function router(ctx) {
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);

  // Los créditos ahora se administran desde cada usuario:
  // /admin/users/:id/credits
  r.get("/", (req, res) => res.redirect("/admin/users"));
  r.post("/adjust", (req, res) => res.redirect("/admin/users"));

  return r;
}

module.exports = { config, router };
