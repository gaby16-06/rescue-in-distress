 update: function (dt) {
      if (!S) return;
      S.t += dt;
      S.ready += dt;

      var i, p;
      for (i = 0; i < S.conf.length; i++) {
        p = S.conf[i];
        p.y += p.vy * dt;
        p.x += p.vx * dt + Math.sin(S.t * 2 + i) * 0.4;
        p.rot += p.spin * dt;
        if (p.y > CFG.H + 20) { p.y = -20; p.x = U.rand(0, CFG.W); }
      }

      if (S.done || S.ready < 1.2) return;
      if (api.input.pressed('action') || api.input.pressed('confirm') ||
          api.input.mouse().clicked) {
        S.done = true;
        api.sfx('sfx.clear');
        api.complete({ coins: 0 });
      }
    },

    render: function (ctx) {
      if (!S) return;
      var i, x;
      var deco = !api.hasBg;

      if (deco) {
        /* salón de fiesta */
        var wl = ctx.createLinearGradient(0, 0, 0, CFG.H);
        wl.addColorStop(0, '#3b2a5e'); wl.addColorStop(1, '#6b4a70');
        ctx.fillStyle = wl; ctx.fillRect(0, 0, CFG.W, CFG.H);

        /* guirnaldas */
        for (i = 0; i < 3; i++) {
          ctx.strokeStyle = 'rgba(255,255,255,.25)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-20, 40 + i * 26);
          ctx.quadraticCurveTo(CFG.W / 2, 100 + i * 30, CFG.W + 20, 40 + i * 26);
          ctx.stroke();
        }
        /* globos */
        var cols = ['#ff4d6d', '#ffd447', '#4ade80', '#5eb3ff', '#b197fc'];
        for (i = 0; i < 8; i++) {
          var bx = 70 + i * 118, by = 120 + Math.sin(S.t * 1.2 + i) * 10;
          ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(bx, by + 22); ctx.lineTo(bx, by + 70); ctx.stroke();
          ctx.fillStyle = cols[i % cols.length];
          U.ellipse(ctx, bx, by, 17, 21); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.45)';
          U.ellipse(ctx, bx - 5, by - 7, 5, 6); ctx.fill();
        }
        /* suelo de mármol */
        ctx.fillStyle = '#e6e0ee';
        ctx.fillRect(0, GROUND, CFG.W, CFG.H - GROUND);
        ctx.fillStyle = '#cfc6dd';
        for (x = 0; x < CFG.W; x += 60) ctx.fillRect(x, GROUND, 3, CFG.H - GROUND);
        ctx.fillStyle = '#9c2135';
        ctx.fillRect(CFG.W / 2 - 120, GROUND, 240, CFG.H - GROUND);
        ctx.fillStyle = '#d4a017';
        ctx.fillRect(CFG.W / 2 - 120, GROUND, 4, CFG.H - GROUND);
        ctx.fillRect(CFG.W / 2 + 116, GROUND, 4, CFG.H - GROUND);
      } else {
        ctx.fillStyle = 'rgba(10,6,20,.22)';
        ctx.fillRect(0, 0, CFG.W, CFG.H);
      }

      /* --- el trofeo gigante --- */
      var lift = Math.sin(S.t * 1.6) * 7;
      var tx = CFG.W / 2, ty = 300 + lift;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var gl = ctx.createRadialGradient(tx, ty - 40, 10, tx, ty - 40, 240);
      gl.addColorStop(0, 'rgba(255,220,120,.30)');
      gl.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(tx, ty - 40, 240, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      /* copa */
      var cup = ctx.createLinearGradient(tx - 70, 0, tx + 70, 0);
      cup.addColorStop(0, '#8a6a12'); cup.addColorStop(0.35, '#ffe98a');
      cup.addColorStop(0.6, '#d4a017'); cup.addColorStop(1, '#8a6a12');
      ctx.fillStyle = cup;
      ctx.beginPath();
      ctx.moveTo(tx - 66, ty - 168);
      ctx.lineTo(tx + 66, ty - 168);
      ctx.quadraticCurveTo(tx + 58, ty - 74, tx, ty - 62);
      ctx.quadraticCurveTo(tx - 58, ty - 74, tx - 66, ty - 168);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5a4508'; ctx.lineWidth = 3; ctx.stroke();

      /* asas */
      ctx.lineWidth = 10; ctx.strokeStyle = '#d4a017';
      ctx.beginPath(); ctx.arc(tx - 78, ty - 138, 26, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx + 78, ty - 138, 26, Math.PI / 2, -Math.PI / 2); ctx.stroke();

      /* pie y peana */
      ctx.fillStyle = '#d4a017';
      ctx.fillRect(tx - 12, ty - 64, 24, 30);
      ctx.fillStyle = '#8a6a12';
      U.roundRect(ctx, tx - 78, ty - 36, 156, 20, 4); ctx.fill();
      ctx.fillStyle = '#5a3a10';
      U.roundRect(ctx, tx - 92, ty - 18, 184, 26, 4); ctx.fill();

      /* placa con el nombre del jugador */
      ctx.fillStyle = '#f6e9c0';
      U.roundRect(ctx, tx - 76, ty - 14, 152, 18, 3); ctx.fill();
      ctx.strokeStyle = '#8a6a12'; ctx.lineWidth = 2; ctx.stroke();
      U.pixelText(ctx, (RID.state.player.name || 'HERO').toUpperCase(),
                  tx, ty - 5, 15, '#5a3a10');

      /* estrella en la copa */
      ctx.save();
      ctx.translate(tx, ty - 126);
      ctx.rotate(Math.sin(S.t) * 0.12);
      ctx.beginPath();
      for (i = 0; i < 10; i++) {
        var a = (Math.PI / 5) * i - Math.PI / 2;
        var r = (i % 2 === 0) ? 30 : 13;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#fff3b0'; ctx.fill();
      ctx.strokeStyle = '#8a6a12'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();

      /* --- los amigos sosteniéndolo --- */
      for (i = 0; i < CREW.length; i++) {
        var cw = CREW[i];
        var cx = 120 + i * 120;
        var hop = Math.abs(Math.sin(S.t * 3 + i * 0.6)) * 9;
        RID.Avatar.drawSprite(ctx, cw.id, cx, GROUND + 8 - hop, cw.s,
                              { flip: cx > CFG.W / 2 });
      }

      /* --- el jugador y su mascota delante --- */
      var bob = Math.abs(Math.sin(S.t * 3.4)) * 7;
      RID.Avatar.drawPlayer(ctx, CFG.W / 2 - 62, GROUND + 44 - bob, 2.2, 'cheer', S.t);
      RID.Avatar.drawPet(ctx, CFG.W / 2 + 46, GROUND + 44, 2.2, 'happy', S.t);
      U.pixelText(ctx, RID.state.pet.name || '', CFG.W / 2 + 46, GROUND + 58, 13, '#ffd447');

      /* --- confeti --- */
      for (i = 0; i < S.conf.length; i++) {
        var p = S.conf[i];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      /* --- rótulo --- */
      U.pixelText(ctx, 'CONGRATULATIONS!', CFG.W / 2, 46, 30, '#ffd447');
      U.pixelText(ctx, (RID.state.player.name || 'HERO') + '  &  ' + (RID.state.pet.name || ''),
                  CFG.W / 2, 78, 17, '#f4f1e8');
      if (S.ready > 1.2 && Math.floor(S.t * 2) % 2 === 0) {
        U.pixelText(ctx, 'PRESS SPACE', CFG.W / 2, CFG.H - 22, 15, '#f4f1e8');
      }
    },

    destroy: function () { S = null; }
  };
})());


