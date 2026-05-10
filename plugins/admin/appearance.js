"use strict";
const express=require("express");
const path=require("path");
const fs=require("fs");
const crypto=require("crypto");

const config={key:"admin_appearance",name:"Apariencia",icon:"ri-palette-line",route:"/admin/appearance",area:"admin",category:"Sistema",permission:"admin",order:10};
const DEF={site_name:"SKY ULTRA PLUS shop",theme_dark_bg:"#050508",theme_dark_card:"#101426",theme_dark_text:"#e9f2ff",theme_dark_muted:"#9aa6bd",theme_dark_accent:"#8b2cff",theme_dark_accent_2:"#d946ef",theme_dark_border:"#7c3aed",theme_dark_topbar:"#111827",theme_dark_nav:"#0b1020",theme_dark_button:"#7c3aed",theme_dark_danger:"#ef4444",theme_light_bg:"#b7f4f2",theme_light_card:"#ffffff",theme_light_text:"#102033",theme_light_muted:"#536173",theme_light_accent:"#2563eb",theme_light_accent_2:"#7c3aed",theme_light_border:"#8b5cf6",theme_light_topbar:"#dff9ff",theme_light_nav:"#ffffff",theme_light_button:"#2563eb",theme_light_danger:"#dc2626",ui_radius:"22",ui_glow_strength:"35",ui_card_opacity:"82",site_bg_blur:"0",site_bg_overlay:"38",show_background_grid:"1",admin_effect_dark:"electric",admin_effect_light:"rain",client_effect_dark:"stars",client_effect_light:"thunder"};

function h(ctx,v){return ctx.layout.escapeHtml(v||"")}
function reg(ctx){return require("../../core/pluginLoader").registry(ctx.db)}
function g(db,k){return db.getSetting(k,DEF[k]||"")}
function save(file,folder){
  if(!file||!file.name)return"";
  const d=path.join(process.cwd(),"uploads",folder);
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
  return"/uploads/"+folder+"/"+n;
}

const COLORS_DARK=[
  ["theme_dark_bg","Fondo principal","Color base de toda la web en modo oscuro.","ri-contrast-2-line"],
  ["theme_dark_card","Tarjetas y formularios","Cajas, paneles, formularios y tablas.","ri-layout-3-line"],
  ["theme_dark_text","Texto principal","Titulos y textos importantes.","ri-text"],
  ["theme_dark_muted","Texto secundario","Descripciones, ayudas y textos suaves.","ri-quote-text"],
  ["theme_dark_accent","Color acento","Botones, enlaces, detalles neon y seleccion.","ri-flashlight-line"],
  ["theme_dark_accent_2","Color acento 2 (gradiente)","Segundo color para gradientes (botones, hero, iconos).","ri-contrast-drop-line"],
  ["theme_dark_border","Bordes y brillo","Bordes de cards, glow y lineas.","ri-magic-line"],
  ["theme_dark_topbar","Barra superior","Color de la cabecera.","ri-layout-top-line"],
  ["theme_dark_nav","Menu lateral/inferior","Color de navegacion.","ri-menu-2-line"],
  ["theme_dark_button","Boton principal","Acciones positivas como guardar o crear.","ri-checkbox-circle-line"],
  ["theme_dark_danger","Boton peligro","Borrar, cancelar o alertas.","ri-error-warning-line"]
];
const COLORS_LIGHT=[
  ["theme_light_bg","Fondo principal","Color base de toda la web en modo claro.","ri-contrast-2-line"],
  ["theme_light_card","Tarjetas y formularios","Cajas, paneles, formularios y tablas.","ri-layout-3-line"],
  ["theme_light_text","Texto principal","Titulos y textos importantes.","ri-text"],
  ["theme_light_muted","Texto secundario","Descripciones, ayudas y textos suaves.","ri-quote-text"],
  ["theme_light_accent","Color acento","Botones, enlaces y seleccion.","ri-flashlight-line"],
  ["theme_light_accent_2","Color acento 2 (gradiente)","Segundo color para gradientes (botones, hero, iconos).","ri-contrast-drop-line"],
  ["theme_light_border","Bordes y brillo","Bordes de cards, glow y lineas.","ri-magic-line"],
  ["theme_light_topbar","Barra superior","Color de la cabecera.","ri-layout-top-line"],
  ["theme_light_nav","Menu lateral/inferior","Color de navegacion.","ri-menu-2-line"],
  ["theme_light_button","Boton principal","Acciones positivas como guardar o crear.","ri-checkbox-circle-line"],
  ["theme_light_danger","Boton peligro","Borrar o alertas.","ri-error-warning-line"]
];

