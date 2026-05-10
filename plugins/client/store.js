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
  if (available <= 0) return `<button class="sp-buy-btn" disabled><i class="ri-close-circle-line"></i> Sin stock</button>`;
  if (!enough) return `<button class="sp-buy-btn" disabled><i class="ri-wallet-3-line"></i> Crédito insuficiente</button><small class="sp-credit-note">Tu crédito ${p.currency} ${billing.money(w.balance)}</small>`;
  return `<form method="POST" action="/store/product/${p.id}/buy-credit" class="sp-buy-form"><button class="sp-buy-btn"><i class="ri-shopping-cart-2-line"></i> Comprar ahora</button></form><small class="sp-credit-note">Tu crédito ${p.currency} ${billing.money(w.balance)}</small>`;
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
    let html = `<link rel="stylesheet" href="/public/css/store-modern.css?v=1"><div class="sp-page-head"><span class="sp-eyebrow"><i class="ri-store-2-line"></i> Tienda</span><h1 class="display-title">Productos digitales</h1><p>Compra con tus créditos disponibles. Al pagar se crea factura, se activa el servicio y se revela la información del producto.</p></div>`;
    if (req.query.error) html += `<div class="notice error">${h(ctx, req.query.error)}</div>`;
    if (!products.length) html += `<div class="sp-empty"><i class="ri-shopping-bag-line"></i><b>Sin productos</b><span>Todavía no hay productos disponibles.</span></div>`;
    for (const c of cats) {
      const list = products.filter(p => Number(p.category_id) === Number(c.id));
      if (!list.length) continue;
      html += `<section class="sp-cat-section" id="cat-${c.id}"><header class="sp-cat-head">${c.image_path?`<div class="sp-cat-img"><img src="${h(ctx,c.image_path)}" alt=""></div>`:`<div class="sp-cat-icon"><i class="${h(ctx,c.icon||'ri-price-tag-3-line')}"></i></div>`}<div class="sp-cat-info"><h2>${h(ctx,c.name)}</h2><span>${list.length} ${list.length===1?'producto':'productos'}</span></div></header><div class="sp-product-grid">`;
      for (const p of list) {
        const available = stock(ctx,p.id);
        const stockBadge = available > 0
          ? `<span class="sp-stock-badge ok"><i class="ri-checkbox-circle-line"></i> ${available} en stock</span>`
          : `<span class="sp-stock-badge out"><i class="ri-close-circle-line"></i> Sin stock</span>`;
        html += `<article class="sp-product">
          <div class="sp-product-image">
            ${p.image_path?`<img src="${h(ctx,p.image_path)}" alt="${h(ctx,p.name)}">`:`<div class="sp-product-image-fallback"><i class="ri-image-2-line"></i></div>`}
            ${stockBadge}
          </div>
          <div class="sp-product-body">
            <span class="sp-product-cat">${h(ctx,c.name)}</span>
            <h3 class="display-title">${h(ctx,p.name)}</h3>
            <p>${h(ctx,p.description)}</p>
            <div class="sp-product-meta">
              <span class="sp-meta-pill"><i class="ri-time-line"></i> ${cycleLabel(p)}</span>
            </div>
            <div class="sp-product-foot">
              <div class="sp-product-price"><small>Precio</small><b>${p.currency} ${billing.money(p.price)}</b></div>
              <a class="sp-details-link" href="/store/product/${p.id}"><i class="ri-information-line"></i> Detalles</a>
            </div>
            ${buyButton(ctx, req, p, available)}
          </div>
        </article>`;
      }
      html += `</div></section>`;
    }
    res.renderPage({ title: "Productos", area: "client", registry: require("../../core/pluginLoader").registry(ctx.db), content: html });
  });

  r.get("/product/:id", (req, res) => {
    const p = ctx.db.sqlite.prepare("SELECT products.*, product_categories.name as cat_name FROM products INNER JOIN product_categories ON product_categories.id=products.category_id WHERE products.id=? AND products.active=1 AND product_categories.active=1").get(req.params.id);
    if (!p) return res.redirect("/store");
    const available = stock(ctx,p.id);
    const err = req.query.error ? `<div class="notice error">${h(ctx, req.query.error)}</div>` : "";
    const stockBadge = available > 0
      ? `<span class="sp-stock-badge ok"><i class="ri-checkbox-circle-line"></i> ${available} en stock</span>`
      : `<span class="sp-stock-badge out"><i class="ri-close-circle-line"></i> Sin stock</span>`;
    res.renderPage({ title: p.name, area: "client", registry: require("../../core/pluginLoader").registry(ctx.db), content: `<link rel="stylesheet" href="/public/css/store-modern.css?v=1">${err}<div class="sp-detail"><div class="sp-detail-image">${p.image_path?`<img src="${h(ctx,p.image_path)}" alt="${h(ctx,p.name)}">`:`<div class="sp-product-image-fallback"><i class="ri-image-2-line"></i></div>`}${stockBadge}</div><div class="sp-detail-info"><a class="sp-back-link" href="/store"><i class="ri-arrow-left-line"></i> Volver a la tienda</a><span class="sp-product-cat">${h(ctx,p.cat_name||'Producto')}</span><h1 class="display-title">${h(ctx,p.name)}</h1><p class="sp-detail-desc">${h(ctx,p.description)}</p><div class="sp-product-meta"><span class="sp-meta-pill"><i class="ri-time-line"></i> ${cycleLabel(p)}</span></div><div class="sp-detail-price"><small>Precio</small><b>${p.currency} ${billing.money(p.price)}</b></div><div class="sp-detail-info-box"><i class="ri-information-line"></i> Al pagar con crédito se genera una factura pagada, se activa el servicio y se revela la información del stock.</div>${buyButton(ctx, req, p, available)}</div></div>` });
  });
  return r;
}
module.exports = { config, router };
