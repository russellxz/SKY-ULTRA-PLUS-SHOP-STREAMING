"use strict";
const express = require("express");
const billing = require("../../core/billing");
const payments = require("../../core/payments");

const config = { key: "client_store", name: "Productos", icon: "ri-store-2-line", route: "/store", area: "client", category: "Tienda", order: 10 };
function h(ctx,v){return ctx.layout.escapeHtml(v||"");}
function stock(ctx,id){ const r = ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM product_inventory_items WHERE product_id=? AND status='available'").get(id); return r ? r.c : 0; }
function cycleLabel(p){ if(p.billing_type==='one_time') return 'Pago único'; if(Number(p.cycle_minutes)>0) return `Cada ${p.cycle_minutes} min`; if(Number(p.cycle_days)===7) return 'Semanal'; if(Number(p.cycle_days)===15) return 'Cada 15 días'; return 'Mensual'; }
function wallet(ctx,userId,currency){ return ctx.db.getWallet(userId,currency); }

function buyButton(ctx, req, p, available){
  if (available <= 0){
    return `<button class="sp-buy-btn" disabled><i class="ri-close-circle-line"></i> Sin stock</button>`;
  }
  const w = wallet(ctx, req.session.user.id, p.currency);
  const enough = Number(w.balance || 0) >= Number(p.price || 0);

  const acceptCredit = payments.productAcceptsProvider(p, "credit");
  const acceptPaypal = payments.productAcceptsProvider(p, "paypal");
  const acceptStripe = payments.productAcceptsProvider(p, "stripe");

  const ppApi = ctx.db.getSetting("paypal_api_enabled","0") === "1";
  const ppIpn = ctx.db.getSetting("paypal_ipn_enabled","0") === "1";
  const stEn  = ctx.db.getSetting("stripe_enabled","0") === "1" && !!ctx.db.getSetting("stripe_pk","") && !!ctx.db.getSetting("stripe_sk","");

  const out = [];

  // Crédito
  if (acceptCredit){
    if (enough){
      out.push(`<form method="POST" action="/store/product/${p.id}/buy-credit" class="sp-buy-form"><button class="sp-buy-btn credit"><i class="ri-wallet-3-line"></i> Comprar con crédito</button></form>`);
    } else {
      out.push(`<button class="sp-buy-btn" disabled title="Crédito insuficiente en ${h(ctx,p.currency)}"><i class="ri-wallet-3-line"></i> Crédito insuficiente</button>`);
    }
  }

  // PayPal API
  if (acceptPaypal){
    if (ppApi){
      out.push(`<form method="POST" action="/pay/paypal/buy" class="sp-buy-form"><input type="hidden" name="product_id" value="${p.id}"><button class="sp-buy-btn pp"><i class="ri-paypal-line"></i> Pagar con PayPal</button></form>`);
    } else {
      out.push(`<button type="button" class="sp-buy-btn pp" disabled title="Este método aún no está disponible. El administrador no ha configurado PayPal."><i class="ri-paypal-line"></i> PayPal — no disponible</button>`);
    }
    if (ppIpn){
      out.push(`<form method="POST" action="/pay/paypal/buy-ipn" class="sp-buy-form"><input type="hidden" name="product_id" value="${p.id}"><button class="sp-buy-btn pp-ipn"><i class="ri-paypal-line"></i> Pagar con PayPal (IPN)</button></form>`);
    }
  }

  // Stripe
  if (acceptStripe){
    if (stEn){
      out.push(`<a class="sp-buy-btn stripe" href="/pay/stripe/buy?product_id=${p.id}"><i class="ri-bank-card-line"></i> Pagar con Stripe</a>`);
    } else {
      out.push(`<button type="button" class="sp-buy-btn stripe" disabled title="Este método aún no está disponible. El administrador no ha configurado Stripe."><i class="ri-bank-card-line"></i> Stripe — no disponible</button>`);
    }
  }

  if (!out.length) return `<button class="sp-buy-btn" disabled>Sin métodos de pago configurados</button>`;
  return `<div class="sp-buy-methods">${out.join("")}</div>`;
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

    // Productos sin filtro (para los contadores de tabs)
    let allProducts = [];
    if (selected) {
      allProducts = ctx.db.sqlite.prepare("SELECT * FROM products WHERE active=1 AND category_id=? ORDER BY id DESC").all(selected.id);
      allProducts = allProducts.map(p=>({...p, available: stock(ctx,p.id)}));
    }
    const countAll = allProducts.length;
    const countIn = allProducts.filter(p=>p.available>0).length;
    const countOut = allProducts.filter(p=>p.available<=0).length;

    // Productos filtrados
    let products = allProducts;
    if (filter==="in") products = products.filter(p=>p.available>0);
    else if (filter==="out") products = products.filter(p=>p.available<=0);

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
      const s=params.toString();
      return "/store"+(s?"?"+s:"");
    };

    // Sidebar vertical de categorías
    let categoriesHtml = `<aside class="sp-cats">
      <div class="sp-cats-head"><i class="ri-folder-3-line"></i><b>Categorías</b></div>
      ${catList.map(c=>{
        const active = selected && Number(c.id)===Number(selected.id);
        return `<a class="sp-cat-item${active?' active':''}" href="${catUrl(c.id)}" title="${h(ctx,c.name)}">
          <span class="sp-cat-name">${h(ctx,c.name)}</span>
        </a>`;
      }).join("")}
    </aside>`;

    // Banner hero de la categoría
    const heroImg = selected && selected.image_path
      ? `<img src="${h(ctx,selected.image_path)}" alt="" class="sp-hero-bg">`
      : '';
    const heroIcon = selected && !selected.image_path
      ? `<div class="sp-hero-icon"><i class="${h(ctx,selected.icon||'ri-store-2-line')}"></i></div>`
      : '';
    const heroHtml = selected ? `
      <section class="sp-hero">
        ${heroImg}
        <div class="sp-hero-overlay"></div>
        <div class="sp-hero-content">
          ${heroIcon}
          <h1 class="display-title sp-hero-title"><span class="sp-deco">✦</span> ${h(ctx,selected.name)} <span class="sp-deco">✦</span></h1>
          <p class="sp-hero-desc">${h(ctx,selected.description||"Aquí puedes encontrar una variedad de planes con diferentes niveles de rendimiento y precios. Escoge el plan que mejor se adapte a tus necesidades.")}</p>
          <div class="sp-credits">
            <span class="sp-credit-pill"><span class="sp-credit-cur">Crédito MXN</span><b>$${billing.money(wMXN.balance)}</b></span>
            <span class="sp-credit-pill"><span class="sp-credit-cur">Crédito USD</span><b>$${billing.money(wUSD.balance)}</b></span>
          </div>
        </div>
      </section>` : '';

    // Tabs con contadores
    const tabsHtml = `
      <div class="sp-search-tabs">
        <form class="sp-search-row" method="GET" action="/store">
          ${selected?`<input type="hidden" name="cat" value="${selected.id}">`:""}
          ${filter&&filter!=="all"?`<input type="hidden" name="filter" value="${h(ctx,filter)}">`:""}
          <div class="sp-search"><i class="ri-search-line"></i><input name="q" value="${h(ctx,q)}" placeholder="Buscar productos..."></div>
        </form>
        <div class="sp-tabs">
          <a class="sp-tab${filter==="all"?" active":""}" href="${tabUrl("all")}"><i class="ri-apps-2-line"></i> All Products <span class="sp-tab-count">${countAll}</span></a>
          <a class="sp-tab${filter==="in"?" active":""}" href="${tabUrl("in")}"><i class="ri-checkbox-circle-line"></i> En stock <span class="sp-tab-count">${countIn}</span></a>
          <a class="sp-tab${filter==="out"?" active":""}" href="${tabUrl("out")}"><i class="ri-close-circle-line"></i> Out of Stock <span class="sp-tab-count">${countOut}</span></a>
        </div>
        <div class="sp-results-count"><i class="ri-shopping-bag-3-line"></i> ${products.length} ${products.length===1?'producto':'productos'}</div>
      </div>`;

    // Cards de productos (con bullets de descripción y ciclo)
    const productsHtml = products.length ? products.map(p=>{
      const w = wallet(ctx, req.session.user.id, p.currency);
      const enough = Number(w.balance || 0) >= Number(p.price || 0);
      const lines = String(p.description||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const bulletLines = lines.slice(0,4);
      const descRest = lines.slice(4).join(" ");
      const bullets = bulletLines.length ? `<ul class="sp-card-bullets">${bulletLines.map(l=>`<li><i class="ri-arrow-right-s-line"></i><span>${h(ctx,l)}</span></li>`).join("")}</ul>` : "";
      const descBlock = descRest ? `<p class="sp-card-desc">${h(ctx,descRest)}</p>` : "";
      const stockBadge = p.available > 0
        ? `<span class="sp-stock-badge ok"><i class="ri-checkbox-circle-line"></i> ${p.available} en stock</span>`
        : `<span class="sp-stock-badge out"><i class="ri-close-circle-line"></i> Agotado</span>`;
      return `<article class="sp-card">
        <div class="sp-card-img">
          ${p.image_path?`<img src="${h(ctx,p.image_path)}" alt="${h(ctx,p.name)}">`:`<div class="sp-card-img-fallback"><i class="ri-image-2-line"></i></div>`}
          ${stockBadge}
        </div>
        <div class="sp-card-body">
          <div class="sp-card-head">
            <h3 class="display-title"><i class="ri-vip-diamond-fill"></i> ${h(ctx,p.name)}</h3>
            <span class="sp-cycle-pill"><i class="ri-time-line"></i> ${cycleLabel(p)}</span>
          </div>
          ${bullets}
          ${descBlock}
          <div class="sp-card-foot">
            <div class="sp-card-price"><small>Precio</small><b>${h(ctx,p.currency)} $${billing.money(p.price)}</b></div>
            <a class="sp-details-link" href="/store/product/${p.id}"><i class="ri-information-line"></i></a>
          </div>
          ${p.available>0&&!enough?`<small class="sp-card-warn"><i class="ri-error-warning-line"></i> Crédito insuficiente en ${p.currency}</small>`:""}
          ${buyButton(ctx, req, p, p.available)}
        </div>
      </article>`;
    }).join("") : `<div class="sp-empty"><i class="ri-shopping-bag-line"></i><b>Sin productos</b><span>Esta categoría no tiene productos${filter!=="all"?" con ese filtro":""}.</span></div>`;

    const html = `<link rel="stylesheet" href="/public/css/store-modern.css?v=6">
    <style>
      .sp-buy-methods{display:flex;flex-direction:column;gap:8px;margin-top:8px}
      .sp-buy-methods .sp-buy-btn{width:100%;justify-content:center;display:inline-flex;align-items:center;gap:8px;text-decoration:none}
      .sp-buy-btn.pp{background:linear-gradient(135deg,#003087,#009cde);color:#fff;border:0}
      .sp-buy-btn.pp-ipn{background:linear-gradient(135deg,#0070ba,#005ea6);color:#fff;border:0}
      .sp-buy-btn.stripe{background:linear-gradient(135deg,#635bff,#3b82f6);color:#fff;border:0}
      .sp-buy-btn:not(.credit):not(.pp):not(.pp-ipn):not(.stripe):not([disabled]){background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff}
      .sp-buy-btn[disabled]{opacity:.55;cursor:not-allowed}
      .sp-buy-btn.pp:hover:not([disabled]),
      .sp-buy-btn.pp-ipn:hover:not([disabled]),
      .sp-buy-btn.stripe:hover:not([disabled]){filter:brightness(1.07)}
    </style>${err}<div class="sp-page">${heroHtml}${tabsHtml}<div class="sp-layout">${categoriesHtml}<main class="sp-products"><div class="sp-grid">${productsHtml}</div></main></div></div>`;

    res.renderPage({ title: selected?selected.name:"Productos", area: "client", registry: require("../../core/pluginLoader").registry(ctx.db), content: html });
  });

  r.get("/product/:id", (req, res) => {
    const p = ctx.db.sqlite.prepare("SELECT products.*, product_categories.name as cat_name, product_categories.id as cat_id FROM products INNER JOIN product_categories ON product_categories.id=products.category_id WHERE products.id=? AND products.active=1 AND product_categories.active=1").get(req.params.id);
    if (!p) return res.redirect("/store");
    const available = stock(ctx,p.id);
    const err = req.query.error ? `<div class="notice error">${h(ctx, req.query.error)}</div>` : "";
    const stockBadge = available > 0
      ? `<span class="sp-stock-badge ok"><i class="ri-checkbox-circle-line"></i> ${available} en stock</span>`
      : `<span class="sp-stock-badge out"><i class="ri-close-circle-line"></i> Agotado</span>`;
    const lines = String(p.description||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const bulletLines = lines.slice(0,4);
    const descRest = lines.slice(4).join(" ");
    const bullets = bulletLines.length ? `<ul class="sp-card-bullets">${bulletLines.map(l=>`<li><i class="ri-arrow-right-s-line"></i><span>${h(ctx,l)}</span></li>`).join("")}</ul>` : "";
    const descBlock = descRest ? `<p class="sp-detail-desc">${h(ctx,descRest)}</p>` : "";
    const wUSD = ctx.db.getWallet(req.session.user.id, "USD");
    const wMXN = ctx.db.getWallet(req.session.user.id, "MXN");
    res.renderPage({ title: p.name, area: "client", registry: require("../../core/pluginLoader").registry(ctx.db), content: `<link rel="stylesheet" href="/public/css/store-modern.css?v=6">
    <style>
      .sp-buy-methods{display:flex;flex-direction:column;gap:8px;margin-top:8px}
      .sp-buy-methods .sp-buy-btn{width:100%;justify-content:center;display:inline-flex;align-items:center;gap:8px;text-decoration:none}
      .sp-buy-btn.pp{background:linear-gradient(135deg,#003087,#009cde);color:#fff;border:0}
      .sp-buy-btn.pp-ipn{background:linear-gradient(135deg,#0070ba,#005ea6);color:#fff;border:0}
      .sp-buy-btn.stripe{background:linear-gradient(135deg,#635bff,#3b82f6);color:#fff;border:0}
      .sp-buy-btn[disabled]{opacity:.55;cursor:not-allowed}
    </style>${err}<div class="sp-detail-page"><a class="sp-back-link" href="/store?cat=${p.cat_id}"><i class="ri-arrow-left-line"></i> Volver a ${h(ctx,p.cat_name||'tienda')}</a><div class="sp-detail"><div class="sp-detail-image">${p.image_path?`<img src="${h(ctx,p.image_path)}" alt="${h(ctx,p.name)}">`:`<div class="sp-card-img-fallback"><i class="ri-image-2-line"></i></div>`}${stockBadge}</div><div class="sp-detail-info"><span class="sp-product-cat">${h(ctx,p.cat_name||'Producto')}</span><h1 class="display-title"><i class="ri-vip-diamond-fill"></i> ${h(ctx,p.name)}</h1><span class="sp-cycle-pill"><i class="ri-time-line"></i> ${cycleLabel(p)}</span>${bullets}${descBlock}<div class="sp-detail-price"><small>Precio</small><b>${p.currency} $${billing.money(p.price)}</b></div><div class="sp-credits"><span class="sp-credit-pill"><span class="sp-credit-cur">Crédito MXN</span><b>$${billing.money(wMXN.balance)}</b></span><span class="sp-credit-pill"><span class="sp-credit-cur">Crédito USD</span><b>$${billing.money(wUSD.balance)}</b></span></div><div class="sp-detail-info-box"><i class="ri-information-line"></i> Al pagar con crédito se genera una factura pagada, se activa el servicio y se revela la información del stock.</div>${buyButton(ctx, req, p, available)}</div></div></div>` });
  });
  return r;
}
module.exports = { config, router };
