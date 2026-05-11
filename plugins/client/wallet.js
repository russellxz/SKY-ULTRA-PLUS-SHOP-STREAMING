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
    const txs=ctx.db.sqlite.prepare("SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 30").all(uid);

    // Stats per currency
    const totalIn=(cur)=>txs.filter(t=>t.currency===cur&&Number(t.amount)>0).reduce((s,t)=>s+Number(t.amount),0);
    const totalOut=(cur)=>txs.filter(t=>t.currency===cur&&Number(t.amount)<0).reduce((s,t)=>s+Math.abs(Number(t.amount)),0);

    const txRows=txs.length?txs.map(t=>{
      const info=txTypeInfo(t.type);
      const amt=Number(t.amount);
      const sign=amt>=0?'+':'';
      const cls=amt>=0?'in':'out';
      return `<tr class="wlt-row ${cls}">
        <td><div class="wlt-tx"><div class="wlt-tx-ico ${info[2]}"><i class="${info[1]}"></i></div><div class="wlt-tx-text"><b>${h(ctx,info[0])}</b><small>${t.note?h(ctx,t.note):h(ctx,t.type)}</small></div></div></td>
        <td class="wlt-cur">${h(ctx,t.currency)}</td>
        <td class="wlt-amt ${cls}">${sign}${fmt(amt)}</td>
        <td class="wlt-bal">${fmt(t.balance_after)}</td>
        <td class="wlt-date">${fmtDate(t.created_at)}</td>
      </tr>`;
    }).join(""):`<tr><td colspan="5" class="wlt-empty-row">Aún no hay movimientos.</td></tr>`;

    res.renderPage({
      title:"Mis créditos",
      area:"client",
      registry:reg(ctx),
      content:`<link rel="stylesheet" href="/public/css/client-billing.css?v=2">
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

        <div class="wlt-info-box">
          <i class="ri-information-line"></i>
          <div>
            <b>¿Cómo funcionan los créditos?</b>
            <span>Tu saldo en cada moneda se usa automáticamente al pagar facturas o comprar productos. Las recargas se realizan generando una factura de tipo recarga desde el panel admin o contactando al equipo de soporte.</span>
          </div>
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