function colorRow(ctx,k,title,desc,icon){
  const v=h(ctx,g(ctx.db,k));
  return `<div class="appr-row">
    <span class="appr-row-icon"><i class="${icon}"></i></span>
    <div class="appr-row-text"><b>${title}</b><small>${desc}</small></div>
    <div class="appr-row-control">
      <span class="appr-color-hex" data-for="${k}">${v.toUpperCase()}</span>
      <label class="appr-color"><input type="color" name="${k}" value="${v}" data-hex="${k}"></label>
    </div>
  </div>`;
}
function sliderRow(ctx,k,title,desc,icon,min,max,suffix){
  const v=h(ctx,g(ctx.db,k));
  return `<div class="appr-row">
    <span class="appr-row-icon"><i class="${icon}"></i></span>
    <div class="appr-row-text"><b>${title}</b><small>${desc}</small></div>
    <div class="appr-row-control appr-slider">
      <input type="range" name="${k}" min="${min}" max="${max}" value="${v}" data-suffix="${suffix||''}">
      <span class="appr-slider-value">${v}${suffix||''}</span>
    </div>
  </div>`;
}
function selectRow(ctx,k,title,desc,icon,opts){
  const sel=g(ctx.db,k);
  return `<div class="appr-row">
    <span class="appr-row-icon"><i class="${icon}"></i></span>
    <div class="appr-row-text"><b>${title}</b><small>${desc}</small></div>
    <div class="appr-row-control">
      <span class="appr-select"><select name="${k}">${opts.map(o=>`<option value="${o[0]}" ${sel===o[0]?"selected":""}>${o[1]}</option>`).join("")}</select></span>
    </div>
  </div>`;
}
function toggleRow(name,title,desc,icon,checked){
  return `<div class="appr-row">
    <span class="appr-row-icon"><i class="${icon}"></i></span>
    <div class="appr-row-text"><b>${title}</b><small>${desc}</small></div>
    <div class="appr-row-control">
      <label class="appr-toggle"><input type="checkbox" name="${name}" value="1" ${checked?"checked":""}><em></em></label>
    </div>
  </div>`;
}

