"use strict";
const express=require("express");
const billing=require("../../core/billing");
const config={key:"client_invoices",name:"Mis facturas",icon:"ri-file-list-3-line",route:"/invoices",area:"client",category:"Facturación",order:30};
function h(ctx,v){return ctx.layout.escapeHtml(v||"")}
function reg(ctx){return require("../../core/pluginLoader").registry(ctx.db)}
function statusInfo(s){
  const map={paid:["paid","Pagada","ri-checkbox-circle-fill"],pending:["pending","Pendiente","ri-time-fill"],canceled:["canceled","Cancelada","ri-close-circle-fill"],suspended:["suspended","Suspendida","ri-error-warning-fill"]};
  return map[s]||["muted",s,"ri-information-fill"];
}
function fmtDate(ts){try{const d=new Date(ts);return d.toLocaleDateString("es",{day:"numeric",month:"numeric",year:"numeric"})+", "+d.toLocaleTimeString("es",{hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true});}catch{return String(ts||"—")}}
function fmtShort(ts){try{const d=new Date(ts);return d.toLocaleDateString("es",{day:"numeric",month:"numeric",year:"numeric"})+", "+d.toLocaleTimeString("es",{hour:"numeric",minute:"2-digit",hour12:true});}catch{return"—"}}

function productThumb(ctx,inv){
  const item=ctx.db.sqlite.prepare("SELECT it.*, p.image_path FROM invoice_items it LEFT JOIN products p ON p.id=it.reference_id WHERE it.invoice_id=? LIMIT 1").get(inv.id);
  if(item&&item.image_path)return `<img src="${h(ctx,item.image_path)}" alt="">`;
  return `<i class="ri-file-list-3-line"></i>`;
}

