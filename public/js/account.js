/* Mi cuenta — avatar upload con progreso, password toggle, strength */
(function(){
  function $(s,c){return (c||document).querySelector(s);}

  // Password toggle
  window.accPwdToggle = function(btn){
    var inp = btn.parentElement.querySelector('input');
    if(inp.type === 'password'){ inp.type = 'text'; btn.querySelector('i').className = 'ri-eye-off-line'; }
    else { inp.type = 'password'; btn.querySelector('i').className = 'ri-eye-line'; }
  };

  // Password strength (mismo algoritmo que admin/users)
  window.accPwdStrength = function(input, wrap){
    var v = input.value || '';
    var score = 0;
    if(v.length >= 6) score++;
    if(v.length >= 10) score++;
    if(/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if(/[0-9]/.test(v)) score++;
    if(/[^A-Za-z0-9]/.test(v)) score++;
    var level = score <= 1 ? 'weak' : score <= 3 ? 'mid' : 'strong';
    var bars = wrap.querySelectorAll('.acc-pwd-bar');
    bars.forEach(function(b){ b.classList.remove('on-weak','on-mid','on-strong'); });
    var idx = level === 'weak' ? 1 : level === 'mid' ? 2 : 3;
    for(var i=0; i<idx; i++) bars[i].classList.add('on-'+level);
    var lbl = wrap.querySelector('.acc-pwd-label');
    lbl.classList.remove('l-weak','l-mid','l-strong');
    lbl.classList.add('l-'+level);
    lbl.textContent = level === 'weak' ? 'Débil' : level === 'mid' ? 'Media' : 'Fuerte';
    accPwdMatch();
  };

  // Match passwords
  window.accPwdMatch = function(){
    var p1 = document.querySelector('input[name="new_password"]');
    var p2 = document.querySelector('input[name="new_password2"]');
    var msg = $('#accPwdMatchMsg');
    if(!p1 || !p2 || !msg) return;
    if(!p2.value){ msg.textContent = ''; msg.className = 'acc-pwd-match'; return; }
    if(p1.value === p2.value){
      msg.textContent = '✓ Las contraseñas coinciden';
      msg.className = 'acc-pwd-match ok';
    } else {
      msg.textContent = '✗ Las contraseñas no coinciden';
      msg.className = 'acc-pwd-match bad';
    }
  };

  // Avatar upload con progreso
  var form = $('#avatarForm');
  var input = $('#avatarInput');
  var progress = $('#avatarProgress');
  var bar = $('#avatarProgressBar');
  var label = $('#avatarProgressLabel');
  var display = $('#accAvatarDisplay');

  if(form && input){
    input.addEventListener('change', function(){
      if(!input.files || !input.files[0]) return;
      var file = input.files[0];
      // Preview local mientras sube
      var reader = new FileReader();
      reader.onload = function(e){
        if(display) display.innerHTML = '<img src="'+e.target.result+'" alt="" style="opacity:.5">';
      };
      reader.readAsDataURL(file);

      var fd = new FormData();
      fd.append('avatar', file);
      var xhr = new XMLHttpRequest();
      progress.classList.add('show');
      bar.style.width = '0%';
      label.classList.add('show');
      label.textContent = 'Subiendo... 0%';
      xhr.upload.addEventListener('progress', function(e){
        if(e.lengthComputable){
          var pct = Math.round((e.loaded/e.total)*100);
          bar.style.width = pct + '%';
          label.textContent = 'Subiendo... ' + pct + '%';
        }
      });
      xhr.addEventListener('load', function(){
        if(xhr.status >= 200 && xhr.status < 300){
          label.textContent = '✓ Foto actualizada';
          setTimeout(function(){ window.location.href = '/account?ok=avatar'; }, 600);
        } else {
          var msg = 'Error al subir la imagen';
          try{ var r = JSON.parse(xhr.responseText); if(r.error) msg = r.error; }catch{}
          label.textContent = '✗ ' + msg;
          label.style.color = '#fb7185';
        }
      });
      xhr.addEventListener('error', function(){
        label.textContent = '✗ Error de red';
        label.style.color = '#fb7185';
      });
      xhr.open('POST', '/account/avatar');
      xhr.setRequestHeader('X-Requested-With', 'fetch');
      xhr.send(fd);
    });
  }
})();
