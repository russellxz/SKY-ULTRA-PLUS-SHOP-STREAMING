"use strict";
const express = require("express");
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

function router(ctx) {
  const r = express.Router();

  r.get("/", (req,res)=>{
    const uid=req.session.user.id;
    const wUSD=ctx.db.getWallet(uid,"USD");
    const wMXN=ctx.db.getWallet(uid,"MXN");

    // Movimientos: JOIN con wallets para obtener currency, LEFT JOIN con invoices/items/products para info del producto
    const txs=ctx.db.sqlite.prepare(`
      SELECT
        wt.*,
        w.currency,
        i.number AS invoice_number,
        (SELECT it.name FROM invoice_items it WHERE it.invoice_id=wt.invoice_id LIMIT 1) AS product_name,
        (SELECT p.image_path FROM invoice_items it LEFT JOIN products p ON p.id=it.reference_id WHERE it.invoice_id=wt.invoice_id LIMIT 1) AS product_image
      FROM wallet_transactions wt
      JOIN wallets w ON w.id=wt.wallet_id
      LEFT JOIN invoices i ON i.id=wt.invoice_id
      WHERE wt.user_id=?
      ORDER BY wt.id DESC
      LIMIT 50
    `).all(uid);

    // Stats por moneda
    const totalIn=(cur)=>txs.filter(t=>t.currency===cur&&Number(t.amount)>0).reduce((s,t)=>s+Number(t.amount),0);
    const totalOut=(cur)=>txs.filter(t=>t.currency===cur&&Number(t.amount)<0).reduce((s,t)=>s+Math.abs(Number(t.amount)),0);

    const txRows=txs.length?txs.map(t=>{
      const info=txTypeInfo(t.type);
      const amt=Number(t.amount);
      const sign=amt>=0?'+':'';
      const cls=amt>=0?'in':'out';

      // Concepto: si es pago de factura y hay producto, mostrar producto + factura
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

      return `<tr class="wlt-row ${cls}">
        <td>${conceptHtml}</td>
        <td><span class="wlt-cur ${(t.currency||'').toLowerCase()}">${h(ctx,t.currency||'—')}</span></td>
        <td class="wlt-amt ${cls}">${sign}${fmt(amt)}</td>
        <td class="wlt-bal">${fmt(t.balance_after)}</td>
        <td class="wlt-date">${fmtDate(t.created_at)}</td>
      </tr>`;
    }).join(""):`<tr><td colspan="5" class="wlt-empty-row">Aún no hay movimientos.</td></tr>`;

    res.renderPage({
      title:"Mis créditos",
      area:"client",
      registry:reg(ctx),
      content:`<link rel="stylesheet" href="/public/css/client-billing.css?v=3">
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
            <small>${txs.length} movimientos</small>
          </div>
          <div class="wlt-tx-wrap">
            <table class="wlt-tx-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Moneda</th>
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
