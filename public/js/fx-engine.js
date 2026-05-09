/* =========================================================
   FX ENGINE — animaciones canvas (electricidad, lluvia,
   estrellas fugaces, truenos). Auto-detecta el efecto activo
   segun las clases del body y se actualiza al toggle de tema.
   ========================================================= */
(function(){
  if (typeof window === 'undefined') return;
  if (window.__fxEngineLoaded) return;
  window.__fxEngineLoaded = true;

  var reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function makeCanvas(){
    var layer = document.querySelector('.effect-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'effect-layer';
      document.body.insertBefore(layer, document.body.firstChild);
    }
    var c = layer.querySelector('canvas.fx-canvas');
    if (!c){
      c = document.createElement('canvas');
      c.className = 'fx-canvas';
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block';
      layer.appendChild(c);
    }
    return c;
  }

  var canvas = makeCanvas();
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  var raf = 0, lastT = 0;
  var current = null;
  var state = {};
  var visible = true;

  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (current && effects[current] && effects[current].resize)
      effects[current].resize();
  }

  function rand(a,b){ return a + Math.random()*(b-a); }
  function chance(p){ return Math.random() < p; }

  // ===================== ELECTRICIDAD (rayos cyan/morado) =====================
  function drawBolt(x1,y1,x2,y2,offset,color){
    if (offset < 4){
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }
    var mx = (x1+x2)/2 + (Math.random()-.5)*offset;
    var my = (y1+y2)/2 + (Math.random()-.5)*offset;
    drawBolt(x1,y1,mx,my,offset/2,color);
    drawBolt(mx,my,x2,y2,offset/2,color);
    if (chance(.18)){
      var bx = mx + (Math.random()-.5)*offset*1.4;
      var by = my + Math.random()*offset*1.4;
      drawBolt(mx,my,bx,by,offset/2.4,color);
    }
  }

  var electric = {
    init: function(){
      state.bolts = [];
      state.next = 0;
      state.flash = 0;
    },
    resize: function(){},
    draw: function(t, dt){
      // flash de fondo cuando hay rayo cercano
      if (state.flash > 0){
        ctx.fillStyle = 'rgba(120,80,255,'+(state.flash*.18)+')';
        ctx.fillRect(0,0,W,H);
        state.flash -= dt*0.0035;
      }
      // disparar rayo nuevo
      if (t > state.next){
        state.next = t + rand(900, 2400);
        var color = chance(.5) ? '#00f3ff' : '#bc13fe';
        var sx = rand(0, W);
        var ex = sx + rand(-W*.4, W*.4);
        state.bolts.push({
          sx: sx, sy: -20,
          ex: ex, ey: H + 20,
          color: color,
          life: 1.0,
          path: null
        });
        state.flash = 1;
      }
      // dibujar y caducar rayos
      for (var i = state.bolts.length - 1; i >= 0; i--){
        var b = state.bolts[i];
        // glow
        ctx.save();
        ctx.shadowBlur = 24;
        ctx.shadowColor = b.color;
        ctx.lineCap = 'round';
        ctx.globalAlpha = b.life;
        ctx.lineWidth = 2.6;
        // dibujar rayo recursivo
        drawBolt(b.sx, b.sy, b.ex, b.ey, Math.min(W,H)*0.18, b.color);
        // segundo trazo blanco mas fino
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = b.life*0.85;
        drawBolt(b.sx, b.sy, b.ex, b.ey, Math.min(W,H)*0.16, '#ffffff');
        ctx.restore();
        b.life -= dt*0.005;
        if (b.life <= 0) state.bolts.splice(i,1);
      }
    }
  };

  // ===================== LLUVIA =====================
  var rain = {
    init: function(){
      var n = Math.min(220, Math.max(80, Math.floor(W*H/9000)));
      state.drops = [];
      for (var i=0;i<n;i++){
        state.drops.push({
          x: Math.random()*W,
          y: Math.random()*H,
          len: rand(10,22),
          vy: rand(380, 720),
          vx: rand(-90,-50),
          a: rand(.35,.85)
        });
      }
      state.splashes = [];
    },
    resize: function(){ this.init(); },
    draw: function(t, dt){
      var isLight = document.body.classList.contains('light');
      var col = isLight ? 'rgba(37,99,235,' : 'rgba(180,210,255,';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.4;
      for (var i=0; i<state.drops.length; i++){
        var d = state.drops[i];
        ctx.strokeStyle = col + d.a + ')';
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.vx*0.012, d.y + d.len);
        ctx.stroke();
        d.x += d.vx * dt * 0.001;
        d.y += d.vy * dt * 0.001;
        if (d.y > H){
          if (chance(.6)){
            state.splashes.push({x:d.x, y:H-2, r:1, a:.6});
          }
          d.y = -10;
          d.x = Math.random()*W*1.2;
        }
        if (d.x < -30) d.x = W + 20;
      }
      // splashes
      for (var j=state.splashes.length-1; j>=0; j--){
        var s = state.splashes[j];
        ctx.strokeStyle = col + s.a + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, Math.PI, 2*Math.PI);
        ctx.stroke();
        s.r += dt*0.04;
        s.a -= dt*0.002;
        if (s.a <= 0) state.splashes.splice(j,1);
      }
    }
  };

  // ===================== ESTRELLAS FUGACES =====================
  var stars = {
    init: function(){
      var n = Math.min(180, Math.max(60, Math.floor(W*H/14000)));
      state.dots = [];
      for (var i=0;i<n;i++){
        state.dots.push({
          x: Math.random()*W,
          y: Math.random()*H,
          r: rand(.4, 1.6),
          base: rand(.2,.7),
          phase: Math.random()*Math.PI*2,
          speed: rand(.0006, .0024)
        });
      }
      state.shoot = [];
      state.next = 0;
    },
    resize: function(){ this.init(); },
    draw: function(t, dt){
      var isLight = document.body.classList.contains('light');
      // estrellas fijas que titilan
      for (var i=0;i<state.dots.length;i++){
        var d = state.dots[i];
        var a = d.base + Math.sin(t*d.speed + d.phase)*0.4;
        if (a < 0) a = 0;
        ctx.fillStyle = isLight ? 'rgba(80,120,255,'+a+')' : 'rgba(255,255,255,'+a+')';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI*2);
        ctx.fill();
      }
      // estrella fugaz nueva
      if (t > state.next){
        state.next = t + rand(1800, 4500);
        state.shoot.push({
          x: rand(-W*.1, W*.7),
          y: rand(-20, H*.4),
          vx: rand(420, 720),
          vy: rand(180, 320),
          life: 1.0,
          tail: []
        });
      }
      // dibujar fugaces con cola
      for (var k=state.shoot.length-1; k>=0; k--){
        var s = state.shoot[k];
        s.tail.unshift({x:s.x, y:s.y});
        if (s.tail.length > 18) s.tail.pop();
        // cola degradada
        for (var p=0; p<s.tail.length; p++){
          var pt = s.tail[p];
          var aa = (1 - p/s.tail.length)*s.life;
          ctx.fillStyle = isLight ? 'rgba(56,148,255,'+aa+')' : 'rgba(0,243,255,'+aa+')';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2 - p*0.08, 0, Math.PI*2);
          ctx.fill();
        }
        // cabeza brillante
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = isLight ? '#3894ff' : '#00f3ff';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.4, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
        s.x += s.vx*dt*0.001;
        s.y += s.vy*dt*0.001;
        s.life -= dt*0.0006;
        if (s.x > W + 100 || s.y > H + 100 || s.life <= 0) state.shoot.splice(k,1);
      }
    }
  };

  // ===================== TRUENOS =====================
  var thunder = {
    init: function(){
      state.next = 0;
      state.flashList = [];
      state.bolts = [];
    },
    resize: function(){},
    draw: function(t, dt){
      // disparar trueno
      if (t > state.next){
        state.next = t + rand(2800, 6500);
        // secuencia: flash -> oscuridad -> flash mas fuerte
        state.flashList.push({a:.55, fade:0.0038, delay:0});
        state.flashList.push({a:.92, fade:0.0030, delay:140});
        // rayo visible
        var sx = rand(W*.2, W*.85);
        var ex = sx + rand(-180, 180);
        state.bolts.push({
          sx: sx, sy: -20,
          ex: ex, ey: H*.7,
          life: 1.0,
          delay: 80
        });
      }
      // pintar flashes
      var isLight = document.body.classList.contains('light');
      for (var i=state.flashList.length-1; i>=0; i--){
        var f = state.flashList[i];
        f.delay -= dt;
        if (f.delay > 0) continue;
        ctx.fillStyle = isLight ? 'rgba(255,255,255,'+f.a+')' : 'rgba(180,200,255,'+f.a+')';
        ctx.fillRect(0,0,W,H);
        f.a -= f.fade*dt;
        if (f.a <= 0) state.flashList.splice(i,1);
      }
      // pintar rayos
      for (var j=state.bolts.length-1; j>=0; j--){
        var b = state.bolts[j];
        b.delay -= dt;
        if (b.delay > 0) continue;
        ctx.save();
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#dde8ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round';
        ctx.globalAlpha = b.life;
        ctx.lineWidth = 3;
        drawBolt(b.sx, b.sy, b.ex, b.ey, Math.min(W,H)*0.15, '#ffffff');
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#88aaff';
        ctx.strokeStyle = '#cfe0ff';
        ctx.lineWidth = 1.2;
        drawBolt(b.sx, b.sy, b.ex, b.ey, Math.min(W,H)*0.13, '#cfe0ff');
        ctx.restore();
        b.life -= dt*0.0028;
        if (b.life <= 0) state.bolts.splice(j,1);
      }
    }
  };

  var effects = {
    electric: electric,
    rain: rain,
    stars: stars,
    thunder: thunder
  };

  function detectEffect(){
    var cls = document.body.classList;
    var isLight = cls.contains('light');
    var prefix = 'effect-' + (isLight ? 'light' : 'dark') + '-';
    for (var i=0; i<cls.length; i++){
      var c = cls.item(i);
      if (c && c.indexOf(prefix) === 0){
        var name = c.slice(prefix.length);
        return name === 'none' ? null : name;
      }
    }
    return null;
  }

  function loop(t){
    raf = 0;
    if (!visible) return;
    var dt = lastT ? Math.min(t - lastT, 60) : 16;
    lastT = t;
    ctx.clearRect(0, 0, W, H);
    if (current && effects[current]) effects[current].draw(t, dt);
    raf = requestAnimationFrame(loop);
  }

  function start(){
    if (reduced.matches){
      ctx.clearRect(0, 0, W, H);
      return;
    }
    var next = detectEffect();
    if (next !== current){
      current = next;
      ctx.clearRect(0, 0, W, H);
      if (current && effects[current]) effects[current].init();
    }
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function stop(){
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
  }

  resize();
  window.addEventListener('resize', function(){ resize(); start(); });
  document.addEventListener('visibilitychange', function(){
    visible = document.visibilityState === 'visible';
    if (visible) start(); else stop();
  });

  // observar cambios de clase del body (light/dark, cambio de efecto)
  var mo = new MutationObserver(function(){ start(); });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  start();
})();
