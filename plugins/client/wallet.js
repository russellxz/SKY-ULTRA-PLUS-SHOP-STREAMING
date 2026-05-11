"use strict";
const express = require("express");
const paymentsLib = require("../../core/payments");
const config = { key: "client_wallet", name: "Mis créditos", icon: "ri-wallet-3-line", route: "/wallet", area: "client", category: "Facturación", order: 20 };

function h(ctx,v){return ctx.layout.escapeHtml(v||"")}
function reg(ctx){return require("../../core/pluginLoader").registry(ctx.db)}
function fmt(n){return Number(n||0).toLocaleString("es",{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtDate(ts){if(!ts)return"—";try{const d=new Date(ts);return d.toLocaleDateString("es",{day:"numeric",month:"numeric",year:"numeric"})+", "+d.toLocaleTimeString("es",{hour:"numeric",minute:"2-digit",hour12:true});}catch{return"—"}}

function txTypeInfo(t){
  const map={
    invoice_payment:["Pago de factura","ri-shopping-cart-2-line","out"],
    credit_topup:["Recarga de crédito","ri-add-circle-line","in"],
    refund:["Reembolso","ri-refund-2-line","in"],
    adjustment:["Ajuste","ri-equalizer-line","mid"],
    admin_set_balance:["Ajuste de admin","ri-shield-keyhole-line","mid"],
    admin_adjustment:["Ajuste de admin","ri-shield-keyhole-line","mid"],
    bonus:["Bonificación","ri-gift-line","in"]
  };
  return map[t]||[String(t||"Movimiento"),"ri-exchange-line","mid"];
}

function methodBadge(ctx, provider){
  const label = paymentsLib.providerLabel(provider);
  const cls = paymentsLib.providerBadgeClass(provider);
  return `<span class="wlt-method ${cls}">${h(ctx,label)}</span>`;
}

function router(ctx) {
  const r = express.Router();

  r.get("/", (req,res)=>{
    const uid=req.session.user.id;
    const wUSD=ctx.db.getWallet(uid,"USD");
    const wMXN=ctx.db.getWallet(uid,"MXN");

    // Movimientos de wallet (créditos): JOIN con wallets + invoice + producto
    const wRows=ctx.db.sqlite.prepare(`
      SELECT
        wt.id, wt.amount, wt.balance_after, wt.created_at, wt.type, wt.note, wt.invoice_id,
        w.currency,
        i.number AS invoice_number,
        i.payment_method AS invoice_method,
        (SELECT it.name FROM invoice_items it WHERE it.invoice_id=wt.invoice_id LIMIT 1) AS product_name,
        (SELECT p.image_path FROM invoice_items it LEFT JOIN products p ON p.id=it.reference_id WHERE it.invoice_id=wt.invoice_id LIMIT 1) AS product_image
      FROM wallet_transactions wt
      JOIN wallets w ON w.id=wt.wallet_id
      LEFT JOIN invoices i ON i.id=wt.invoice_id
      WHERE wt.user_id=?
      ORDER BY wt.id DESC
      LIMIT 100
    `).all(uid);

    // Pagos externos (PayPal/Stripe) — los créditos ya van en wallet_transactions, los excluimos para no duplicar
    const eRows=ctx.db.sqlite.prepare(`
      SELECT
        py.id, py.amount, py.currency, py.created_at, py.provider, py.invoice_id,
        i.number AS invoice_number,
        i.payment_method AS invoice_method,
        (SELECT it.name FROM invoice_items it WHERE it.invoice_id=py.invoice_id LIMIT 1) AS product_name,
        (SELECT p.image_path FROM invoice_items it LEFT JOIN products p ON p.id=it.reference_id WHERE it.invoice_id=py.invoice_id LIMIT 1) AS product_image
      FROM payments py
      LEFT JOIN invoices i ON i.id=py.invoice_id
      WHERE py.user_id=? AND py.status='paid' AND py.provider != 'credits'
      ORDER BY py.id DESC
      LIMIT 100
    `).all(uid);

    // Unimos en una sola lista ordenada por fecha
    const wallet_items = wRows.map(t => ({
      kind: "wallet",
      id: t.id,
      created_at: t.created_at,
      amount: Number(t.amount),
      currency: t.currency,
      balance_after: t.balance_after,
      type: t.type,
      note: t.note,
      invoice_id: t.invoice_id,
      invoice_number: t.invoice_number,
      product_name: t.product_name,
      product_image: t.product_image,
      method: t.type === "invoice_payment" ? "credits" : null,
    }));
    const ext_items = eRows.map(p => ({
      kind: "external",
      id: "p" + p.id,
      created_at: p.created_at,
      amount: -Math.abs(Number(p.amount)),
      currency: p.currency,
      balance_after: null,
      type: "invoice_payment",
      note: "",
      invoice_id: p.invoice_id,
      invoice_number: p.invoice_number,
      product_name: p.product_name,
      product_image: p.product_image,
      method: p.provider,
    }));
    const items = wallet_items.concat(ext_items).sort((a,b) => {
      const da = new Date(a.created_at).getTime() || 0;
      const db_= new Date(b.created_at).getTime() || 0;
      return db_ - da;
    }).slice(0, 150);

    // Stats: solo movimientos de wallet
    const totalIn=(cur)=>wRows.filter(t=>t.currency===cur&&Number(t.amount)>0).reduce((s,t)=>s+Number(t.amount),0);
    const totalOut=(cur)=>wRows.filter(t=>t.currency===cur&&Number(t.amount)<0).reduce((s,t)=>s+Math.abs(Number(t.amount)),0);

    const txRows=items.length?items.map(t=>{
      const info=txTypeInfo(t.type);
      const amt=Number(t.amount);
      const sign=amt>=0?'+':'';
      const cls=amt>=0?'in':'out';

      let conceptHtml;
      if (t.type==='invoice_payment' && t.product_name) {
        const thumb = t.product_image
          ? `<img src="${h(ctx,t.product_image)}" alt="">`
          : `<div class="wlt-tx-thumb-fb"><i class="ri-archive-2-line"></i></div>`;
        conceptHtml = `<div class="wlt-tx">
          <div class="wlt-tx-thumb">${thumb}</div>
          <div class="wlt-tx-text">
            <b>${h(ctx,t.product_name)}</b>
            <small><i class="ri-file-list-3-line"></i> ${h(ctx,t.invoice_number||'Factura')}</small>
          </div>
        </div>`;
      } else {
        conceptHtml = `<div class="wlt-tx">
          <div class="wlt-tx-ico ${info[2]}"><i class="${info[1]}"></i></div>
          <div class="wlt-tx-text">
            <b>${h(ctx,info[0])}</b>
            <small>${t.note?h(ctx,t.note):h(ctx,t.type)}</small>
          </div>
        </div>`;
      }

      const methodHtml = t.method ? methodBadge(ctx, t.method) : `<span class="wlt-method muted">—</span>`;
      const balHtml = (t.balance_after == null) ? '—' : fmt(t.balance_after);

      return `<tr class="wlt-row ${cls}">
        <td>${conceptHtml}</td>
        <td><span class="wlt-cur ${(t.currency||'').toLowerCase()}">${h(ctx,t.currency||'—')}</span></td>
        <td>${methodHtml}</td>
        <td class="wlt-amt ${cls}">${sign}${fmt(amt)}</td>
        <td class="wlt-bal">${balHtml}</td>
        <td class="wlt-date">${fmtDate(t.created_at)}</td>
      </tr>`;
    }).join(""):`<tr><td colspan="6" class="wlt-empty-row">Aún no hay movimientos.</td></tr>`;
    const txCount = items.length;

    res.renderPage({
      title:"Mis créditos",
      area:"client",
      registry:reg(ctx),
      content:`<link rel="stylesheet" href="/public/css/client-billing.css?v=3">
      <style>
        .wlt-method{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
        .wlt-method.credit{background:rgba(124,58,237,.18);color:#c4b5fd;border:1px solid rgba(124,58,237,.4)}
        .wlt-method.pp{background:rgba(0,156,222,.16);color:#7dd3fc;border:1px solid rgba(0,156,222,.4)}
        .wlt-method.stripe{background:rgba(99,91,255,.18);color:#a5b4fc;border:1px solid rgba(99,91,255,.45)}
        .wlt-method.muted{background:rgba(255,255,255,.08);color:#9aa6bd;border:1px solid rgba(255,255,255,.14)}
      </style>
      <div class="wlt-page">
        <header class="inv-page-head">
          <h1 class="display-title">Mis créditos</h1>
          <p>Consulta tu saldo disponible en cada moneda y tus últimos movimientos.</p>
        </header>

        <div class="wlt-balances">
          <article class="wlt-card usd">
            <div class="wlt-card-bg"></div>
            <div class="wlt-card-top">
              <span class="wlt-card-cur">USD</span>
              <span class="wlt-card-flag">🇺🇸</span>
            </div>
            <div class="wlt-card-mid">
              <small>Saldo disponible</small>
              <b>$${fmt(wUSD.balance)}</b>
            </div>
            <div class="wlt-card-foot">
              <span class="wlt-stat in"><i class="ri-arrow-up-line"></i> Recargas $${fmt(totalIn("USD"))}</span>
              <span class="wlt-stat out"><i class="ri-arrow-down-line"></i> Gastos $${fmt(totalOut("USD"))}</span>
            </div>
          </article>

          <article class="wlt-card mxn">
            <div class="wlt-card-bg"></div>
            <div class="wlt-card-top">
              <span class="wlt-card-cur">MXN</span>
              <span class="wlt-card-flag">🇲🇽</span>
            </div>
            <div class="wlt-card-mid">
              <small>Saldo disponible</small>
              <b>$${fmt(wMXN.balance)}</b>
            </div>
            <div class="wlt-card-foot">
              <span class="wlt-stat in"><i class="ri-arrow-up-line"></i> Recargas $${fmt(totalIn("MXN"))}</span>
              <span class="wlt-stat out"><i class="ri-arrow-down-line"></i> Gastos $${fmt(totalOut("MXN"))}</span>
            </div>
          </article>
        </div>

        <div class="wlt-tx-card">
          <div class="wlt-tx-head">
            <div><i class="ri-exchange-funds-line"></i> <b>Movimientos recientes</b></div>
            <small>${txCount} movimientos</small>
          </div>
          <div class="wlt-tx-wrap">
            <table class="wlt-tx-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Moneda</th>
                  <th>Método</th>
                  <th>Cambio</th>
                  <th>Saldo</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>${txRows}</tbody>
            </table>
          </div>
        </div>
      </div>`
    });
  });

  return r;
}
module.exports = { config, router };
