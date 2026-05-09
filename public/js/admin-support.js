"use strict";
(function(){
  var dataEl = document.getElementById("spInitData");
  var _spData = [];
  if (dataEl) { try { _spData = JSON.parse(dataEl.textContent || "[]"); } catch(e) { _spData = []; } }

  function _spE(v){ return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

  function spToast(msg, isErr){
    var t = document.getElementById("spToast");
    if (!t) return;
    var span = t.querySelector("span");
    if (span) span.textContent = msg || "Guardado";
    t.classList.toggle("err", !!isErr);
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(function(){ t.classList.remove("show"); }, 2200);
  }

  function spTab(t){
    var c = document.getElementById("spPanelContact");
    var s = document.getElementById("spPanelSlides");
    if (c) c.style.display = t==="contact" ? "block" : "none";
    if (s) s.style.display = t==="slides" ? "block" : "none";
    var btns = document.querySelectorAll(".sp-tab");
    btns.forEach(function(b){ b.classList.remove("active"); });
    btns.forEach(function(b){
      if (b.getAttribute("data-tab") === t) b.classList.add("active");
    });
    try { history.replaceState(null, "", "/admin/support" + (t==="slides"?"?tab=slides":"")); } catch(e) {}
  }
  function spSync(i,f,v){ if(_spData[i]) _spData[i][f]=v; }
  function spAdd(){ _spData.push({text:"",subtitle:"",colorFrom:"#4c1d95",colorTo:"#7c3aed",image:""}); spRender(); }
  function spDel(i){
    if(!confirm("¿Eliminar slide "+(i+1)+"? Esto se guardará automáticamente.")) return;
    _spData.splice(i,1);
    spRender();
    spSaveAll(true);
  }
  function spMove(i,d){
    var j=i+d; if(j<0||j>=_spData.length) return;
    var t=_spData[i]; _spData[i]=_spData[j]; _spData[j]=t;
    spRender();
    spSaveAll(true);
  }
  function spRmImg(i){ if(!_spData[i]) return; _spData[i].image=""; spRenderItem(i); }

  function spUpload(inp,i){
    if (!inp.files || !inp.files[0]) return;
    var btnLabel = document.querySelector('label[for="spf'+i+'"]');
    var origLabel = btnLabel ? btnLabel.innerHTML : null;
    if (btnLabel) btnLabel.innerHTML = '<i class="ri-loader-4-line spin"></i> Subiendo...';
    var fd = new FormData();
    fd.append("image", inp.files[0]);
    fetch("/admin/support/upload-image", { method:"POST", body:fd })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d && d.ok) {
          if (_spData[i]) _spData[i].image = d.path;
          spRenderItem(i);
          spToast("Imagen subida");
        } else {
          if (btnLabel && origLabel) btnLabel.innerHTML = origLabel;
          spToast((d && d.error) ? d.error : "No se pudo subir la imagen", true);
        }
      })
      .catch(function(){
        if (btnLabel && origLabel) btnLabel.innerHTML = origLabel;
        spToast("Error al subir imagen", true);
      });
  }

  function buildSlideHtml(s, i){
    var cf = _spE(s.colorFrom||"#4c1d95"), ct = _spE(s.colorTo||"#7c3aed");
    // Preview con CSS classes solamente. La imagen y los colores se aplican
    // despues por DOM property, evitando cualquier problema de escape de
    // comillas en el atributo style del HTML.
    var prevHtml =
      '<div class="sp-preview" data-slide-preview="'+i+'">'+
        '<div class="sp-preview-overlay" data-slide-overlay="'+i+'"></div>'+
        '<div class="sp-preview-text">'+
          '<div class="sp-preview-title">'+_spE(s.text||"Texto del slide")+'</div>'+
          '<div class="sp-preview-sub">'+_spE(s.subtitle||"Subtítulo")+'</div>'+
        '</div>'+
      '</div>';
    var imgArea = '<div class="sp-img-area">'+
      (s.image
        ? '<div class="sp-cur-img"><img src="'+_spE(s.image)+'" alt=""><button type="button" class="sp-rm-img" data-act="rmimg" data-idx="'+i+'"><i class="ri-close-line"></i></button></div>'
        : '')+
      '<label class="sp-up-btn" for="spf'+i+'"><i class="ri-image-add-line"></i> '+(s.image?"Cambiar imagen":"Subir imagen de fondo")+'</label>'+
      '<input type="file" id="spf'+i+'" accept="image/*" style="display:none" data-act="upload" data-idx="'+i+'">'+
    '</div>';
    return '<div class="sp-slide-item" data-slide-idx="'+i+'">'+
      '<div class="sp-slide-hd"><span class="sp-slide-n">Slide '+(i+1)+'</span>'+
      '<div class="sp-slide-acts">'+
        '<button type="button" class="sp-icon-btn" data-act="up" data-idx="'+i+'" title="Subir"><i class="ri-arrow-up-s-line"></i></button>'+
        '<button type="button" class="sp-icon-btn" data-act="down" data-idx="'+i+'" title="Bajar"><i class="ri-arrow-down-s-line"></i></button>'+
        '<button type="button" class="sp-icon-btn danger" data-act="del" data-idx="'+i+'" title="Eliminar"><i class="ri-delete-bin-line"></i></button>'+
      '</div></div>'+
      '<div class="sp-slide-body">'+
        '<div class="sp-field"><label>Texto principal</label><input type="text" value="'+_spE(s.text)+'" data-sync="text" data-idx="'+i+'" placeholder="Texto principal"></div>'+
        '<div class="sp-field"><label>Subtítulo</label><input type="text" value="'+_spE(s.subtitle)+'" data-sync="subtitle" data-idx="'+i+'" placeholder="Subtítulo del slide"></div>'+
        '<div class="sp-2col">'+
          '<div class="sp-field"><label>Color inicial</label><div class="sp-color">'+
            '<input type="color" value="'+cf+'" data-sync="colorFrom" data-idx="'+i+'" data-pair="next">'+
            '<input type="text" value="'+cf+'" maxlength="7" data-sync="colorFrom" data-idx="'+i+'" data-pair="prev"></div></div>'+
          '<div class="sp-field"><label>Color final</label><div class="sp-color">'+
            '<input type="color" value="'+ct+'" data-sync="colorTo" data-idx="'+i+'" data-pair="next">'+
            '<input type="text" value="'+ct+'" maxlength="7" data-sync="colorTo" data-idx="'+i+'" data-pair="prev"></div></div>'+
        '</div>'+
        prevHtml+
        '<div class="sp-field" style="margin-top:12px;"><label>Imagen de fondo (opcional)</label>'+imgArea+'</div>'+
        '<div class="sp-actions sp-slide-save">'+
          '<button type="button" class="sp-btn primary sp-btn-sm" data-act="save-one" data-idx="'+i+'"><i class="ri-save-line"></i> Guardar este slide</button>'+
        '</div>'+
      '</div></div>';
  }

  // Aplica colores e imagen al preview de un slide via DOM (NO inline HTML)
  function spApplyPreview(i){
    var s = _spData[i]; if (!s) return;
    var prev = document.querySelector('[data-slide-preview="'+i+'"]');
    var ovl = document.querySelector('[data-slide-overlay="'+i+'"]');
    if (!prev) return;
    var cf = s.colorFrom || "#4c1d95";
    var ct = s.colorTo || "#7c3aed";
    if (s.image) {
      // Asignar imagen por DOM property: el navegador no parsea atributos
      // HTML aqui, asi que cualquier ruta es segura.
      prev.style.backgroundImage = "url(" + JSON.stringify(s.image) + ")";
      prev.style.backgroundColor = "transparent";
      if (ovl) {
        ovl.style.background = "linear-gradient(135deg," + cf + "66," + ct + "88)";
        ovl.style.display = "";
      }
    } else {
      prev.style.backgroundImage = "linear-gradient(135deg," + cf + "," + ct + ")";
      prev.style.backgroundColor = "";
      if (ovl) ovl.style.display = "none";
    }
  }

  function spApplyAllPreviews(){
    for (var i = 0; i < _spData.length; i++) spApplyPreview(i);
  }

  function spRender(){
    var el = document.getElementById("spList");
    if (!el) return;
    var ct = document.getElementById("spSlidesCount");
    if (ct) ct.textContent = _spData.length + " slide" + (_spData.length===1?"":"s");
    if (!_spData.length) {
      el.innerHTML = '<div class="sp-empty">No hay slides. Haz clic en "Agregar slide".</div>';
      return;
    }
    el.innerHTML = _spData.map(buildSlideHtml).join("");
    spApplyAllPreviews();
  }

  // Re-render solo del slide en el indice i, conservando estado de otros campos
  function spRenderItem(i){
    var item = document.querySelector('.sp-slide-item[data-slide-idx="'+i+'"]');
    if (!item) { spRender(); return; }
    var tmp = document.createElement("div");
    tmp.innerHTML = buildSlideHtml(_spData[i], i);
    var fresh = tmp.firstChild;
    if (fresh) item.parentNode.replaceChild(fresh, item);
    spApplyPreview(i);
  }

  function spSaveOne(i, silent){
    var btn = document.querySelector('[data-act="save-one"][data-idx="'+i+'"]');
    var orig = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Guardando...'; }
    return fetch("/admin/support/save-slide", {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-Requested-With":"fetch", "Accept":"application/json" },
      body: JSON.stringify({ index: i, slide: _spData[i] })
    }).then(function(r){ return r.ok ? r.json() : Promise.reject(r); })
      .then(function(){
        if (btn) {
          btn.innerHTML = '<i class="ri-checkbox-circle-line"></i> Guardado';
          btn.classList.add("ok");
          setTimeout(function(){
            btn.innerHTML = orig || '<i class="ri-save-line"></i> Guardar este slide';
            btn.classList.remove("ok");
            btn.disabled = false;
          }, 1400);
        }
        if (!silent) spToast("Slide "+(i+1)+" guardado");
      })
      .catch(function(){
        if (btn) { btn.innerHTML = orig || '<i class="ri-save-line"></i> Guardar este slide'; btn.disabled = false; }
        spToast("Error al guardar slide", true);
      });
  }

  function spSaveAll(silent){
    var btn = document.querySelector('[data-act="save-all"]');
    var orig = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Guardando...'; }
    return fetch("/admin/support/save-slides", {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-Requested-With":"fetch", "Accept":"application/json" },
      body: JSON.stringify({ slides: _spData })
    }).then(function(r){ return r.ok ? r.json() : Promise.reject(r); })
      .then(function(){
        if (btn) {
          btn.innerHTML = '<i class="ri-checkbox-circle-line"></i> Guardado';
          btn.classList.add("ok");
          setTimeout(function(){
            btn.innerHTML = orig || '<i class="ri-save-line"></i> Guardar todos los slides';
            btn.classList.remove("ok");
            btn.disabled = false;
          }, 1500);
        }
        if (!silent) spToast("Todos los slides guardados");
      })
      .catch(function(){
        if (btn) { btn.innerHTML = orig || '<i class="ri-save-line"></i> Guardar todos los slides'; btn.disabled = false; }
        spToast("Error al guardar", true);
      });
  }

  function spResetFactory(){
    if (!confirm("¿Restablecer TODOS los slides a los valores de fábrica? Esto reemplaza tus slides actuales.")) return;
    var btn = document.querySelector('[data-act="reset-factory"]');
    var orig = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Restableciendo...'; }
    fetch("/admin/support/reset-slides", {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-Requested-With":"fetch", "Accept":"application/json" },
      body: "{}"
    }).then(function(r){ return r.ok ? r.json() : Promise.reject(r); })
      .then(function(d){
        if (d && d.slides) _spData = d.slides.slice();
        spRender();
        if (btn) {
          btn.innerHTML = '<i class="ri-checkbox-circle-line"></i> Restablecido';
          setTimeout(function(){ btn.innerHTML = orig || '<i class="ri-restart-line"></i> Restablecer de fábrica'; btn.disabled = false; }, 1600);
        }
        spToast("Slides restablecidos a fábrica");
      })
      .catch(function(){
        if (btn) { btn.innerHTML = orig || '<i class="ri-restart-line"></i> Restablecer de fábrica'; btn.disabled = false; }
        spToast("Error al restablecer", true);
      });
  }

  function spSaveContact(form){
    var btn = form.querySelector('button[type="submit"]');
    var orig = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Guardando...'; }
    var data = new FormData(form);
    fetch(form.action, {
      method: "POST",
      body: data,
      headers: { "X-Requested-With": "fetch", "Accept": "application/json" }
    }).then(function(r){ return r.ok ? r.json() : Promise.reject(r); })
      .then(function(){
        if (btn) {
          btn.innerHTML = '<i class="ri-checkbox-circle-line"></i> Guardado';
          setTimeout(function(){ btn.innerHTML = orig; btn.disabled = false; }, 1500);
        }
        spToast("Contacto guardado");
      })
      .catch(function(){
        if (btn) { btn.innerHTML = orig; btn.disabled = false; }
        spToast("Error al guardar", true);
      });
  }

  // Event delegation - handles all dynamic + initial buttons
  document.addEventListener("click", function(e){
    var t = e.target;
    var tabBtn = t.closest ? t.closest("[data-tab]") : null;
    if (tabBtn && tabBtn.classList.contains("sp-tab")) { spTab(tabBtn.getAttribute("data-tab")); return; }

    var addBtn = t.closest ? t.closest("[data-act='add']") : null;
    if (addBtn) { spAdd(); return; }

    var saveAllBtn = t.closest ? t.closest("[data-act='save-all']") : null;
    if (saveAllBtn) { spSaveAll(); return; }

    var resetBtn = t.closest ? t.closest("[data-act='reset-factory']") : null;
    if (resetBtn) { spResetFactory(); return; }

    var saveOneBtn = t.closest ? t.closest("[data-act='save-one']") : null;
    if (saveOneBtn) { spSaveOne(parseInt(saveOneBtn.getAttribute("data-idx"), 10)); return; }

    var actBtn = t.closest ? t.closest("[data-act][data-idx]") : null;
    if (actBtn) {
      var i = parseInt(actBtn.getAttribute("data-idx"), 10);
      var act = actBtn.getAttribute("data-act");
      if (act === "up") spMove(i, -1);
      else if (act === "down") spMove(i, 1);
      else if (act === "del") spDel(i);
      else if (act === "rmimg") spRmImg(i);
    }
  });

  document.addEventListener("input", function(e){
    var t = e.target;
    if (!t.hasAttribute) return;
    if (t.hasAttribute("data-sync")) {
      var i = parseInt(t.getAttribute("data-idx"), 10);
      var f = t.getAttribute("data-sync");
      spSync(i, f, t.value);
      var pair = t.getAttribute("data-pair");
      if (pair === "next" && t.nextElementSibling) t.nextElementSibling.value = t.value;
      else if (pair === "prev" && t.previousElementSibling) t.previousElementSibling.value = t.value;
      // Actualizar preview en vivo del slide afectado (sin recrear inputs)
      spApplyPreview(i);
      var prev = document.querySelector('[data-slide-preview="'+i+'"]');
      if (prev) {
        var s = _spData[i];
        var titleEl = prev.querySelector('.sp-preview-title');
        var subEl = prev.querySelector('.sp-preview-sub');
        if (titleEl) titleEl.textContent = s.text || "Texto del slide";
        if (subEl) subEl.textContent = s.subtitle || "Subtítulo";
      }
    }
  });

  document.addEventListener("change", function(e){
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-act") === "upload") {
      var i = parseInt(t.getAttribute("data-idx"), 10);
      spUpload(t, i);
    }
  });

  // AJAX form para "Soporte" (correo + WhatsApp)
  document.addEventListener("submit", function(e){
    var f = e.target;
    if (f && f.getAttribute && f.getAttribute("action") === "/admin/support/save-contact") {
      e.preventDefault();
      spSaveContact(f);
    }
  });

  // Render on load (replaces server-rendered to keep IDs/handlers consistent)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", spRender);
  } else {
    spRender();
  }
})();
