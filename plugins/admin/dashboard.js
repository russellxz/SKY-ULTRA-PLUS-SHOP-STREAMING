"use strict";
const express = require("express");
const config = { key: "admin_dashboard", name: "Resumen", icon: "ri-dashboard-2-line", route: "/admin", area: "admin", category: "Resumen", permission: "admin", order: 1 };

function reg(ctx){return require("../../core/pluginLoader").registry(ctx.db);}
function fmtMoney(n){return Number(n||0).toLocaleString("es",{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtCount(n){return Number(n||0).toLocaleString("es");}
function safeCount(db,sql,params=[]){try{return db.prepare(sql).get(...params).c;}catch(e){return 0;}}
function safeSum(db,sql,col="s",params=[]){try{const r=db.prepare(sql).get(...params);return Number(r[col]||0);}catch(e){return 0;}}

// Serie diaria de los ultimos N dias para una tabla con timestamp
function dailySeries(db, table, col, where, days){
  let rows = [];
  try{
    const w = where ? " AND "+where : "";
    rows = db.prepare(`SELECT date(${col}) day, COUNT(*) c FROM ${table} WHERE ${col} >= date('now', '-${days-1} days')${w} GROUP BY date(${col}) ORDER BY day`).all();
  }catch(e){rows=[];}
  const map = Object.fromEntries(rows.map(r=>[r.day,r.c]));
  const result = [];
  const now = new Date();
  for(let i=days-1; i>=0; i--){
    const d = new Date(now);
    d.setDate(now.getDate()-i);
    const key = d.toISOString().slice(0,10);
    result.push({day:key, c:map[key]||0});
  }
  return result;
}
function shortDay(iso){
  const d = new Date(iso+"T00:00:00");
  return d.toLocaleDateString("es",{day:"2-digit",month:"short"});
}

function router(ctx){
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);

  r.get("/", (req,res)=>{
    const db = ctx.db.sqlite;

    // Rango configurable por query string
    const requested = parseInt(req.query.range||"30",10);
    const allowed = [7,15,30,60,90];
    const days = allowed.includes(requested) ? requested : 30;
    const miniDays = Math.min(days, 30);

    // ===== KPIs principales =====
    const totalUsers   = safeCount(db,"SELECT COUNT(*) c FROM users");
    const totalProducts= safeCount(db,"SELECT COUNT(*) c FROM products");
    const totalInvoices= safeCount(db,"SELECT COUNT(*) c FROM invoices");
    const totalServices= safeCount(db,"SELECT COUNT(*) c FROM services");
    const totalSales   = safeSum  (db,"SELECT COALESCE(SUM(total),0) s FROM invoices WHERE status='paid'");
    const ticketsNew   = safeCount(db,"SELECT COUNT(*) c FROM tickets WHERE status='open'");

    // ===== Resumen facturas =====
    const inv = {
      paid:      safeCount(db,"SELECT COUNT(*) c FROM invoices WHERE status='paid'"),
      pending:   safeCount(db,"SELECT COUNT(*) c FROM invoices WHERE status='pending'"),
      suspended: safeCount(db,"SELECT COUNT(*) c FROM invoices WHERE status='suspended'"),
      canceled:  safeCount(db,"SELECT COUNT(*) c FROM invoices WHERE status='canceled'"),
    };

    // ===== Resumen servicios =====
    const svc = {
      active:    safeCount(db,"SELECT COUNT(*) c FROM services WHERE status='active'"),
      pending:   safeCount(db,"SELECT COUNT(*) c FROM services WHERE status='pending'"),
      suspended: safeCount(db,"SELECT COUNT(*) c FROM services WHERE status='suspended'"),
      canceled:  safeCount(db,"SELECT COUNT(*) c FROM services WHERE status='canceled'"),
    };
    const svcTotal = svc.active+svc.pending+svc.suspended+svc.canceled;

    // ===== Inventario productos =====
    const productsActive   = safeCount(db,"SELECT COUNT(*) c FROM products WHERE active=1");
    const productsInactive = safeCount(db,"SELECT COUNT(*) c FROM products WHERE active=0");
    const productsWithStock= safeCount(db,"SELECT COUNT(DISTINCT product_id) c FROM product_inventory_items WHERE status='available'");
    const productsOutStock = Math.max(0, productsActive - productsWithStock);
    const stockTotal       = safeCount(db,"SELECT COUNT(*) c FROM product_inventory_items");
    const stockAvailable   = safeCount(db,"SELECT COUNT(*) c FROM product_inventory_items WHERE status='available'");
    const stockPct         = stockTotal>0 ? Math.round(stockAvailable/stockTotal*100) : 0;

    // ===== Series de tiempo (rango dinamico) =====
    const usersSeries    = dailySeries(ctx.db,"users","created_at","",days);
    const invoicesSeries = dailySeries(ctx.db,"invoices","created_at","status='paid'",days);
    const servicesSeries = dailySeries(ctx.db,"services","created_at","status='active'",days);
    const suspSeries     = dailySeries(ctx.db,"services","created_at","status IN ('suspended','canceled')",days);
    const ticketsSeries  = dailySeries(ctx.db,"tickets","created_at","",days);
    const labelsRange    = usersSeries.map(d=>shortDay(d.day));

    // ===== Stats abajo =====
    const ticketsResolved = safeCount(db,"SELECT COUNT(*) c FROM tickets WHERE status='closed'");
    const monthSales = safeSum(db,"SELECT COALESCE(SUM(total),0) s FROM invoices WHERE status='paid' AND date(COALESCE(paid_at,created_at)) >= date('now','start of month')");
    const ticketsResolvedSeries = dailySeries(ctx.db,"tickets","created_at","status='closed'",miniDays);
    const productsActiveSeries  = dailySeries(ctx.db,"products","created_at","active=1",miniDays);
    const servicesActiveSeries  = dailySeries(ctx.db,"services","created_at","status='active'",miniDays);
    const monthSalesSeries      = dailySeries(ctx.db,"invoices","COALESCE(paid_at,created_at)","status='paid'",miniDays);

    // Range label
    const now = new Date();
    const ago = new Date(now); ago.setDate(now.getDate()-(days-1));
    const rangeLabel = "Últimos "+days+" días";
    const rangeDates = ago.toLocaleDateString("es",{day:"2-digit",month:"short"})+" — "+now.toLocaleDateString("es",{day:"2-digit",month:"short",year:"numeric"});

    const rangeOptions = [
      {d:7,  label:"Últimos 7 días"},
      {d:15, label:"Últimos 15 días"},
      {d:30, label:"Últimos 30 días"},
      {d:60, label:"Últimos 60 días"},
      {d:90, label:"Últimos 90 días"},
    ];

    // Datos como JSON serializable para el script
    const chartData = {
      labels: labelsRange,
      users: usersSeries.map(x=>x.c),
      invoices: invoicesSeries.map(x=>x.c),
      services: servicesSeries.map(x=>x.c),
      suspended: suspSeries.map(x=>x.c),
      tickets: ticketsSeries.map(x=>x.c),
      donutInvoices:[inv.paid,inv.pending,inv.suspended,inv.canceled],
      donutInventory:[productsWithStock,productsOutStock,productsInactive],
      donutServices:[svc.active,svc.pending,svc.suspended,svc.canceled],
      stockPct,
      stockAvailable,
      stockTotal,
      mini:{
        ticketsResolved: ticketsResolvedSeries.map(x=>x.c),
        productsActive:  productsActiveSeries.map(x=>x.c),
        servicesActive:  servicesActiveSeries.map(x=>x.c),
        monthSales:      monthSalesSeries.map(x=>x.c),
      }
    };

    res.renderPage({
      title:"Resumen",
      area:"admin",
      registry:reg(ctx),
      content:`
<link rel="stylesheet" href="/public/css/admin-dashboard-design.css?v=1">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<div class="dash">
  <div class="dash-head">
    <div>
      <h1>Resumen</h1>
      <p>Vista general de la plataforma</p>
    </div>
    <div class="dash-date-range" id="dashRange">
      <i class="ri-calendar-line"></i>
      <span>${rangeLabel}</span>
      <i class="ri-arrow-down-s-line caret"></i>
      <div class="dash-date-menu">
        ${rangeOptions.map(o=>`<a href="/admin?range=${o.d}" class="${o.d===days?'active':''}">${o.label}<small>${o.d===days?rangeDates:o.d+'d'}</small></a>`).join("")}
      </div>
    </div>
  </div>

  <div class="dash-stats-top">
    <div class="dash-stat blue"><div class="dash-stat-icon"><i class="ri-user-3-line"></i></div><div class="dash-stat-text"><span>Total usuarios</span><b>${fmtCount(totalUsers)}</b></div></div>
    <div class="dash-stat purple"><div class="dash-stat-icon"><i class="ri-shopping-bag-3-line"></i></div><div class="dash-stat-text"><span>Productos</span><b>${fmtCount(totalProducts)}</b></div></div>
    <div class="dash-stat green"><div class="dash-stat-icon"><i class="ri-file-list-3-line"></i></div><div class="dash-stat-text"><span>Facturas</span><b>${fmtCount(totalInvoices)}</b></div></div>
    <div class="dash-stat orange"><div class="dash-stat-icon"><i class="ri-archive-stack-line"></i></div><div class="dash-stat-text"><span>Servicios</span><b>${fmtCount(totalServices)}</b></div></div>
    <div class="dash-stat pink"><div class="dash-stat-icon"><i class="ri-money-dollar-circle-line"></i></div><div class="dash-stat-text"><span>Total ventas</span><b>${fmtMoney(totalSales)}</b></div></div>
    <div class="dash-stat red"><div class="dash-stat-icon"><i class="ri-customer-service-2-line"></i></div><div class="dash-stat-text"><span>Tickets nuevos</span><b>${fmtCount(ticketsNew)}</b></div></div>
  </div>

  <div class="dash-mid">
    <div class="dash-card">
      <div class="dash-card-head"><h3>Resumen de facturas</h3></div>
      <p class="dash-card-sub">Estado actual de las facturas</p>
      <div class="dash-donut-wrap">
        <canvas id="invoicesDonut"></canvas>
        <div class="dash-donut-center"><b>${fmtCount(totalInvoices)}</b><small>Facturas</small></div>
      </div>
      <ul class="dash-legend">
        <li><span class="dot" style="color:#22c55e;background:#22c55e"></span>Pagadas <b>${inv.paid}</b></li>
        <li><span class="dot" style="color:#f59e0b;background:#f59e0b"></span>Pendientes <b>${inv.pending}</b></li>
        <li><span class="dot" style="color:#f43f5e;background:#f43f5e"></span>Suspendidas <b>${inv.suspended}</b></li>
        <li><span class="dot" style="color:#94a3b8;background:#94a3b8"></span>Canceladas <b>${inv.canceled}</b></li>
      </ul>
      <a class="dash-card-cta" href="/admin/invoices">Ver facturas <i class="ri-arrow-right-line"></i></a>
    </div>

    <div class="dash-card">
      <div class="dash-card-head"><h3>Inventario de productos</h3></div>
      <p class="dash-card-sub">Estado del inventario</p>
      <div class="dash-donut-wrap">
        <canvas id="inventoryDonut"></canvas>
        <div class="dash-donut-center"><b>${fmtCount(totalProducts)}</b><small>Productos</small></div>
      </div>
      <ul class="dash-legend">
        <li><span class="dot" style="color:#22c55e;background:#22c55e"></span>Con stock <b>${productsWithStock}</b></li>
        <li><span class="dot" style="color:#f59e0b;background:#f59e0b"></span>Agotados <b>${productsOutStock}</b></li>
        <li><span class="dot" style="color:#94a3b8;background:#94a3b8"></span>Inactivos <b>${productsInactive}</b></li>
      </ul>
      <a class="dash-card-cta" href="/admin/products">Ver inventario <i class="ri-arrow-right-line"></i></a>
    </div>

    <div class="dash-card">
      <div class="dash-card-head"><h3>Stock disponible</h3></div>
      <p class="dash-card-sub">Items disponibles vs total</p>
      <div class="dash-donut-wrap">
        <canvas id="stockGauge"></canvas>
        <div class="dash-donut-center"><b>${fmtCount(stockAvailable)}</b><small class="pct">${stockPct}%</small></div>
      </div>
      <p style="margin:0;color:rgba(233,242,255,.55);font-size:12px;text-align:center;font-weight:700">${stockPct}% del total disponible</p>
      <a class="dash-card-cta" href="/admin/products">Ver inventario <i class="ri-arrow-right-line"></i></a>
    </div>
  </div>

  <div class="dash-row-2">
    <div class="dash-card">
      <div class="dash-card-head"><h3>Usuarios nuevos</h3><span class="dash-card-tag"><i class="ri-line-chart-line"></i> ${rangeLabel}</span></div>
      <p class="dash-card-sub">Nuevos usuarios registrados por día</p>
      <div class="dash-chart-wrap"><canvas id="usersLine"></canvas></div>
      <a class="dash-card-cta" href="/admin/users">Ver usuarios <i class="ri-arrow-right-line"></i></a>
    </div>
    <div class="dash-card">
      <div class="dash-card-head"><h3>Servicios</h3></div>
      <p class="dash-card-sub">Estado de los servicios</p>
      <div class="dash-donut-wrap">
        <canvas id="servicesDonut"></canvas>
        <div class="dash-donut-center"><b>${fmtCount(svcTotal)}</b><small>Total</small></div>
      </div>
      <ul class="dash-legend">
        <li><span class="dot" style="color:#22c55e;background:#22c55e"></span>Activos <b>${svc.active}</b></li>
        <li><span class="dot" style="color:#f59e0b;background:#f59e0b"></span>Pendientes <b>${svc.pending}</b></li>
        <li><span class="dot" style="color:#f43f5e;background:#f43f5e"></span>Suspendidos <b>${svc.suspended}</b></li>
        <li><span class="dot" style="color:#94a3b8;background:#94a3b8"></span>Cancelados <b>${svc.canceled}</b></li>
      </ul>
      <a class="dash-card-cta" href="/admin/services">Ver servicios <i class="ri-arrow-right-line"></i></a>
    </div>
  </div>

  <div class="dash-card big">
    <div class="dash-card-head"><h3>Resumen general</h3><span class="dash-card-tag"><i class="ri-line-chart-line"></i> ${rangeLabel}</span></div>
    <p class="dash-card-sub">Comparativa general de métricas</p>
    <div class="dash-chart-wrap"><canvas id="generalLine"></canvas></div>
  </div>

  <div class="dash-stats-bottom">
    <div class="dash-mini green">
      <div class="dash-mini-head"><div class="dash-mini-icon"><i class="ri-checkbox-circle-line"></i></div><div class="dash-mini-text"><span>Tickets resueltos</span><b>${fmtCount(ticketsResolved)}</b></div></div>
      <canvas id="miniTickets"></canvas>
    </div>
    <div class="dash-mini purple">
      <div class="dash-mini-head"><div class="dash-mini-icon"><i class="ri-shopping-bag-3-line"></i></div><div class="dash-mini-text"><span>Productos activos</span><b>${fmtCount(productsActive)}</b></div></div>
      <canvas id="miniProducts"></canvas>
    </div>
    <div class="dash-mini orange">
      <div class="dash-mini-head"><div class="dash-mini-icon"><i class="ri-archive-stack-line"></i></div><div class="dash-mini-text"><span>Servicios activos</span><b>${fmtCount(svc.active)}</b></div></div>
      <canvas id="miniServices"></canvas>
    </div>
    <div class="dash-mini pink">
      <div class="dash-mini-head"><div class="dash-mini-icon"><i class="ri-line-chart-line"></i></div><div class="dash-mini-text"><span>Ingresos del mes</span><b>${fmtMoney(monthSales)}</b></div></div>
      <canvas id="miniSales"></canvas>
    </div>
  </div>
</div>

<script id="dashData" type="application/json">${JSON.stringify(chartData)}</script>
<script>
(function(){
  if(typeof Chart==='undefined')return;
  var data = JSON.parse(document.getElementById('dashData').textContent);
  function isLight(){return document.body.classList.contains('light');}
  function colors(){return{
    text: isLight()?'#0f172a':'#e5e7eb',
    sub: isLight()?'rgba(15,23,42,.6)':'rgba(229,231,235,.6)',
    grid: isLight()?'rgba(15,23,42,.06)':'rgba(255,255,255,.06)',
    border: isLight()?'rgba(15,23,42,.08)':'rgba(255,255,255,.08)',
    tooltipBg: isLight()?'#ffffff':'#0d1230',
  };}
  var instances = [];
  function makeChart(el,cfg){
    if(!el)return null;
    var c = new Chart(el,cfg);
    instances.push({chart:c,cfg:cfg});
    return c;
  }
  function applyTheme(){
    var col = colors();
    Chart.defaults.color = col.text;
    Chart.defaults.borderColor = col.grid;
    instances.forEach(function(it){
      var ch = it.chart;
      if(ch.options.scales){
        Object.values(ch.options.scales).forEach(function(s){
          if(s.grid)s.grid.color = col.grid;
          if(s.ticks)s.ticks.color = col.sub;
          if(s.border)s.border.color = col.border;
        });
      }
      if(ch.options.plugins&&ch.options.plugins.tooltip){
        ch.options.plugins.tooltip.backgroundColor = col.tooltipBg;
        ch.options.plugins.tooltip.titleColor = col.text;
        ch.options.plugins.tooltip.bodyColor = col.text;
        ch.options.plugins.tooltip.borderColor = col.border;
      }
      ch.update('none');
    });
  }
  function gradient(ctx,h,c1,c2){
    var g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,c1);g.addColorStop(1,c2);
    return g;
  }
  function lineDataset(label,data,color,c2){
    return {
      label: label,
      data: data,
      borderColor: color,
      backgroundColor: function(ctx){var ch=ctx.chart;var area=ch.chartArea;if(!area)return color;return gradient(ch.ctx,area.bottom,c2||color+'33','transparent');},
      borderWidth: 2.4,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: color,
      pointHoverBorderWidth: 2,
      fill: true
    };
  }
  var commonScales = {
    x:{grid:{display:false,drawBorder:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8,font:{size:11}}},
    y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.06)',drawBorder:false},ticks:{precision:0,font:{size:11}}}
  };
  var commonPlugins = {
    legend:{display:false},
    tooltip:{
      enabled:true,
      mode:'index',
      intersect:false,
      padding:10,
      cornerRadius:10,
      borderWidth:1,
      displayColors:true,
      titleFont:{weight:'bold',size:12},
      bodyFont:{size:12}
    }
  };

  // Donuts
  function donut(id,labels,data,colors,cutout){
    var el=document.getElementById(id);if(!el)return;
    return makeChart(el,{
      type:'doughnut',
      data:{labels:labels,datasets:[{data:data,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},
      options:{cutout:(cutout||'72%'),plugins:{legend:{display:false},tooltip:commonPlugins.tooltip},maintainAspectRatio:false}
    });
  }
  donut('invoicesDonut',['Pagadas','Pendientes','Suspendidas','Canceladas'],data.donutInvoices,['#22c55e','#f59e0b','#f43f5e','#94a3b8']);
  donut('inventoryDonut',['Con stock','Agotados','Inactivos'],data.donutInventory,['#22c55e','#f59e0b','#94a3b8']);
  donut('servicesDonut',['Activos','Pendientes','Suspendidos','Cancelados'],data.donutServices,['#22c55e','#f59e0b','#f43f5e','#94a3b8']);

  // Stock gauge (semi-donut)
  (function(){
    var el=document.getElementById('stockGauge');if(!el)return;
    var pct = data.stockPct, rest = 100-pct;
    makeChart(el,{
      type:'doughnut',
      data:{labels:['Disponible','Sin stock'],datasets:[{data:[pct,rest],backgroundColor:[function(c){var ch=c.chart;var a=ch.chartArea;if(!a)return '#22c55e';return gradient(ch.ctx,a.bottom,'#22c55e','#34d399');},'rgba(148,163,184,.18)'],borderWidth:0,circumference:270,rotation:-135}]},
      options:{cutout:'78%',plugins:{legend:{display:false},tooltip:{enabled:false}},maintainAspectRatio:false}
    });
  })();

  // Users line
  (function(){
    var el=document.getElementById('usersLine');if(!el)return;
    makeChart(el,{
      type:'line',
      data:{labels:data.labels,datasets:[lineDataset('Usuarios nuevos',data.users,'#a78bfa','rgba(167,139,250,.32)')]},
      options:{plugins:commonPlugins,scales:commonScales,maintainAspectRatio:false,responsive:true,interaction:{mode:'index',intersect:false}}
    });
  })();

  // General multi-line
  (function(){
    var el=document.getElementById('generalLine');if(!el)return;
    makeChart(el,{
      type:'line',
      data:{labels:data.labels,datasets:[
        lineDataset('Usuarios',data.users,'#a78bfa','rgba(167,139,250,.18)'),
        lineDataset('Facturas pagadas',data.invoices,'#22c55e','rgba(34,197,94,.16)'),
        lineDataset('Servicios activos',data.services,'#3b82f6','rgba(59,130,246,.16)'),
        lineDataset('Servicios suspendidos',data.suspended,'#f43f5e','rgba(244,63,94,.16)'),
        lineDataset('Tickets nuevos',data.tickets,'#f59e0b','rgba(245,158,11,.16)'),
      ]},
      options:{
        plugins:{
          legend:{display:true,position:'top',align:'start',labels:{usePointStyle:true,boxWidth:8,boxHeight:8,padding:14,font:{size:11,weight:'600'}}},
          tooltip:commonPlugins.tooltip
        },
        scales:commonScales,
        maintainAspectRatio:false,
        responsive:true,
        interaction:{mode:'index',intersect:false}
      }
    });
  })();

  // Mini sparklines
  function sparkline(id,arr,color,c2){
    var el=document.getElementById(id);if(!el)return;
    makeChart(el,{
      type:'line',
      data:{labels:arr.map(function(_,i){return i;}),datasets:[lineDataset('',arr,color,c2)]},
      options:{plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false,beginAtZero:true}},maintainAspectRatio:false,responsive:true,elements:{point:{radius:0}}}
    });
  }
  sparkline('miniTickets',data.mini.ticketsResolved,'#22c55e','rgba(34,197,94,.32)');
  sparkline('miniProducts',data.mini.productsActive,'#a78bfa','rgba(167,139,250,.32)');
  sparkline('miniServices',data.mini.servicesActive,'#f59e0b','rgba(245,158,11,.32)');
  sparkline('miniSales',data.mini.monthSales,'#d946ef','rgba(217,70,239,.32)');

  applyTheme();
  // Re-aplicar al cambiar de tema
  new MutationObserver(function(){applyTheme();}).observe(document.body,{attributes:true,attributeFilter:['class']});

  // Menu de rango de fechas
  var dashRange = document.getElementById('dashRange');
  if(dashRange){
    dashRange.addEventListener('click',function(ev){
      if(ev.target.closest('.dash-date-menu a'))return;
      ev.stopPropagation();
      dashRange.classList.toggle('open');
    });
    document.addEventListener('click',function(ev){
      if(!dashRange.contains(ev.target))dashRange.classList.remove('open');
    });
  }
})();
</script>`
    });
  });
  return r;
}
module.exports = { config, router };
