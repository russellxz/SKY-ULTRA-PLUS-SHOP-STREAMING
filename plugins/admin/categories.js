"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const config = {
  key: "admin_categories",
  name: "Categorías",
  icon: "ri-folder-3-line",
  route: "/admin/categories",
  area: "admin",
  category: "Tienda",
  permission: "admin",
  order: 11,
};

const ICONS = ["ri-price-tag-3-line","ri-store-2-line","ri-shopping-bag-3-line","ri-tv-2-line","ri-movie-2-line","ri-youtube-line","ri-video-line","ri-live-line","ri-music-2-line","ri-music-fill","ri-disc-line","ri-album-line","ri-headphone-line","ri-speaker-2-line","ri-mic-line","ri-radio-2-line","ri-play-circle-line","ri-robot-2-line","ri-code-box-line","ri-terminal-box-line","ri-server-line","ri-database-2-line","ri-cloud-line","ri-global-line","ri-pages-line","ri-window-line","ri-gamepad-line","ri-vip-crown-line","ri-key-2-line","ri-shield-star-line"];

function h(ctx,v){ return ctx.layout.escapeHtml(v || ""); }
function reg(ctx){ return require("../../core/pluginLoader").registry(ctx.db); }
function slug(v){ return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "categoria"; }
function migrate(db){
  const cols = db.sqlite.prepare("PRAGMA table_info(product_categories)").all().map(x=>x.name);
  if(!cols.includes("slug")) db.sqlite.exec("ALTER TABLE product_categories ADD COLUMN slug TEXT DEFAULT ''");
  if(!cols.includes("description")) db.sqlite.exec("ALTER TABLE product_categories ADD COLUMN description TEXT DEFAULT ''");
  if(!cols.includes("image_path")) db.sqlite.exec("ALTER TABLE product_categories ADD COLUMN image_path TEXT DEFAULT ''");
  if(!cols.includes("active")) db.sqlite.exec("ALTER TABLE product_categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
}
function saveUpload(file){
  if(!file || !file.name) return "";
  const dir = path.join(process.cwd(), "uploads", "categories");
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
  const name = Date.now() + "-" + crypto.randomBytes(4).toString("hex") + (path.extname(file.name) || ".png");
  fs.writeFileSync(path.join(dir, name), file.data);
  return "/uploads/categories/" + name;
}
function iconPicker(selected){
  return `<div class="cat-icon-grid">${ICONS.map(ic=>`<label class="cat-icon-choice"><input type="radio" name="icon" value="${ic}" ${selected===ic?"checked":""}><i class="${ic}"></i></label>`).join("")}</div>`;
}
function canRemove(ctx,id){
  const products = ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM products WHERE category_id=?").get(id).c;
  return products === 0;
}
function fmtDate(v){if(!v)return"";try{const d=new Date(v);return d.toLocaleDateString("es",{day:"2-digit",month:"short",year:"numeric"})}catch{return""}}

const CSS_LINK = `<link rel="stylesheet" href="/public/css/admin-categories-design.css?v=1">`;

function createModalHtml(ctx){
  return `<div class="cat-modal" id="catCreateModal">
    <div class="cat-modal-box">
      <header class="cat-modal-head">
        <div>
          <h2><i class="ri-folder-add-line"></i> Crear categoria</h2>
          <p>Completa la informacion para agregar una nueva categoria.</p>
        </div>
        <button type="button" class="cat-modal-close" onclick="catCloseCreate()">×</button>
      </header>
      <form method="POST" action="/admin/categories/create" enctype="multipart/form-data">
        <div class="cat-modal-body">
          <section class="cat-section">
            <div class="cat-section-head"><span class="cat-section-num">1</span><h3><i class="ri-information-line"></i> Informacion basica</h3></div>
            <p class="cat-section-sub">Completa la informacion basica para agregar una nueva categoria.</p>
            <div class="cat-grid two">
              <label class="cat-field"><span>Nombre <em>*</em></span><input name="name" placeholder="Ej. Tecnologia" required></label>
              <label class="cat-field"><span>Slug <em style="color:rgba(255,255,255,.45);font-style:normal;font-weight:600">(opcional)</em></span><input name="slug" placeholder="tecnologia" data-slug-from="name"><small class="cat-field-help">Se usa en la URL. Dejalo vacio para generar automaticamente.</small></label>
              <label class="cat-field full"><span>Descripcion <em style="color:rgba(255,255,255,.45);font-style:normal;font-weight:600">(opcional)</em></span><textarea name="description" placeholder="Describe esta categoria..." maxlength="200" oninput="catUpdateCount(this,'descCountCreate')"></textarea><small class="cat-counter"><span id="descCountCreate">0</span>/200</small></label>
            </div>
          </section>
          <section class="cat-section">
            <div class="cat-section-head"><span class="cat-section-num">2</span><h3><i class="ri-shapes-line"></i> Icono</h3></div>
            <p class="cat-section-sub">Elige un icono representativo para tu categoria.</p>
            ${iconPicker("ri-price-tag-3-line")}
          </section>
          <section class="cat-section">
            <div class="cat-section-head"><span class="cat-section-num">3</span><h3><i class="ri-image-line"></i> Imagen <em style="color:rgba(255,255,255,.45);font-style:normal;font-weight:600">(opcional)</em></h3></div>
            <label class="cat-upload">
              <input type="file" name="image" accept="image/*">
              <div class="cat-upload-content">
                <i class="ri-upload-cloud-2-line"></i>
                <strong>Sube una imagen para tu categoria</strong>
                <small>PNG, JPG o WEBP. Tamano maximo 5MB.</small>
                <span class="cat-upload-btn">Seleccionar archivo</span>
              </div>
            </label>
          </section>
          <section class="cat-section">
            <div class="cat-toggle-row">
              <div>
                <h3 style="margin:0"><i class="ri-eye-line"></i> Visibilidad</h3>
                <p class="cat-section-sub" style="margin:6px 0 0">Los clientes podran ver y acceder a esta categoria en la tienda.</p>
              </div>
              <label class="cat-toggle"><input type="checkbox" name="active" value="1" checked><em></em></label>
            </div>
          </section>
        </div>
        <footer class="cat-modal-foot">
          <button type="button" class="cat-cancel-btn" onclick="catCloseCreate()">Cancelar</button>
          <button type="submit" class="cat-submit-btn"><i class="ri-add-line"></i> Crear categoria</button>
        </footer>
      </form>
    </div>
  </div>`;
}

function commonScripts(){
  return `<script>
function catUpdateCount(el,id){var n=document.getElementById(id);if(n)n.textContent=String(el.value.length);}
function catOpenCreate(){var m=document.getElementById('catCreateModal');if(m){m.classList.add('show');document.body.style.overflow='hidden';}}
function catCloseCreate(){var m=document.getElementById('catCreateModal');if(m){m.classList.remove('show');document.body.style.overflow='';}}
function catFilter(){var q=(document.getElementById('catSearch').value||'').toLowerCase();document.querySelectorAll('.cat-list .cat-card').forEach(function(c){c.style.display=c.innerText.toLowerCase().indexOf(q)>=0?'':'none';});}
function catSort(){var s=document.getElementById('catSort').value;var list=document.querySelector('.cat-list');if(!list)return;var arr=Array.from(list.querySelectorAll('.cat-card'));arr.sort(function(a,b){if(s==='name')return (a.dataset.name||'').localeCompare(b.dataset.name||'');if(s==='products')return (parseInt(b.dataset.products||'0')-parseInt(a.dataset.products||'0'));return (parseInt(b.dataset.created||'0')-parseInt(a.dataset.created||'0'));});arr.forEach(function(c){list.appendChild(c);});}
document.addEventListener('click',function(ev){var box=document.querySelector('.cat-modal.show .cat-modal-box');var m=document.querySelector('.cat-modal.show');if(m&&ev.target===m)catCloseCreate();});
</script>`;
}

function router(ctx){
  const r = express.Router();
  r.use(ctx.auth.requireAdmin);
  migrate(ctx.db);

  r.post("/create", (req,res)=>{
    const image = saveUpload(req.files?.image);
    ctx.db.sqlite.prepare("INSERT INTO product_categories (name,slug,description,icon,image_path,order_index,active) VALUES (?,?,?,?,?,?,?)").run(req.body.name, slug(req.body.slug || req.body.name), req.body.description || "", req.body.icon || "ri-price-tag-3-line", image, 100, req.body.active ? 1 : 0);
    res.redirect("/admin/categories?ok=create");
  });

  r.post("/:id/update", (req,res)=>{
    const cat = ctx.db.sqlite.prepare("SELECT * FROM product_categories WHERE id=?").get(req.params.id);
    if(!cat) return res.redirect("/admin/categories");
    const image = req.body.remove_image ? "" : (saveUpload(req.files?.image) || cat.image_path || "");
    ctx.db.sqlite.prepare("UPDATE product_categories SET name=?, slug=?, description=?, icon=?, image_path=?, active=? WHERE id=?").run(req.body.name, slug(req.body.slug || req.body.name), req.body.description || "", req.body.icon || cat.icon, image, req.body.active ? 1 : 0, req.params.id);
    res.redirect("/admin/categories/" + req.params.id + "?saved=1");
  });

  r.post("/:id/remove", (req,res)=>{
    const id = req.params.id;
    if(canRemove(ctx, id)){
      ctx.db.sqlite.prepare("DELETE FROM product_categories WHERE id=?").run(id);
      return res.redirect("/admin/categories?ok=delete");
    }
    const count = ctx.db.sqlite.prepare("SELECT COUNT(*) c FROM products WHERE category_id=?").get(id).c;
    res.redirect("/admin/categories?error=" + encodeURIComponent("No puedes eliminar esta categoria porque tiene " + count + " producto(s) asociado(s). Mueve o elimina los productos primero."));
  });

  r.get("/:id", (req,res)=>{
    const cat = ctx.db.sqlite.prepare("SELECT * FROM product_categories WHERE id=?").get(req.params.id);
    if(!cat) return res.redirect("/admin/categories");
    const products = ctx.db.sqlite.prepare("SELECT * FROM products WHERE category_id=? ORDER BY id DESC").all(cat.id);
    const prodRows = products.map(p=>`<div class="cat-prod-row">${p.image_path?`<img src="${h(ctx,p.image_path)}" alt="">`:`<span class="cat-prod-fb"><i class="ri-image-line"></i></span>`}<strong>${h(ctx,p.name)}</strong><span class="cat-meta-status ${p.active?"visible":"hidden"}">${p.active?"Visible":"Oculto"}</span><a class="cat-action-btn" href="/admin/products/${p.id}" title="Editar"><i class="ri-pencil-line"></i></a></div>`).join("") || `<p style="color:rgba(233,242,255,.55);font-size:13px;margin:8px 0">Aun no hay productos en esta categoria.</p>`;
    const saved = req.query.saved ? `<div class="notice success" style="margin:0">Cambios guardados.</div>` : "";
    res.renderPage({
      title:"Editar categoria",
      area:"admin",
      registry:reg(ctx),
      content:`${CSS_LINK}
<div class="cat-admin">
  <div class="cat-crumb"><a href="/admin/categories">Categorias</a> &gt; <span class="now">Editar</span></div>
  <div class="cat-edit-head">
    <div class="cat-head-text">
      <h1>Editar categoria</h1>
      <p>Actualiza la informacion de tu categoria y administra los productos que contiene.</p>
    </div>
    <form method="POST" action="/admin/categories/${cat.id}/remove" onsubmit="return confirm('Eliminar esta categoria? Esto no se puede deshacer.')">
      <button class="cat-delete-btn"><i class="ri-delete-bin-line"></i> Eliminar categoria</button>
    </form>
  </div>
  ${saved}
  <form method="POST" action="/admin/categories/${cat.id}/update" enctype="multipart/form-data" style="display:grid;gap:18px;margin:0">
    <section class="cat-edit-card">
      <header class="cat-edit-card-head"><span class="cat-section-num">1</span><h3><i class="ri-information-line"></i> Informacion basica</h3></header>
      <div class="cat-edit-card-body">
        <p class="cat-section-sub">Datos generales que veran tus clientes.</p>
        <div class="cat-grid two">
          <label class="cat-field"><span>Nombre <em>*</em></span><input name="name" value="${h(ctx,cat.name)}" required></label>
          <label class="cat-field"><span>Slug (URL)</span><input name="slug" value="${h(ctx,cat.slug || slug(cat.name))}"><small class="cat-field-help">Se usa en la URL. Dejalo vacio para generar automaticamente.</small></label>
          <label class="cat-field full"><span>Descripcion</span><textarea name="description" placeholder="Agrega una descripcion para esta categoria..." maxlength="200" oninput="catUpdateCount(this,'descCountEdit')">${h(ctx,cat.description)}</textarea><small class="cat-counter"><span id="descCountEdit">${(cat.description||"").length}</span>/200</small></label>
        </div>
      </div>
    </section>
    <section class="cat-edit-card">
      <header class="cat-edit-card-head"><span class="cat-section-num">2</span><h3><i class="ri-shapes-line"></i> Icono</h3></header>
      <div class="cat-edit-card-body">
        <p class="cat-section-sub">Elige un icono representativo para esta categoria.</p>
        ${iconPicker(cat.icon)}
      </div>
    </section>
    <section class="cat-edit-card">
      <header class="cat-edit-card-head"><span class="cat-section-num">3</span><h3><i class="ri-image-line"></i> Imagen</h3></header>
      <div class="cat-edit-card-body">
        <p class="cat-section-sub">Agrega una imagen distintiva para mostrar en la lista.</p>
        ${cat.image_path?`<img class="cat-upload-preview" src="${h(ctx,cat.image_path)}" alt=""><label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin:0 0 12px"><input type="checkbox" name="remove_image" value="1" style="width:auto;margin:0"> Quitar imagen actual</label>`:""}
        <label class="cat-upload">
          <input type="file" name="image" accept="image/*">
          <div class="cat-upload-content">
            <i class="ri-upload-cloud-2-line"></i>
            <strong>${cat.image_path?"Cambiar imagen":"Sube una imagen para tu categoria"}</strong>
            <small>PNG, JPG o WEBP. Tamano maximo 5MB.</small>
            <span class="cat-upload-btn">Seleccionar archivo</span>
          </div>
        </label>
      </div>
    </section>
    <section class="cat-edit-card">
      <header class="cat-edit-card-head"><span class="cat-section-num">4</span><h3><i class="ri-eye-line"></i> Visibilidad</h3></header>
      <div class="cat-edit-card-body">
        <div class="cat-toggle-row">
          <div>
            <strong style="display:block;font-weight:900;font-size:14px">${cat.active?"Visible":"Oculta"}</strong>
            <p class="cat-section-sub" style="margin:5px 0 0">Controla si esta categoria aparece o no en la tienda.</p>
          </div>
          <label class="cat-toggle"><input type="checkbox" name="active" value="1" ${cat.active?"checked":""}><em></em></label>
        </div>
      </div>
    </section>
    <div class="cat-edit-actions">
      <a href="/admin/categories" class="cat-cancel-btn">Cancelar</a>
      <button class="cat-submit-btn"><i class="ri-save-3-line"></i> Guardar cambios</button>
    </div>
  </form>

  <section class="cat-edit-card">
    <header class="cat-edit-card-head" style="justify-content:space-between"><div style="display:flex;align-items:center;gap:12px"><span class="cat-section-num"><i class="ri-shopping-bag-3-line"></i></span><h3 style="margin:0">Productos en esta categoria</h3></div><a class="cat-submit-btn" href="/admin/products/new?category_id=${cat.id}"><i class="ri-add-line"></i> Crear producto</a></header>
    <div class="cat-edit-card-body">
      ${prodRows}
    </div>
  </section>
</div>
${commonScripts()}`
    });
  });

  r.get("/", (req,res)=>{
    const cats = ctx.db.sqlite.prepare("SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) product_count FROM product_categories c ORDER BY c.id DESC").all();
    const cards = cats.map(c=>{
      const created = fmtDate(c.created_at) || "";
      const ts = c.created_at ? new Date(c.created_at).getTime() : 0;
      return `<div class="cat-card" data-name="${h(ctx,c.name).toLowerCase()}" data-products="${c.product_count}" data-created="${ts}">
        <div class="cat-card-icon">${c.image_path?`<img src="${h(ctx,c.image_path)}" alt="">`:`<i class="${h(ctx,c.icon||"ri-price-tag-3-line")}"></i>`}</div>
        <div class="cat-card-info">
          <strong>${h(ctx,c.name)}</strong>
          <div class="cat-card-meta">
            <span class="cat-meta-products"><i class="ri-shopping-bag-3-line"></i> ${c.product_count} producto${c.product_count===1?"":"s"}</span>
            <span class="cat-meta-status ${c.active?"visible":"hidden"}">${c.active?"Visible":"Oculta"}</span>
          </div>
        </div>
        <div class="cat-card-side">
          ${created?`<small class="cat-card-date">Creado el ${created}</small>`:""}
          <div class="cat-card-actions">
            <a class="cat-action-btn" href="/admin/categories/${c.id}" title="Editar"><i class="ri-pencil-line"></i></a>
            <form method="POST" action="/admin/categories/${c.id}/remove" style="margin:0" onsubmit="return confirm('Eliminar esta categoria? Esto no se puede deshacer.')">
              <button class="cat-action-btn danger" type="submit" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
            </form>
          </div>
        </div>
      </div>`;
    }).join("");
    let msg = "";
    if(req.query.ok==="create") msg = `<div class="notice success" style="margin:0">Categoria creada.</div>`;
    if(req.query.ok==="delete") msg = `<div class="notice success" style="margin:0">Categoria eliminada.</div>`;
    if(req.query.error) msg = `<div class="notice error" style="margin:0">${h(ctx,req.query.error)}</div>`;
    res.renderPage({
      title:"Categorias",
      area:"admin",
      registry:reg(ctx),
      content:`${CSS_LINK}
<div class="cat-admin">
  <div class="cat-crumb">Categorias &gt; <span class="now">Listado</span></div>
  <div class="cat-head">
    <div class="cat-head-text">
      <h1>Categorias</h1>
      <p>Organiza tus productos por categorias para que tus clientes encuentren lo que buscan.</p>
    </div>
    <button class="cat-create-btn" onclick="catOpenCreate()"><i class="ri-add-line"></i> Crear categoria</button>
  </div>
  ${msg}
  <div class="cat-toolbar">
    <label class="cat-search-wrap"><i class="ri-search-line"></i><input id="catSearch" placeholder="Buscar categorias..." oninput="catFilter()"></label>
    <label class="cat-filter-wrap"><i class="ri-arrow-up-down-line"></i><select id="catSort" onchange="catSort()"><option value="recent">Ordenar: Mas recientes</option><option value="name">Por nombre</option><option value="products">Por # productos</option></select><i class="ri-arrow-down-s-line caret"></i></label>
  </div>
  <div class="cat-list">
    ${cards}
  </div>
  <div class="cat-empty-card">
    <i class="ri-folder-3-line"></i>
    <h3>Organiza tu tienda con categorias</h3>
    <p>Crea categorias para mantener tus productos ordenados y facilitar la navegacion de tus clientes.</p>
  </div>
</div>
${createModalHtml(ctx)}
${commonScripts()}`
    });
  });

  return r;
}

module.exports = { config, router };