function printHtml(ctx,inv){
  const logo=ctx.db.getSetting("site_logo","");
  const site=ctx.db.getSetting("site_name","SKY ULTRA PLUS shop");
  const rows=inv.items.map(i=>`<tr><td>${h(ctx,i.name)}<small>${h(ctx,i.description)}</small></td><td>${i.quantity}</td><td>${inv.currency} ${billing.money(i.unit_price)}</td><td>${inv.currency} ${billing.money(i.total)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${h(ctx,inv.number)}</title><style>body{font-family:Arial;background:#f4f7fb;margin:0;padding:30px;color:#111827}.actions{max-width:900px;margin:auto;text-align:right;padding:0 0 16px}.invoice{max-width:900px;margin:auto;background:white;border-radius:24px;padding:34px;box-shadow:0 24px 70px rgba(15,23,42,.14)}.top{display:flex;justify-content:space-between;border-bottom:2px solid #eef2ff;padding-bottom:20px}.brand{display:flex;gap:14px;align-items:center}.brand img,.fake{width:72px;height:72px;border-radius:18px;object-fit:cover}.fake{display:grid;place-items:center;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:white;font-size:34px;font-weight:900}h1{margin:0;font-size:34px}.pill{display:inline-block;padding:8px 14px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:800}.pending{background:#fef3c7;color:#92400e}.canceled{background:#fee2e2;color:#991b1b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:24px 0}.box{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:18px}table{width:100%;border-collapse:collapse}th,td{padding:14px;border-bottom:1px solid #e5e7eb;text-align:left}th{background:#111827;color:white}small{display:block;color:#64748b;margin-top:4px}.total{text-align:right;font-size:28px;font-weight:900;margin-top:22px}@media print{.actions{display:none}body{background:white;padding:0}.invoice{box-shadow:none;border-radius:0}}</style></head><body><div class="actions"><button onclick="window.print()">Descargar / imprimir PDF</button></div><div class="invoice"><div class="top"><div class="brand">${logo?`<img src="${h(ctx,logo)}">`:`<div class="fake">S</div>`}<div><h2>${h(ctx,site)}</h2><p>Factura digital</p></div></div><div><h1>${h(ctx,inv.number)}</h1><span class="pill ${inv.status}">${h(ctx,inv.status).toUpperCase()}</span></div></div><div class="grid"><div class="box"><b>Cliente</b><p>${h(ctx,inv.first_name)} ${h(ctx,inv.last_name)}<br>${h(ctx,inv.email)}<br>${h(ctx,inv.phone||'')}</p></div><div class="box"><b>Fechas</b><p>Creada: ${new Date(inv.created_at).toLocaleString()}<br>Vence: ${inv.due_at?new Date(inv.due_at).toLocaleString():'—'}<br>Pagada: ${inv.paid_at?new Date(inv.paid_at).toLocaleString():'—'}</p></div></div><table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total: ${inv.currency} ${billing.money(inv.total)}</div></div></body></html>`
}

function detail(ctx,inv,msg=""){
  const st=statusInfo(inv.status);
  const phone=inv.whatsapp_number?(inv.whatsapp_country||'')+' '+inv.whatsapp_number:(inv.phone||'');
  const itemThumb=(item)=>{
    const prod=item.reference_id?ctx.db.sqlite.prepare("SELECT image_path FROM products WHERE id=?").get(item.reference_id):null;
    if(prod&&prod.image_path)return `<img src="${h(ctx,prod.image_path)}" alt="">`;
    return `<i class="ri-archive-2-line"></i>`;
  };
  const rows=inv.items.map(i=>`<tr>
    <td><div class="inv-item-prod"><div class="inv-item-thumb">${itemThumb(i)}</div><div class="inv-item-text"><b>${h(ctx,i.name)}</b>${i.description?`<small>${h(ctx,i.description)}</small>`:''}</div></div></td>
    <td class="inv-item-cell">${i.quantity}</td>
    <td class="inv-item-cell">${inv.currency} ${billing.money(i.unit_price)}</td>
    <td class="inv-item-cell">${inv.currency} ${billing.money(i.total)}</td>
  </tr>`).join("");
  const del=inv.allocations.map(a=>`<div class="inv-del-box"><div class="inv-del-head"><i class="ri-key-2-line"></i> <b>Información de entrega</b></div><textarea readonly>${h(ctx,a.delivered_content)}</textarea></div>`).join("");
  return `<link rel="stylesheet" href="/public/css/client-billing.css?v=1">${msg}
  <div class="inv-detail">
    <a class="inv-back" href="/invoices"><i class="ri-arrow-left-line"></i></a>
    <div class="inv-detail-card">
      <div class="inv-detail-head">
        <div class="inv-detail-head-left">
          <span class="inv-eyebrow"><i class="ri-file-list-3-line"></i> FACTURA</span>
          <h1 class="display-title">${h(ctx,inv.number)}</h1>
        </div>
        <div class="inv-detail-head-right">
          <small class="inv-detail-totallbl">Total a pagar</small>
          <b class="inv-detail-totalval">${h(ctx,inv.currency)} ${billing.money(inv.total)}</b>
          <span class="inv-status ${st[0]}"><i class="${st[2]}"></i> ${h(ctx,st[1])}</span>
        </div>
      </div>
      <div class="inv-user-row">
        <span><i class="ri-user-3-line"></i> ${h(ctx,(inv.first_name||'')+' '+(inv.last_name||''))}</span>
        <span><i class="ri-mail-line"></i> ${h(ctx,inv.email||'')}</span>
        ${phone?`<span><i class="ri-phone-line"></i> ${h(ctx,phone)}</span>`:''}
      </div>
      <div class="inv-actions">
        <a class="inv-btn primary" href="/invoices/${inv.id}/print" target="_blank"><i class="ri-eye-line"></i> Ver / descargar</a>
        ${inv.status==='pending'?`<form method="POST" action="/invoices/${inv.id}/pay-credit" style="margin:0"><button class="inv-btn primary"><i class="ri-bank-card-line"></i> Pagar con crédito</button></form>`:''}
      </div>
    </div>

    <div class="inv-table-card">
      <div class="inv-table-head"><i class="ri-archive-2-line"></i> <b>Detalle de la factura</b></div>
      <div class="inv-table-wrap">
        <table class="inv-table">
          <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="inv-total-row">
        <span>Total:</span>
        <b>${h(ctx,inv.currency)} ${billing.money(inv.total)}</b>
      </div>
    </div>

    ${del}
  </div>`
}

function router(ctx){
  const r=express.Router();

  r.post("/:id/pay-credit",(req,res)=>{
    const out=billing.payWithCredits(ctx.db,req.params.id,req.session.user.id);
    res.redirect(out.ok?`/invoices/${req.params.id}?paid=1`:`/invoices/${req.params.id}?error=${encodeURIComponent(out.error)}`);
  });

  r.get("/:id/print",(req,res)=>{
    const inv=billing.fullInvoice(ctx.db,req.params.id);
    if(!inv||Number(inv.user_id)!==Number(req.session.user.id))return res.status(404).send("Factura no encontrada");
    res.send(printHtml(ctx,inv));
  });

  r.get("/:id",(req,res)=>{
    const inv=billing.fullInvoice(ctx.db,req.params.id);
    if(!inv||Number(inv.user_id)!==Number(req.session.user.id))return res.redirect('/invoices');
    const msg=req.query.error?`<div class="notice error">${h(ctx,req.query.error)}</div>`:req.query.paid?`<div class="notice success">Factura pagada.</div>`:"";
    res.renderPage({title:inv.number,area:"client",registry:reg(ctx),content:detail(ctx,inv,msg)});
  });

  r.get("/",(req,res)=>{
    const invs=ctx.db.sqlite.prepare("SELECT * FROM invoices WHERE user_id=? ORDER BY id DESC").all(req.session.user.id);
    const enriched=invs.map(i=>{
      const it=ctx.db.sqlite.prepare("SELECT it.name, it.description, p.image_path FROM invoice_items it LEFT JOIN products p ON p.id=it.reference_id WHERE it.invoice_id=? LIMIT 1").get(i.id);
      return {...i, product_name: it?it.name:'', product_image: it?it.image_path:''};
    });
    const cards=enriched.map(i=>{
      const st=statusInfo(i.status);
      const typeLabel=i.type==='renewal'?'renewal':'product';
      const thumb=i.product_image?`<img src="${h(ctx,i.product_image)}" alt="">`:`<i class="ri-file-list-3-line"></i>`;
      return `<a class="inv-card" href="/invoices/${i.id}">
        <div class="inv-card-thumb">${thumb}<span class="inv-card-checkmark"><i class="ri-checkbox-circle-fill"></i></span></div>
        <div class="inv-card-body">
          <div class="inv-card-top">
            <b class="inv-card-number">${h(ctx,i.number)}</b>
            <span class="inv-status ${st[0]} small"><i class="${st[2]}"></i> ${h(ctx,i.status)}</span>
          </div>
          <div class="inv-card-mid">
            <span class="inv-card-product">${h(ctx,i.product_name||i.type||'Factura')}</span>
            <span class="inv-card-type">${h(ctx,typeLabel)}</span>
          </div>
          <div class="inv-card-bottom">
            <span class="inv-card-date"><i class="ri-time-line"></i> ${fmtDate(i.created_at)}</span>
            <span class="inv-card-amount">${h(ctx,i.currency)} ${billing.money(i.total)}</span>
          </div>
        </div>
        <span class="inv-card-cta"><i class="ri-arrow-right-s-line"></i></span>
      </a>`;
    }).join("");

    const empty=`<div class="inv-empty"><i class="ri-file-list-3-line"></i><b>Sin facturas</b><span>Aún no tienes facturas. Cuando compres un producto, aparecerá aquí.</span></div>`;

    res.renderPage({title:"Mis facturas",area:"client",registry:reg(ctx),content:`
      <link rel="stylesheet" href="/public/css/client-billing.css?v=1">
      <div class="inv-page">
        <header class="inv-page-head">
          <h1 class="display-title">Mis facturas</h1>
          <p>Consulta tus facturas, pagos y productos comprados.</p>
        </header>
        <div class="inv-list">${cards||empty}</div>
      </div>`});
  });

  return r;
}
module.exports={config,router,detail,printHtml};
