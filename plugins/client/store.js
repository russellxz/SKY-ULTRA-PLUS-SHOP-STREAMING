"use strict";
const express = require("express");
const billing = require("../../core/billing");

const config = { key: "client_store", name: "Productos", icon: "ri-store-2-line", route: "/store", area: "client", category: "Tienda", order: 10 };
function h(ctx,v){return ctx.layout.escapeHtml(v||"");}
function stock(ctx,id){ const r = ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM product_inventory_items WHERE product_id=? AND status='available'").get(id); return r ? r.c : 0; }
function cycleLabel(p){ if(p.billing_type==='one_time') return 'Pago único'; if(Number(p.cycle_minutes)>0) return `Cada ${p.cycle_minutes} min`; if(Number(p.cycle_days)===7) return 'Semanal'; if(Number(p.cycle_days)===15) return 'Cada 15 días'; return 'Mensual'; }
function wallet(ctx,userId,currency){ return ctx.db.getWallet(userId,currency); }

function buyButton(ctx, req, p, available){
  const w = wallet(ctx, req.session.user.id, p.currency);
  const enough = Number(w.balance || 0) >= Number(p.price || 0);
  if (available <= 0) return `<button class="btn" disabled>Sin stock</button>`;
  if (!enough) return `<button class="btn" disabled>Crédito insuficiente</button><small>Tu crédito: ${p.currency} ${billing.money(w.balance)}</small>`;
  return `<form method="POST" action="/store/product/${p.id}/buy-credit"><button class="btn">Comprar con crédito</button></form><small>Tu crédito: ${p.currency} ${billing.money(w.balance)}</small>`;
}

function router(ctx) {
  const r = express.Router();

  r.post("/product/:id/buy-credit", (req, res) => {
    const out = billing.buyWithCredits(ctx.db, req.session.user.id, req.params.id);
    if (out.ok) return res.redirect("/services?bought=1");
    return res.redirect(`/store/product/${req.params.id}?error=${encodeURIComponent(out.error)}`);
  });

  r.get("/", (req, res) => {
    const cats = ctx.db.sqlite.prepare("SELECT * FROM product_categories WHERE active=1 ORDER BY order_index,id").all();
    const products = ctx.db.sqlite.prepare("SELECT products.* FROM products INNER JOIN product_categories ON product_categories.id=products.category_id WHERE products.active=1 AND product_categories.active=1 ORDER BY products.id DESC").all();
    let html = `<div class="page-head"><p class="eyebrow">Tienda</p><h1>Productos digitales</h1><p>Compra con tus créditos. Al pagar se crea factura, servicio activo y se revela tu información del producto.</p></div>`;
    if (req.query.error) html += `<div class="notice error">${h(ctx, req.query.error)}</div>`;
    if (!products.length) html += `<div class="card empty">Todavía no hay productos disponibles.</div>`;
    for (const c of cats) {
      const list = products.filter(p => Number(p.category_id) === Number(c.id));
      if (!list.length) continue;
      html += `<div class="store-category-head">${c.image_path?`<img src="${h(ctx,c.image_path)}">`:`<i class="${h(ctx,c.icon)}"></i>`}<h2>${h(ctx,c.name)}</h2></div><div class="grid cards-3">`;
      for (const p of list) {
        const available = stock(ctx,p.id);
        html += `<div class="card product-card">${p.image_path?`<img class="product-img" src="${h(ctx,p.image_path)}">`:""}<b>${h(ctx,p.name)}</b><p>${h(ctx,p.description)}</p><div class="product-meta"><span>${cycleLabel(p)}</span><span>Stock: ${available}</span><span>${p.currency} ${billing.money(p.price)}</span></div>${buyButton(ctx, req, p, available)}<a class="btn ghost" href="/store/product/${p.id}">Ver detalles</a></div>`;
      }
      html += `</div>`;
    }
    res.renderPage({ title: "Productos", area: "client", registry: require("../../core/pluginLoader").registry(ctx.db), content: html });
  });

  r.get("/product/:id", (req, res) => {
    const p = ctx.db.sqlite.prepare("SELECT products.* FROM products INNER JOIN product_categories ON product_categories.id=products.category_id WHERE products.id=? AND products.active=1 AND product_categories.active=1").get(req.params.id);
    if (!p) return res.redirect("/store");
    const available = stock(ctx,p.id);
    const err = req.query.error ? `<div class="notice error">${h(ctx, req.query.error)}</div>` : "";
    res.renderPage({ title: p.name, area: "client", registry: require("../../core/pluginLoader").registry(ctx.db), content: `${err}<div class="card product-detail">${p.image_path?`<img class="product-hero-img" src="${h(ctx,p.image_path)}">`:""}<p class="eyebrow">Producto</p><h1>${h(ctx,p.name)}</h1><p>${h(ctx,p.description)}</p><div class="product-meta"><span>${cycleLabel(p)}</span><span>Stock disponible: ${available}</span><span>${p.currency} ${billing.money(p.price)}</span></div><p>Cuando pagues con crédito se generará una factura pagada, se activará el servicio y se revelará la siguiente información disponible del stock.</p>${buyButton(ctx, req, p, available)}</div>` });
  });
  return r;
}
module.exports = { config, router };
