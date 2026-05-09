/* Sistema de tickets — chat con upload de imagen/video y progreso */
(function(){
  function $(s,c){return (c||document).querySelector(s);}
  function $$(s,c){return Array.from((c||document).querySelectorAll(s));}

  // Auto-scroll al final del chat
  var body = $('.tk-chat-body');
  if(body){body.scrollTop = body.scrollHeight;}

  // Modal nuevo ticket
  window.tkOpenNew = function(){var m=$('#tkNewModal');if(m){m.classList.add('show');document.body.style.overflow='hidden';}};
  window.tkCloseNew = function(){var m=$('#tkNewModal');if(m){m.classList.remove('show');document.body.style.overflow='';}};
  document.addEventListener('click',function(ev){
    var m=$('.tk-modal.show');
    if(m && ev.target===m)tkCloseNew();
  });

  // Filtros
  window.tkFilter = function(){
    var q = ($('#tkSearch')?.value||'').toLowerCase();
    var st = ($('#tkStatus')?.value||'all');
    $$('.tk-list .tk-card').forEach(function(c){
      var txt = c.innerText.toLowerCase();
      var s = c.getAttribute('data-status');
      var ok = txt.indexOf(q)>=0 && (st==='all' || s===st);
      c.style.display = ok ? '' : 'none';
    });
  };

  // Form de chat con barra de progreso
  var form = $('#tkChatForm');
  if(form){
    var fileInput = $('input[type=file]', form);
    var preview = $('#tkAttachPreview');
    var previewName = $('#tkAttachPreviewName');
    var clearBtn = $('#tkAttachClear');
    var progress = $('#tkProgress');
    var progressBar = $('#tkProgressBar');
    var progressLabel = $('#tkProgressLabel');
    var sendBtn = $('.tk-send-btn', form);
    var textarea = $('textarea', form);

    fileInput && fileInput.addEventListener('change', function(){
      if(fileInput.files && fileInput.files[0]){
        var f = fileInput.files[0];
        previewName.textContent = f.name + ' · ' + Math.round(f.size/1024) + ' KB';
        preview.classList.add('show');
      }
    });
    clearBtn && clearBtn.addEventListener('click', function(){
      fileInput.value = '';
      preview.classList.remove('show');
    });

    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      var hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
      var hasText = textarea && textarea.value.trim().length > 0;
      if(!hasFile && !hasText){
        textarea && textarea.focus();
        return;
      }
      var fd = new FormData(form);
      var xhr = new XMLHttpRequest();
      sendBtn.disabled = true;
      if(hasFile){
        progress.classList.add('show');
        progressBar.style.width = '0%';
        progressLabel && (progressLabel.textContent = 'Subiendo... 0%');
      }
      xhr.upload.addEventListener('progress', function(e){
        if(e.lengthComputable){
          var pct = Math.round((e.loaded/e.total)*100);
          progressBar.style.width = pct + '%';
          progressLabel && (progressLabel.textContent = 'Subiendo... ' + pct + '%');
        }
      });
      xhr.addEventListener('load', function(){
        if(xhr.status >= 200 && xhr.status < 300){
          window.location.reload();
        } else {
          alert('Error al enviar el mensaje. Intenta de nuevo.');
          sendBtn.disabled = false;
          progress.classList.remove('show');
        }
      });
      xhr.addEventListener('error', function(){
        alert('Error de red. Intenta de nuevo.');
        sendBtn.disabled = false;
        progress.classList.remove('show');
      });
      xhr.open('POST', form.action);
      xhr.setRequestHeader('X-Requested-With', 'fetch');
      xhr.send(fd);
    });
  }

  // Auto-resize textarea
  $$('.tk-chat-textarea').forEach(function(t){
    t.addEventListener('input', function(){
      t.style.height = 'auto';
      t.style.height = Math.min(t.scrollHeight, 140) + 'px';
    });
  });
})();