function router(ctx){
  const r=express.Router();
  r.use(ctx.auth.requireAdmin);
  for(const[k,v]of Object.entries(DEF))if(!ctx.db.getSetting(k,""))ctx.db.setSetting(k,v);

  r.post("/save",(req,res)=>{
    if(req.body.site_name!==undefined)ctx.db.setSetting("site_name",req.body.site_name||DEF.site_name);
    for(const k of Object.keys(DEF)){
      if(k!=="site_name"&&req.body[k]!==undefined)ctx.db.setSetting(k,req.body[k]);
    }
    if(req.body.__section==="background"&&req.body.show_background_grid===undefined)ctx.db.setSetting("show_background_grid","0");
    const logo=save(req.files?.site_logo,"branding");
    if(logo)ctx.db.setSetting("site_logo",logo);
    if(req.body.remove_logo)ctx.db.setSetting("site_logo","");
    const bd=save(req.files?.site_bg_dark,"backgrounds");
    if(bd)ctx.db.setSetting("site_bg_dark",bd);
    if(req.body.remove_bg_dark)ctx.db.setSetting("site_bg_dark","");
    const bl=save(req.files?.site_bg_light,"backgrounds");
    if(bl)ctx.db.setSetting("site_bg_light",bl);
    if(req.body.remove_bg_light)ctx.db.setSetting("site_bg_light","");
    if(req.headers["x-requested-with"]==="fetch"){
      return res.json({ok:true,settings:Object.fromEntries(Object.keys(DEF).map(k=>[k,ctx.db.getSetting(k,DEF[k])])),site_logo:ctx.db.getSetting("site_logo",""),site_bg_dark:ctx.db.getSetting("site_bg_dark",""),site_bg_light:ctx.db.getSetting("site_bg_light","")});
    }
    res.redirect("/admin/appearance?saved=1");
  });

  r.post("/reset",(req,res)=>{
    for(const[k,v]of Object.entries(DEF))if(k!=="site_name")ctx.db.setSetting(k,v);
    ctx.db.setSetting("site_bg_dark","");
    ctx.db.setSetting("site_bg_light","");
    res.redirect("/admin/appearance?reset=1");
  });

  r.get("/",(req,res)=>{
    const effects=[["none","Ninguno"],["electric","Electricidad"],["rain","Lluvia"],["stars","Estrellas fugaces"],["thunder","Truenos"]];
    const siteName=g(ctx.db,"site_name");
    const logo=ctx.db.getSetting("site_logo","");
    const bgD=ctx.db.getSetting("site_bg_dark","");
    const bgL=ctx.db.getSetting("site_bg_light","");
    const initial=h(ctx,siteName.charAt(0).toUpperCase()||"S");
    const msg=req.query.saved?'<div class="appr-notice success"><i class="ri-checkbox-circle-line"></i> Apariencia guardada correctamente.</div>':req.query.reset?'<div class="appr-notice success"><i class="ri-refresh-line"></i> Colores de fabrica restaurados.</div>':"";
    res.renderPage({title:"Configuracion de apariencia",area:"admin",registry:reg(ctx),content:`
<link rel="stylesheet" href="/public/css/admin-appearance-design.css?v=1">
<div class="appr-page">
  <header class="appr-head">
    <p class="appr-eyebrow">Personalizacion</p>
    <h1>Configuracion de apariencia</h1>
    <p>Personaliza nombre, logo, colores, fondos, bordes, brillo y efectos visuales de tu tienda digital.</p>
  </header>
  ${msg}

  <!-- IDENTIDAD -->
  <form class="appr-card" data-section="identity" method="POST" action="/admin/appearance/save" enctype="multipart/form-data">
    <input type="hidden" name="__section" value="identity">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-store-2-line"></i> Identidad de tu tienda</h2>
        <p>Configura el nombre, logo y los datos generales de tu tienda digital.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar</button>
    </div>
    <div class="appr-card-body">
      <div class="appr-identity">
        <label class="appr-field">
          <span>Nombre de la tienda</span>
          <input name="site_name" value="${h(ctx,siteName)}" placeholder="SKY ULTRA PLUS shop">
          <small class="appr-field-help">Aparece en el panel y en el navegador.</small>
        </label>
        <label class="appr-field">
          <span>Logo de la tienda</span>
          <input type="file" name="site_logo" accept="image/*">
          <small class="appr-field-help">PNG, JPG o WEBP. Cuadrado para mejor resultado.</small>
          ${logo?`<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin:6px 0 0"><input type="checkbox" name="remove_logo" value="1" style="width:auto;margin:0"> Quitar logo actual</label>`:""}
        </label>
        <div class="appr-logo-preview-wrap">
          ${logo?`<img class="appr-logo-preview" src="${h(ctx,logo)}" alt="logo">`:`<div class="appr-logo-preview">${initial}</div>`}
          <span class="appr-logo-preview-name">${h(ctx,siteName)}</span>
        </div>
      </div>
    </div>
  </form>

  <!-- FONDO -->
  <form class="appr-card" data-section="background" method="POST" action="/admin/appearance/save" enctype="multipart/form-data">
    <input type="hidden" name="__section" value="background">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-image-line"></i> Fondo de la pagina</h2>
        <p>Imagen de fondo, intensidad de difuminado y rejilla futurista.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar</button>
    </div>
    <div class="appr-card-body">
      <div class="appr-bg-grid">
        <div class="appr-bg-card">
          <label>Fondo modo oscuro</label>
          <input type="file" name="site_bg_dark" accept="image/*">
          ${bgD?`<img class="appr-bg-preview" src="${h(ctx,bgD)}" alt=""><label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin-top:8px"><input type="checkbox" name="remove_bg_dark" value="1" style="width:auto;margin:0"> Quitar fondo</label>`:""}
        </div>
        <div class="appr-bg-card">
          <label>Fondo modo claro</label>
          <input type="file" name="site_bg_light" accept="image/*">
          ${bgL?`<img class="appr-bg-preview" src="${h(ctx,bgL)}" alt=""><label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin-top:8px"><input type="checkbox" name="remove_bg_light" value="1" style="width:auto;margin:0"> Quitar fondo</label>`:""}
        </div>
      </div>
      ${sliderRow(ctx,"site_bg_blur","Difuminar fondo","Controla que tan borroso se ve el fondo subido.","ri-contrast-drop-2-line",0,24,"px")}
      ${sliderRow(ctx,"site_bg_overlay","Capa superior","Mas alto = contenido mas legible encima del fondo.","ri-blur-off-line",0,85,"%")}
      ${toggleRow("show_background_grid","Mostrar grid futurista","Rejilla decorativa de fondo.","ri-grid-line",g(ctx.db,"show_background_grid")==="1")}
    </div>
  </form>

  <!-- MODO OSCURO -->
  <form class="appr-card" data-section="dark-colors" method="POST" action="/admin/appearance/save">
    <input type="hidden" name="__section" value="dark-colors">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-moon-line"></i> Modo oscuro</h2>
        <p>Personaliza la apariencia de tu tienda en modo oscuro.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar cambios</button>
    </div>
    <div class="appr-card-body">
      ${COLORS_DARK.map(c=>colorRow(ctx,c[0],c[1],c[2],c[3])).join("")}
    </div>
  </form>

  <!-- MODO CLARO -->
  <form class="appr-card" data-section="light-colors" method="POST" action="/admin/appearance/save">
    <input type="hidden" name="__section" value="light-colors">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-sun-line"></i> Modo claro</h2>
        <p>Personaliza la apariencia de tu tienda en modo claro.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar cambios</button>
    </div>
    <div class="appr-card-body">
      ${COLORS_LIGHT.map(c=>colorRow(ctx,c[0],c[1],c[2],c[3])).join("")}
    </div>
  </form>

  <!-- ESTILO VISUAL -->
  <form class="appr-card" data-section="visual" method="POST" action="/admin/appearance/save">
    <input type="hidden" name="__section" value="visual">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-paint-brush-line"></i> Estilo visual</h2>
        <p>Personaliza el estilo visual de las tarjetas, botones y elementos.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar</button>
    </div>
    <div class="appr-card-body">
      ${sliderRow(ctx,"ui_radius","Redondeado","Que tan redondas se ven las tarjetas y botones.","ri-shape-line",6,34,"px")}
      ${sliderRow(ctx,"ui_glow_strength","Brillo neon","Intensidad de sombras y brillo futurista.","ri-flashlight-line",0,80,"")}
      ${sliderRow(ctx,"ui_card_opacity","Transparencia de tarjetas","Mas bajo = tarjetas mas transparentes.","ri-contrast-2-line",45,100,"%")}
    </div>
  </form>

  <!-- EFECTOS ANIMADOS -->
  <form class="appr-card" data-section="effects" method="POST" action="/admin/appearance/save">
    <input type="hidden" name="__section" value="effects">
    <div class="appr-card-head">
      <div>
        <h2><i class="ri-sparkling-2-line"></i> Efectos animados</h2>
        <p>Configura los efectos animados para los diferentes modos.</p>
      </div>
      <button class="appr-save-btn"><i class="ri-save-line"></i> Guardar</button>
    </div>
    <div class="appr-card-body">
      ${selectRow(ctx,"admin_effect_dark","Admin modo oscuro","Efecto del panel admin en modo oscuro.","ri-shield-star-line",effects)}
      ${selectRow(ctx,"admin_effect_light","Admin modo claro","Efecto del panel admin en modo claro.","ri-shield-line",effects)}
      ${selectRow(ctx,"client_effect_dark","Cliente modo oscuro","Efecto del dashboard cliente en modo oscuro.","ri-user-star-line",effects)}
      ${selectRow(ctx,"client_effect_light","Cliente modo claro","Efecto del dashboard cliente en modo claro.","ri-user-line",effects)}
    </div>
  </form>

  <div class="appr-global">
    <form method="POST" action="/admin/appearance/reset" onsubmit="return confirm('Restablecer todos los colores y efectos de fabrica?')">
      <button class="appr-reset-btn"><i class="ri-restart-line"></i> Restablecer colores de fabrica</button>
    </form>
    <button type="button" class="appr-save-all" id="apprSaveAll"><i class="ri-save-3-line"></i> Guardar todos los cambios</button>
  </div>
</div>

<div class="appr-toast" id="apprToast"><i class="ri-checkbox-circle-line"></i><span>Guardado</span></div>

<script>
(function(){
  // Sliders: actualizar el valor mostrado en vivo
  document.querySelectorAll('.appr-slider input[type=range]').forEach(function(inp){
    var lbl=inp.parentElement.querySelector('.appr-slider-value');
    var sfx=inp.dataset.suffix||'';
    inp.addEventListener('input',function(){lbl.textContent=inp.value+sfx;});
  });
  // Color: actualizar el hex mostrado
  document.querySelectorAll('input[type=color][data-hex]').forEach(function(inp){
    var lbl=document.querySelector('.appr-color-hex[data-for="'+inp.dataset.hex+'"]');
    inp.addEventListener('input',function(){if(lbl)lbl.textContent=inp.value.toUpperCase();applyLivePreview(inp.dataset.hex,inp.value);});
  });
  // Live preview: actualiza CSS variables al vuelo
  function applyLivePreview(key,value){
    var root=document.documentElement.style;
    var map={
      theme_dark_bg:'--dark-bg',theme_dark_card:'--dark-card',theme_dark_text:'--dark-text',
      theme_dark_muted:'--dark-muted',theme_dark_accent:'--dark-accent',theme_dark_accent_2:'--dark-accent-2',theme_dark_border:'--dark-border',
      theme_dark_topbar:'--dark-topbar',theme_dark_nav:'--dark-nav',theme_dark_button:'--dark-button',theme_dark_danger:'--dark-danger',
      theme_light_bg:'--light-bg',theme_light_card:'--light-card',theme_light_text:'--light-text',
      theme_light_muted:'--light-muted',theme_light_accent:'--light-accent',theme_light_accent_2:'--light-accent-2',theme_light_border:'--light-border',
      theme_light_topbar:'--light-topbar',theme_light_nav:'--light-nav',theme_light_button:'--light-button',theme_light_danger:'--light-danger'
    };
    if(map[key])root.setProperty(map[key],value);
  }
  // Toast
  var toast=document.getElementById('apprToast');
  function showToast(msg,err){
    toast.querySelector('span').textContent=msg||'Guardado';
    toast.classList.toggle('error',!!err);
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t=setTimeout(function(){toast.classList.remove('show');},2200);
  }
  // Submit AJAX por seccion
  document.querySelectorAll('form.appr-card').forEach(function(form){
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var btn=form.querySelector('.appr-save-btn');
      var orig=btn.innerHTML;
      btn.innerHTML='<i class="ri-loader-4-line"></i> Guardando...';
      btn.disabled=true;
      var data=new FormData(form);
      // Asegurar checkboxes desmarcados
      form.querySelectorAll('input[type=checkbox]').forEach(function(c){if(!c.checked)data.set(c.name,'0');});
      fetch(form.action,{method:'POST',body:data,headers:{'X-Requested-With':'fetch'}})
        .then(function(r){return r.ok?r.json():Promise.reject(r);})
        .then(function(){
          btn.innerHTML='<i class="ri-checkbox-circle-line"></i> Guardado';
          btn.classList.add('is-saved');
          showToast('Cambios guardados');
          setTimeout(function(){btn.innerHTML=orig;btn.classList.remove('is-saved');btn.disabled=false;},1500);
        })
        .catch(function(){
          btn.innerHTML=orig;
          btn.disabled=false;
          showToast('Error al guardar',true);
        });
    });
  });
  // Boton Guardar todos los cambios
  document.getElementById('apprSaveAll').addEventListener('click',function(){
    var forms=Array.from(document.querySelectorAll('form.appr-card'));
    var p=Promise.resolve();
    forms.forEach(function(f){
      p=p.then(function(){
        var data=new FormData(f);
        f.querySelectorAll('input[type=checkbox]').forEach(function(c){if(!c.checked)data.set(c.name,'0');});
        return fetch(f.action,{method:'POST',body:data,headers:{'X-Requested-With':'fetch'}});
      });
    });
    p.then(function(){showToast('Todos los cambios guardados');}).catch(function(){showToast('Error guardando',true);});
  });
})();
</script>`});
  });
  return r;
}

module.exports={config,router};