/* =========================================================================
   PARTE 19.4 — Pantalla de victoria: el abrazo con la mascota
   Es lo último que se ve tras la escena final, antes del boletín.
   ========================================================================= */

(function () {

  var raf = 0;

  function drawHug(ctx, t) {
    var i, k;
    ctx.clearRect(0, 0, 960, 420);

    /* cielo del amanecer */
    var sk = ctx.createLinearGradient(0, 0, 0, 420);
    sk.addColorStop(0, '#1b1040'); sk.addColorStop(0.45, '#7a3a6a');
    sk.addColorStop(0.75, '#e0763c'); sk.addColorStop(1, '#f6c76a');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 420);

    /* estrellas que se apagan arriba */
    ctx.fillStyle = '#fff';
    for (i = 0; i < 30; i++) {
      ctx.globalAlpha = 0.25 + 0.45 * Math.abs(Math.sin(t * 1.4 + i));
      ctx.fillRect((i * 137) % 960, (i * 61) % 130, 2, 2);
    }
    ctx.globalAlpha = 1;

    /* fuegos artificiales */
    for (i = 0; i < 4; i++) {
      var p  = ((t * 0.42 + i / 4) % 1);
      var fx = 150 + i * 220, fy = 190 - i % 2 * 40;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var col = ['#ff4d6d', '#ffd447', '#4ade80', '#5eb3ff'][i];
      ctx.strokeStyle = col;
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.lineWidth = 2.5;
      for (k = 0; k < 12; k++) {
        var a = (Math.PI * 2 / 12) * k;
        var r = p * 90;
        ctx.beginPath();
        ctx.moveTo(fx + Math.cos(a) * r * 0.55, fy + Math.sin(a) * r * 0.55);
        ctx.lineTo(fx + Math.cos(a) * r, fy + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* colina */
    ctx.fillStyle = '#2a1b3a';
    U.ellipse(ctx, 480, 470, 620, 130); ctx.fill();
    ctx.fillStyle = '#3a2650';
    U.ellipse(ctx, 480, 486, 560, 120); ctx.fill();

    /* corazones subiendo */
    for (i = 0; i < 7; i++) {
      var hp = ((t * 0.5 + i / 7) % 1);
      var hx = 480 + Math.sin(t * 1.4 + i * 2) * (40 + i * 9);
      var hy = 300 - hp * 210;
      var hs = 7 + (1 - hp) * 7;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - hp);
      ctx.fillStyle = '#ff6b9d';
      ctx.beginPath();
      ctx.moveTo(hx, hy + hs * 0.7);
      ctx.bezierCurveTo(hx - hs, hy - hs * 0.4, hx - hs * 0.4, hy - hs, hx, hy - hs * 0.35);
      ctx.bezierCurveTo(hx + hs * 0.4, hy - hs, hx + hs, hy - hs * 0.4, hx, hy + hs * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* resplandor del abrazo */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var gl = ctx.createRadialGradient(480, 300, 20, 480, 300, 230);
    gl.addColorStop(0, 'rgba(255,220,150,.30)');
    gl.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(480, 300, 230, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* el abrazo: la mascota salta a los brazos */
    var bob = Math.sin(t * 2.2) * 4;
    RID.Avatar.drawPlayer(ctx, 448, 390 - bob, 3.6, 'hug', t);
    ctx.save();
    ctx.translate(0, -bob);
    RID.Avatar.drawPet(ctx, 540, 330, 3.0, 'hug', t);
    ctx.restore();

    U.pixelText(ctx, (RID.state.player.name || 'HERO') + '  &  ' + (RID.state.pet.name || ''),
                480, 44, 26, '#ffe9a8');
  }

  RID.Flow.showVictory = function (onEnd) {
    var cv = U.el('#victory-canvas'), ctx = cv.getContext('2d'), t0 = U.now();

    RID.Screens.hideAll();
    RID.Screens.closeAllOverlays();
    RID.Screens.setHUD(false);
    RID.Loop.setScene(null);
    RID.Screens.setBackground(null);
    RID.Audio.playMusic('music.final');

    U.el('#victory-title').textContent = RID.state.lang === 'es' ? '¡LO LOGRASTE!' : 'YOU DID IT!';
    U.el('#victory-text').textContent  = RID.state.lang === 'es'
      ? RID.state.pet.name + ' está en casa. Gracias por jugar.'
      : RID.state.pet.name + ' is home. Thanks for playing.';
    RID.Screens.show('victory');

    (function loop() {
      raf = window.requestAnimationFrame(loop);
      drawHug(ctx, (U.now() - t0) / 1000);
    })();

    var btn = U.el('#victory-next');
    btn.onclick = function () {
      btn.onclick = null;
      window.cancelAnimationFrame(raf);
      if (onEnd) onEnd();
    };
  };
})();


/* Arranque automático ---------------------------------------------------- */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', RID.Core.boot);
} else {
  RID.Core.boot();
}

})(window, document);    
