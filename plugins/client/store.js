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
  if (!enough) return `<button class="sp-buy-btn" disabled><i class="ri-wallet-3-line"></i> Crédito insuficiente</button>`;
  return `<form method="POST" action="/store/product/${p.id}/buy-credit" class="sp-buy-form"><button class="sp-buy-btn"><i class="ri-shopping-cart-2-line"></i> Comprar con crédito</button></form>`;
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
    // Categorias con conteo
    const catList = cats.map(c=>{
      const cnt = ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM products WHERE active=1 AND category_id=?").get(c.id).c;
      return {...c, count: cnt};
    });

    // Categoria seleccionada (primero la del query, luego primera con productos, luego primera cualquiera)
    let selectedId = Number(req.query.cat || 0);
    let selected = catList.find(c=>Number(c.id)===selectedId);
    if (!selected) selected = catList.find(c=>c.count>0) || catList[0];

    // Filtro de stock: all, in, out
    const filter = String(req.query.filter||"all");

    // Productos de la categoria seleccionada
    let products = [];
    if (selected) {
      products = ctx.db.sqlite.prepare("SELECT * FROM products WHERE active=1 AND category_id=? ORDER BY id DESC").all(selected.id);
      products = products.map(p=>({...p, available: stock(ctx,p.id)}));
      if (filter==="in") products = products.filter(p=>p.available>0);
      else if (filter==="out") products = products.filter(p=>p.available<=0);
    }

    // Búsqueda
    const q = String(req.query.q||"").trim().toLowerCase();
    if (q) products = products.filter(p=>String(p.name||"").toLowerCase().includes(q)||String(p.description||"").toLowerCase().includes(q));

    // Wallets
    const wUSD = ctx.db.getWallet(req.session.user.id, "USD");
    const wMXN = ctx.db.getWallet(req.session.user.id, "MXN");

    const err = req.query.error?`<div class="notice error">${h(ctx,req.query.error)}</div>`:"";

    const tabUrl = (f)=>{
      const params=new URLSearchParams();
      if(selected)params.set("cat",selected.id);
      if(f&&f!=="all")params.set("filter",f);
      if(q)params.set("q",q);
      const s=params.toString();
      return "/store"+(s?"?"+s:"");
    };
    const catUrl = (id)=>{
      const params=new URLSearchParams();
      params.set("cat",id);
      if(filter&&filter!=="all")params.set("filter",filter);
      const s=params.toString();
      return "/store"+(s?"?"+s:"");
    };

    let categoriesHtml = `<aside class="sp-cats">
      <div class="sp-cats-head"><i class="ri-folder-3-line"></i><b>Categorías</b></div>
      ${catList.map(c=>{
        const active = selected && Number(c.id)===Number(selected.id);
        const ico = c.icon || 'ri-price-tag-3-line';
        return `<a class="sp-cat-item${active?' active':''}" href="${catUrl(c.id)}"><div class="sp-cat-item-ico">${c.image_path?`<img src="${h(ctx,c.image_path)}" alt="">`:`<i class="${h(ctx,ico)}"></i>`}</div><div class="sp-cat-item-text"><b>${h(ctx,c.name)}</b><small>${c.count} ${c.count===1?'producto':'productos'}</small></div></a>`;
      }).join("")}
    </aside>`;

    const headerImage = selected
      ? (selected.image_path
          ? `<img src="${h(ctx,selected.image_path)}" alt="">`
          : `<i class="${h(ctx,selected.icon||'ri-store-2-line')}"></i>`)
      : `<i class="ri-store-2-line"></i>`;

    const headHtml = `
    <div class="sp-head">
      <a href="/" class="sp-head-back"><i class="ri-arrow-left-line"></i><span>TIENDA</span></a>
      <div class="sp-head-main">
        <div class="sp-head-icon">${headerImage}</div>
        <div class="sp-head-text">
          <h1 class="display-title">${h(ctx,selected?selected.name:"Productos")}</h1>
          <p>${h(ctx,(selected&&selected.description)||"Productos digitales listos para comprar con crédito. Acceso rápido, entrega automática y stock visible.")}</p>
        </div>
      </div>
      <div class="sp-credits">
        <span class="sp-credit-pill"><span class="sp-credit-cur">Crédito</span><b>MXN $${billing.money(wMXN.balance)}</b></span>
        <span class="sp-credit-pill"><span class="sp-credit-cur">Crédito</span><b>USD $${billing.money(wUSD.balance)}</b></span>
      </div>
      <form class="sp-search-row" method="GET" action="/store">
        ${selected?`<input type="hidden" name="cat" value="${selected.id}">`:""}
        ${filter&&filter!=="all"?`<input type="hidden" name="filter" value="${h(ctx,filter)}">`:""}
        <div class="sp-search"><i class="ri-search-line"></i><input name="q" value="${h(ctx,q)}" placeholder="Buscar productos..."></div>
        <button class="sp-search-btn" type="submit" aria-label="Filtrar"><i class="ri-equalizer-line"></i></button>
      </form>
      <div class="sp-tabs">
        <a class="sp-tab${filter==="all"?" active":""}" href="${tabUrl("all")}">Todos</a>
        <a class="sp-tab${filter==="in"?" active":""}" href="${tabUrl("in")}">En stock</a>
        <a class="sp-tab${filter==="out"?" active":""}" href="${tabUrl("out")}">Agotado</a>
      </div>
    </div>`;

    const productsHtml = products.length ? products.map(p=>{
      const w = wallet(ctx, req.session.user.id, p.currency);
      const enough = Number(w.balance || 0) >= Number(p.price || 0);
      const stockBadge = p.available > 0
        ? `<span class="sp-card-pill stock-ok"><i class="ri-checkbox-circle-line"></i> Stock ${p.available}</span>`
        : `<span class="sp-card-pill stock-out"><i class="ri-close-circle-line"></i> Agotado</span>`;
      return `<article class="sp-card">
        <div class="sp-card-img">
          ${p.image_path?`<img src="${h(ctx,p.image_path)}" alt="${h(ctx,p.name)}">`:`<div class="sp-card-img-fallback"><i class="ri-image-2-line"></i></div>`}
        </div>
        <div class="sp-card-body">
          <h3 class="display-title">${h(ctx,p.name)}</h3>
          <p>${h(ctx,p.description)}</p>
          <div class="sp-card-pills">
            ${stockBadge}
            <span class="sp-card-pill price">${h(ctx,p.currency)} $${billing.money(p.price)}</span>
          </div>
          ${p.available>0&&!enough?`<small class="sp-card-warn"><i class="ri-error-warning-line"></i> Sin crédito ${p.currency}</small>`:""}
          ${buyButton(ctx, req, p, p.available)}
        </div>
      </article>`;
    }).join("") + `<article class="sp-card sp-card-soon"><div class="sp-card-soon-inner"><i class="ri-shopping-bag-3-line"></i><b>Más productos próximamente</b></div></article>` : `<div class="sp-empty"><i class="ri-shopping-bag-line"></i><b>Sin productos</b><span>Esta categoría no tiene productos disponibles${filter!=="all"?" con ese filtro":""}.</span></div>`;

    const html = `<link rel="stylesheet" href="/public/css/store-modern.css?v=3">${err}<div class="sp-page">${headHtml}<div class="sp-layout">${categoriesHtml}<main class="sp-products"><div class="sp-grid">${productsHtml}</div></main></div></div>`;

    res.renderPage({ title: selected?selected.name:"Productos", area: "client", registry: require("../../core/pluginLoader").registry(ctx.db), content: html });
  });

  r.get("/product/:id", (req, res) => {
    const p = ctx.db.sqlite.prepare("SELECT products.*, product_categories.name as cat_name, product_categories.id as cat_id FROM products INNER JOIN product_categories ON product_categories.id=products.category_id WHERE products.id=? AND products.active=1 AND product_categories.active=1").get(req.params.id);
    if (!p) return res.redirect("/store");
    const available = stock(ctx,p.id);
    const err = req.query.error ? `<div class="notice error">${h(ctx, req.query.error)}</div>` : "";
    const stockBadge = available > 0
      ? `<span class="sp-card-pill stock-ok"><i class="ri-checkbox-circle-line"></i> Stock ${available}</span>`
      : `<span class="sp-card-pill stock-out"><i class="ri-close-circle-line"></i> Agotado</span>`;
    const wUSD = ctx.db.getWallet(req.session.user.id, "USD");
    const wMXN = ctx.db.getWallet(req.session.user.id, "MXN");
    res.renderPage({ title: p.name, area: "client", registry: require("../../core/pluginLoader").registry(ctx.db), content: `<link rel="stylesheet" href="/public/css/store-modern.css?v=3">${err}<div class="sp-detail-page"><a class="sp-back-link" href="/store?cat=${p.cat_id}"><i class="ri-arrow-left-line"></i> Volver a ${h(ctx,p.cat_name||'tienda')}</a><div class="sp-detail"><div class="sp-detail-image">${p.image_path?`<img src="${h(ctx,p.image_path)}" alt="${h(ctx,p.name)}">`:`<div class="sp-card-img-fallback"><i class="ri-image-2-line"></i></div>`}</div><div class="sp-detail-info"><span class="sp-product-cat">${h(ctx,p.cat_name||'Producto')}</span><h1 class="display-title">${h(ctx,p.name)}</h1><p class="sp-detail-desc">${h(ctx,p.description)}</p><div class="sp-card-pills">${stockBadge}<span class="sp-card-pill cycle"><i class="ri-time-line"></i> ${cycleLabel(p)}</span></div><div class="sp-detail-price"><small>Precio</small><b>${p.currency} $${billing.money(p.price)}</b></div><div class="sp-credits"><span class="sp-credit-pill"><span class="sp-credit-cur">MXN</span><b>$${billing.money(wMXN.balance)}</b></span><span class="sp-credit-pill"><span class="sp-credit-cur">USD</span><b>$${billing.money(wUSD.balance)}</b></span></div><div class="sp-detail-info-box"><i class="ri-information-line"></i> Al pagar con crédito se genera una factura pagada, se activa el servicio y se revela la información del stock.</div>${buyButton(ctx, req, p, available)}</div></div></div>` });
  });
  return r;
}
module.exports = { config, router };
