"use strict";

const fs = require("fs");
const path = require("path");

function isAppearance(config) {
  const name = String(config.name || "").toLowerCase();
  const route = String(config.route || "").toLowerCase();
  const key = String(config.key || "").toLowerCase();
  return name.includes("apariencia") || name.includes("appearance") || route.includes("appearance") || key.includes("appearance");
}

function cleanupOldAppearance(db) {
  db.sqlite.prepare("DELETE FROM plugins WHERE area='admin' AND plugin_key != 'admin_appearance' AND (lower(name) LIKE '%apariencia%' OR lower(name) LIKE '%appearance%' OR lower(route) LIKE '%appearance%' OR lower(plugin_key) LIKE '%appearance%')").run();
}

function upsertPlugin(db, file, config) {
  if (config.area === "admin" && isAppearance(config) && config.key !== "admin_appearance") {
    cleanupOldAppearance(db);
    return false;
  }

  const catId = db.ensureCategory(config.area, config.category || "General", config.categoryIcon || "ri-folder-line", config.categoryOrder || 100);
  const row = db.sqlite.prepare("SELECT id, category_id FROM plugins WHERE plugin_key=?").get(config.key);

  if (!row) {
    db.sqlite.prepare(`INSERT INTO plugins (plugin_key,filename,name,icon,route,area,category_id,permission,enabled,show_in_menu,order_index,core) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(config.key, file, config.name, config.icon, config.route, config.area, catId, config.permission || "user", 1, config.showInMenu === false ? 0 : 1, config.order || 100, 1);
  } else {
    db.sqlite.prepare("UPDATE plugins SET filename=?, name=?, icon=?, route=?, area=?, category_id=?, permission=?, show_in_menu=?, order_index=? WHERE plugin_key=?")
      .run(file, config.name, config.icon, config.route, config.area, catId, config.permission || "user", config.showInMenu === false ? 0 : 1, config.order || 100, config.key);
  }

  if (config.key === "admin_appearance") {
    cleanupOldAppearance(db);
  } else {
    db.sqlite.prepare("DELETE FROM plugins WHERE area=? AND route=? AND plugin_key != ? AND plugin_key != 'admin_appearance'").run(config.area, config.route, config.key);
    db.sqlite.prepare("DELETE FROM plugins WHERE area=? AND name=? AND plugin_key != ? AND plugin_key != 'admin_appearance'").run(config.area, config.name, config.key);
  }
  return true;
}

function loadDir(app, ctx, dir, area) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".js")) continue;
    const full = path.join(dir, file);
    delete require.cache[require.resolve(full)];
    const mod = require(full);
    if (!mod.router || !mod.config || !mod.config.route) continue;
    mod.config.area = mod.config.area || area;
    const mounted = upsertPlugin(ctx.db, `${area}/${file}`, mod.config);
    if (!mounted) {
      console.log(`Plugin ${area}: ${file} saltado por ser apariencia vieja`);
      continue;
    }
    app.use(mod.config.route, mod.router(ctx));
    console.log(`Plugin ${area}: ${file} -> ${mod.config.route}`);
  }
}

function registry(db) {
  cleanupOldAppearance(db);
  const categories = db.sqlite.prepare("SELECT * FROM plugin_categories ORDER BY area, order_index, id").all();
  const plugins = db.sqlite.prepare("SELECT * FROM plugins WHERE enabled=1 AND show_in_menu=1 ORDER BY order_index, id").all();
  return { categories, plugins };
}

function loadPlugins(app, ctx) {
  loadDir(app, ctx, path.join(ctx.rootDir, "plugins", "client"), "client");
  loadDir(app, ctx, path.join(ctx.rootDir, "plugins", "admin"), "admin");
  return registry(ctx.db);
}

module.exports = { loadPlugins, registry };
