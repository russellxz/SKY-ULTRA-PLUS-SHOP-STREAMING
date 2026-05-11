"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const config = { key: "admin_products", name: "Productos", icon: "ri-shopping-bag-3-line", route: "/admin/products", area: "admin", category: "Tienda", permission: "admin", order: 10 };
const CYCLES = { one_time:["Pago único",0,0], test_3m:["Recurrente test 3 minutos",0,3], weekly:["Recurrente semanal",7,0], half_month:["Recurrente cada 15 días",15,0], monthly:["Recurrente mensual",30,0] };

function h(ctx,v){return ctx.layout.escapeHtml(v||"");}
function reg(ctx){return require("../../core/pluginLoader").registry(ctx.db);}
function slug(v){return String(v||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"producto";}
function migrate(db){const c=db.sqlite.prepare("PRAGMA table_info(products)").all().map(x=>x.name); if(!c.includes("slug"))db.sqlite.exec("ALTER TABLE products ADD COLUMN slug TEXT DEFAULT ''"); if(!c.includes("cycle_minutes"))db.sqlite.exec("ALTER TABLE products ADD COLUMN cycle_minutes INTEGER NOT NULL DEFAULT 0"); if(!c.includes("image_path"))db.sqlite.exec("ALTER TABLE products ADD COLUMN image_path TEXT DEFAULT ''"); if(!c.includes("stock_limit"))db.sqlite.exec("ALTER TABLE products ADD COLUMN stock_limit INTEGER NOT NULL DEFAULT 0");}
function saveImg(file){
  if(!file||!file.name)return"";
  const d=path.join(process.cwd(),"uploads","products");
  if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});
  const n=Date.now()+"-"+crypto.randomBytes(4).toString("hex")+(path.extname(file.name)||".png");
  const dest=path.join(d,n);
  if(file.tempFilePath){
    try{fs.renameSync(file.tempFilePath,dest);}catch(e){fs.copyFileSync(file.tempFilePath,dest);try{fs.unlinkSync(file.tempFilePath);}catch(_){}}
  }else if(file.data&&file.data.length){
    fs.writeFileSync(dest,file.data);
  }else{
    return"";
  }
  return"/uploads/products/"+n;
}
function items(body){const v=body.delivery_items; if(Array.isArray(v))return v.map(x=>String(x||"").trim()).filter(Boolean); return String(v||"").split("---").map(x=>x.trim()).filter(Boolean);}
function addItems(ctx,id,body){const arr=items(body); if(!arr.length)return 0; const last=ctx.db.sqlite.prepare("SELECT COALESCE(MAX(order_index),0) m FROM product_inventory_items WHERE product_id=?").get(id).m||0; const st=ctx.db.sqlite.prepare("INSERT INTO product_inventory_items (product_id,content,status,order_index,created_at) VALUES (?,?,?,?,?)"); const tx=ctx.db.sqlite.transaction(()=>arr.forEach((x,i)=>st.run(id,x,"available",last+(i+1)*10,ctx.db.now()))); tx(); return arr.length;}
function counts(ctx,id){const rows=ctx.db.sqlite.prepare("SELECT status,COUNT(*) c FROM product_inventory_items WHERE product_id=? GROUP BY status").all(id); const o={available:0,delivered:0,disabled:0,total:0}; for(const r of rows){o[r.status]=r.c;o.total+=r.c} return o;}
function cats(ctx,sel){return ctx.db.sqlite.prepare("SELECT * FROM product_categories ORDER BY active DESC,order_index,id").all().map(c=>`<option value="${c.id}" ${Number(sel)===Number(c.id)?"selected":""}>${h(ctx,c.name)}${c.active?"":" (oculta)"}</option>`).join("");}
function catOptions(ctx){return ctx.db.sqlite.prepare("SELECT id,name FROM product_categories WHERE active=1 ORDER BY order_index,id").all().map(c=>`<option value="${c.id}">${h(ctx,c.name)}</option>`).join("");}
function cycleSel(name,sel){return `<select name="${name}">${Object.entries(CYCLES).map(([k,v])=>`<option value="${k}" ${sel===k?"selected":""}>${v[0]}</option>`).join("")}</select>`;}
function cycleKey(p){if(p.billing_type==="one_time")return"one_time"; if(Number(p.cycle_minutes)===3)return"test_3m"; if(Number(p.cycle_days)===7)return"weekly"; if(Number(p.cycle_days)===15)return"half_month"; return"monthly";}
function cycle(body){const k=body.cycle_key||"one_time"; const c=CYCLES[k]||CYCLES.one_time; return {billing_type:k==="one_time"?"one_time":"recurring",cycle_days:c[1],cycle_minutes:c[2]};}
function canDelete(ctx,id){return ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM services WHERE product_id=? AND status='active'").get(id).c===0;}
function blocks(){return `<div id="deliveryBlocks" class="hidden-blocks"><div class="hidden-card"><div class="hidden-head"><b>Info de entrega 1</b><button type="button" class="link-danger" onclick="removeHiddenBlock(this)">Quitar</button></div><textarea name="delivery_items" placeholder="Datos privados que verá el cliente después de pagar"></textarea></div></div><button type="button" class="prod-ghost-btn" onclick="addHiddenBlock()"><i class="ri-add-line"></i> Agregar otra info de entrega</button>`;}
function spark(c){return `<svg class="prod-spark" viewBox="0 0 100 24" preserveAspectRatio="none" style="color:${c}"><path d="M2 18 L14 14 L26 17 L38 9 L52 13 L64 11 L76 14 L88 8 L98 12" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
function pct(n,t){return t?Math.round(n/t*100):0;}
function fmtDate(ts){if(!ts)return"—";try{const d=new Date(ts);const date=d.toLocaleDateString("es",{day:"2-digit",month:"2-digit",year:"numeric"});const time=d.toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit",hour12:true});return {date,time}}catch{return {date:"—",time:""}}}
function statusInfo(p,available){if(!p.active)return{cls:"hidden",label:"Oculto"};if(available===0)return{cls:"hidden",label:"Agotado"};return{cls:"active",label:"Activo"};}

const PRODUCTS_CSS = `<link rel="stylesheet" href="/public/css/admin-products-design.css?v=1">`;

function pageList(ctx,req,res){
  const ps = ctx.db.sqlite.prepare("SELECT products.*,product_categories.name cat_name FROM products LEFT JOIN product_categories ON product_categories.id=products.category_id ORDER BY products.id DESC").all();
  const enriched = ps.map(p=>({...p,available:counts(ctx,p.id).available}));
  const total = enriched.length;
  const active = enriched.filter(x=>x.active && x.available>0).length;
  const out = enriched.filter(x=>x.active && x.available===0).length;
  const hidden = enriched.filter(x=>!x.active).length;
  const allCats = ctx.db.sqlite.prepare("SELECT id,name FROM product_categories ORDER BY name").all();
  const catFilterOpts = allCats.map(c=>`<option value="${c.id}">${h(ctx,c.name)}</option>`).join("");
  const stats = `<section class="prod-stats">
    <div class="prod-stat total"><div class="prod-stat-icon"><i class="ri-archive-2-line"></i></div><div><span>Total productos</span><b>${total}</b><small>Todos los productos</small>${spark("#a78bfa")}</div></div>
    <div class="prod-stat ok"><div class="prod-stat-icon"><i class="ri-checkbox-circle-line"></i></div><div><span>Activos</span><b>${active}</b><small>Visibles en tienda</small>${spark("#22c55e")}</div></div>
    <div class="prod-stat warn"><div class="prod-stat-icon"><i class="ri-archive-line"></i></div><div><span>Agotados</span><b>${out}</b><small>Sin stock disponible</small>${spark("#f59e0b")}</div></div>
    <div class="prod-stat bad"><div class="prod-stat-icon"><i class="ri-eye-off-line"></i></div><div><span>Ocultos</span><b>${hidden}</b><small>No visibles</small>${spark("#ec4899")}</div></div>
  </section>`;
  const rows = enriched.map(p=>{
    const st = statusInfo(p,p.available);
    const created = fmtDate(p.created_at);
    const stockLabel = p.available===0?"Agotado":"Disponible";
    const stockCls = p.available===0?"agotado":"disp";
    return `<tr class="prod-row" data-status="${st.cls}" data-cat="${p.category_id||''}">
      <td>
        <div class="prod-cell">
          ${p.image_path?`<img src="${h(ctx,p.image_path)}" class="prod-thumb" alt="">`:`<div class="prod-thumb-empty"><i class="ri-image-line"></i></div>`}
          <div class="prod-cell-text">
            <strong>${h(ctx,p.name)}</strong>
            <small>SKU: ${h(ctx,(p.slug||slug(p.name)).toUpperCase())}</small>
          </div>
        </div>
      </td>
      <td><span class="prod-cat-pill">${h(ctx,p.cat_name||"Sin categoría")}</span></td>
      <td><span class="prod-price">${h(ctx,p.currency)} ${Number(p.price).toFixed(2)}</span></td>
      <td><div class="prod-stock"><strong>${p.available}</strong><small class="${stockCls}">${stockLabel}</small></div></td>
      <td><span class="prod-status ${st.cls}">${st.label}</span></td>
      <td><div class="prod-date"><strong>${created.date||"—"}</strong><small>${created.time||""}</small></div></td>
      <td>
        <div class="prod-actions">
          <a href="/admin/products/${p.id}" class="prod-action-btn edit" title="Editar"><i class="ri-pencil-line"></i></a>
          <a href="/store/${h(ctx,p.slug||p.id)}" class="prod-action-btn view" title="Ver en tienda"><i class="ri-eye-line"></i></a>
          <form method="POST" action="/admin/products/${p.id}/delete" onsubmit="return confirm('¿Eliminar este producto?')"><button class="prod-action-btn delete" title="Borrar"><i class="ri-delete-bin-line"></i></button></form>
        </div>
      </td>
    </tr>`;
  }).join("");
  let listMsg="";
  if(req.query.ok==="delete") listMsg=`<div class="notice success" style="margin:0">Producto eliminado correctamente.</div>`;
  else if(req.query.error) listMsg=`<div class="notice error" style="margin:0"><i class="ri-error-warning-line"></i> ${h(ctx,req.query.error)}</div>`;
  res.renderPage({title:"Productos",area:"admin",registry:reg(ctx),content:`${PRODUCTS_CSS}
    <div class="prod-admin">
      <div class="prod-crumb">Productos &gt; <span class="now">Listado</span></div>
      ${listMsg}
      <div class="prod-head">
        <div class="prod-head-left">
          <span class="prod-head-icon"><i class="ri-shopping-bag-3-line"></i></span>
          <div class="prod-head-text">
            <h1>Productos</h1>
            <p>Administra todos los productos de tu tienda en un solo lugar.</p>
          </div>
        </div>
        <a class="prod-create-btn" href="/admin/products/new"><i class="ri-add-line"></i> Crear producto</a>
      </div>
      ${stats}
      <div class="prod-toolbar">
        <label class="prod-search-wrap"><i class="ri-search-line"></i><input id="prodSearch" placeholder="Buscar por nombre, categoría o SKU..." oninput="prodFilter()"></label>
        <label class="prod-filter-wrap"><i class="ri-folder-line"></i><select id="prodCat" onchange="prodFilter()"><option value="all">Todas las categorías</option>${catFilterOpts}</select><i class="ri-arrow-down-s-line caret"></i></label>
        <label class="prod-filter-wrap"><i class="ri-filter-3-line"></i><select id="prodStatus" onchange="prodFilter()"><option value="all">Estado: Todos</option><option value="active">Activos</option><option value="hidden">Agotados u ocultos</option></select><i class="ri-arrow-down-s-line caret"></i></label>
      </div>
      <section class="prod-panel">
        <div class="prod-table-wrap">
          <table class="prod-table" id="prodTable">
            <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th>Creado el</th><th>Acciones</th></tr></thead>
            <tbody>${rows||'<tr><td colspan="7"><div class="prod-empty">No hay productos todavía.</div></td></tr>'}</tbody>
          </table>
        </div>
      </section>
    </div>
    <script>
    function prodFilter(){
      var q=(document.getElementById('prodSearch').value||'').toLowerCase();
      var cat=document.getElementById('prodCat').value;
      var st=document.getElementById('prodStatus').value;
      document.querySelectorAll('#prodTable tbody tr.prod-row').forEach(function(r){
        var t=r.innerText.toLowerCase();
        var okQ=t.indexOf(q)>=0;
        var okCat=cat==='all'||r.getAttribute('data-cat')===cat;
        var rs=r.getAttribute('data-status');
        var okSt=st==='all'||(st==='active'?rs==='active':rs!=='active');
        r.style.display=(okQ&&okCat&&okSt)?'':'none';
      });
    }
    </script>`});
}

function pageForm(ctx,req,res,p){
  const isEdit = !!p;
  const action = isEdit ? `/admin/products/${p.id}/update` : "/admin/products/create";
  const sc = isEdit ? counts(ctx,p.id) : {available:0,delivered:0,disabled:0,total:0};
  const inv = isEdit ? ctx.db.sqlite.prepare("SELECT * FROM product_inventory_items WHERE product_id=? ORDER BY order_index,id").all(p.id) : [];
  const invRows = inv.map(x=>`<tr><td>${x.id}</td><td><pre>${h(ctx,x.content)}</pre></td><td><span class="prod-inv-pill ${h(ctx,x.status)}">${h(ctx,x.status)}</span></td><td>${x.status==='available'?`<form method="POST" action="/admin/products/${p.id}/item/${x.id}/delete" style="margin:0"><button class="link-danger">Quitar</button></form>`:""}</td></tr>`).join("");
  const title = isEdit ? `Editar ${h(ctx,p.name)}` : "Crear producto";
  const subtitle = isEdit ? "Actualiza la información del producto." : "Completa la información para crear un nuevo producto en tu tienda.";
  const submitText = isEdit ? `<i class="ri-save-3-line"></i> Guardar cambios` : `<i class="ri-add-line"></i> Crear producto`;
  const initialCycle = isEdit ? cycleKey(p) : "one_time";
  let saved = "";
  if(req.query.saved) saved=`<div class="notice success" style="margin-bottom:0">Producto guardado correctamente.</div>`;
  else if(req.query.error) saved=`<div class="notice error" style="margin-bottom:0"><i class="ri-error-warning-line"></i> ${h(ctx,req.query.error)}</div>`;
  res.renderPage({title,area:"admin",registry:reg(ctx),content:`${PRODUCTS_CSS}
    <div class="prod-admin">
      <div class="prod-crumb"><a href="/admin/products">Productos</a> &gt; <span class="now">${isEdit?"Editar":"Crear"}</span></div>
      <div class="prod-form-head">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      ${saved}
      <form class="prod-form" method="POST" action="${action}" enctype="multipart/form-data">
        <section class="prod-card">
          <div class="prod-card-title"><i class="ri-information-line"></i> Información básica</div>
          <p class="prod-card-sub">Datos generales del producto que verán tus clientes.</p>
          <div class="prod-grid two">
            <label class="prod-field"><span>Nombre del producto</span><input name="name" placeholder="Ej. Teclado Mecánico RGB" value="${isEdit?h(ctx,p.name):''}" required></label>
            <label class="prod-field"><span>Slug (URL amigable)</span><input name="slug" placeholder="teclado-mecanico-rgb" value="${isEdit?h(ctx,p.slug||slug(p.name)):''}"></label>
            <label class="prod-field"><span>Categoría</span><select name="category_id" required>${cats(ctx,isEdit?p.category_id:req.query.category_id)}</select></label>
            <label class="prod-field full"><span>Descripción</span><textarea name="description" placeholder="Escribe una descripción del producto...">${isEdit?h(ctx,p.description):''}</textarea></label>
          </div>
        </section>
        <section class="prod-card">
          <div class="prod-card-title"><i class="ri-image-line"></i> Media del producto</div>
          <p class="prod-card-sub">Imagen del producto. PNG, JPG o WEBP.</p>
          ${isEdit && p.image_path ? `<img class="prod-upload-preview" src="${h(ctx,p.image_path)}" alt=""><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;margin:0 0 12px"><input type="checkbox" name="remove_image" value="1" style="width:auto"> Quitar imagen actual</label>` : ""}
          <label class="prod-upload">
            <input type="file" name="image" accept="image/*">
            <div class="prod-upload-content">
              <i class="ri-upload-cloud-2-line"></i>
              <strong>Seleccionar archivo</strong>
              <small>Arrastra o haz clic. Tamaño máx. 5MB.</small>
            </div>
          </label>
        </section>
        <section class="prod-card">
          <div class="prod-card-title"><i class="ri-money-dollar-circle-line"></i> Detalles comerciales</div>
          <p class="prod-card-sub">Precio, moneda y modalidad de cobro.</p>
          <div class="prod-grid two">
            <label class="prod-field"><span>Precio</span><input name="price" type="number" step="0.01" placeholder="0.00" value="${isEdit?Number(p.price).toFixed(2):''}"></label>
            <label class="prod-field"><span>Stock disponible</span><input type="text" disabled placeholder="Cantidad en inventario" value="${sc.available}"></label>
            <label class="prod-field"><span>Moneda</span><select name="currency"><option ${isEdit&&p.currency==='USD'?'selected':''}>USD</option><option ${isEdit&&p.currency==='MXN'?'selected':''}>MXN</option></select></label>
            <label class="prod-field"><span>Tipo de cobro</span>${cycleSel("cycle_key",initialCycle)}</label>
            <label class="prod-toggle full">
              <div class="prod-toggle-text"><b>Mostrar producto</b><small>El producto será visible para los clientes en la tienda.</small></div>
              <input type="checkbox" name="active" value="1" ${(!isEdit || p.active)?'checked':''}>
              <em></em>
            </label>
          </div>
        </section>
        <section class="prod-card">
          <div class="prod-card-title"><i class="ri-bank-card-line"></i> Métodos de pago aceptados</div>
          <p class="prod-card-sub">Selecciona qué métodos de pago se mostrarán a los clientes al pagar este producto.</p>
          <div class="prod-grid two">
            <label class="prod-toggle full">
              <div class="prod-toggle-text"><b>Aceptar crédito de la cuenta</b><small>Permitir pagar usando los créditos del usuario.</small></div>
              <input type="checkbox" name="accept_credit" value="1" ${(!isEdit || p.accept_credit==null || p.accept_credit) ? "checked" : ""}>
              <em></em>
            </label>
            <label class="prod-toggle full">
              <div class="prod-toggle-text"><b>Aceptar PayPal</b><small>Mostrar el botón de PayPal (API e IPN) cuando esté habilitado en el panel admin.</small></div>
              <input type="checkbox" name="accept_paypal" value="1" ${(!isEdit || p.accept_paypal==null || p.accept_paypal) ? "checked" : ""}>
              <em></em>
            </label>
            <label class="prod-toggle full">
              <div class="prod-toggle-text"><b>Aceptar Stripe</b><small>Mostrar el botón de Stripe cuando esté habilitado en el panel admin.</small></div>
              <input type="checkbox" name="accept_stripe" value="1" ${(!isEdit || p.accept_stripe==null || p.accept_stripe) ? "checked" : ""}>
              <em></em>
            </label>
          </div>
        </section>
        <section class="prod-card">
          <div class="prod-card-title"><i class="ri-database-2-line"></i> Inventario visual</div>
          <p class="prod-card-sub">Cada info de entrega cuenta como 1 stock disponible.${isEdit?` <b>Disponible: ${sc.available} · Entregado: ${sc.delivered} · Total: ${sc.total}</b>`:""}</p>
          ${blocks()}
        </section>
        <div class="prod-form-actions">
          <a href="/admin/products" class="prod-cancel-btn">Cancelar</a>
          <button class="prod-submit-btn">${submitText}</button>
        </div>
      </form>
      ${isEdit?`<section class="prod-card" id="inventory">
        <div class="prod-card-title"><i class="ri-list-check-2"></i> Inventario actual</div>
        <p class="prod-card-sub">Listado de items entregables ya cargados.</p>
        <div style="overflow-x:auto"><table class="prod-inv-table"><thead><tr><th>ID</th><th>Info</th><th>Estado</th><th></th></tr></thead><tbody>${invRows||'<tr><td colspan="4">Sin inventario todavía.</td></tr>'}</tbody></table></div>
      </section>
      <div class="prod-delete-row">
        <form method="POST" action="/admin/products/${p.id}/delete" onsubmit="return confirm('¿Eliminar este producto y todo su inventario?')"><button class="prod-delete-btn"><i class="ri-delete-bin-line"></i> Eliminar producto</button></form>
      </div>`:""}
    </div>`});
}

function router(ctx){
  const r=express.Router();
  r.use(ctx.auth.requireAdmin);
  migrate(ctx.db);
  r.get("/new",(req,res)=>pageForm(ctx,req,res,null));
  r.post("/create",(req,res)=>{const c=cycle(req.body), img=saveImg(req.files?.image); const info=ctx.db.sqlite.prepare("INSERT INTO products (category_id,name,slug,description,price,currency,billing_type,cycle_days,cycle_minutes,delivery_mode,image_path,stock_limit,active,accept_credit,accept_paypal,accept_stripe,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(req.body.category_id,req.body.name,slug(req.body.slug||req.body.name),req.body.description||"",Number(req.body.price||0),ctx.db.normalizeCurrency(req.body.currency),c.billing_type,c.cycle_days,c.cycle_minutes,"sequential",img,0,req.body.active?1:0,req.body.accept_credit?1:0,req.body.accept_paypal?1:0,req.body.accept_stripe?1:0,ctx.db.now()); addItems(ctx,info.lastInsertRowid,req.body); res.redirect(`/admin/products/${info.lastInsertRowid}?saved=1`);});
  r.post("/:id/update",(req,res)=>{const p=ctx.db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(req.params.id); if(!p)return res.redirect("/admin/products"); const c=cycle(req.body), img=req.body.remove_image?"":(saveImg(req.files?.image)||p.image_path||""); ctx.db.sqlite.prepare("UPDATE products SET category_id=?,name=?,slug=?,description=?,price=?,currency=?,billing_type=?,cycle_days=?,cycle_minutes=?,delivery_mode=?,image_path=?,active=?,accept_credit=?,accept_paypal=?,accept_stripe=? WHERE id=?").run(req.body.category_id,req.body.name,slug(req.body.slug||req.body.name),req.body.description||"",Number(req.body.price||0),ctx.db.normalizeCurrency(req.body.currency),c.billing_type,c.cycle_days,c.cycle_minutes,"sequential",img,req.body.active?1:0,req.body.accept_credit?1:0,req.body.accept_paypal?1:0,req.body.accept_stripe?1:0,req.params.id); addItems(ctx,req.params.id,req.body); res.redirect(`/admin/products/${req.params.id}?saved=1`);});
  r.post("/:id/delete",(req,res)=>{
    const id=req.params.id;
    if(canDelete(ctx,id)){
      ctx.db.sqlite.prepare("DELETE FROM product_inventory_items WHERE product_id=?").run(id);
      ctx.db.sqlite.prepare("DELETE FROM products WHERE id=?").run(id);
      return res.redirect("/admin/products?ok=delete");
    }
    const count=ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM services WHERE product_id=? AND status='active'").get(id).c;
    const back=req.headers.referer&&req.headers.referer.indexOf(`/admin/products/${id}`)>=0?`/admin/products/${id}`:"/admin/products";
    res.redirect(back+"?error="+encodeURIComponent("No se puede eliminar este producto: tiene "+count+" servicio(s) activo(s). Cancela todos los servicios activos antes de eliminarlo."));
  });
  r.post("/:id/item/:item/delete",(req,res)=>{ctx.db.sqlite.prepare("UPDATE product_inventory_items SET status='disabled' WHERE id=? AND product_id=? AND status='available'").run(req.params.item,req.params.id);res.redirect(`/admin/products/${req.params.id}#inventory`);});
  r.get("/:id",(req,res)=>{const p=ctx.db.sqlite.prepare("SELECT * FROM products WHERE id=?").get(req.params.id); if(!p)return res.redirect("/admin/products"); pageForm(ctx,req,res,p);});
  r.get("/",(req,res)=>pageList(ctx,req,res));
  return r;
}

module.exports={config,router};
