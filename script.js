/* =========================================================================
   RESCUE IN DISTRESS — v1.0
   script.js — TODO el juego. Namespace único: window.RID
   -------------------------------------------------------------------------
   ÍNDICE DE PARTES (cada parte se AÑADE, nunca se reescribe)
     PARTE 3 · Núcleo:  CFG · DATA(esqueleto) · state · Util · Events
                        Storage · Assets · Audio · Input · Loop · Screens · Core
     PARTE 4 · Avatar + mascota + pantallas de creación
     PARTE 5 · Story · i18n · UI/HUD · FX · Progress
     PARTE 6 · Questions + banco de preguntas
     PARTE 7 · Nivel 1  (gap-maze)
     PARTE 8 · Niveles 2-3 (dodge-run)
     PARTE 9 · Map + Lobby
     PARTE 10 · Nivel 4 (kart)      PARTE 11 · Niveles 5-7
     PARTE 12 · Nivel 8             PARTE 13 · Shop + Nivel 9
   ========================================================================= */

(function (window, document) {
'use strict';

/* Namespace único ------------------------------------------------------- */
var RID = window.RID || (window.RID = {});


/* =========================================================================
   PARTE 3.1 — CONFIGURACIÓN GLOBAL
   ========================================================================= */

var CFG = RID.CFG = {
  /* lienzo lógico */
  W: 960,
  H: 540,

  /* bucle */
  STEP: 1000 / 60,        // paso fijo (ms)
  MAX_FRAME: 250,         // tope anti "espiral de la muerte" (ms)

  /* reglas de juego */
  LIVES: 3,
  TOTAL_LEVELS: 20,
  TOTAL_WORLDS: 5,
  LEVELS_PER_WORLD: 4,
  SHOP_LEVELS: [9, 15],
  MAP_FIRST_LEVEL: 2,     // el mapa cubre los niveles 2..20 = 19 paradas
  MAP_UNLOCKS_AFTER: 3,   // el mapa aparece al superar el nivel 3

  /* audio */
  MUSIC_VOL: 0.70,
  SFX_VOL: 0.80,
  FADE_MS: 600,

  /* carga */
  ASSET_TIMEOUT: 9000,    // ms por asset antes de darlo por ausente

  /* guardado */
  SAVE_KEY: 'rid_save_v1',
  AUTOSAVE_MS: 400
};


/* =========================================================================
   PARTE 3.2 — DATA (esqueleto). Las partes siguientes RELLENAN estos campos.
   Añadir contenido al juego = añadir entradas aquí. Nunca tocar el motor.
   ========================================================================= */

RID.DATA = {
  worlds:    [],   // parte 9
  levels:    [],   // partes 7-13
  story:     [],   // parte 5
  questions: {},   // parte 6
  shop:      [],   // parte 13
  map:       [],   // parte 9
  avatar:    {},   // parte 4
  pet:       {},   // parte 4
  i18n:      {}    // parte 5
};


/* =========================================================================
   PARTE 3.3 — ESTADO GLOBAL (única fuente de verdad)
   ========================================================================= */

RID.defaultState = function () {
  return {
    lang: 'es',
    player: { name: '', hair: 'short', face: 'happy', shirt: 'red', cosmetics: [], equipped: {} },
    pet:    { name: '', species: 'dog', coat: 'brown' },
    run:    { world: 1, level: 1, lives: CFG.LIVES, coins: 0, gauge: 100, shield: 0 },
    /* results: un intento por nivel. Cada entrada { lvl, c, t, ok } */
    progress: { cleared: [], unlocked: [1], storySeen: [], worldSeals: [], results: [] },
    shopOwned: [],
    upgrades: { hints: 0, gaugeDrain: 1.0, boostBonus: 0, aimAssist: 0,
                jumpBoost: 1.0, hitPower: 1, kartSpeed: 1.0, shield: 0 },
    settings: { musicVol: CFG.MUSIC_VOL, sfxVol: CFG.SFX_VOL, muted: false },
    session: { paused: false, screen: 'boot', levelType: null, qIndex: 0, correct: 0, wrong: 0, startedAt: 0 },
    meta: { version: 1, savedAt: 0 }
  };
};

RID.state = RID.defaultState();


/* =========================================================================
   PARTE 3.4 — RID.Util
   ========================================================================= */

RID.Util = (function () {

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function lerp(a, b, t)      { return a + (b - a) * t; }
  function rand(min, max)     { return min + Math.random() * (max - min); }
  function randInt(min, max)  { return Math.floor(min + Math.random() * (max - min + 1)); }
  function choice(arr)        { return arr[Math.floor(Math.random() * arr.length)]; }

  function shuffle(arr) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function dist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function el(sel, root)  { return (root || document).querySelector(sel); }
  function els(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls)  n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function on(node, evt, fn, opts) { if (node) node.addEventListener(evt, fn, opts || false); return fn; }
  function off(node, evt, fn, opts) { if (node) node.removeEventListener(evt, fn, opts || false); }

  function show(node, visible) { if (node) node.classList.toggle('hidden', !visible); }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* Dibujo: rectángulo con esquinas redondeadas */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  /* Dibujo: elipse compatible con navegadores antiguos */
  function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    if (ctx.ellipse) { ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); return; }
    ctx.save(); ctx.translate(cx, cy); ctx.scale(rx / ry, 1);
    ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.restore();
  }

  /* Texto retro con contorno negro */
  function pixelText(ctx, text, x, y, size, color, align) {
    ctx.save();
    ctx.font = 'bold ' + size + 'px "Courier New", monospace';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = '#05060d';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color || '#f4f1e8';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16),
        r = clamp(((n >> 16) & 255) + amount, 0, 255),
        g = clamp(((n >> 8) & 255) + amount, 0, 255),
        b = clamp((n & 255) + amount, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function easeOut(t)    { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t)  { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  var _uid = 0;
  function uid(prefix) { return (prefix || 'id') + '_' + (++_uid); }

  return {
    clamp: clamp, lerp: lerp, rand: rand, randInt: randInt, choice: choice, shuffle: shuffle,
    aabb: aabb, dist: dist, angle: angle, now: now,
    el: el, els: els, make: make, on: on, off: off, show: show, clear: clear,
    fmtTime: fmtTime, roundRect: roundRect, ellipse: ellipse, pixelText: pixelText,
    shade: shade, easeOut: easeOut, easeInOut: easeInOut, uid: uid
  };
})();

var U = RID.Util;


/* =========================================================================
   PARTE 3.5 — RID.Events (bus de eventos interno)
   ========================================================================= */

RID.Events = (function () {
  var map = {};

  function on(evt, fn) {
    (map[evt] || (map[evt] = [])).push(fn);
    return fn;
  }

  function once(evt, fn) {
    var w = function (d) { off(evt, w); fn(d); };
    return on(evt, w);
  }

  function off(evt, fn) {
    var list = map[evt];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  function emit(evt, data) {
    if (!map[evt]) return;
    var list = map[evt].slice();   // copia: un handler puede desuscribirse
    for (var i = 0; i < list.length; i++) {
      try { list[i](data); } catch (e) { console.error('[RID] handler "' + evt + '"', e); }
    }
  }

  return { on: on, once: once, off: off, emit: emit };
})();


/* =========================================================================
   PARTE 3.6 — RID.Storage
   Guardado automático. Con respaldo en memoria por si file:// bloquea
   localStorage, y códigos de exportación/importación como red de seguridad.
   ========================================================================= */

RID.Storage = (function () {

  var memory = null;      // respaldo cuando localStorage no está disponible
  var usable = null;      // null = sin comprobar
  var timer  = 0;

  function available() {
    if (usable !== null) return usable;
    try {
      var k = '__rid_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      usable = true;
    } catch (e) {
      usable = false;
      console.warn('[RID] localStorage no disponible; se usa respaldo en memoria.');
    }
    return usable;
  }

  /* Mezcla el guardado con el estado por defecto: si mañana se añaden campos
     nuevos, las partidas viejas siguen cargando sin romperse. */
  function merge(base, saved) {
    var out = {}, k;
    for (k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
      if (saved && Object.prototype.hasOwnProperty.call(saved, k)) {
        if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
          out[k] = merge(base[k], saved[k]);
        } else {
          out[k] = saved[k];
        }
      } else {
        out[k] = base[k];
      }
    }
    return out;
  }

  function hasSave() {
    if (!available()) return !!memory;
    try { return !!window.localStorage.getItem(CFG.SAVE_KEY); } catch (e) { return false; }
  }

  function load() {
    var raw = null;
    if (available()) {
      try { raw = window.localStorage.getItem(CFG.SAVE_KEY); } catch (e) { raw = null; }
    } else {
      raw = memory;
    }
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      return merge(RID.defaultState(), data);
    } catch (e) {
      console.warn('[RID] guardado corrupto, se ignora.');
      return null;
    }
  }

  function save() {
    RID.state.meta.savedAt = Date.now();
    var raw = JSON.stringify(RID.state);
    if (available()) {
      try { window.localStorage.setItem(CFG.SAVE_KEY, raw); }
      catch (e) { memory = raw; }
    } else {
      memory = raw;
    }
    RID.Events.emit('save:done');
  }

  /* Guardado automático con antirrebote: se llama sin miedo desde cualquier sitio */
  function autosave() {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () { timer = 0; save(); }, CFG.AUTOSAVE_MS);
  }

  function wipe() {
    memory = null;
    if (available()) { try { window.localStorage.removeItem(CFG.SAVE_KEY); } catch (e) {} }
    RID.Events.emit('save:wiped');
  }

  function exportCode() {
    try { return window.btoa(unescape(encodeURIComponent(JSON.stringify(RID.state)))); }
    catch (e) { return ''; }
  }

  function importCode(code) {
    try {
      var data = JSON.parse(decodeURIComponent(escape(window.atob(code))));
      RID.state = merge(RID.defaultState(), data);
      save();
      return true;
    } catch (e) { return false; }
  }

  return {
    available: available, hasSave: hasSave, load: load, save: save,
    autosave: autosave, wipe: wipe, exportCode: exportCode, importCode: importCode
  };
})();


/* =========================================================================
   PARTE 3.7 — RID.Assets
   Manifiesto de los archivos que aporta el usuario. Los nombres llevan
   espacios: se codifican con encodeURI. Si un archivo falta, el juego NO se
   rompe: usa fondo procedural y silencia esa pista.
   ========================================================================= */

RID.Assets = (function () {

  /* En la versión de UN SOLO ARCHIVO los assets viajan incrustados dentro
     del propio HTML. Si existe esa tabla se usa; si no, se leen de img/ y
     audio/ como siempre. El resto del juego no se entera. */
  var INLINE = window.RID_INLINE || {};
  function url(path) { return INLINE[path] || encodeURI(path); }

  var images = {};        // key -> HTMLImageElement
  var sounds = {};        // key -> HTMLAudioElement (plantilla)
  var missing = [];       // keys ausentes
  var manifest = { img: {}, audio: {}, alias: {}, imgAlias: {} };

  /* Pistas compartidas: los niveles de kart usan una sola canción y las tres
     tiendas otra. Se resuelven como ALIAS para no descargar el archivo dos
     veces. Si algún día cada nivel tiene la suya, basta con darle su ruta. */
  var MUSIC_ALIAS = {
    'music.level8':  'music.level4',
    'music.level12': 'music.level4',
    'music.level16': 'music.level4',
    'music.level9':  'music.shop',
    'music.level14': 'music.shop',
    'music.level18': 'music.shop',
    'music.lobby':   'music.intro'
  };

  /* Personajes que admiten imagen propia en img/<nombre>.png */
  var CHARS = ['goomba', 'toad', 'yoshi', 'koopa', 'peach', 'dk', 'roy', 'bowser',
               'shyguy', 'ludwig', 'morton', 'drybones',
               'mario', 'luigi', 'daisy'];

  /* Rutas concretas de las imágenes que ya existen, con el nombre tal cual
     las guardó el usuario. Lo que no esté aquí usa el nombre genérico. */
  var IMG_PATH = {
    'bg.level4': ['img/nivel4,8,12,16.png'],   // una sola pista para los karts
    'bg.title':  ['img/fondo inicio.png'],
    'ui.coin':   ['img/moneda.png'],
    'story1':    ['img/introduccion.png']
  };

  /* Imágenes compartidas por varias pantallas: se descargan UNA vez */
  var IMG_ALIAS = {
    'bg.level3':  'bg.level2',    // el mismo pasillo, de salida
    'bg.level6':  'bg.level5',    // misma zona de la Isla Yoshi
    'bg.level8':  'bg.level4',    // pistas de kart
    'bg.level16': 'bg.level4',
    'bg.level11': 'bg.level10',   // el castillo de Ludwig por dentro
    'bg.level13': 'bg.world4',    // desierto de Sarasaland
    'bg.shop':    'bg.level9'     // respaldo genérico de tienda
  };

  /* --- construcción del manifiesto ---
     Cada entrada admite VARIAS rutas candidatas: se prueba la primera y, si
     no existe, la siguiente. Da igual el espacio o la extensión. */
  (function build() {
    var i;

    function pic(key, generic) {
      if (IMG_ALIAS[key]) return;                 // se resuelve por alias
      manifest.img[key] = IMG_PATH[key] || generic;
    }

    function names(base) {
      return ['img/' + base + '.png', 'img/' + base + '.jpg', 'img/' + base + '.jpeg'];
    }

    pic('bg.title', names('fondo inicio'));

    for (i = 1; i <= CFG.TOTAL_WORLDS; i++) {
      pic('bg.world' + i, names('fondo mundo ' + i).concat(names('fondo mundo' + i)));
      manifest.audio['music.world' + i] = ['audio/mundo ' + i + '.mp3',
                                           'audio/mundo' + i + ' lobby.mp3'];
    }

    for (i = 1; i <= CFG.TOTAL_LEVELS; i++) {
      pic('bg.level' + i, names('fondo nivel ' + i).concat(names('fondo nivel' + i)));
      if (!MUSIC_ALIAS['music.level' + i]) {
        manifest.audio['music.level' + i] = ['audio/nivel ' + i + '.mp3',
                                             'audio/nivel' + i + '.mp3'];
      }
    }

    /* fondos de las escenas de historia: img/historia 1.png, historia 2.png... */
    for (i = 1; i <= 24; i++) {
      pic('story' + i, names('historia ' + i).concat(names('historia' + i)));
    }

    pic('ui.coin', names('moneda'));

    /* imágenes de las preguntas de ordenar: img/frase 1.png, frase 2.png... */
    for (i = 1; i <= 12; i++) {
      pic('phrase' + i, names('frase ' + i).concat(names('frase' + i)));
    }

    /* Imagen opcional por personaje: si existe img/yoshi.png (o toad.png,
       roy.png, bowser.png...) el juego la usa EN LUGAR del pixel art. */
    for (i = 0; i < CHARS.length; i++) {
      pic('char.' + CHARS[i], names(CHARS[i]));
    }

    manifest.audio['music.intro'] = ['audio/introduccion.mp3'];
    manifest.audio['music.story'] = ['audio/historia.mp3'];
    manifest.audio['music.shop']  = ['audio/tienda.mp3'];
    manifest.audio['music.final'] = ['audio/nivel final.mp3'];

    manifest.audio['sfx.death']   = ['audio/muerte subita.mp3'];
    manifest.audio['sfx.jump']    = ['audio/salto.mp3'];
    manifest.audio['sfx.life']    = ['audio/perdida de una vida.mp3'];
    manifest.audio['sfx.hit']     = ['audio/golpe.mp3', 'audio/golpear.mp3'];
    manifest.audio['sfx.door']    = ['audio/puerta.mp3', 'audio/abrir una puerta.mp3'];
    manifest.audio['sfx.clear']   = ['audio/pasar de nivel.mp3', 'audio/pasar un nivel.mp3'];
    manifest.audio['sfx.coin']    = ['audio/moneda.mp3', 'audio/recoger una moneda.mp3'];
    manifest.audio['sfx.correct'] = ['audio/respuesta correcta.mp3'];
    manifest.audio['sfx.item']    = ['audio/objeto adquirido.mp3'];

    manifest.alias    = MUSIC_ALIAS;
    manifest.imgAlias = IMG_ALIAS;
  })();

  function total() {
    return Object.keys(manifest.img).length + Object.keys(manifest.audio).length;
  }

  /* Prueba las rutas candidatas en orden y se queda con la primera que exista */
  function loadImage(key, paths, done, at) {
    at = at || 0;
    if (at >= paths.length) { missing.push(key); done(); return; }

    var img = new Image(), settled = false, t;
    function finish(ok) {
      if (settled) return;
      settled = true;
      window.clearTimeout(t);
      if (ok) { images[key] = img; done(); }
      else loadImage(key, paths, done, at + 1);
    }
    t = window.setTimeout(function () { finish(false); }, CFG.ASSET_TIMEOUT);
    img.onload  = function () { finish(img.naturalWidth > 0); };
    img.onerror = function () { finish(false); };
    img.src = url(paths[at]);
  }

  function loadSound(key, paths, done, at) {
    at = at || 0;
    if (at >= paths.length) { missing.push(key); done(); return; }

    var au = new Audio(), settled = false, t;
    function finish(ok) {
      if (settled) return;
      settled = true;
      window.clearTimeout(t);
      if (ok) { sounds[key] = au; done(); }
      else loadSound(key, paths, done, at + 1);
    }
    t = window.setTimeout(function () { finish(au.readyState > 0); }, CFG.ASSET_TIMEOUT);
    au.addEventListener('canplaythrough', function () { finish(true); });
    au.addEventListener('loadeddata',     function () { finish(true); });
    au.addEventListener('error',          function () { finish(false); });
    au.preload = 'auto';
    au.src = url(paths[at]);
    au.load();
  }

  /* Añade, tras cada ruta con carpeta, la misma sin carpeta.
     Así el juego funciona igual si los archivos están en img/ y audio/
     que si están todos sueltos junto al index.html. */
  function expand(list) {
    var out = [], i, p, slash;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      out.push(p);
      slash = p.indexOf('/');
      if (slash > 0) out.push(p.slice(slash + 1));
    }
    return out;
  }

  function preload(onProgress, onDone) {
    var keys = [], k, count = 0, all = total();

    for (k in manifest.img)   keys.push({ kind: 'img',   key: k, path: expand(manifest.img[k]) });
    for (k in manifest.audio) keys.push({ kind: 'audio', key: k, path: expand(manifest.audio[k]) });

    if (!all) { onDone(missing); return; }

    function step() {
      count++;
      if (onProgress) onProgress(count / all, count, all);
      if (count >= all) { resolveAlias(); onDone(missing); }
    }

    keys.forEach(function (a) {
      if (a.kind === 'img') loadImage(a.key, a.path, step);
      else                  loadSound(a.key, a.path, step);
    });
  }

  /* Las claves con alias apuntan al mismo recurso ya cargado */
  function resolveAlias() {
    var k;
    for (k in manifest.alias) {
      if (sounds[manifest.alias[k]]) sounds[k] = sounds[manifest.alias[k]];
    }
    for (k in manifest.imgAlias) {
      if (images[manifest.imgAlias[k]]) images[k] = images[manifest.imgAlias[k]];
    }
  }

  function img(key)   { return images[key] || null; }
  function sound(key) { return sounds[key] || null; }
  function has(key)   { return !!(images[key] || sounds[key]); }
  function missingList() { return missing.slice(); }

  /* Fondo procedural cuando falta la imagen: el juego siempre es jugable. */
  var PALETTES = {
    world1: ['#2ea3d6', '#7fd6a2', '#0d5c3a'],
    world2: ['#39c07a', '#d9f28a', '#14603a'],
    world3: ['#8a5a2b', '#d9a760', '#3a2412'],
    world4: ['#e0a83c', '#f6dd9a', '#5a3c10'],
    world5: ['#7a1020', '#e0562a', '#1a0508'],
    shop:   ['#3a2a6b', '#a37cf0', '#150e2e'],
    dark:   ['#101425', '#2a3050', '#05060d']
  };

  function paletteFor(key) {
    if (key === 'bg.shop') return PALETTES.shop;
    var m = /^bg\.world(\d+)$/.exec(key);
    if (m) return PALETTES['world' + m[1]] || PALETTES.dark;
    m = /^bg\.level(\d+)$/.exec(key);
    if (m) {
      var lvl = parseInt(m[1], 10);
      var w = Math.min(CFG.TOTAL_WORLDS, Math.ceil(lvl / CFG.LEVELS_PER_WORLD));
      return PALETTES['world' + w] || PALETTES.dark;
    }
    return PALETTES.dark;
  }

  function fallbackBG(ctx, key) {
    var p = paletteFor(key), g = ctx.createLinearGradient(0, 0, 0, CFG.H), i, x, y;
    g.addColorStop(0, p[0]); g.addColorStop(0.62, p[1]); g.addColorStop(1, p[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    /* retícula retro tenue */
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#000';
    for (y = 0; y < CFG.H; y += 8) ctx.fillRect(0, y, CFG.W, 2);
    ctx.globalAlpha = 1;

    /* colinas de fondo */
    ctx.fillStyle = p[2];
    for (i = 0; i < 5; i++) {
      x = 90 + i * 200;
      U.ellipse(ctx, x, CFG.H + 30, 170, 120);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, CFG.H - 46, CFG.W, 46);
  }

  return {
    preload: preload, img: img, sound: sound, has: has,
    missing: missingList, fallbackBG: fallbackBG, manifest: manifest, total: total
  };
})();


/* =========================================================================
   PARTE 3.8 — RID.Audio
   Un único canal de música: al pedir una pista nueva la anterior se detiene.
   Las canciones NUNCA se mezclan. Los efectos van en un canal aparte.
   ========================================================================= */

RID.Audio = (function () {

  var currentKey = null;
  var currentEl  = null;
  var fadeTimer  = 0;
  var unlocked   = false;
  var sfxPool    = {};      // key -> array de clones reutilizables
  var POOL_MAX   = 4;

  function musicVol() { return RID.state.settings.muted ? 0 : RID.state.settings.musicVol; }
  function sfxVol()   { return RID.state.settings.muted ? 0 : RID.state.settings.sfxVol; }

  /* Los navegadores bloquean el audio hasta que hay un gesto del usuario.
     Se llama desde el botón PRESS START. */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    var probe = RID.Assets.sound('sfx.coin') || RID.Assets.sound('music.lobby');
    if (!probe) return;
    var p = probe.play();
    if (p && p.then) p.then(function () { probe.pause(); probe.currentTime = 0; }).catch(function () {});
    else { try { probe.pause(); probe.currentTime = 0; } catch (e) {} }
  }

  function stopMusic() {
    if (fadeTimer) { window.clearInterval(fadeTimer); fadeTimer = 0; }
    if (currentEl) {
      try { currentEl.pause(); currentEl.currentTime = 0; } catch (e) {}
    }
    currentEl = null;
    currentKey = null;
  }

  function playMusic(key) {
    if (key === currentKey && currentEl && !currentEl.paused) return;   // ya suena
    stopMusic();
    var au = RID.Assets.sound(key);
    if (!au) { currentKey = key; return; }                              // pista ausente: silencio
    currentKey = key;
    currentEl  = au;
    au.loop = true;
    au.volume = musicVol();
    try { au.currentTime = 0; } catch (e) {}
    var p = au.play();
    if (p && p.catch) p.catch(function () {});
  }

  function fadeTo(key, ms) {
    ms = ms || CFG.FADE_MS;
    if (!currentEl) { playMusic(key); return; }
    if (key === currentKey) return;
    if (fadeTimer) window.clearInterval(fadeTimer);

    var from = currentEl, start = from.volume, steps = Math.max(1, Math.round(ms / 40)), i = 0;
    fadeTimer = window.setInterval(function () {
      i++;
      from.volume = Math.max(0, start * (1 - i / steps));
      if (i >= steps) {
        window.clearInterval(fadeTimer); fadeTimer = 0;
        playMusic(key);
      }
    }, 40);
  }

  function sfx(key) {
    var base = RID.Assets.sound(key);
    if (!base) return;
    var pool = sfxPool[key] || (sfxPool[key] = []);
    var node = null, i;

    for (i = 0; i < pool.length; i++) {
      if (pool[i].paused || pool[i].ended) { node = pool[i]; break; }
    }
    if (!node) {
      if (pool.length >= POOL_MAX) node = pool[0];
      else { node = base.cloneNode(true); pool.push(node); }
    }
    node.volume = sfxVol();
    try { node.currentTime = 0; } catch (e) {}
    var p = node.play();
    if (p && p.catch) p.catch(function () {});
  }

  function setMusicVol(v) {
    RID.state.settings.musicVol = U.clamp(v, 0, 1);
    if (currentEl) currentEl.volume = musicVol();
    RID.Storage.autosave();
  }

  function setSfxVol(v) {
    RID.state.settings.sfxVol = U.clamp(v, 0, 1);
    RID.Storage.autosave();
  }

  function mute(on) {
    RID.state.settings.muted = !!on;
    if (currentEl) currentEl.volume = musicVol();
    RID.Storage.autosave();
  }

  function current() { return currentKey; }

  return {
    unlock: unlock, playMusic: playMusic, stopMusic: stopMusic, fadeTo: fadeTo,
    sfx: sfx, setMusicVol: setMusicVol, setSfxVol: setSfxVol, mute: mute, current: current
  };
})();


/* =========================================================================
   PARTE 3.9 — RID.Input
   Teclado (flechas + barra espaciadora) y ratón (apuntar y linterna).
   El ratón se convierte SIEMPRE a coordenadas lógicas 960x540.
   ========================================================================= */

RID.Input = (function () {

  var down     = {};        // teclas mantenidas
  var pressed  = {};        // teclas pulsadas en este fotograma
  var released = {};
  var locked   = false;     // true mientras hay un overlay (preguntas, pausa)
  var mouse    = { x: CFG.W / 2, y: CFG.H / 2, down: false, clicked: false };
  var clickHandlers = [];
  var gameEl = null;

  var KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    Space: 'action', Enter: 'confirm', Escape: 'pause', KeyP: 'pause',
    ShiftLeft: 'run', ShiftRight: 'run',
    Digit1: 'opt1', Digit2: 'opt2', Digit3: 'opt3', Digit4: 'opt4'
  };
  var BLOCK_SCROLL = { left: 1, right: 1, up: 1, down: 1, action: 1 };

  function keyOf(e) { return KEYMAP[e.code] || null; }

  /* Mientras se escribe en un campo de texto el juego NO toca el teclado:
     si no, teclas como A, D, W, S o la barra espaciadora nunca llegarían
     al input porque el motor las usa para moverse. */
  function isTyping(e) {
    var t = e.target;
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable === true;
  }

  function onKeyDown(e) {
    if (isTyping(e)) return;
    var k = keyOf(e);
    if (!k) return;
    if (BLOCK_SCROLL[k]) e.preventDefault();
    if (k === 'pause') { RID.Events.emit('input:pause'); return; }
    if (locked) { RID.Events.emit('input:key', k); return; }
    if (!down[k]) pressed[k] = true;
    down[k] = true;
    RID.Events.emit('input:key', k);
  }

  function onKeyUp(e) {
    if (isTyping(e)) return;
    var k = keyOf(e);
    if (!k) return;
    down[k] = false;
    released[k] = true;
  }

  function toLogical(clientX, clientY) {
    if (!gameEl) gameEl = U.el('#game');
    var r = gameEl.getBoundingClientRect();
    return {
      x: U.clamp((clientX - r.left) * (CFG.W / r.width),  0, CFG.W),
      y: U.clamp((clientY - r.top)  * (CFG.H / r.height), 0, CFG.H)
    };
  }

  function onMouseMove(e) {
    var p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
  }

  function onMouseDown(e) {
    var p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y; mouse.down = true;
    if (locked) return;
    mouse.clicked = true;
    for (var i = 0; i < clickHandlers.length; i++) clickHandlers[i](mouse.x, mouse.y);
  }

  function onMouseUp() { mouse.down = false; }

  function onBlur() { down = {}; pressed = {}; released = {}; mouse.down = false; }

  function init() {
    gameEl = U.el('#game');
    U.on(window, 'keydown', onKeyDown);
    U.on(window, 'keyup', onKeyUp);
    U.on(window, 'blur', onBlur);
    U.on(window, 'mousemove', onMouseMove);
    U.on(window, 'mousedown', onMouseDown);
    U.on(window, 'mouseup', onMouseUp);
    U.on(window, 'contextmenu', function (e) { e.preventDefault(); });
  }

  /* Lo llama el bucle al final de cada fotograma */
  function endFrame() { pressed = {}; released = {}; mouse.clicked = false; }

  function isDown(k)      { return !locked && !!down[k]; }
  function justPressed(k) { return !locked && !!pressed[k]; }
  function justReleased(k){ return !locked && !!released[k]; }
  function getMouse()     { return mouse; }
  function onClick(fn)    { clickHandlers.push(fn); return fn; }
  function offClick(fn)   { var i = clickHandlers.indexOf(fn); if (i >= 0) clickHandlers.splice(i, 1); }
  function lock()         { locked = true; down = {}; pressed = {}; }
  function unlock()       { locked = false; }
  function isLocked()     { return locked; }
  function clearAll()     { down = {}; pressed = {}; released = {}; clickHandlers.length = 0; locked = false; }

  return {
    init: init, endFrame: endFrame, isDown: isDown, pressed: justPressed, released: justReleased,
    mouse: getMouse, onClick: onClick, offClick: offClick,
    lock: lock, unlock: unlock, isLocked: isLocked, clear: clearAll
  };
})();


/* =========================================================================
   PARTE 3.10 — RID.Loop
   Paso fijo a 60 Hz con acumulador. La escena activa es siempre un objeto
   { update(dt), render(ctx, fx) }. dt llega en SEGUNDOS.
   ========================================================================= */

RID.Loop = (function () {

  var raf = 0, last = 0, acc = 0;
  var running = false, paused = false;
  var scene = null;
  var ctxWorld = null, ctxFX = null;
  var fps = 0, fpsAcc = 0, fpsCount = 0;

  function contexts() {
    if (!ctxWorld) ctxWorld = U.el('#layer-world').getContext('2d');
    if (!ctxFX)    ctxFX    = U.el('#layer-fx').getContext('2d');
    return { world: ctxWorld, fx: ctxFX };
  }

  function frame(ts) {
    if (!running) return;
    raf = window.requestAnimationFrame(frame);

    var delta = ts - last;
    last = ts;
    if (delta > CFG.MAX_FRAME) delta = CFG.MAX_FRAME;

    fpsAcc += delta; fpsCount++;
    if (fpsAcc >= 500) { fps = Math.round(1000 / (fpsAcc / fpsCount)); fpsAcc = 0; fpsCount = 0; }

    if (!paused && scene) {
      acc += delta;
      while (acc >= CFG.STEP) {
        if (scene.update) scene.update(CFG.STEP / 1000);
        acc -= CFG.STEP;
        RID.Input.endFrame();
      }
      var c = contexts();
      c.world.clearRect(0, 0, CFG.W, CFG.H);
      c.fx.clearRect(0, 0, CFG.W, CFG.H);
      if (scene.render) scene.render(c.world, c.fx);
    }
  }

  function start() {
    if (running) return;
    running = true; paused = false;
    last = U.now(); acc = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    clearCanvas();
  }

  function clearCanvas() {
    var c = contexts();
    c.world.clearRect(0, 0, CFG.W, CFG.H);
    c.fx.clearRect(0, 0, CFG.W, CFG.H);
  }

  function setScene(next) {
    if (scene && scene.destroy) { try { scene.destroy(); } catch (e) { console.error(e); } }
    scene = next || null;
    acc = 0; last = U.now();
    clearCanvas();
    if (scene && scene.start) scene.start();
  }

  function pause()  { paused = true;  RID.state.session.paused = true; }
  function resume() { paused = false; RID.state.session.paused = false; last = U.now(); acc = 0; }

  return {
    start: start, stop: stop, pause: pause, resume: resume, setScene: setScene,
    clearCanvas: clearCanvas, contexts: contexts,
    isPaused: function () { return paused; },
    isRunning: function () { return running; },
    scene: function () { return scene; },
    fps: function () { return fps; }
  };
})();


/* =========================================================================
   PARTE 3.11 — RID.Screens
   Pantallas (capa 5) y overlays (capa 6). Solo una pantalla activa a la vez;
   los overlays se apilan encima y bloquean la entrada del juego.
   ========================================================================= */

RID.Screens = (function () {

  var currentId = null;
  var stack = [];
  var openOverlays = [];
  var bgImage = null, bgCanvas = null, bgCtx = null;

  function node(id)     { return U.el('[data-screen="' + id + '"]'); }
  function overlayNode(id) { return U.el('[data-overlay="' + id + '"]'); }

  function show(id, data) {
    var next = node(id);
    if (!next) { console.warn('[RID] pantalla inexistente:', id); return; }
    if (currentId === id) { RID.Events.emit('screen:show', { id: id, data: data }); return; }

    var prev = currentId ? node(currentId) : null;
    if (prev) prev.classList.remove('is-active');

    next.classList.add('is-active');
    currentId = id;
    RID.state.session.screen = id;
    RID.Events.emit('screen:show', { id: id, data: data });
  }

  function hide(id) {
    var n = node(id || currentId);
    if (n) n.classList.remove('is-active');
    if (!id || id === currentId) currentId = null;
  }

  function hideAll() {
    U.els('.screen').forEach(function (n) { n.classList.remove('is-active'); });
    currentId = null;
  }

  function current() { return currentId; }

  function push(id, data) { if (currentId) stack.push(currentId); show(id, data); }
  function pop()          { var back = stack.pop(); if (back) show(back); return back || null; }

  /* Transición con fundido usando la capa de efectos */
  function transition(toId, data, ms) {
    ms = ms || 260;
    var fx = U.el('#layer-fx'), ctx = fx.getContext('2d');
    var t0 = U.now();

    (function fadeOut() {
      var t = U.clamp((U.now() - t0) / (ms / 2), 0, 1);
      ctx.clearRect(0, 0, CFG.W, CFG.H);
      ctx.fillStyle = 'rgba(5,6,13,' + t + ')';
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      if (t < 1) { window.requestAnimationFrame(fadeOut); return; }

      show(toId, data);
      var t1 = U.now();
      (function fadeIn() {
        var k = U.clamp((U.now() - t1) / (ms / 2), 0, 1);
        ctx.clearRect(0, 0, CFG.W, CFG.H);
        ctx.fillStyle = 'rgba(5,6,13,' + (1 - k) + ')';
        ctx.fillRect(0, 0, CFG.W, CFG.H);
        if (k < 1) window.requestAnimationFrame(fadeIn);
        else ctx.clearRect(0, 0, CFG.W, CFG.H);
      })();
    })();
  }

  /* --- overlays --- */
  function openOverlay(id, data) {
    var n = overlayNode(id);
    if (!n) { console.warn('[RID] overlay inexistente:', id); return; }
    if (openOverlays.indexOf(id) < 0) openOverlays.push(id);
    n.classList.add('is-active');
    RID.Input.lock();
    RID.Events.emit('overlay:open', { id: id, data: data });
  }

  function closeOverlay(id) {
    var n = overlayNode(id);
    if (n) n.classList.remove('is-active');
    var i = openOverlays.indexOf(id);
    if (i >= 0) openOverlays.splice(i, 1);
    if (!openOverlays.length) RID.Input.unlock();
    RID.Events.emit('overlay:close', { id: id });
  }

  function closeAllOverlays() { openOverlays.slice().forEach(closeOverlay); }
  function isOverlayOpen(id) { return id ? openOverlays.indexOf(id) >= 0 : openOverlays.length > 0; }

  /* --- fondo (capa 1) --- */
  function setBackground(key) {
    if (!bgImage) {
      bgImage  = U.el('#bg-image');
      bgCanvas = U.el('#bg-fallback');
      bgCtx    = bgCanvas.getContext('2d');
    }
    var img = key ? RID.Assets.img(key) : null;
    if (img) {
      bgImage.src = img.src;
      bgImage.classList.remove('hidden');
      bgCanvas.classList.add('hidden');
    } else {
      bgImage.classList.add('hidden');
      bgCanvas.classList.remove('hidden');
      bgCtx.clearRect(0, 0, CFG.W, CFG.H);
      RID.Assets.fallbackBG(bgCtx, key || 'dark');
    }
  }

  /* --- HUD --- */
  function setHUD(visible) { U.show(U.el('#layer-hud'), visible); }

  return {
    show: show, hide: hide, hideAll: hideAll, current: current,
    push: push, pop: pop, transition: transition,
    openOverlay: openOverlay, closeOverlay: closeOverlay,
    closeAllOverlays: closeAllOverlays, isOverlayOpen: isOverlayOpen,
    setBackground: setBackground, setHUD: setHUD, node: node
  };
})();


/* =========================================================================
   PARTE 3.12 — RID.Core
   Arranque, escalado del lienzo y alias del bus de eventos.
   Las partes siguientes se enganchan con RID.Core.on('boot:ready', ...).
   ========================================================================= */

RID.Core = (function () {

  var booted = false;

  /* Escala el lienzo 960x540 al tamaño de la ventana sin deformarlo */
  function fitStage() {
    var g = U.el('#game');
    if (!g) return;
    var pad = 24;
    var sx = (window.innerWidth  - pad) / CFG.W;
    var sy = (window.innerHeight - pad) / CFG.H;
    var s  = Math.max(0.35, Math.min(sx, sy));
    g.style.transform = 'scale(' + s + ')';
  }

  function boot() {
    if (booted) return;
    booted = true;

    RID.Input.init();
    fitStage();
    U.on(window, 'resize', fitStage);

    /* carga previa de una partida guardada (no se aplica hasta "Continuar") */
    RID.Screens.setHUD(false);
    RID.Screens.show('boot');
    RID.Screens.setBackground(null);

    var fill = U.el('#boot-fill'),
        text = U.el('#boot-text'),
        btn  = U.el('#boot-enter'),
        warn = U.el('#boot-missing');

    RID.Assets.preload(
      function (pct) {
        fill.style.width = Math.round(pct * 100) + '%';
        text.textContent = 'Loading… ' + Math.round(pct * 100) + '%';
      },
      function (missing) {
        fill.style.width = '100%';
        text.textContent = 'Ready';
        U.show(btn, true);

        if (missing.length) {
          warn.textContent = missing.length + ' file(s) not found in img/ or audio/ — ' +
                             'the game runs anyway with fallback visuals and silent tracks.';
          U.show(warn, true);
          console.warn('[RID] assets ausentes:', missing);
        }

        U.on(btn, 'click', function () {
          RID.Audio.unlock();
          RID.Loop.start();
          RID.Events.emit('boot:ready');
        });
      }
    );
  }

  return {
    boot: boot,
    fitStage: fitStage,
    on: RID.Events.on,
    once: RID.Events.once,
    off: RID.Events.off,
    emit: RID.Events.emit,
    state: function () { return RID.state; },
    isBooted: function () { return booted; }
  };
})();


/* =========================================================================
   PARTE 4.1 — DATA.i18n (textos de interfaz)
   NOTA: por especificación la INTERFAZ y las PREGUNTAS van siempre en inglés;
   solo la HISTORIA cambia de idioma. CFG.UI_LANG = 'en' fija la interfaz;
   ponerlo en 'auto' haría que la interfaz siguiera al idioma de la historia.
   ========================================================================= */

CFG.UI_LANG = 'en';

RID.DATA.i18n = {
  en: {
    tagline: 'Bowser stole your pet. Bring it home.',
    menuNew: 'New Game', menuContinue: 'Continue', menuSettings: 'Settings',
    next: 'Next', back: 'Back', start: 'Start', skip: 'Skip', continue: 'Continue',
    close: 'Close', yes: 'Yes', no: 'No',
    askPlayerName: 'What is your name?',
    askPetName: "What is your pet's name?",
    buildAvatar: 'Create your character',
    buildPet: 'Create your pet',
    optHair: 'Hair', optFace: 'Face', optShirt: 'Shirt',
    optSpecies: 'Pet', optCoat: 'Coat',
    nameRequired: 'Please type a name.',
    noSave: 'There is no saved game yet.',
    openMap: 'World Map', openLobby: 'World Lobby', quitToTitle: 'Quit to Title',
    mapTitle: 'World Map', mapHint: 'Arrows to move · Enter to play',
    enter: 'Enter',
    shopTitle: 'Shop', tabUpgrades: 'Upgrades', tabCosmetics: 'Accessories',
    leaveShop: 'Leave Shop', bought: 'Purchased!', notEnough: 'Not enough coins',
    levelFailed: 'Level Failed', quitToMap: 'Quit to Map',
    levelClear: 'Level Clear!', worldClear: 'World Clear!',
    sumScore: 'Correct answers', sumCoins: 'Coins earned', sumLives: 'Lives left',
    failNote: 'This level cannot be played again. Only a New Game resets it.',
    paused: 'Paused', resume: 'Resume', giveUp: 'Give Up Level',
    pauseNote: 'Giving up counts as a failed attempt.',
    giveUpAsk: 'Give up this level? It counts as failed and cannot be replayed.',
    resultsTitle: 'Report Card',
    thLevel: 'Level', thTopic: 'Topic', thScore: 'Score', thResult: 'Result',
    viewResults: 'Report Card', passed: 'PASSED', failed: 'FAILED', notPlayed: 'not played',
    totalScore: 'TOTAL', alreadyPlayed: 'Already played — one try per level',
    useHint: 'Hint', backToTitle: 'Back to Title',
    settingsTitle: 'Settings', setMusic: 'Music', setSfx: 'Sound FX', setLang: 'Story language',
    wipeSave: 'Erase Save', wipeAsk: 'Erase your saved game? This cannot be undone.',
    wipeDone: 'Save erased.',
    newGameAsk: 'Starting a new game will overwrite your saved progress. Continue?',
    hair_short: 'Short', hair_long: 'Long', hair_cap: 'Cap',
    face_serious: 'Serious', face_happy: 'Happy', face_angry: 'Angry', face_lashes: 'Lashes',
    pet_dog: 'Dog', pet_cat: 'Cat',
    coat_black: 'Black', coat_gray: 'Gray', coat_brown: 'Brown',
    coat_spots: 'White + spots', coat_striped: 'Striped',
    saved: 'Progress saved'
  },
  es: {
    tagline: 'Bowser se llevó a tu mascota. Tráela de vuelta.',
    menuNew: 'Nueva partida', menuContinue: 'Continuar', menuSettings: 'Opciones',
    next: 'Siguiente', back: 'Atrás', start: 'Empezar', skip: 'Saltar', continue: 'Continuar',
    close: 'Cerrar', yes: 'Sí', no: 'No',
    askPlayerName: '¿Cómo te llamas?',
    askPetName: '¿Cómo se llama tu mascota?',
    buildAvatar: 'Crea tu personaje',
    buildPet: 'Crea tu mascota',
    optHair: 'Pelo', optFace: 'Cara', optShirt: 'Camisa',
    optSpecies: 'Mascota', optCoat: 'Pelaje',
    nameRequired: 'Escribe un nombre.',
    noSave: 'Todavía no hay partida guardada.',
    openMap: 'Mapa', openLobby: 'Lobby del mundo', quitToTitle: 'Salir al título',
    mapTitle: 'Mapa del mundo', mapHint: 'Flechas para moverte · Enter para jugar',
    enter: 'Entrar',
    shopTitle: 'Tienda', tabUpgrades: 'Mejoras', tabCosmetics: 'Accesorios',
    leaveShop: 'Salir de la tienda', bought: '¡Comprado!', notEnough: 'Monedas insuficientes',
    levelFailed: 'Nivel fallido', quitToMap: 'Salir al mapa',
    levelClear: '¡Nivel superado!', worldClear: '¡Mundo superado!',
    sumScore: 'Respuestas correctas', sumCoins: 'Monedas ganadas', sumLives: 'Vidas restantes',
    failNote: 'Este nivel no se puede volver a jugar. Solo una partida nueva lo reinicia.',
    paused: 'Pausa', resume: 'Reanudar', giveUp: 'Rendirse',
    pauseNote: 'Rendirse cuenta como intento fallido.',
    giveUpAsk: '¿Rendirte en este nivel? Cuenta como fallido y no se podrá repetir.',
    resultsTitle: 'Boletín de resultados',
    thLevel: 'Nivel', thTopic: 'Tema', thScore: 'Puntaje', thResult: 'Resultado',
    viewResults: 'Boletín', passed: 'SUPERADO', failed: 'FALLIDO', notPlayed: 'sin jugar',
    totalScore: 'TOTAL', alreadyPlayed: 'Ya jugado — un intento por nivel',
    useHint: 'Pista', backToTitle: 'Volver al título',
    settingsTitle: 'Opciones', setMusic: 'Música', setSfx: 'Efectos', setLang: 'Idioma de la historia',
    wipeSave: 'Borrar partida', wipeAsk: '¿Borrar la partida guardada? No se puede deshacer.',
    wipeDone: 'Partida borrada.',
    newGameAsk: 'Empezar una partida nueva borrará tu progreso guardado. ¿Continuar?',
    hair_short: 'Corto', hair_long: 'Largo', hair_cap: 'Gorra',
    face_serious: 'Seria', face_happy: 'Feliz', face_angry: 'Enojada', face_lashes: 'Pestañas',
    pet_dog: 'Perro', pet_cat: 'Gato',
    coat_black: 'Negro', coat_gray: 'Gris', coat_brown: 'Café',
    coat_spots: 'Blanco con manchas', coat_striped: 'Rayado',
    saved: 'Progreso guardado'
  }
};


/* =========================================================================
   PARTE 4.2 — DATA.avatar y DATA.pet (opciones de creación)
   ========================================================================= */

RID.DATA.avatar = {
  hair:  [{ id: 'short', key: 'hair_short' },
          { id: 'long',  key: 'hair_long'  },
          { id: 'cap',   key: 'hair_cap'   }],
  face:  [{ id: 'serious', key: 'face_serious' },
          { id: 'happy',   key: 'face_happy'   },
          { id: 'angry',   key: 'face_angry'   },
          { id: 'lashes',  key: 'face_lashes'  }],
  shirt: [{ id: 'red',    hex: '#e03131' }, { id: 'black',  hex: '#1b1b1f' },
          { id: 'purple', hex: '#8b3ad6' }, { id: 'pink',   hex: '#f06fb4' },
          { id: 'green',  hex: '#3fb950' }, { id: 'blue',   hex: '#2f6fed' },
          { id: 'orange', hex: '#f28a20' }, { id: 'yellow', hex: '#f5d130' },
          { id: 'white',  hex: '#f2f2f2' }],
  hairColor: '#3b2412',
  skin: '#f0c39a',
  skinShade: '#d19a6e'
};

RID.DATA.pet = {
  species: [{ id: 'dog', key: 'pet_dog' }, { id: 'cat', key: 'pet_cat' }],
  coat: [
    { id: 'black',   key: 'coat_black',   base: '#242429', accent: '#3d3d45', pattern: 'none'    },
    { id: 'gray',    key: 'coat_gray',    base: '#8d939e', accent: '#b6bcc6', pattern: 'none'    },
    { id: 'brown',   key: 'coat_brown',   base: '#8a5a2b', accent: '#a97440', pattern: 'none'    },
    { id: 'spots',   key: 'coat_spots',   base: '#f0efe6', accent: '#6b5a45', pattern: 'spots'   },
    { id: 'striped', key: 'coat_striped', base: '#c08a3e', accent: '#5a3a18', pattern: 'stripes' }
  ]
};


/* =========================================================================
   PARTE 4.3 — RID.UI (parte 1 de 2: textos y avisos)
   La parte 5 añade a este mismo objeto el HUD (vidas, monedas, barras).
   ========================================================================= */

RID.UI = (function () {

  function dict(lang) { return RID.DATA.i18n[lang] || RID.DATA.i18n.en; }

  /* Texto de INTERFAZ (inglés fijo salvo que CFG.UI_LANG sea 'auto') */
  function t(key) {
    var lang = CFG.UI_LANG === 'auto' ? RID.state.lang : CFG.UI_LANG;
    var d = dict(lang);
    return (d && d[key] != null) ? d[key] : (RID.DATA.i18n.en[key] != null ? RID.DATA.i18n.en[key] : key);
  }

  /* Texto de HISTORIA (siempre sigue al idioma elegido por el jugador) */
  function ts(key) {
    var d = dict(RID.state.lang);
    return (d && d[key] != null) ? d[key] : t(key);
  }

  /* Rellena todos los [data-i18n] del documento */
  function applyI18n(root) {
    U.els('[data-i18n]', root || document).forEach(function (n) {
      n.textContent = t(n.getAttribute('data-i18n'));
    });
  }

  function toast(msg, kind) {
    var host = U.el('#layer-toast');
    if (!host) return;
    var n = U.make('div', 'toast' + (kind ? ' is-' + kind : ''), msg);
    var count = host.children.length;
    n.style.bottom = (54 + count * 40) + 'px';
    host.appendChild(n);
    window.setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2400);
  }

  /* Diálogo de confirmación reutilizable (overlay "confirm") */
  function confirm(message, onYes, onNo) {
    var box = U.el('#confirm-text'),
        yes = U.el('#confirm-yes'),
        no  = U.el('#confirm-no');
    box.textContent = message;

    function cleanup() {
      U.off(yes, 'click', okFn);
      U.off(no,  'click', noFn);
      RID.Screens.closeOverlay('confirm');
    }
    function okFn() { cleanup(); if (onYes) onYes(); }
    function noFn() { cleanup(); if (onNo)  onNo(); }

    U.on(yes, 'click', okFn);
    U.on(no,  'click', noFn);
    RID.Screens.openOverlay('confirm');
  }

  return { t: t, ts: ts, applyI18n: applyI18n, toast: toast, confirm: confirm };
})();


/* =========================================================================
   PARTE 4.4 — RID.Avatar
   Dibujo procedural del personaje y de la mascota. Nada de sprites: así el
   avatar personalizado funciona sin que el usuario aporte imágenes.
   Sistema de coordenadas local: origen en los PIES, el personaje mide 44 de
   alto y 28 de ancho antes de aplicar la escala.
   ========================================================================= */

RID.Avatar = (function () {

  var A = RID.DATA.avatar;

  function shirtHex(id) {
    for (var i = 0; i < A.shirt.length; i++) if (A.shirt[i].id === id) return A.shirt[i].hex;
    return A.shirt[0].hex;
  }

  function coatOf(id) {
    var list = RID.DATA.pet.coat;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  /* Devuelve una configuración válida completando lo que falte */
  function build(cfg) {
    var base = RID.state.player;
    cfg = cfg || {};
    return {
      name:  cfg.name  != null ? cfg.name  : base.name,
      hair:  cfg.hair  || base.hair  || 'short',
      face:  cfg.face  || base.face  || 'happy',
      shirt: cfg.shirt || base.shirt || 'red',
      cosmetics: cfg.cosmetics || base.cosmetics || [],
      equipped: cfg.equipped || base.equipped || {}
    };
  }

  /* ---------- primitivas de dibujo ---------- */
  var INK = '#1a1020';

  function ink(ctx, w) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w || 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function blob(ctx, cx, cy, rx, ry, fill, stroked) {
    U.ellipse(ctx, cx, cy, rx, ry);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroked !== false) ink(ctx, 1.4);
  }

  function pill(ctx, x, y, w, h, r, fill, stroked) {
    U.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroked !== false) ink(ctx, 1.4);
  }

  /* Overol: azul denim salvo que la camisa ya sea azul */
  function overallHex(shirtId) {
    return shirtId === 'blue' ? '#1f2f6b' : '#33499f';
  }

  /* ---------- CARAS ----------
     Ojos con esclerótica, pupila, ceja y boca. Parpadeo automático. */
  function drawFace(ctx, type, cx, cy, t, hurt, hairCol) {
    var blink = (!hurt && (t % 3.4) > 3.22);        // parpadeo corto cada 3.4 s
    var eyeL = cx - 4.3, eyeR = cx + 3.5, eyeY = cy - 2.4;

    /* cejas */
    ctx.fillStyle = hairCol || A.hairColor;
    if (type === 'angry') {
      ctx.save();
      ctx.translate(eyeL, eyeY - 5.4); ctx.rotate(0.32);
      ctx.fillRect(-3.2, -1.1, 6.4, 2.2); ctx.restore();
      ctx.save();
      ctx.translate(eyeR, eyeY - 5.4); ctx.rotate(-0.32);
      ctx.fillRect(-3.2, -1.1, 6.4, 2.2); ctx.restore();
    } else if (type === 'serious') {
      ctx.fillRect(eyeL - 3.2, eyeY - 6, 6.4, 1.9);
      ctx.fillRect(eyeR - 3.2, eyeY - 6, 6.4, 1.9);
    } else {
      ctx.save();
      ctx.translate(eyeL, eyeY - 5.8); ctx.rotate(-0.14);
      ctx.fillRect(-3.1, -1, 6.2, 2); ctx.restore();
      ctx.save();
      ctx.translate(eyeR, eyeY - 5.8); ctx.rotate(0.14);
      ctx.fillRect(-3.1, -1, 6.2, 2); ctx.restore();
    }

    if (hurt) {                                     // ojos en X al morir
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      [eyeL, eyeR].forEach(function (ex) {
        ctx.beginPath();
        ctx.moveTo(ex - 2.4, eyeY - 2.4); ctx.lineTo(ex + 2.4, eyeY + 2.4);
        ctx.moveTo(ex + 2.4, eyeY - 2.4); ctx.lineTo(ex - 2.4, eyeY + 2.4);
        ctx.stroke();
      });
    } else if (blink) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(eyeL - 2.3, eyeY); ctx.lineTo(eyeL + 2.3, eyeY);
      ctx.moveTo(eyeR - 2.3, eyeY); ctx.lineTo(eyeR + 2.3, eyeY);
      ctx.stroke();
    } else {
      /* blanco del ojo */
      blob(ctx, eyeL, eyeY, 2.5, 3.2, '#ffffff');
      blob(ctx, eyeR, eyeY, 2.5, 3.2, '#ffffff');
      /* pupila */
      var look = (type === 'angry') ? 0.6 : 0;
      ctx.fillStyle = '#2b2140';
      U.ellipse(ctx, eyeL + look, eyeY + 0.4, 1.25, 1.9); ctx.fill();
      U.ellipse(ctx, eyeR + look, eyeY + 0.4, 1.25, 1.9); ctx.fill();
      /* brillo */
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      U.ellipse(ctx, eyeL + look - 0.6, eyeY - 0.9, 0.55, 0.75); ctx.fill();
      U.ellipse(ctx, eyeR + look - 0.6, eyeY - 0.9, 0.55, 0.75); ctx.fill();

      if (type === 'lashes') {
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.lineCap = 'round';
        [[eyeL, -1], [eyeR, 1]].forEach(function (p) {
          var ex = p[0], d = p[1];
          ctx.beginPath();
          ctx.moveTo(ex - 2.6 * d, eyeY - 2.6); ctx.lineTo(ex - 4.4 * d, eyeY - 4.4);
          ctx.moveTo(ex - 1.2 * d, eyeY - 3.2); ctx.lineTo(ex - 2.2 * d, eyeY - 5.4);
          ctx.stroke();
        });
      }
    }

    /* nariz redonda estilo Mario */
    blob(ctx, cx + 0.4, cy + 1.6, 3.1, 2.6, A.skin);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    U.ellipse(ctx, cx - 0.5, cy + 0.7, 1.1, 0.8); ctx.fill();

    /* boca */
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (hurt) {
      ctx.arc(cx, cy + 8.4, 2.8, 1.15 * Math.PI, 1.85 * Math.PI);
    } else if (type === 'angry') {
      ctx.arc(cx, cy + 9.6, 3.6, 1.2 * Math.PI, 1.8 * Math.PI);
    } else if (type === 'serious') {
      ctx.moveTo(cx - 3.2, cy + 6.6); ctx.lineTo(cx + 3.2, cy + 6.6);
    } else {
      ctx.arc(cx, cy + 4.4, 3.8, 0.16 * Math.PI, 0.84 * Math.PI);
    }
    ctx.stroke();

    /* mofletes */
    if (type === 'happy' || type === 'lashes') {
      ctx.fillStyle = 'rgba(233,120,140,.45)';
      U.ellipse(ctx, cx - 7.4, cy + 3, 2.2, 1.5); ctx.fill();
      U.ellipse(ctx, cx + 7.4, cy + 3, 2.2, 1.5); ctx.fill();
    }
  }

  /* ---------- PELO / GORRA ---------- */
  function drawHair(ctx, type, cx, headCY, shirt, hairCol) {
    var top = headCY - 9.6;
    hairCol = hairCol || A.hairColor;

    if (type === 'cap') {
      /* patillas bajo la gorra */
      ctx.fillStyle = hairCol;
      ctx.beginPath();
      ctx.moveTo(cx - 10, headCY - 3); ctx.lineTo(cx - 6.6, headCY - 3);
      ctx.lineTo(cx - 7.4, headCY + 2.6); ctx.lineTo(cx - 9.8, headCY + 1.6);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 10, headCY - 3); ctx.lineTo(cx + 6.6, headCY - 3);
      ctx.lineTo(cx + 7.4, headCY + 2.6); ctx.lineTo(cx + 9.8, headCY + 1.6);
      ctx.closePath(); ctx.fill();

      /* copa */
      ctx.beginPath();
      ctx.moveTo(cx - 10.4, top + 5.4);
      ctx.quadraticCurveTo(cx - 10.4, top - 4.6, cx, top - 4.6);
      ctx.quadraticCurveTo(cx + 10.4, top - 4.6, cx + 10.4, top + 5.4);
      ctx.closePath();
      ctx.fillStyle = shirt; ctx.fill(); ink(ctx, 1.5);
      /* visera */
      ctx.beginPath();
      ctx.moveTo(cx + 2, top + 4.2);
      ctx.quadraticCurveTo(cx + 17, top + 3.4, cx + 15.6, top + 8.2);
      ctx.quadraticCurveTo(cx + 9, top + 8.6, cx + 2, top + 7.6);
      ctx.closePath();
      ctx.fillStyle = U.shade(shirt, -45); ctx.fill(); ink(ctx, 1.4);
      /* emblema */
      blob(ctx, cx - 1.4, top + 0.6, 3.3, 3.3, '#ffffff');
      U.pixelText(ctx, '★', cx - 1.4, top + 0.9, 4.4, shirt);
      return;
    }

    /* pelo */
    ctx.beginPath();
    ctx.moveTo(cx - 10.6, headCY - 1.5);
    ctx.quadraticCurveTo(cx - 11.4, top - 6.2, cx - 1, top - 5.6);
    ctx.quadraticCurveTo(cx + 11.6, top - 5.2, cx + 10.6, headCY - 2.5);
    ctx.quadraticCurveTo(cx + 7.4, top + 3.6, cx + 2.6, top + 2.2);
    ctx.quadraticCurveTo(cx - 4.6, top + 6.4, cx - 10.6, headCY - 1.5);
    ctx.closePath();
    ctx.fillStyle = hairCol; ctx.fill(); ink(ctx, 1.5);

    /* brillo del pelo */
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    U.ellipse(ctx, cx - 3.6, top - 1.4, 4.2, 2); ctx.fill();

    if (type === 'long') {
      ctx.fillStyle = hairCol;
      ctx.beginPath();
      ctx.moveTo(cx - 10.4, headCY - 4);
      ctx.quadraticCurveTo(cx - 14.4, headCY + 8, cx - 10.6, headCY + 17);
      ctx.quadraticCurveTo(cx - 7.4, headCY + 12, cx - 7, headCY + 2);
      ctx.closePath(); ctx.fill(); ink(ctx, 1.3);
      ctx.beginPath();
      ctx.moveTo(cx + 10.4, headCY - 4);
      ctx.quadraticCurveTo(cx + 14.4, headCY + 8, cx + 10.6, headCY + 17);
      ctx.quadraticCurveTo(cx + 7.4, headCY + 12, cx + 7, headCY + 2);
      ctx.closePath(); ctx.fill(); ink(ctx, 1.3);
    }
  }

  /* ---------- ACCESORIOS DE LA TIENDA ----------
     Cada accesorio se dibuja en su capa dentro del mismo sistema de
     coordenadas del personaje. Añadir uno = añadir una función aquí
     y su entrada en DATA.shop. */
  var COSMETIC = {

    cape: { layer: 'back', draw: function (ctx, shirt, headCY, t) {
      var sway = Math.sin(t * 2.2) * 1.4;
      ctx.beginPath();
      ctx.moveTo(-8, -28);
      ctx.quadraticCurveTo(-15 + sway, -12, -12 + sway, -2);
      ctx.lineTo(12 + sway, -2);
      ctx.quadraticCurveTo(15 + sway, -12, 8, -28);
      ctx.closePath();
      ctx.fillStyle = '#8b1f3a'; ctx.fill(); ink(ctx, 1.4);
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fillRect(-2, -26, 4, 24);
    } },

    skirt: { layer: 'waist', draw: function (ctx) {
      ctx.beginPath();
      ctx.moveTo(-8.6, -14.5);
      ctx.lineTo(8.6, -14.5);
      ctx.lineTo(13, -3.5);
      ctx.lineTo(-13, -3.5);
      ctx.closePath();
      ctx.fillStyle = '#2f6fed'; ctx.fill(); ink(ctx, 1.4);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(-11, -6.4, 22, 1.6);
    } },

    scarf: { layer: 'waist', draw: function (ctx, shirt, headCY, t) {
      var wave = Math.sin(t * 3) * 1.6;
      ctx.fillStyle = '#e03131';
      U.roundRect(ctx, -7.5, -30.2, 15, 4.2, 2); ctx.fill(); ink(ctx, 1.2);
      ctx.beginPath();
      ctx.moveTo(4, -28);
      ctx.quadraticCurveTo(11 + wave, -24, 9 + wave, -16);
      ctx.lineTo(4.5, -18);
      ctx.closePath();
      ctx.fillStyle = '#c62828'; ctx.fill(); ink(ctx, 1.2);
    } },

    crown: { layer: 'head', draw: function (ctx, shirt, headCY) {
      var top = headCY - 12.5;
      ctx.beginPath();
      ctx.moveTo(-9, top + 6);
      ctx.lineTo(-9, top);
      ctx.lineTo(-4.5, top + 3.4);
      ctx.lineTo(0, top - 2.6);
      ctx.lineTo(4.5, top + 3.4);
      ctx.lineTo(9, top);
      ctx.lineTo(9, top + 6);
      ctx.closePath();
      ctx.fillStyle = '#ffd447'; ctx.fill(); ink(ctx, 1.4);
      ctx.fillStyle = '#e03131';
      U.ellipse(ctx, 0, top + 3.8, 1.6, 1.6); ctx.fill();
      ctx.fillStyle = '#5eb3ff';
      U.ellipse(ctx, -5, top + 4.2, 1.2, 1.2); ctx.fill();
      U.ellipse(ctx, 5, top + 4.2, 1.2, 1.2); ctx.fill();
    } },

    bow: { layer: 'head', draw: function (ctx, shirt, headCY, t) {
      var bx = -9.5, by = headCY - 8, w = Math.sin(t * 3) * 0.6;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-0.35 + w * 0.04);
      ctx.fillStyle = '#f06fb4';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-7, -4.5); ctx.lineTo(-7, 4.5);
      ctx.closePath(); ctx.fill(); ink(ctx, 1.3);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(7, -4.5); ctx.lineTo(7, 4.5);
      ctx.closePath(); ctx.fill(); ink(ctx, 1.3);
      blob(ctx, 0, 0, 2.2, 2.2, '#ff9ed2');
      ctx.restore();
    } },

    hairGold: { layer: 'hair', hairColor: '#f2d16b' },
    hairPink: { layer: 'hair', hairColor: '#f06fb4' },
    hairSnow: { layer: 'hair', hairColor: '#e8ecf5' },

    goggles: { layer: 'head', draw: function (ctx, shirt, headCY) {
      var y = headCY - 7.6;
      ctx.fillStyle = '#3a2f1c';
      ctx.fillRect(-10.6, y - 1.6, 21.2, 3.2);
      ctx.fillStyle = '#5eb3ff';
      U.ellipse(ctx, -4.4, y, 3.4, 2.8); ctx.fill(); ink(ctx, 1.3);
      U.ellipse(ctx,  4.4, y, 3.4, 2.8); ctx.fill(); ink(ctx, 1.3);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      U.ellipse(ctx, -5.4, y - 0.9, 1.1, 0.8); ctx.fill();
      U.ellipse(ctx,  3.4, y - 0.9, 1.1, 0.8); ctx.fill();
    } }
  };

  /* Dibuja los accesorios equipados de una capa concreta */
  function drawCosmetics(ctx, layer, cfg, shirt, headCY, t) {
    var eq = cfg.equipped, slot, item;
    for (slot in eq) {
      if (!eq[slot]) continue;
      item = COSMETIC[eq[slot]];
      if (item && item.layer === layer && item.draw) item.draw(ctx, shirt, headCY, t);
    }
  }

  /* Color de pelo: el de la tienda manda sobre el de fábrica */
  function hairColorOf(cfg) {
    var eq = cfg.equipped, slot, item;
    for (slot in eq) {
      if (!eq[slot]) continue;
      item = COSMETIC[eq[slot]];
      if (item && item.hairColor) return item.hairColor;
    }
    return A.hairColor;
  }

  /* ---------- PERSONAJE ----------
     Proporciones de caricatura: cabeza grande, cuerpo compacto, overol,
     guantes blancos y botas. Origen en los PIES, altura total 44.
     pose: idle | run | jump | hurt | hug | cheer   ·   t = segundos */
  function drawPlayer(ctx, x, y, scale, pose, t, cfgIn) {
    var cfg    = build(cfgIn);
    var shirt  = shirtHex(cfg.shirt);
    var deep   = U.shade(shirt, -42);
    var pants  = overallHex(cfg.shirt);
    var pantsD = U.shade(pants, -34);
    var s      = scale || 1;
    t = t || 0;
    pose = pose || 'idle';

    var swing = 0, bob = 0, tilt = 0, armUp = 0, crouch = 0, hurt = (pose === 'hurt');

    if (pose === 'run') {
      swing = Math.sin(t * 13) * 5.6;
      bob   = Math.abs(Math.sin(t * 13)) * 1.8;
    } else if (pose === 'idle') {
      bob = Math.sin(t * 2.6) * 0.8;
    } else if (pose === 'jump') {
      swing = 2.4; crouch = 2.2; armUp = 0.6;
    } else if (pose === 'hurt') {
      tilt = Math.sin(t * 20) * 0.14; armUp = 0.35;
    } else if (pose === 'hug' || pose === 'cheer') {
      armUp = 1; bob = Math.sin(t * 3.6) * 1.3;
    }

    var headCY = -35 - bob * 0.35;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (tilt) ctx.rotate(tilt);
    ctx.translate(0, -bob);

    /* sombra en el suelo */
    ctx.fillStyle = 'rgba(0,0,0,.30)';
    U.ellipse(ctx, 0, 1.5, 11.5, 3.2); ctx.fill();

    drawCosmetics(ctx, 'back', cfg, shirt, headCY, t);

    /* ---- brazo trasero ---- */
    drawArm(ctx, -1, shirt, deep, armUp, swing, hurt);

    /* ---- piernas ---- */
    var legY = -12.5 + crouch;
    ctx.save();
    ctx.translate(-4.6, legY);
    ctx.rotate(swing * 0.035);
    pill(ctx, -3.2, 0, 6.4, 10 - crouch, 2.6, pantsD);
    ctx.restore();
    ctx.save();
    ctx.translate(4.6, legY);
    ctx.rotate(-swing * 0.035);
    pill(ctx, -3.2, 0, 6.4, 10 - crouch, 2.6, pantsD);
    ctx.restore();

    /* ---- botas ---- */
    var footY = -2.6 + crouch * 0.4;
    blob(ctx, -5.6 + swing * 0.42, footY, 6.4, 3.4, '#5a3418');
    blob(ctx,  5.6 - swing * 0.42, footY, 6.4, 3.4, '#5a3418');

    /* ---- torso: camisa ---- */
    pill(ctx, -9.6, -27.5, 19.2, 16.5, 5, shirt);
    /* sombra inferior de la camisa */
    ctx.save();
    U.roundRect(ctx, -9.6, -27.5, 19.2, 16.5, 5); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.fillRect(-9.6, -17, 19.2, 6.5);
    ctx.restore();

    /* ---- overol ---- */
    ctx.beginPath();
    ctx.moveTo(-7.4, -22.5);
    ctx.lineTo(7.4, -22.5);
    ctx.lineTo(7.4, -11.6);
    ctx.lineTo(-7.4, -11.6);
    ctx.closePath();
    ctx.fillStyle = pants; ctx.fill(); ink(ctx, 1.4);
    /* tirantes */
    ctx.fillStyle = pants;
    ctx.save();
    ctx.translate(-5.4, -26.6); ctx.rotate(0.16);
    ctx.fillRect(-1.7, 0, 3.4, 5.2); ctx.restore();
    ctx.save();
    ctx.translate(5.4, -26.6); ctx.rotate(-0.16);
    ctx.fillRect(-1.7, 0, 3.4, 5.2); ctx.restore();
    /* botones dorados */
    blob(ctx, -5.2, -21.4, 1.5, 1.5, '#ffd447');
    blob(ctx,  5.2, -21.4, 1.5, 1.5, '#ffd447');

    drawCosmetics(ctx, 'waist', cfg, shirt, headCY, t);

    /* ---- cuello ---- */
    ctx.fillStyle = A.skinShade;
    ctx.fillRect(-3, -29.4, 6, 2.6);

    /* ---- cabeza ---- */
    blob(ctx, 0, headCY, 10.2, 9.6, A.skin);
    /* orejas */
    blob(ctx, -10.2, headCY + 1.4, 2.2, 2.6, A.skin);
    blob(ctx,  10.2, headCY + 1.4, 2.2, 2.6, A.skin);
    /* sombra bajo el flequillo */
    ctx.save();
    U.ellipse(ctx, 0, headCY, 10.2, 9.6); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    ctx.fillRect(-11, headCY - 10, 22, 4.6);
    ctx.restore();

    var hairCol = hairColorOf(cfg);
    drawFace(ctx, cfg.face, 0, headCY, t, hurt, hairCol);
    drawHair(ctx, cfg.hair, 0, headCY, shirt, hairCol);
    drawCosmetics(ctx, 'head', cfg, shirt, headCY, t);

    /* ---- brazo delantero ---- */
    drawArm(ctx, 1, shirt, deep, armUp, -swing, hurt);

    ctx.restore();
  }

  /* Brazo con guante blanco. side: -1 atrás (izquierda), 1 delante */
  function drawArm(ctx, side, shirt, deep, armUp, swing, hurt) {
    var sx = side * 9.4;
    var baseA = -0.22 * side;
    var ang = armUp ? (side * -2.15 * armUp) : (baseA + swing * 0.055 * side);
    if (hurt) ang = side * -1.5;

    ctx.save();
    ctx.translate(sx, -25.4);
    ctx.rotate(ang);
    pill(ctx, -2.4, 0, 4.8, 11.5, 2.4, side < 0 ? deep : shirt);
    blob(ctx, 0, 13.2, 3.4, 3.2, '#ffffff');     // guante
    ctx.restore();
  }

  /* ---------- MASCOTA ---------- */
  /* pose: idle | run | sad | happy | hug */
  function drawPet(ctx, x, y, scale, pose, t, cfgIn) {
    var cfg  = cfgIn || RID.state.pet;
    var coat = coatOf(cfg.coat);
    var dog  = (cfg.species || 'dog') === 'dog';
    var s    = scale || 1;
    t = t || 0;
    pose = pose || 'idle';

    /* --- dormida: hecha un ovillo, la cola alrededor --- */
    if (pose === 'sleep') {
      var br = Math.sin(t * 1.2) * 0.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);

      ctx.fillStyle = 'rgba(0,0,0,.22)';
      U.ellipse(ctx, 0, 1, 15, 3.4); ctx.fill();

      /* cola enroscada */
      ctx.strokeStyle = coat.base;
      ctx.lineCap = 'round';
      ctx.lineWidth = dog ? 3.6 : 2.8;
      ctx.beginPath();
      ctx.moveTo(11, -4);
      ctx.quadraticCurveTo(19, -12, 8, -15);
      ctx.stroke();

      /* cuerpo enroscado */
      ctx.fillStyle = coat.base;
      U.ellipse(ctx, 0, -8 - br, 15, 9 + br); ctx.fill();
      ctx.strokeStyle = 'rgba(5,6,13,.6)'; ctx.lineWidth = 1.2; ctx.stroke();

      if (coat.pattern === 'spots') {
        ctx.fillStyle = coat.accent;
        U.ellipse(ctx, -4, -10, 3.4, 2.4); ctx.fill();
        U.ellipse(ctx,  5, -6,  2.6, 1.9); ctx.fill();
      } else if (coat.pattern === 'stripes') {
        ctx.fillStyle = coat.accent;
        ctx.fillRect(-6, -14, 2, 8);
        ctx.fillRect(0, -15, 2, 9);
        ctx.fillRect(6, -14, 2, 8);
      }

      /* cabeza apoyada */
      ctx.fillStyle = coat.base;
      U.ellipse(ctx, -11, -6 - br, 7.4, 6.4); ctx.fill();
      ctx.fillStyle = U.shade(coat.base, -22);
      if (dog) {
        U.ellipse(ctx, -16, -8 - br, 2.8, 5); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(-16, -10 - br); ctx.lineTo(-13, -17 - br); ctx.lineTo(-10, -10 - br);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = coat.pattern === 'spots' ? '#e6e2d6' : U.shade(coat.base, 26);
      U.ellipse(ctx, -13, -3.6 - br, 4.4, 3); ctx.fill();
      ctx.fillStyle = '#1b1b1f';
      U.ellipse(ctx, -15.5, -4.4 - br, 1.3, 1); ctx.fill();
      /* ojo cerrado */
      ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-11, -8 - br, 2, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.restore();
      return;
    }

    var bob = 0, tail = 0, ear = 0;
    if (pose === 'idle')  { bob = Math.sin(t * 3) * 0.8;  tail = Math.sin(t * 5) * 0.4; }
    if (pose === 'run')   { bob = Math.abs(Math.sin(t * 12)) * 2; tail = Math.sin(t * 12) * 0.5; }
    if (pose === 'happy' || pose === 'hug') { bob = Math.abs(Math.sin(t * 7)) * 2.4; tail = Math.sin(t * 14) * 0.8; }
    if (pose === 'sad')   { ear = 0.5; tail = -0.4; }

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.translate(0, -bob);

    ctx.fillStyle = 'rgba(0,0,0,.28)';
    U.ellipse(ctx, 0, 1, 13, 3.2); ctx.fill();

    /* cola */
    ctx.strokeStyle = coat.base;
    ctx.lineCap = 'round';
    ctx.lineWidth = dog ? 3.4 : 2.6;
    ctx.beginPath();
    ctx.moveTo(11, -12);
    if (dog) ctx.quadraticCurveTo(19 + tail * 3, -20 + tail * 4, 15 + tail * 2, -27);
    else     ctx.quadraticCurveTo(21 + tail * 4, -16, 22 + tail * 4, -28);
    ctx.stroke();

    /* patas */
    ctx.fillStyle = U.shade(coat.base, -18);
    ctx.fillRect(-9, -7, 4.5, 7);
    ctx.fillRect(-2, -7, 4.5, 7);
    ctx.fillRect(4.5, -7, 4.5, 7);

    /* cuerpo */
    ctx.fillStyle = coat.base;
    U.ellipse(ctx, 0, -13, 13, 8.5); ctx.fill();

    /* patrón del pelaje */
    if (coat.pattern === 'spots') {
      ctx.fillStyle = coat.accent;
      U.ellipse(ctx, -5, -15, 3.6, 2.8); ctx.fill();
      U.ellipse(ctx,  4, -11, 2.8, 2.2); ctx.fill();
      U.ellipse(ctx,  8, -17, 2.2, 1.8); ctx.fill();
    } else if (coat.pattern === 'stripes') {
      ctx.fillStyle = coat.accent;
      ctx.fillRect(-7, -20, 2.2, 9);
      ctx.fillRect(-1, -21, 2.2, 10);
      ctx.fillRect(5,  -20, 2.2, 9);
    }

    /* cabeza */
    var hx = -11, hy = -24;
    ctx.fillStyle = coat.base;
    U.ellipse(ctx, hx, hy, 8.6, 7.6); ctx.fill();

    /* orejas */
    ctx.fillStyle = U.shade(coat.base, -22);
    if (dog) {
      U.ellipse(ctx, hx - 7, hy - 1 + ear * 4, 3.2, 6.2); ctx.fill();
      U.ellipse(ctx, hx + 6, hy - 1 + ear * 4, 3.2, 6.2); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy - 3 + ear * 3); ctx.lineTo(hx - 4.5, hy - 11 + ear * 4); ctx.lineTo(hx - 1.5, hy - 4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + 8, hy - 3 + ear * 3); ctx.lineTo(hx + 4.5, hy - 11 + ear * 4); ctx.lineTo(hx + 1.5, hy - 4);
      ctx.closePath(); ctx.fill();
    }

    /* hocico y cara */
    ctx.fillStyle = coat.pattern === 'spots' ? '#e6e2d6' : U.shade(coat.base, 26);
    U.ellipse(ctx, hx - 2, hy + 3.4, 5, 3.6); ctx.fill();

    ctx.fillStyle = '#1b1b1f';
    U.ellipse(ctx, hx - 4.5, hy + 2.4, 1.5, 1.2); ctx.fill();      // nariz
    if (pose === 'sad') {
      ctx.fillRect(hx - 5.5, hy - 2, 3, 1.4);
      ctx.fillRect(hx + 1.5, hy - 2, 3, 1.4);
    } else {
      U.ellipse(ctx, hx - 4, hy - 1.6, 1.5, 1.8); ctx.fill();
      U.ellipse(ctx, hx + 3, hy - 1.6, 1.5, 1.8); ctx.fill();
    }
    if (!dog) {                                                     // bigotes
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy + 3); ctx.lineTo(hx - 13, hy + 1.5);
      ctx.moveTo(hx - 6, hy + 4.5); ctx.lineTo(hx - 13, hy + 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- HUELLA (icono de vida) ---------- */
  function pawSVG(species, color) {
    var dog = (species || RID.state.pet.species) === 'dog';
    var c = color || '#ffcc00';
    var toes = dog
      ? '<ellipse cx="9"  cy="11" rx="3.1" ry="4.1"/>' +
        '<ellipse cx="16" cy="8"  rx="3.3" ry="4.4"/>' +
        '<ellipse cx="23" cy="11" rx="3.1" ry="4.1"/>' +
        '<ellipse cx="27" cy="18" rx="2.7" ry="3.5"/>'
      : '<ellipse cx="8"  cy="12" rx="2.8" ry="3.6"/>' +
        '<ellipse cx="14" cy="8"  rx="2.9" ry="3.7"/>' +
        '<ellipse cx="21" cy="8"  rx="2.9" ry="3.7"/>' +
        '<ellipse cx="27" cy="12" rx="2.8" ry="3.6"/>';
    var pad = dog
      ? '<path d="M16 30c-5.2 0-8.6-2.7-8.6-6.3 0-3.4 3.5-5.4 8.6-5.4s8.6 2 8.6 5.4c0 3.6-3.4 6.3-8.6 6.3z"/>'
      : '<ellipse cx="17" cy="23" rx="8" ry="6.4"/>';
    return '<svg class="paw" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg" fill="' + c + '">' +
           toes + pad + '</svg>';
  }

  /* ---------- VISTA PREVIA ANIMADA ---------- */
  var previewRAF = 0, previewT = 0;

  function stopPreview() {
    if (previewRAF) window.cancelAnimationFrame(previewRAF);
    previewRAF = 0;
  }

  function preview(canvas, kind) {
    stopPreview();
    if (!canvas) return;
    var ctx = canvas.getContext('2d'), t0 = U.now();

    (function frame() {
      previewRAF = window.requestAnimationFrame(frame);
      previewT = (U.now() - t0) / 1000;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      /* tablero de ajedrez de fondo */
      var sq = 20, i, j;
      for (i = 0; i * sq < canvas.width; i++) {
        for (j = 0; j * sq < canvas.height; j++) {
          ctx.fillStyle = ((i + j) % 2) ? '#141a33' : '#0f1428';
          ctx.fillRect(i * sq, j * sq, sq, sq);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(0, canvas.height - 34, canvas.width, 34);

      var cx = canvas.width / 2, base = canvas.height - 30;
      if (kind === 'pet') drawPet(ctx, cx + 6, base, 3.2, 'idle', previewT);
      else                drawPlayer(ctx, cx, base, 3.4, 'idle', previewT);
    })();
  }

  function applyCosmetic(id) {
    var list = RID.state.player.cosmetics;
    if (list.indexOf(id) < 0) list.push(id);
    RID.Storage.autosave();
  }

  /* ---------- CABEZA DORMIDA ----------
     Solo la cabeza, con los ojos cerrados: para la escena de la cama,
     donde el cuerpo va tapado por la manta. */
  function drawSleepHead(ctx, x, y, scale, t, cfgIn) {
    var cfg   = build(cfgIn);
    var shirt = shirtHex(cfg.shirt);
    var hairCol = hairColorOf(cfg);
    var s = scale || 1;
    var breathe = Math.sin((t || 0) * 1.1) * 0.4;

    ctx.save();
    ctx.translate(x, y + breathe);
    ctx.scale(s, s);
    ctx.rotate(-0.12);

    /* cabeza */
    blob(ctx, 0, 0, 10.2, 9.6, A.skin);
    blob(ctx, -10.2, 1.4, 2.2, 2.6, A.skin);
    blob(ctx,  10.2, 1.4, 2.2, 2.6, A.skin);

    /* ojos cerrados */
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-4.3, -2.2, 2.6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.arc( 3.5, -2.2, 2.6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    /* nariz y boca tranquila */
    blob(ctx, 0.4, 1.6, 3.1, 2.6, A.skin);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 5.2, 2.4, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();

    /* mofletes */
    ctx.fillStyle = 'rgba(233,120,140,.4)';
    U.ellipse(ctx, -7.4, 3, 2.2, 1.5); ctx.fill();
    U.ellipse(ctx,  7.4, 3, 2.2, 1.5); ctx.fill();

    drawHair(ctx, cfg.hair, 0, 0, shirt, hairCol);
    drawCosmetics(ctx, 'head', cfg, shirt, 0, t || 0);
    ctx.restore();
  }

  /* ---------- CAPARAZÓN DE KOOPA ----------
     Cúpula con placas hexagonales y reborde crema festoneado.
     x,y = centro · r = radio · spin = giro en radianes */
  function drawShell(ctx, x, y, r, spin, hex) {
    var base = hex || '#3fb950';
    var i, a;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin || 0);

    /* reborde crema con festón */
    ctx.beginPath();
    U.ellipse(ctx, 0, r * 0.34, r * 1.04, r * 0.58);
    ctx.fillStyle = '#f7f0d4'; ctx.fill(); ink(ctx, r * 0.11);
    ctx.fillStyle = '#e2d8b2';
    for (i = -3; i <= 3; i++) {
      U.ellipse(ctx, i * r * 0.29, r * 0.72, r * 0.13, r * 0.09); ctx.fill();
    }

    /* cúpula */
    var g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.08, 0, 0, r * 1.15);
    g.addColorStop(0, U.shade(base, 62));
    g.addColorStop(0.55, base);
    g.addColorStop(1, U.shade(base, -58));
    ctx.beginPath();
    ctx.arc(0, r * 0.22, r, Math.PI, 0);
    ctx.lineTo(r, r * 0.3);
    ctx.quadraticCurveTo(0, r * 0.62, -r, r * 0.3);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill(); ink(ctx, r * 0.12);

    /* placas hexagonales */
    ctx.fillStyle = U.shade(base, -34);
    function hexAt(hx, hy, hr) {
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        a = Math.PI / 3 * k - Math.PI / 6;
        ctx[k ? 'lineTo' : 'moveTo'](hx + Math.cos(a) * hr, hy + Math.sin(a) * hr);
      }
      ctx.closePath(); ctx.fill();
    }
    hexAt(0, -r * 0.16, r * 0.28);
    for (i = 0; i < 5; i++) {
      a = Math.PI + (Math.PI / 4) * (i + 0.5);
      hexAt(Math.cos(a) * r * 0.60, -r * 0.16 + Math.sin(a) * r * 0.52, r * 0.20);
    }

    /* brillo */
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    U.ellipse(ctx, -r * 0.40, -r * 0.46, r * 0.26, r * 0.15); ctx.fill();

    ctx.restore();
  }

  /* ---------- KART VISTO POR DETRÁS ----------
     Orden de dibujo importante: el piloto va PRIMERO y el chasis se pinta
     encima, de modo que queda sentado DENTRO del kart y no flotando sobre
     él. Las ruedas se pintan al final porque son lo más cercano a la cámara.
     Origen = punto de contacto con el suelo. */
  function drawKart(ctx, x, y, scale, opts) {
    opts = opts || {};
    var s    = scale || 1;
    var t    = opts.t || 0;
    var lean = opts.lean || 0;
    var body = opts.color || shirtHex(RID.state.player.shirt);
    var dark = U.shade(body, -55);
    var lite = U.shade(body, 40);
    var k;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(lean * 0.025);

    /* sombra en el suelo */
    ctx.fillStyle = 'rgba(0,0,0,.40)';
    U.ellipse(ctx, 0, -2, 82, 10); ctx.fill();

    /* --- 1. piloto sentado (el chasis lo tapará de cintura para abajo) --- */
    if (opts.driver !== false) {
      drawPlayer(ctx, 0, -26, 1.15, opts.pose || 'idle', t);
    }

    /* --- 2. chasis: bajo, ancho y de fondo plano --- */
    ctx.beginPath();
    ctx.moveTo(-58, -54);
    ctx.lineTo(58, -54);
    ctx.lineTo(50, -14);
    ctx.lineTo(-50, -14);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();

    /* brillo superior y faldón inferior */
    ctx.fillStyle = lite;
    ctx.fillRect(-56, -53, 112, 4);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-52, -22); ctx.lineTo(52, -22);
    ctx.lineTo(50, -14); ctx.lineTo(-50, -14);
    ctx.closePath(); ctx.fill();

    /* --- 3. motor y escapes, al fondo del kart --- */
    ctx.fillStyle = '#3d3d4a';
    U.roundRect(ctx, -30, -48, 60, 22, 5); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#57576a';
    ctx.fillRect(-24, -44, 48, 4);
    ctx.fillRect(-24, -36, 48, 4);

    ctx.fillStyle = '#7b8090';
    for (k = -1; k <= 1; k += 2) {
      U.roundRect(ctx, k * 44 - 8, -42, 16, 26, 5); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#2a2a33';
      U.ellipse(ctx, k * 44, -18, 6, 3); ctx.fill();
      ctx.fillStyle = '#7b8090';
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (k = -1; k <= 1; k += 2) {
      var fg = ctx.createRadialGradient(k * 44, -14, 1, k * 44, -14, 22);
      fg.addColorStop(0, 'rgba(150,225,255,.8)');
      fg.addColorStop(1, 'rgba(150,225,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(k * 44, -12 + Math.sin(t * 22 + k) * 2, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* pilotos traseros y matrícula */
    ctx.fillStyle = '#ff4242';
    U.roundRect(ctx, -50, -34, 15, 8, 3); ctx.fill();
    U.roundRect(ctx, 35, -34, 15, 8, 3); ctx.fill();
    ctx.fillStyle = '#f6f2e2';
    U.roundRect(ctx, -12, -34, 24, 14, 3); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.6; ctx.stroke();
    U.pixelText(ctx, '1', 0, -27, 12, '#1b1b1f');

    /* --- 4. ruedas: lo más cercano a la cámara --- */
    function wheel(wx) {
      ctx.save();
      ctx.translate(wx, -23);
      /* neumático */
      ctx.fillStyle = '#0d0d14';
      U.roundRect(ctx, -16, -23, 32, 46, 10); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#23232c';
      for (k = -2; k <= 2; k++) ctx.fillRect(-14, k * 9 - 2, 28, 4);
      /* llanta */
      ctx.fillStyle = '#d3d7e2';
      U.ellipse(ctx, 0, 0, 8.5, 12); ctx.fill();
      ctx.strokeStyle = '#5d6272'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#9aa0b2';
      U.ellipse(ctx, 0, 0, 4, 5.5); ctx.fill();
      /* brillo del caucho */
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fillRect(-13, -20, 5, 40);
      ctx.restore();
    }
    wheel(-64); wheel(64);

    ctx.restore();
  }

  return {
    build: build, drawPlayer: drawPlayer, drawPet: drawPet,
    drawSleepHead: drawSleepHead, drawShell: drawShell, drawKart: drawKart,
    preview: preview, stopPreview: stopPreview, pawSVG: pawSVG,
    shirtHex: shirtHex, coatOf: coatOf, applyCosmetic: applyCosmetic
  };
})();


/* =========================================================================
   PARTE 4.5 — RID.Flow
   Controlador de navegación: decide QUÉ pantalla va después de cuál.
   Las pantallas se limitan a mostrarse; la lógica de recorrido vive aquí.
   ========================================================================= */

RID.Flow = (function () {

  var draft  = null;     // configuración en curso durante la creación
  var wired  = false;    // el cableado se hace una sola vez

  /* ---------- utilidades de opciones ---------- */
  function buildOptions(container, items, current, onPick, asColor) {
    U.clear(container);
    items.forEach(function (item) {
      var b = U.make('button', 'opt' + (item.id === current ? ' is-selected' : ''));
      b.type = 'button';
      if (asColor) {
        b.style.background = item.hex;
        b.title = item.id;
      } else {
        b.textContent = RID.UI.t(item.key);
      }
      U.on(b, 'click', function () {
        U.els('.opt', container).forEach(function (o) { o.classList.remove('is-selected'); });
        b.classList.add('is-selected');
        onPick(item.id);
      });
      container.appendChild(b);
    });
  }

  /* ---------- 2. TÍTULO ---------- */
  function goTitle() {
    RID.Avatar.stopPreview();
    RID.Screens.closeAllOverlays();
    RID.Screens.setHUD(false);
    RID.Screens.setBackground('bg.title');
    RID.Audio.playMusic('music.lobby');
    U.el('#title-continue').disabled = !RID.Storage.hasSave();
    RID.Screens.show('title');
  }

  /* ---------- 3. IDIOMA ---------- */
  function goLanguage() { RID.Screens.show('language'); }

  function pickLanguage(lang) {
    RID.state.lang = lang;
    RID.Storage.autosave();
    goPlayerName();
  }

  /* ---------- 4. NOMBRE DEL JUGADOR ---------- */
  function goPlayerName() {
    var input = U.el('#input-player-name');
    input.value = draft.name || '';
    U.show(U.el('#player-name-error'), false);
    RID.Screens.show('player-name');
    window.setTimeout(function () { input.focus(); }, 60);
  }

  function submitPlayerName() {
    var input = U.el('#input-player-name'),
        name  = input.value.trim();
    if (!name) {
      var err = U.el('#player-name-error');
      err.textContent = RID.UI.t('nameRequired');
      U.show(err, true);
      return;
    }
    draft.name = name;
    goAvatar();
  }

  /* ---------- 5. AVATAR ---------- */
  function refreshAvatarPreview() {
    U.el('#avatar-preview-name').textContent = draft.name || '';
    RID.state.player.hair  = draft.hair;
    RID.state.player.face  = draft.face;
    RID.state.player.shirt = draft.shirt;
  }

  function goAvatar() {
    var A = RID.DATA.avatar;
    buildOptions(U.el('#opt-hair'),  A.hair,  draft.hair,  function (id) { draft.hair = id;  refreshAvatarPreview(); });
    buildOptions(U.el('#opt-face'),  A.face,  draft.face,  function (id) { draft.face = id;  refreshAvatarPreview(); });
    buildOptions(U.el('#opt-shirt'), A.shirt, draft.shirt, function (id) { draft.shirt = id; refreshAvatarPreview(); }, true);
    refreshAvatarPreview();
    RID.Screens.show('avatar');
    RID.Avatar.preview(U.el('#avatar-preview'), 'player');
  }

  /* ---------- 6. NOMBRE DE LA MASCOTA ---------- */
  function goPetName() {
    RID.Avatar.stopPreview();
    var input = U.el('#input-pet-name');
    input.value = draft.petName || '';
    U.show(U.el('#pet-name-error'), false);
    RID.Screens.show('pet-name');
    window.setTimeout(function () { input.focus(); }, 60);
  }

  function submitPetName() {
    var input = U.el('#input-pet-name'),
        name  = input.value.trim();
    if (!name) {
      var err = U.el('#pet-name-error');
      err.textContent = RID.UI.t('nameRequired');
      U.show(err, true);
      return;
    }
    draft.petName = name;
    goPetBuilder();
  }

  /* ---------- 7. MASCOTA ---------- */
  function refreshPetPreview() {
    U.el('#pet-preview-name').textContent = draft.petName || '';
    RID.state.pet.species = draft.species;
    RID.state.pet.coat    = draft.coat;
  }

  function goPetBuilder() {
    var P = RID.DATA.pet;
    buildOptions(U.el('#opt-species'), P.species, draft.species, function (id) { draft.species = id; refreshPetPreview(); });
    buildOptions(U.el('#opt-coat'),    P.coat,    draft.coat,    function (id) { draft.coat = id;    refreshPetPreview(); });
    refreshPetPreview();
    RID.Screens.show('pet-builder');
    RID.Avatar.preview(U.el('#pet-preview'), 'pet');
  }

  /* ---------- fin de la creación ---------- */
  function finishCreation() {
    RID.Avatar.stopPreview();

    RID.state.player.name  = draft.name;
    RID.state.player.hair  = draft.hair;
    RID.state.player.face  = draft.face;
    RID.state.player.shirt = draft.shirt;
    RID.state.pet.name     = draft.petName;
    RID.state.pet.species  = draft.species;
    RID.state.pet.coat     = draft.coat;
    RID.state.run.world    = 1;
    RID.state.run.level    = 1;
    RID.state.run.lives    = CFG.LIVES;
    RID.state.run.coins    = 0;
    RID.Storage.save();

    /* La parte 5 engancha este evento para lanzar la introducción */
    RID.Events.emit('game:begin', { fresh: true });
  }

  /* ---------- partida nueva / continuar ---------- */
  function newGame() {
    var doIt = function () {
      RID.state = RID.defaultState();
      draft = {
        name: '', hair: 'short', face: 'happy', shirt: 'red',
        petName: '', species: 'dog', coat: 'brown'
      };
      goLanguage();
    };
    if (RID.Storage.hasSave()) RID.UI.confirm(RID.UI.t('newGameAsk'), doIt);
    else doIt();
  }

  function continueGame() {
    var saved = RID.Storage.load();
    if (!saved) { RID.UI.toast(RID.UI.t('noSave'), 'bad'); return; }
    RID.state = saved;
    RID.Events.emit('game:resume', { level: saved.run.level });
  }

  /* ---------- 21. OPCIONES ---------- */
  var settingsReturn = 'title';

  function goSettings(from) {
    settingsReturn = from || RID.Screens.current() || 'title';
    U.el('#set-music').value = Math.round(RID.state.settings.musicVol * 100);
    U.el('#set-sfx').value   = Math.round(RID.state.settings.sfxVol * 100);
    markLangButtons();
    RID.Screens.show('settings');
  }

  function markLangButtons() {
    U.els('[data-setlang]').forEach(function (b) {
      b.classList.toggle('is-selected', b.getAttribute('data-setlang') === RID.state.lang);
    });
  }

  function closeSettings() { RID.Screens.show(settingsReturn); }

  /* ---------- cableado ---------- */
  function wire() {
    if (wired) return;
    wired = true;
    RID.UI.applyI18n();

    /* título */
    U.on(U.el('#title-new'),      'click', newGame);
    U.on(U.el('#title-continue'), 'click', continueGame);
    U.on(U.el('#title-settings'), 'click', function () { goSettings('title'); });

    /* idioma */
    U.els('[data-lang]').forEach(function (b) {
      U.on(b, 'click', function () { pickLanguage(b.getAttribute('data-lang')); });
    });

    /* nombres */
    U.on(U.el('#player-name-next'), 'click', submitPlayerName);
    U.on(U.el('#input-player-name'), 'keydown', function (e) { if (e.key === 'Enter') submitPlayerName(); });
    U.on(U.el('#pet-name-next'), 'click', submitPetName);
    U.on(U.el('#pet-name-back'), 'click', goAvatar);
    U.on(U.el('#input-pet-name'), 'keydown', function (e) { if (e.key === 'Enter') submitPetName(); });

    /* creadores */
    U.on(U.el('#avatar-back'), 'click', goPlayerName);
    U.on(U.el('#avatar-next'), 'click', goPetName);
    U.on(U.el('#pet-back'),    'click', goPetName);
    U.on(U.el('#pet-next'),    'click', finishCreation);

    /* opciones */
    U.on(U.el('#set-music'), 'input', function () { RID.Audio.setMusicVol(this.value / 100); });
    U.on(U.el('#set-sfx'),   'input', function () { RID.Audio.setSfxVol(this.value / 100); RID.Audio.sfx('sfx.coin'); });
    U.els('[data-setlang]').forEach(function (b) {
      U.on(b, 'click', function () {
        RID.state.lang = b.getAttribute('data-setlang');
        markLangButtons();
        RID.Storage.autosave();
      });
    });
    U.on(U.el('#set-close'), 'click', closeSettings);
    U.on(U.el('#set-wipe'),  'click', function () {
      RID.UI.confirm(RID.UI.t('wipeAsk'), function () {
        RID.Storage.wipe();
        RID.state = RID.defaultState();
        RID.UI.toast(RID.UI.t('wipeDone'), 'bad');
        goTitle();
      });
    });

    /* la creación no necesita el bucle de juego */
    RID.Events.on('screen:show', function (e) {
      if (e.id !== 'avatar' && e.id !== 'pet-builder') RID.Avatar.stopPreview();
    });
  }

  return {
    wire: wire, goTitle: goTitle, goSettings: goSettings,
    newGame: newGame, continueGame: continueGame,
    draft: function () { return draft; }
  };
})();


/* Enganche: al pulsar PRESS START se cablea todo y se va al título --------- */
RID.Events.on('boot:ready', function () {
  RID.Flow.wire();
  RID.Flow.goTitle();
});


/* =========================================================================
   PARTE 5.1 — DATA.story
   Cada escena: { id, after, anim, text:{es:[páginas], en:[páginas]} }
     after: 'start'  -> antes del nivel 1
     after: <número> -> justo después de superar ese nivel
   Añadir historia = añadir objetos a este array. Nada más.
   ========================================================================= */

RID.DATA.story = [
  {
    id: 's0', img: 1, after: 'start', anim: 'missing',
    text: {
      es: [
        'Era una noche tranquila… hasta que {PET} dejó de responder.',
        'Su cama estaba vacía. La puerta, abierta de par en par. Y en el suelo, una huella enorme con garras.',
        '¡Bowser! Solo él sería capaz de algo así. {PLAYER} apretó los puños: iba a recuperar a {PET} costara lo que costara.',
        'La única pista era una alcantarilla abierta al final de la calle. {PLAYER} respiró hondo y saltó a la oscuridad.'
      ],
      en: [
        'It was a quiet night… until {PET} stopped answering.',
        'The bed was empty. The door was wide open. And on the floor there was a huge clawed footprint.',
        'Bowser! Only he could have done this. {PLAYER} clenched their fists: they would get {PET} back, no matter what.',
        'The only clue was an open sewer at the end of the street. {PLAYER} took a deep breath and jumped into the dark.'
      ]
    }
  },
  {
    id: 's1', img: 2, bgKey: 'bg.world1', after: 1, anim: 'mushroom',
    text: {
      es: [
        'Al cruzar el laberinto de las alcantarillas, la oscuridad se abrió de golpe en una tierra mágica y misteriosa.',
        '¡Era la Tierra Champiñón!',
        '{PLAYER} avanzó con intriga hasta cruzarse con Toad, que temblaba detrás de un champiñón.',
        '"¡Bowser también está atormentando nuestro reino!", dijo Toad. "Tiene secuestrados a Mario y a sus amigos. Eres el único que puede salvarlos."',
        'Toad llevó a {PLAYER} hasta el castillo de la princesa Peach… un castillo lleno de trampas puestas por los secuaces de Bowser.'
      ],
      en: [
        'After crossing the sewer maze, the darkness suddenly opened into a magical, mysterious land.',
        'It was Mushroom Land!',
        '{PLAYER} moved forward with curiosity until they met Toad, shaking behind a mushroom.',
        '"Bowser is tormenting our kingdom too!" said Toad. "He has kidnapped Mario and his friends. You are the only one who can save them."',
        'Toad led {PLAYER} to Princess Peach\'s castle… a castle full of traps set by Bowser\'s minions.'
      ]
    }
  },
  {
    id: 's2', img: 3, bgKey: 'bg.level2', after: 2, anim: 'letter',
    text: {
      es: [
        'En el cuarto del trono no había nadie. Solo silencio… y un sobre escondido bajo el cojín del trono.',
        'Era una carta de Peach: "Eres el único que puede salvar ambos reinos. Sigue este mapa."',
        'Dentro del sobre había un mapa dibujado a mano con cinco reinos marcados. El último tenía un dibujo de fuego.',
        'Ahora {PLAYER} sabía a dónde ir. Pero primero había que salir del castillo… por el mismo camino lleno de trampas.'
      ],
      en: [
        'There was nobody in the throne room. Only silence… and an envelope hidden under the cushion of the throne.',
        'It was a letter from Peach: "You are the only one who can save both kingdoms. Follow this map."',
        'Inside the envelope there was a hand-drawn map with five kingdoms marked on it. The last one had a drawing of fire.',
        'Now {PLAYER} knew where to go. But first they had to get out of the castle… through the same trap-filled corridor.'
      ]
    }
  },
  {
    id: 's3', img: 4, bgKey: 'bg.level4', after: 3, anim: 'drive',
    text: {
      es: [
        '{PLAYER} salió del castillo con el mapa en la mano y una misión clara: recorrer los reinos y rescatarlos a todos.',
        'Pero lo más importante seguía siendo rescatar a {PET}.',
        'El siguiente destino era la Isla de Yoshi, al otro lado de la Senda Arcoíris. {PLAYER} encendió el motor del auto.',
        'En el camino ya se veían Goombas y Koopa Troopas bloqueando la pista. No iba a ser un paseo.'
      ],
      en: [
        '{PLAYER} left the castle with the map in hand and a clear mission: travel the kingdoms and free them all.',
        'But the most important thing was still rescuing {PET}.',
        'The next stop was Yoshi\'s Island, on the other side of the Rainbow Road. {PLAYER} started the engine.',
        'Goombas and Koopa Troopas could already be seen blocking the track ahead. This would not be an easy ride.'
      ]
    }
  },
  {
    id: 's4', img: 5, bgKey: 'bg.level5', after: 4, anim: 'cracks',
    text: {
      es: [
        'Al llegar a la Isla de Yoshi, el suelo estaba partido por grietas enormes.',
        'Los Yoshis habían sido esclavizados y trabajaban encadenados bajo el sol.',
        'Uno de ellos levantó la cabeza: "El culpable es Roy Koopa. Está al otro lado de las grietas."',
        'Para rescatarlos había que llegar hasta él… saltando de borde en borde.'
      ],
      en: [
        'When {PLAYER} arrived at Yoshi\'s Island, the ground was broken by enormous cracks.',
        'The Yoshis had been enslaved and were working in chains under the sun.',
        'One of them lifted his head: "Roy Koopa did this. He is on the other side of the cracks."',
        'To rescue them, {PLAYER} had to reach him… jumping from edge to edge.'
      ]
    }
  },
  {
    id: 's5', img: 6, bgKey: 'bg.level5', after: 5, anim: 'boss',
    text: {
      es: [
        'Del otro lado de las grietas, la tierra temblaba.',
        'Roy Koopa apareció con sus gafas oscuras y una sonrisa cruel. "¿Tú? ¿Tú vas a salvarlos?"',
        'Levantó la mano y una lluvia de caparazones salió disparada hacia {PLAYER}.',
        'No había forma de golpearlo de frente. Habría que devolverle sus propios caparazones.'
      ],
      en: [
        'On the other side of the cracks, the ground was shaking.',
        'Roy Koopa appeared with his dark glasses and a cruel smile. "You? You are going to save them?"',
        'He raised his hand and a rain of shells shot towards {PLAYER}.',
        'There was no way to hit him head-on. {PLAYER} would have to throw his own shells back at him.'
      ]
    }
  },
  {
    id: 's6', img: 7, bgKey: 'bg.level5', after: 6, anim: 'coins',
    text: {
      es: [
        'Con Roy derrotado, las cadenas de los Yoshis cayeron al suelo.',
        '{PLAYER} decidió dar una vuelta por la isla para ver en qué estado la habían dejado.',
        'Los Yoshis, agradecidos, trajeron un montón de monedas de oro… pero la bolsa se rompió.',
        'Las monedas rodaron directo hacia las grietas que dejó Roy Koopa. ¡Había que atraparlas!'
      ],
      en: [
        'With Roy defeated, the chains fell off the Yoshis.',
        '{PLAYER} decided to walk around the island to see the damage.',
        'The grateful Yoshis brought a pile of gold coins… but the bag broke open.',
        'The coins rolled straight towards the cracks Roy Koopa had left behind. They had to be caught!'
      ]
    }
  },
  {
    id: 's7', img: 8, bgKey: 'bg.level4', after: 7, anim: 'drive',
    text: {
      es: [
        '{PLAYER} guardó hasta la última moneda. Iban a hacer falta.',
        'El mapa de Peach marcaba el siguiente reino: la Isla Kong.',
        'De vuelta al auto, otra vez la Senda Arcoíris… y otra vez infestada de Koopas.'
      ],
      en: [
        '{PLAYER} saved every last coin. They were going to be needed.',
        'Peach\'s map marked the next kingdom: Kong Island.',
        'Back in the car, onto the Rainbow Road again… and again it was infested with Koopas.'
      ]
    }
  },
  {
    id: 's8', img: 9, bgKey: 'bg.world3', after: 8, anim: 'jungle',
    text: {
      es: [
        'Al llegar a la Isla Kong, {PLAYER} escondió el auto entre las lianas por si había enemigos cerca.',
        'Y los había: varios Koopas se habían instalado en la isla.',
        'De repente, un gorila camuflado agarró a {PLAYER} del brazo y tiró de él sin decir nada.',
        'Bajo tierra había un escondite lleno de refugiados… y una pequeña tienda iluminada por antorchas.'
      ],
      en: [
        'When {PLAYER} reached Kong Island, they hid the car among the vines in case enemies were near.',
        'And they were: several Koopas had settled on the island.',
        'Suddenly a camouflaged gorilla grabbed {PLAYER} by the arm and pulled without saying a word.',
        'Underground there was a hideout full of refugees… and a small shop lit by torches.'
      ]
    }
  },
  {
    id: 's9', img: 10, bgKey: 'bg.level9', after: 9, anim: 'refuge',
    text: {
      es: [
        'Con las compras hechas, los gorilas se sentaron alrededor del fuego y contaron todo.',
        'Bowser llegó de noche, tomó la isla en pocas horas y encerró al rey Donkey Kong en el calabozo del castillo.',
        '"Sálvanos, por favor", rogaron. "Eres nuestra única esperanza."',
        '{PLAYER} aceptó. "¿Y quién gobierna la isla ahora?", preguntó.',
        'Los gorilas se miraron entre ellos antes de responder: "El Koopaling Ludwig von Koopa."',
        '"Está en lo alto del castillo, y el camino está lleno de trampas." {PLAYER} apretó los puños y decidió ayudarlos.'
      ],
      en: [
        'With the shopping done, the gorillas sat around the fire and told the whole story.',
        'Bowser came at night, took the island in a few hours, and locked King Donkey Kong in the castle dungeon.',
        '"Save us, please," they begged. "You are our only hope."',
        '{PLAYER} agreed. "And who rules the island now?" they asked.',
        'The gorillas looked at each other before answering: "The Koopaling Ludwig von Koopa."',
        '"He is at the top of the castle, and the way there is full of traps." {PLAYER} clenched their fists and decided to help them.'
      ]
    }
  }
  ,
  {
    id: 's10', img: 11, bgKey: 'bg.world3', after: 10, anim: 'ludwig',
    text: {
      es: [
        'Al final del pasillo de trampas, una puerta de hierro se abrió sola.',
        'Ludwig von Koopa esperaba sentado en el trono de Donkey Kong, con su melena azul y una sonrisa torcida.',
        '"¿Tú has cruzado mis trampas? Entonces mereces ver esto."',
        'Levantó las manos y del suelo brotaron bolas de fuego que salieron disparadas hacia {PLAYER}.',
        'No había forma de acercarse. Habría que recogerlas y devolvérselas.'
      ],
      en: [
        'At the end of the trap corridor, an iron door opened by itself.',
        'Ludwig von Koopa was waiting on Donkey Kong\'s throne, with his blue hair and a crooked smile.',
        '"You crossed my traps? Then you deserve to see this."',
        'He raised his hands and fireballs burst from the floor straight at {PLAYER}.',
        'There was no way to get closer. The fireballs had to be caught and thrown back.'
      ]
    }
  },
  {
    id: 's11', img: 12, bgKey: 'bg.level4', after: 11, anim: 'drive', reward: 200,
    text: {
      es: [
        'Las cadenas cayeron y Donkey Kong salió del calabozo rugiendo de alegría.',
        'Los gorilas rodearon a {PLAYER} y le entregaron una bolsa con 200 monedas.',
        '"Cómprate lo que quieras. Te lo has ganado."',
        'El mapa de Peach marcaba el siguiente reino: Sarasaland. De vuelta al auto y a la Senda Arcoíris.',
        'Pero esta vez la pista estaba llena de enemigos: el doble que antes, y el doble de difícil llegar al otro lado.'
      ],
      en: [
        'The chains fell and Donkey Kong came out of the dungeon roaring with joy.',
        'The gorillas surrounded {PLAYER} and handed over a bag with 200 coins.',
        '"Buy whatever you want. You have earned it."',
        'Peach\'s map marked the next kingdom: Sarasaland. Back to the car and onto the Rainbow Road.',
        'But this time the track was full of enemies: twice as many, and twice as hard to cross.'
      ]
    }
  },
  {
    id: 's12', img: 13, bgKey: 'bg.world4', after: 12, anim: 'sarasa',
    text: {
      es: [
        'Sarasaland recibió a {PLAYER} con un viento de arena caliente.',
        'Escondió el auto bajo una duna y se adentró a pie entre las pirámides.',
        'Pero algo iba mal: los Shy Guys, los habitantes de Sarasaland, caminaban en fila con los ojos dando vueltas.',
        'Estaban hipnotizados. Y el responsable era otro Koopaling: Morton Koopa Jr.',
        '{PLAYER} decidió enfrentarlos para romper el hechizo y devolverles la libertad.'
      ],
      en: [
        'Sarasaland welcomed {PLAYER} with a hot sand wind.',
        'They hid the car under a dune and walked in among the pyramids.',
        'But something was wrong: the Shy Guys, the people of Sarasaland, were walking in line with spinning eyes.',
        'They were hypnotised. And the one behind it was another Koopaling: Morton Koopa Jr.',
        '{PLAYER} decided to face them and break the spell to set them free.'
      ]
    }
  },
  {
    id: 's13', img: 14, bgKey: 'bg.world4', after: 13, anim: 'morton', reward: 0,
    text: {
      es: [
        'El último Shy Guy despertó y señaló hacia la pirámide más alta.',
        'Allí estaba Morton Koopa Jr., enorme, golpeando el suelo con los puños.',
        '"¿Me has quitado mi ejército? ¡Entonces te aplastaré yo mismo!"',
        'Del techo empezaron a caer martillos girando en el aire.',
        'Habría que agacharse, saltar… y devolverle sus propios martillos.'
      ],
      en: [
        'The last Shy Guy woke up and pointed to the tallest pyramid.',
        'There stood Morton Koopa Jr., enormous, pounding the ground with his fists.',
        '"You took my army? Then I will crush you myself!"',
        'Hammers started falling from the ceiling, spinning through the air.',
        'It was time to duck, jump… and throw his own hammers back at him.'
      ]
    }
  },
  {
    id: 's14', img: 15, bgKey: 'bg.level9', after: 14, anim: 'refuge', reward: 200,
    text: {
      es: [
        'Morton cayó de espaldas y el hechizo se rompió del todo.',
        'Los Shy Guys se quitaron las máscaras un momento para dar las gracias.',
        'Trajeron una caja de madera con 200 monedas dentro.',
        '"Nuestra tienda es tuya. Llévate lo que necesites para lo que viene."',
        'Y lo que venía, todos lo sabían, era el Reino de Bowser.'
      ],
      en: [
        'Morton fell backwards and the spell broke completely.',
        'The Shy Guys lifted their masks for a moment to say thank you.',
        'They brought a wooden box with 200 coins inside.',
        '"Our shop is yours. Take whatever you need for what comes next."',
        'And what came next, everybody knew, was Bowser\'s Kingdom.'
      ]
    }
  },
  {
    id: 's15', img: 16, bgKey: 'bg.level4', after: 15, anim: 'drive',
    text: {
      es: [
        'Con la mochila llena y la última compra hecha, {PLAYER} volvió al auto.',
        'Solo quedaba una isla en el mapa de Peach, y estaba marcada con fuego.',
        'La Senda Arcoíris apareció otra vez… pero esta vez daba miedo mirarla.',
        'Había el TRIPLE de enemigos que antes, ocupando los tres carriles.',
        '"Última carrera", pensó {PLAYER}, y pisó el acelerador.'
      ],
      en: [
        'With a full backpack and the last purchase done, {PLAYER} went back to the car.',
        'Only one island was left on Peach\'s map, and it was marked with fire.',
        'The Rainbow Road appeared again… but this time it was frightening to look at.',
        'There were THREE TIMES as many enemies as before, filling all three lanes.',
        '"Last race," thought {PLAYER}, and hit the accelerator.'
      ]
    }
  },
  {
    id: 's16', img: 17, bgKey: 'bg.world5', after: 16, anim: 'bowserland',
    text: {
      es: [
        'La rabia le subía por el pecho: por Toad, por los Yoshis, por los Kong, por los Shy Guys.',
        'Y sobre todo por {PET}, que llevaba demasiado tiempo encerrada.',
        '{PLAYER} escondió el auto entre las rocas negras y avanzó a pie.',
        'La tierra de Bowser estaba infestada de Koopas esqueleto que se levantaban una y otra vez.',
        'No había forma de rodearlos: habría que saltar sobre ellos hasta el castillo.'
      ],
      en: [
        'Anger rose in their chest: for Toad, for the Yoshis, for the Kongs, for the Shy Guys.',
        'And above all for {PET}, who had been locked up for far too long.',
        '{PLAYER} hid the car among the black rocks and went on by foot.',
        'Bowser\'s land was infested with Dry Bones that stood up again and again.',
        'There was no way around them: the only path was to jump on them, all the way to the castle.'
      ]
    }
  },
  {
    id: 's17', img: 18, bgKey: 'bg.world5', after: 17, anim: 'castle',
    text: {
      es: [
        'La puerta del castillo de Bowser se cerró de golpe a su espalda.',
        'Dentro, el pasillo era mucho peor que el del castillo de Peach.',
        'Cuchillas girando a la altura de la cabeza, pinchos, fuego cayendo del techo.',
        '{PLAYER} respiró hondo. Agacharse, saltar, agacharse otra vez.',
        'Al final de ese pasillo estaba Bowser. Y estaba {PET}.'
      ],
      en: [
        'The door of Bowser\'s castle slammed shut behind them.',
        'Inside, the corridor was far worse than the one in Peach\'s castle.',
        'Blades spinning at head height, spikes, fire falling from the ceiling.',
        '{PLAYER} took a deep breath. Duck, jump, duck again.',
        'At the end of that corridor was Bowser. And so was {PET}.'
      ]
    }
   }
  ,
  {
    id: 's18', img: 19, bgKey: 'bg.world5', after: 18, anim: 'throne',
    text: {
      es: [
        'El pasillo terminó en un portón de hierro que se abrió solo.',
        'Y ahí estaba: Bowser, sentado en un trono de lava, enorme.',
        'A los lados, atados: Mario, Luigi, Toad, Peach, Daisy, los Yoshis y Donkey Kong.',
        'Y en una jaula colgando del techo, {PET}, que al ver a {PLAYER} empezó a llorar de alegría.',
        'A {PLAYER} le hirvió la sangre. Esto ya no era solo por {PET}: era por todos.'
      ],
      en: [
        'The corridor ended at an iron gate that opened by itself.',
        'And there he was: Bowser, sitting on a throne of lava, enormous.',
        'Tied up at his sides: Mario, Luigi, Toad, Peach, Daisy, the Yoshis and Donkey Kong.',
        'And in a cage hanging from the ceiling, {PET}, who started crying with joy at the sight of {PLAYER}.',
        "{PLAYER}'s blood boiled. This was not only about {PET} any more: it was about everyone."
      ]
    }
  },
  {
    id: 's19', img: 20, bgKey: 'story3', after: 19, anim: 'partyscene',
    text: {
      es: [
        '¡LO LOGRASTE!',
        'Bowser cayó de rodillas y el castillo empezó a temblar.',
        '{PLAYER} abrió la jaula y {PET} saltó a sus brazos de un salto.',
        'Todos escaparon juntos del castillo infernal justo antes de que se derrumbara.',
        'En agradecimiento, la princesa Peach organizó una fiesta en su castillo. Y todos estaban invitados.'
      ],
      en: [
        'YOU DID IT!',
        'Bowser fell to his knees and the castle began to shake.',
        '{PLAYER} opened the cage and {PET} jumped straight into their arms.',
        'Everybody escaped the burning castle together, just before it collapsed.',
        'To say thank you, Princess Peach threw a party in her castle. And everyone was invited.'
      ]
    }
  },
  {
    id: 's20', img: 21, bgKey: 'bg.level20', after: 20, anim: 'partyscene',
    text: {
      es: [
        'La fiesta terminó tarde. {PLAYER} se despidió uno a uno de los amigos que hizo en el camino.',
        'Mario, Peach, Luigi, Daisy, Toad, los Yoshis y Donkey Kong salieron a la puerta a decir adiós.',
        'Toad, los Kong, los Shy Guys… todos prometieron visitarle algún día.'
      ],
      en: [
        'The party ended late. {PLAYER} said goodbye one by one to the friends made along the way.',
        'Mario, Peach, Luigi, Daisy, Toad, the Yoshis and Donkey Kong came to the door to wave.',
        'Toad, the Kongs, the Shy Guys… they all promised to visit some day.'
      ]
    }
  },
  {
    id: 's21', img: 22, after: 20, anim: 'bedroom',
    text: {
      es: [
        'De vuelta en casa, {PLAYER} se dejó caer en la cama, agotado y feliz.',
        '{PET} se acurrucó sobre sus piernas, como si nunca se hubiera ido.',
        'En la mesita de noche brillaba el trofeo. {PLAYER} lo miró y sonrió.',
        'Y se quedó dormido pensando en cuál sería la próxima aventura.'
      ],
      en: [
        'Back home, {PLAYER} dropped onto the bed, exhausted and happy.',
        '{PET} curled up on their legs, as if they had never been apart.',
        'On the nightstand the trophy was shining. {PLAYER} looked at it and smiled.',
        'And fell asleep wondering what the next adventure would be.'
      ]
    }
  }
];


/* =========================================================================
   PARTE 5.2 — RID.UI (parte 2 de 2: HUD)
   Se añade al mismo objeto creado en la parte 4.
   ========================================================================= */

(function () {

  var lastLives = -1;

  function livesBox()  { return U.el('#hud-lives'); }

  /* Pinta las huellas: llenas = vidas restantes, apagadas = perdidas */
  function setLives(n, animateLoss) {
    var host = livesBox();
    if (!host) return;
    var species = RID.state.pet.species || 'dog';
    var lost = (lastLives >= 0 && n < lastLives);

    U.clear(host);
    for (var i = 0; i < CFG.LIVES; i++) {
      var wrap = U.make('span');
      wrap.innerHTML = RID.Avatar.pawSVG(species, i < n ? '#ffcc00' : '#5a5f7a');
      var svg = wrap.firstChild;
      if (i >= n) svg.classList.add('is-lost');
      if (animateLoss && lost && i === n) svg.classList.add('is-losing');
      host.appendChild(svg);
    }
    lastLives = n;
  }

  function setCoins(n) {
    var el = U.el('#hud-coins-value');
    if (el) el.textContent = n;
    var shopEl = U.el('#shop-coins');
    if (shopEl) shopEl.textContent = n;
  }

  /* type: 'energy' | 'boost' | null (oculta la barra) */
  function setGauge(type, pct) {
    var box  = U.el('#hud-gauge'),
        fill = U.el('#hud-gauge-fill'),
        lab  = U.el('#hud-gauge-label');
    if (!box) return;
    if (!type) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    lab.textContent = String(type).toUpperCase();
    pct = U.clamp(pct, 0, 100);
    fill.style.width = pct + '%';
    fill.classList.toggle('is-low',  pct <= 45 && pct > 20);
    fill.classList.toggle('is-crit', pct <= 20);
  }

  function setObjective(text) {
    var el = U.el('#hud-objective');
    if (el) el.textContent = text || '';
  }

  function setLevelName(worldName, levelName) {
    var w = U.el('#hud-world-name'), l = U.el('#hud-level-name');
    if (w) w.textContent = worldName || '';
    if (l) l.textContent = levelName || '';
  }

  function setProgress() {
    var done = RID.Progress.playedCount(),
        pct  = RID.Progress.percent(),
        fill = U.el('#hud-progress-fill'),
        txt  = U.el('#hud-progress-text');
    if (fill) fill.style.width = pct + '%';
    if (txt)  txt.textContent = done + ' / ' + CFG.TOTAL_LEVELS;
  }

  /* Refresca el HUD entero de golpe */
  function renderHUD() {
    setLives(RID.state.run.lives, false);
    setCoins(RID.state.run.coins);
    setProgress();
  }

  /* Aviso a pantalla completa al perder una vida */
  function showLifeLost(livesLeft, onEnd) {
    var txt  = U.el('#life-lost-text'),
        paws = U.el('#life-lost-paws'),
        species = RID.state.pet.species || 'dog';

    txt.textContent = livesLeft > 0 ? ('-1  ×' + livesLeft) : 'GAME OVER';
    U.clear(paws);
    for (var i = 0; i < CFG.LIVES; i++) {
      var wrap = U.make('span');
      wrap.innerHTML = RID.Avatar.pawSVG(species, i < livesLeft ? '#ffcc00' : '#5a5f7a');
      wrap.firstChild.style.width = '34px';
      wrap.firstChild.style.height = '34px';
      if (i >= livesLeft) wrap.firstChild.classList.add('is-lost');
      paws.appendChild(wrap.firstChild);
    }

    RID.Screens.openOverlay('life-lost');
    window.setTimeout(function () {
      RID.Screens.closeOverlay('life-lost');
      if (onEnd) onEnd();
    }, 1200);
  }

  RID.UI.setLives      = setLives;
  RID.UI.setCoins      = setCoins;
  RID.UI.setGauge      = setGauge;
  RID.UI.setObjective  = setObjective;
  RID.UI.setLevelName  = setLevelName;
  RID.UI.setProgress   = setProgress;
  RID.UI.renderHUD     = renderHUD;
  RID.UI.showLifeLost  = showLifeLost;
})();


/* =========================================================================
   PARTE 5.3 — RID.FX
   Linterna, partículas, sacudida, destello y la animación retro de muerte
   (el personaje se hace chiquito y luego cae).
   Los niveles llaman a FX.update(dt) y FX.render(ctx) desde su propio bucle.
   ========================================================================= */

RID.FX = (function () {

  var parts = [];
  var death = null;
  var flash = 0;

  /* ---------- partículas ---------- */
  var PRESETS = {
    coin:  { color: '#ffd447', n: 10, life: 0.7, spd: 130, g: 260, size: 4 },
    dust:  { color: '#cbb99a', n: 8,  life: 0.5, spd: 70,  g: 60,  size: 3 },
    hit:   { color: '#ff6b6b', n: 12, life: 0.6, spd: 170, g: 190, size: 4 },
    star:  { color: '#9be7ff', n: 14, life: 0.9, spd: 150, g: -20, size: 3 },
    smoke: { color: '#8b8b96', n: 9,  life: 0.8, spd: 50,  g: -40, size: 5 }
  };

  function particles(type, x, y, amount) {
    var p = PRESETS[type] || PRESETS.dust,
        n = amount || p.n, i, a, s;
    for (i = 0; i < n; i++) {
      a = U.rand(0, Math.PI * 2);
      s = U.rand(p.spd * 0.4, p.spd);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - p.spd * 0.3,
        g: p.g, life: p.life, max: p.life, color: p.color, size: p.size
      });
    }
  }

  /* ---------- muerte retro: encoger + caer ----------
     El sonido lo elige quien la dispara: 'perdida de una vida' si aún quedan
     vidas, 'muerte subita' si era la última. */
  function playerDeath(x, y, onEnd) {
    death = { x: x, y: y, t: 0, phase: 1, vy: 0, onEnd: onEnd || null };
  }

  function isBusy() { return !!death; }

  /* ---------- sacudida y destello (CSS) ---------- */
  function shake(ms) {
    var g = U.el('#game');
    if (!g) return;
    g.classList.remove('is-shaking');
    void g.offsetWidth;                       // reinicia la animación
    g.classList.add('is-shaking');
    window.setTimeout(function () { g.classList.remove('is-shaking'); }, ms || 350);
  }

  function hitFlash() {
    var g = U.el('#game');
    if (!g) return;
    g.classList.remove('is-hit');
    void g.offsetWidth;
    g.classList.add('is-hit');
    window.setTimeout(function () { g.classList.remove('is-hit'); }, 300);
    flash = 0.18;
  }

  /* ---------- linterna que sigue al ratón ---------- */
  function flashlight(ctx, x, y, radius, darkness) {
    var r = radius || 150;
    ctx.save();
    ctx.fillStyle = 'rgba(3,4,10,' + (darkness == null ? 0.94 : darkness) + ')';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.globalCompositeOperation = 'destination-out';
    var g = ctx.createRadialGradient(x, y, r * 0.12, x, y, r);
    g.addColorStop(0,    'rgba(0,0,0,1)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.92)');
    g.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* halo cálido de linterna */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var h = ctx.createRadialGradient(x, y, 0, x, y, r * 0.8);
    h.addColorStop(0, 'rgba(255,225,150,.14)');
    h.addColorStop(1, 'rgba(255,225,150,0)');
    ctx.fillStyle = h;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- ciclo ---------- */
  function update(dt) {
    var i, p;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
    }

    if (flash > 0) flash = Math.max(0, flash - dt);

    if (death) {
      death.t += dt;
      if (death.phase === 1 && death.t >= 0.75) {      // ya encogió: ahora cae
        death.phase = 2;
        death.vy = -260;
      }
      if (death.phase === 2) {
        death.vy += 900 * dt;
        death.y  += death.vy * dt;
        if (death.y > CFG.H + 120) {
          var cb = death.onEnd;
          death = null;
          if (cb) cb();
        }
      }
    }
  }

  function render(ctx) {
    var i, p, a;

    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      a = U.clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    if (death) {
      var scale, rot;
      if (death.phase === 1) {
        scale = U.lerp(2.2, 0.9, U.easeOut(U.clamp(death.t / 0.75, 0, 1)));
        rot = 0;
        if (Math.floor(death.t * 16) % 2 === 0) ctx.globalAlpha = 0.45;   // parpadeo retro
      } else {
        scale = 0.9;
        rot = (death.t - 0.75) * 6;
      }
      ctx.save();
      ctx.translate(death.x, death.y);
      ctx.rotate(rot);
      RID.Avatar.drawPlayer(ctx, 0, 0, scale, 'hurt', death.t);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 1.6) + ')';
      ctx.fillRect(0, 0, CFG.W, CFG.H);
    }
  }

  function clear() { parts.length = 0; death = null; flash = 0; }

  return {
    particles: particles, playerDeath: playerDeath, isBusy: isBusy,
    shake: shake, hitFlash: hitFlash, flashlight: flashlight,
    update: update, render: render, clear: clear
  };
})();


/* =========================================================================
   PARTE 5.4 — RID.Story
   Reproductor de escenas: fondo animado en canvas + texto por páginas con
   efecto máquina de escribir, en el idioma elegido por el jugador.
   Las animaciones viven en un registro: añadir una es añadir una función.
   ========================================================================= */

RID.Story = (function () {

  var scene = null, page = 0, raf = 0, t0 = 0, tNow = 0;
  var typing = false, typed = 0, typeT = 0, fullText = '';
  var onFinish = null;
  var TYPE_SPEED = 42;      // caracteres por segundo

  /* ---------- registro de animaciones (canvas 960x400) ----------
     anim[x]   : escena completa dibujada por código (fondo + personajes)
     actors[x] : SOLO los personajes, para usarse encima de la imagen de
                 fondo que aporte el usuario en img/historia N.png        */
  var anim = {};
  var actors = {};

  /* Encaja una imagen en el lienzo sin deformarla (recorta lo que sobra) */
  function cover(ctx, img, w, h) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;
    var ir = iw / ih, cr = w / h, sw, sh, sx, sy;
    if (ir > cr) { sh = ih; sw = sh * cr; sx = (iw - sw) / 2; sy = 0; }
    else         { sw = iw; sh = sw / cr; sx = 0; sy = (ih - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  }

  function sky(ctx, top, bottom) {
    var g = ctx.createLinearGradient(0, 0, 0, 400);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 400);
  }

  function ground(ctx, y, color, edge) {
    ctx.fillStyle = edge || U.shade(color, 30);
    ctx.fillRect(0, y, 960, 6);
    ctx.fillStyle = color;
    ctx.fillRect(0, y + 6, 960, 400 - y);
  }

  function stars(ctx, t, n) {
    ctx.fillStyle = '#fff';
    for (var i = 0; i < (n || 40); i++) {
      var x = (i * 137) % 960, y = (i * 71) % 200;
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function moon(ctx, x, y, r) {
    ctx.fillStyle = '#f4f1c8';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    ctx.beginPath(); ctx.arc(x - r * .3, y + r * .2, r * .22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * .35, y - r * .25, r * .16, 0, Math.PI * 2); ctx.fill();
  }

  /* 1 · la mascota no está */
  anim.missing = function (ctx, t) {
    sky(ctx, '#0b1030', '#1b2455');
    stars(ctx, t);
    moon(ctx, 810, 80, 42);
    ground(ctx, 330, '#2a2140', '#3a2f58');

    /* casa */
    ctx.fillStyle = '#3b2f4f'; ctx.fillRect(90, 190, 210, 146);
    ctx.fillStyle = '#59406e';
    ctx.beginPath(); ctx.moveTo(70, 192); ctx.lineTo(195, 128); ctx.lineTo(320, 192); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f6d98a'; ctx.fillRect(120, 220, 46, 40);      // ventana
    ctx.fillStyle = '#221a30'; ctx.fillRect(215, 236, 54, 100);     // puerta abierta
    ctx.fillStyle = '#4a3a5e'; ctx.fillRect(269, 236, 8, 100);

    /* cama vacía de la mascota */
    ctx.fillStyle = '#6b5a45';
    U.ellipse(ctx, 430, 322, 52, 16); ctx.fill();
    ctx.fillStyle = '#8a7458';
    U.ellipse(ctx, 430, 316, 40, 11); ctx.fill();
    U.pixelText(ctx, RID.state.pet.name || '', 430, 288, 15, '#b9b3a2');

    /* huella gigante con garras */
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2.5);
    ctx.fillStyle = '#7a1020';
    U.ellipse(ctx, 600, 330, 30, 20); ctx.fill();
    for (var i = 0; i < 4; i++) {
      U.ellipse(ctx, 574 + i * 17, 302, 7, 10); ctx.fill();
    }
    ctx.restore();

    /* silueta de Bowser al fondo, parpadeando */
    RID.Avatar.drawSprite(ctx, 'bowser', 810, 336, 5, {
      silhouette: true,
      alpha: 0.20 + 0.18 * Math.abs(Math.sin(t * 1.1))
    });

    RID.Avatar.drawPlayer(ctx, 340, 336, 3.1, 'idle', t);
  };

  /* 2 · Tierra Champiñón y Toad */
  anim.mushroom = function (ctx, t) {
    var i, x;

    /* cielo con sol */
    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#3fa9e0'); sk.addColorStop(0.55, '#8fd8f2'); sk.addColorStop(1, '#d9f5c9');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createRadialGradient(160, 70, 10, 160, 70, 130);
    sg.addColorStop(0, 'rgba(255,244,190,.85)');
    sg.addColorStop(1, 'rgba(255,244,190,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(160, 70, 130, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff6c0';
    ctx.beginPath(); ctx.arc(160, 70, 34, 0, Math.PI * 2); ctx.fill();

    /* nubes en dos planos */
    function cloud(cx, cy, s, a) {
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      U.ellipse(ctx, cx, cy, 46 * s, 20 * s); ctx.fill();
      U.ellipse(ctx, cx + 34 * s, cy + 5 * s, 32 * s, 15 * s); ctx.fill();
      U.ellipse(ctx, cx - 32 * s, cy + 6 * s, 28 * s, 13 * s); ctx.fill();
      U.ellipse(ctx, cx + 10 * s, cy - 14 * s, 26 * s, 14 * s); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < 4; i++) cloud(((i * 300 + t * 8) % 1200) - 120, 58 + i * 9, 0.75, 0.55);
    for (i = 0; i < 3; i++) cloud(((i * 380 + t * 17) % 1300) - 150, 96 + i * 16, 1, 0.92);

    /* colinas en capas */
    ctx.fillStyle = '#2f7a3a';
    for (i = 0; i < 6; i++) { U.ellipse(ctx, i * 210 - 40, 330, 190, 95); ctx.fill(); }
    ctx.fillStyle = '#3f9b46';
    for (i = 0; i < 7; i++) { U.ellipse(ctx, i * 180 + 60, 352, 165, 88); ctx.fill(); }

    /* castillo de Peach al fondo */
    (function castle() {
      var bx = 640, by = 318;
      ctx.fillStyle = '#c9c2b0';
      ctx.fillRect(bx, by - 96, 170, 96);
      ctx.fillRect(bx - 26, by - 118, 34, 118);
      ctx.fillRect(bx + 162, by - 118, 34, 118);
      ctx.fillRect(bx + 58, by - 146, 54, 146);
      ctx.fillStyle = '#e3ddcd';
      ctx.fillRect(bx, by - 96, 170, 8);

      function roof(x, w, h, y) {
        ctx.fillStyle = '#e05a7a';
        ctx.beginPath();
        ctx.moveTo(x - 6, y); ctx.lineTo(x + w / 2, y - h); ctx.lineTo(x + w + 6, y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y - h); ctx.lineTo(x + w / 2, y - h - 16); ctx.stroke();
        ctx.fillStyle = '#ffd447';
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y - h - 16);
        ctx.lineTo(x + w / 2 + 20 + Math.sin(t * 4) * 3, y - h - 11);
        ctx.lineTo(x + w / 2, y - h - 6);
        ctx.closePath(); ctx.fill();
      }
      roof(bx - 26, 34, 34, by - 118);
      roof(bx + 162, 34, 34, by - 118);
      roof(bx + 58, 54, 46, by - 146);

      /* ventanas y puerta */
      ctx.fillStyle = '#3b3f6b';
      for (var w = 0; w < 4; w++) {
        ctx.beginPath();
        ctx.arc(bx + 26 + w * 40, by - 66, 9, Math.PI, 0);
        ctx.fillRect(bx + 17 + w * 40, by - 66, 18, 22);
        ctx.fill();
      }
      ctx.fillStyle = '#7a4a1e';
      ctx.beginPath();
      ctx.arc(bx + 85, by - 40, 21, Math.PI, 0);
      ctx.fillRect(bx + 64, by - 40, 42, 40);
      ctx.fill();
      /* vitral redondo con la corona */
      ctx.fillStyle = '#f6d98a';
      ctx.beginPath(); ctx.arc(bx + 85, by - 112, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e05a7a';
      ctx.beginPath(); ctx.arc(bx + 85, by - 112, 7, 0, Math.PI * 2); ctx.fill();
    })();

    /* suelo */
    ctx.fillStyle = '#63c66a';
    ctx.fillRect(0, 320, 960, 16);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(0, 336, 960, 64);
    ctx.fillStyle = '#6b431f';
    for (x = 0; x < 960; x += 46) ctx.fillRect(x + 8, 350, 26, 9);

    /* tubería verde por la que salió el personaje */
    ctx.fillStyle = '#1e6b2a';
    ctx.fillRect(96, 268, 76, 54);
    ctx.fillStyle = '#3fb950';
    ctx.fillRect(102, 268, 20, 54);
    ctx.fillStyle = '#1e6b2a';
    ctx.fillRect(86, 250, 96, 24);
    ctx.fillStyle = '#3fb950';
    ctx.fillRect(92, 250, 22, 24);
    ctx.fillStyle = '#0d3a17';
    ctx.fillRect(94, 250, 80, 8);

    /* champiñones */
    function shroom(cx, cy, s, red) {
      ctx.fillStyle = '#f2ead6';
      ctx.fillRect(cx - 9 * s, cy - 26 * s, 18 * s, 26 * s);
      ctx.fillStyle = '#d8d0bc';
      ctx.fillRect(cx + 3 * s, cy - 26 * s, 6 * s, 26 * s);
      ctx.fillStyle = red ? '#e03131' : '#f28a20';
      U.ellipse(ctx, cx, cy - 28 * s, 27 * s, 17 * s); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      U.ellipse(ctx, cx - 10 * s, cy - 32 * s, 6 * s, 4.5 * s); ctx.fill();
      U.ellipse(ctx, cx + 9 * s, cy - 28 * s, 4.5 * s, 3.5 * s); ctx.fill();
      ctx.fillStyle = '#1b1b1f';
      ctx.fillRect(cx - 5 * s, cy - 20 * s, 3 * s, 4 * s);
      ctx.fillRect(cx + 2 * s, cy - 20 * s, 3 * s, 4 * s);
    }
    shroom(250, 322, 1.5, true);
    shroom(392, 320, 1.0, false);
    shroom(886, 324, 1.7, true);

    /* bloques ? flotando */
    for (i = 0; i < 3; i++) {
      var bxx = 470 + i * 52, byy = 176 + Math.sin(t * 2 + i) * 5;
      ctx.fillStyle = '#e8a020';
      ctx.fillRect(bxx, byy, 42, 42);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(bxx, byy, 42, 42);
      ctx.fillStyle = '#7a4a10';
      [[6, 6], [32, 6], [6, 32], [32, 32]].forEach(function (p) {
        ctx.fillRect(bxx + p[0], byy + p[1], 5, 5);
      });
      U.pixelText(ctx, '?', bxx + 21, byy + 22, 26, '#fff3c0');
    }

    /* arbustos */
    ctx.fillStyle = '#2f7a3a';
    [[520, 320], [700, 322], [60, 322]].forEach(function (p) {
      U.ellipse(ctx, p[0], p[1], 34, 20); ctx.fill();
      U.ellipse(ctx, p[0] - 24, p[1] + 4, 22, 14); ctx.fill();
      U.ellipse(ctx, p[0] + 24, p[1] + 4, 22, 14); ctx.fill();
    });

    /* Toad saltando y señalando el castillo */
    var bob = Math.abs(Math.sin(t * 3)) * 8;
    RID.Avatar.drawSprite(ctx, 'toad', 470, 322 - bob, 3.6);

    /* bocadillo */
    ctx.fillStyle = '#f6f2e2';
    U.roundRect(ctx, 500, 190 - bob * 0.3, 118, 46, 10); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(510, 232 - bob * 0.3); ctx.lineTo(498, 250 - bob * 0.3); ctx.lineTo(524, 234 - bob * 0.3);
    ctx.closePath(); ctx.fillStyle = '#f6f2e2'; ctx.fill(); ctx.stroke();
    U.pixelText(ctx, 'HELP!', 559, 213 - bob * 0.3, 20, '#1b1b1f');

    RID.Avatar.drawPlayer(ctx, 320, 322, 3.0, 'idle', t);
  };

  /* 3 · la carta de Peach en el cuarto del trono */
  anim.letter = function (ctx, t) {
    var i, k, x;

    /* muro */
    var wl = ctx.createLinearGradient(0, 0, 0, 400);
    wl.addColorStop(0, '#241c46'); wl.addColorStop(1, '#3b2f5e');
    ctx.fillStyle = wl; ctx.fillRect(0, 0, 960, 400);

    /* sillería */
    for (var yy = 40; yy < 330; yy += 34) {
      for (x = -40; x < 960; x += 68) {
        var off = ((yy / 34) % 2) ? 34 : 0;
        var v = ((Math.abs(x + off) * 7919 + yy * 131) % 15) - 7;
        ctx.fillStyle = 'rgb(' + (66 + v) + ',' + (54 + v) + ',' + (100 + v) + ')';
        ctx.fillRect(x + off, yy, 64, 30);
      }
    }

    /* vidrieras altas */
    for (i = 0; i < 2; i++) {
      x = 96 + i * 620;
      ctx.fillStyle = '#150f2c';
      ctx.beginPath();
      ctx.moveTo(x, 300); ctx.lineTo(x, 96);
      ctx.quadraticCurveTo(x + 48, 30, x + 96, 96);
      ctx.lineTo(x + 96, 300); ctx.closePath(); ctx.fill();

      var vg = ctx.createLinearGradient(0, 40, 0, 300);
      vg.addColorStop(0, '#8fd0ff'); vg.addColorStop(0.5, '#e05a7a'); vg.addColorStop(1, '#f0c040');
      ctx.fillStyle = vg;
      ctx.beginPath();
      ctx.moveTo(x + 8, 292); ctx.lineTo(x + 8, 100);
      ctx.quadraticCurveTo(x + 48, 42, x + 88, 100);
      ctx.lineTo(x + 88, 292); ctx.closePath(); ctx.fill();

      ctx.strokeStyle = 'rgba(10,8,22,.8)'; ctx.lineWidth = 3;
      for (k = 1; k < 4; k++) {
        ctx.beginPath(); ctx.moveTo(x + 8 + k * 20, 292); ctx.lineTo(x + 8 + k * 20, 60); ctx.stroke();
      }
      for (k = 1; k < 6; k++) {
        ctx.beginPath(); ctx.moveTo(x + 8, 60 + k * 40); ctx.lineTo(x + 88, 60 + k * 40); ctx.stroke();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var lb = ctx.createLinearGradient(x + 48, 100, x + 48, 340);
      lb.addColorStop(0, 'rgba(255,210,240,.16)');
      lb.addColorStop(1, 'rgba(255,210,240,0)');
      ctx.fillStyle = lb;
      ctx.beginPath();
      ctx.moveTo(x + 8, 110); ctx.lineTo(x + 88, 110);
      ctx.lineTo(x + 140, 340); ctx.lineTo(x - 44, 340);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* retrato de Peach */
    ctx.fillStyle = '#6b4a1e'; ctx.fillRect(806, 62, 118, 152);
    ctx.fillStyle = '#2a1f44'; ctx.fillRect(814, 70, 102, 136);
    RID.Avatar.drawSprite(ctx, 'peach', 865, 204, 6.2);
    ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 4; ctx.strokeRect(806, 62, 118, 152);
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.moveTo(848, 62); ctx.lineTo(865, 46); ctx.lineTo(882, 62); ctx.closePath(); ctx.fill();

    /* suelo ajedrezado en perspectiva */
    ctx.fillStyle = '#241c3c';
    ctx.fillRect(0, 300, 960, 100);
    for (var r = 0; r < 6; r++) {
      var y0 = 300 + r * r * 3.4, y1 = 300 + (r + 1) * (r + 1) * 3.4;
      var w0 = 60 + r * 26;
      for (k = -9; k < 9; k++) {
        if ((k + r) % 2) continue;
        ctx.fillStyle = 'rgba(220,214,240,.13)';
        ctx.beginPath();
        ctx.moveTo(480 + k * w0, y0);
        ctx.lineTo(480 + (k + 1) * w0, y0);
        ctx.lineTo(480 + (k + 1) * (w0 + 26), y1);
        ctx.lineTo(480 + k * (w0 + 26), y1);
        ctx.closePath(); ctx.fill();
      }
    }

    /* alfombra roja */
    ctx.fillStyle = '#6e1626';
    ctx.beginPath();
    ctx.moveTo(392, 300); ctx.lineTo(568, 300); ctx.lineTo(660, 400); ctx.lineTo(300, 400);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9c2135';
    ctx.beginPath();
    ctx.moveTo(402, 300); ctx.lineTo(558, 300); ctx.lineTo(642, 400); ctx.lineTo(318, 400);
    ctx.closePath(); ctx.fill();

    /* trono */
    (function throne() {
      var tx = 480, ty = 300;
      ctx.fillStyle = '#8a6a12';
      ctx.fillRect(tx - 56, ty - 30, 112, 30);
      ctx.fillStyle = '#d4a017';
      ctx.fillRect(tx - 48, ty - 150, 96, 122);
      ctx.fillStyle = '#f0c040';
      ctx.fillRect(tx - 40, ty - 142, 80, 60);
      ctx.fillStyle = '#e05a7a';
      ctx.fillRect(tx - 36, ty - 76, 72, 26);
      ctx.fillStyle = '#c9456a';
      ctx.fillRect(tx - 36, ty - 56, 72, 6);
      /* respaldo con corona */
      ctx.fillStyle = '#d4a017';
      ctx.beginPath();
      ctx.moveTo(tx - 48, ty - 150);
      ctx.lineTo(tx - 30, ty - 186);
      ctx.lineTo(tx - 10, ty - 158);
      ctx.lineTo(tx, ty - 194);
      ctx.lineTo(tx + 10, ty - 158);
      ctx.lineTo(tx + 30, ty - 186);
      ctx.lineTo(tx + 48, ty - 150);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e03131';
      ctx.beginPath(); ctx.arc(tx, ty - 176, 6, 0, Math.PI * 2); ctx.fill();
    })();

    /* candelabro */
    ctx.strokeStyle = '#3a3358'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(300, 58); ctx.stroke();
    ctx.fillStyle = '#6a5f9c'; ctx.fillRect(266, 58, 68, 7);
    for (k = -1; k <= 1; k++) {
      ctx.fillStyle = '#e8e2c8'; ctx.fillRect(300 + k * 26 - 3, 46, 6, 14);
      ctx.fillStyle = '#ffcf6a';
      ctx.beginPath();
      ctx.moveTo(300 + k * 26 - 3, 46);
      ctx.quadraticCurveTo(300 + k * 26, 34 + Math.sin(t * 9 + k) * 2, 300 + k * 26 + 3, 46);
      ctx.closePath(); ctx.fill();
    }

    /* la carta flotando junto al mapa */
    var fy = Math.sin(t * 2) * 7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var gl = ctx.createRadialGradient(660, 214 + fy, 0, 660, 214 + fy, 150);
    gl.addColorStop(0, 'rgba(255,240,180,.35)');
    gl.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(660, 214 + fy, 150, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* mapa enrollado detrás */
    ctx.save();
    ctx.translate(700, 236 + fy * 0.6);
    ctx.rotate(0.12);
    ctx.fillStyle = '#e8dcb0'; ctx.fillRect(-52, -34, 104, 68);
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.strokeRect(-52, -34, 104, 68);
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(-58, -38, 8, 76); ctx.fillRect(50, -38, 8, 76);
    ctx.strokeStyle = '#a33'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(-36, 18); ctx.quadraticCurveTo(-4, -12, 14, 10); ctx.quadraticCurveTo(28, 22, 38, -18);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.arc(38, -18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f9b46';
    ctx.beginPath(); ctx.arc(-36, 18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(636, 210 + fy);
    ctx.rotate(Math.sin(t * 1.2) * 0.07);
    ctx.fillStyle = '#f9f5e6'; ctx.fillRect(-46, -32, 92, 64);
    ctx.strokeStyle = '#c9b98a'; ctx.lineWidth = 2.5; ctx.strokeRect(-46, -32, 92, 64);
    ctx.fillStyle = '#b8a67a';
    ctx.fillRect(-34, -20, 68, 3); ctx.fillRect(-34, -11, 68, 3);
    ctx.fillRect(-34, -2, 68, 3);  ctx.fillRect(-34, 7, 44, 3);
    ctx.fillStyle = '#e05a7a';
    ctx.beginPath(); ctx.arc(26, 20, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7b7c8';
    ctx.beginPath(); ctx.arc(26, 20, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* motas de polvo en los haces de luz */
    ctx.fillStyle = 'rgba(255,235,200,.35)';
    for (i = 0; i < 22; i++) {
      var px = (i * 137 + t * 9) % 980 - 10;
      var py = (i * 61 + Math.sin(t * 0.8 + i) * 22 + 90) % 220 + 80;
      ctx.fillRect(px, py, 2, 2);
    }

    RID.Avatar.drawPlayer(ctx, 300, 336, 3.1, 'idle', t);
  };

  /* 4 · senda arcoíris en auto */
  anim.drive = function (ctx, t) {
    var i, k;

    /* espacio */
    var sp = ctx.createLinearGradient(0, 0, 0, 400);
    sp.addColorStop(0, '#0a0620'); sp.addColorStop(0.6, '#2a1257'); sp.addColorStop(1, '#4a1f6b');
    ctx.fillStyle = sp; ctx.fillRect(0, 0, 960, 400);
    stars(ctx, t, 70);

    /* nebulosa */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var nb = ctx.createRadialGradient(760, 90, 10, 760, 90, 190);
    nb.addColorStop(0, 'rgba(180,90,255,.22)');
    nb.addColorStop(1, 'rgba(180,90,255,0)');
    ctx.fillStyle = nb; ctx.fillRect(560, 0, 400, 260);
    ctx.restore();

    /* planeta con anillo */
    ctx.fillStyle = '#e0a83c';
    ctx.beginPath(); ctx.arc(150, 92, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.arc(164, 84, 40, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(150, 92); ctx.rotate(-0.35); ctx.scale(1, 0.24);
    ctx.strokeStyle = 'rgba(255,220,160,.85)'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,160,.4)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    /* --- Senda Arcoíris: la calzada entera es un degradado a lo ancho --- */
    var HZ = 236;
    var RB = RID.DATA.rainbow.road;
    var RM = RID.DATA.rainbow.rumble;
    var SLICES = 46;

    for (i = 0; i < SLICES; i++) {
      var a = i / SLICES, b = (i + 1) / SLICES;
      var y0 = HZ + a * a * (400 - HZ), y1 = HZ + b * b * (400 - HZ);
      var w0 = 34 + a * a * 640,        w1 = 34 + b * b * 640;
      var ph = Math.floor(i / 7 + t * 4) % RB.length;

      /* calzada */
      var g = ctx.createLinearGradient(480 - w1, 0, 480 + w1, 0);
      for (k = 0; k <= RB.length; k++) g.addColorStop(k / RB.length, RB[(k + ph) % RB.length]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(480 - w0, y0); ctx.lineTo(480 + w0, y0);
      ctx.lineTo(480 + w1, y1); ctx.lineTo(480 - w1, y1);
      ctx.closePath();
      ctx.fill();

      /* damero que corre hacia el jugador */
      var beat = (Math.floor(i / 2) + Math.floor(t * 5)) % 2;
      if (!beat) { ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fill(); }

      /* raíles de caramelo a los lados, como en el nivel */
      var e0 = 5 + a * a * 46, e1 = 5 + b * b * 46;
      ctx.fillStyle = beat ? '#ffffff' : RM[Math.floor(i / 2) % RM.length];
      ctx.beginPath();
      ctx.moveTo(480 - w0 - e0, y0); ctx.lineTo(480 - w0, y0);
      ctx.lineTo(480 - w1, y1); ctx.lineTo(480 - w1 - e1, y1);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(480 + w0, y0); ctx.lineTo(480 + w0 + e0, y0);
      ctx.lineTo(480 + w1 + e1, y1); ctx.lineTo(480 + w1, y1);
      ctx.closePath(); ctx.fill();
    }

    /* neón sobre los raíles */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (k = -1; k <= 1; k += 2) {
      var ng = ctx.createLinearGradient(480 + k * 40, HZ, 480 + k * 700, 400);
      ng.addColorStop(0, 'rgba(255,255,255,0)');
      ng.addColorStop(1, 'rgba(255,255,255,.22)');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.moveTo(480 + k * 34, HZ);
      ctx.lineTo(480 + k * 700, 400);
      ctx.lineTo(480 + k * 760, 400);
      ctx.lineTo(480 + k * 40, HZ);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    /* cintas de pista lejanas flotando en el espacio */
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (i = 0; i < 2; i++) {
      var rx = 120 + i * 520, ry = 150 - i * 34;
      var rg2 = ctx.createLinearGradient(rx, ry - 16, rx, ry + 16);
      for (k = 0; k <= RB.length; k++) rg2.addColorStop(k / RB.length, RB[(k + i * 3) % RB.length]);
      ctx.strokeStyle = rg2;
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(rx - 150, ry + 30);
      ctx.quadraticCurveTo(rx + 20, ry - 70, rx + 210, ry + 14);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();

    /* brillo del horizonte */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var hg = ctx.createRadialGradient(480, HZ, 4, 480, HZ, 200);
    hg.addColorStop(0, 'rgba(255,255,255,.35)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(480, HZ, 200, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* enemigos en la pista */
    var gp = ((t * 0.32) % 1), gs = 0.25 + gp * gp * 3.6;
    RID.Avatar.drawSprite(ctx, 'goomba', 480 - 210 * gp * gp - 40,
                          HZ + gp * gp * (400 - HZ) - Math.abs(Math.sin(t * 6)) * 6 * gs, gs);
    var kp = ((t * 0.32 + 0.45) % 1), ks = 0.25 + kp * kp * 3.2;
    RID.Avatar.drawSprite(ctx, 'koopa', 480 + 240 * kp * kp + 30,
                          HZ + kp * kp * (400 - HZ), ks, { flip: true });

    /* líneas de velocidad */
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    for (k = 0; k < 10; k++) {
      var s = ((t * 1.6 + k / 10) % 1);
      ctx.fillRect(480 - (10 + s * s * 640), HZ + s * s * 150, 60 * s, 2);
      ctx.fillRect(480 + (10 + s * s * 640) - 60 * s, HZ + s * s * 150, 60 * s, 2);
    }

    /* --- kart visto por detrás --- */
    var sway = Math.sin(t * 3.2) * 14;
    RID.Avatar.drawKart(ctx, 480 + sway, 392 + Math.sin(t * 15) * 2, 1.15,
                        { t: t, lean: sway * 0.07 });
  };

  /* Cadena de eslabones reales entre dos puntos, con caída natural */
  function chain(ctx, x0, y0, x1, y1, sag, links) {
    var i, p, cx, cy, ang, nx, ny, dx, dy;
    links = links || 9;
    sag = sag || 26;

    function pt(u) {
      return {
        x: x0 + (x1 - x0) * u,
        y: y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag
      };
    }
    for (i = 0; i <= links; i++) {
      p  = pt(i / links);
      nx = pt(Math.min(1, (i + 0.5) / links));
      dx = nx.x - p.x; dy = nx.y - p.y;
      ang = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang + (i % 2 ? Math.PI / 2 : 0));
      ctx.strokeStyle = '#7d8494';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      U.ellipse(ctx, 0, 0, 8, 5);
      ctx.stroke();
      ctx.strokeStyle = '#c3cad8';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      U.ellipse(ctx, -1, -1, 8, 5);
      ctx.stroke();
      ctx.restore();
    }
    /* argolla del extremo */
    ctx.fillStyle = '#5d6474';
    U.ellipse(ctx, x1, y1, 6, 6); ctx.fill();
    ctx.fillStyle = '#2a2a33';
    U.ellipse(ctx, x1, y1, 2.6, 2.6); ctx.fill();
  }

  /* Grieta profunda con estratos y fondo incandescente */
  function chasm(ctx, x, w, top, glow) {
    var g = ctx.createLinearGradient(0, top, 0, 400);
    g.addColorStop(0, '#2b241b');
    g.addColorStop(0.45, '#120e0a');
    g.addColorStop(1, glow ? '#3a1206' : '#000000');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + w * 0.22, top + 9);
    ctx.lineTo(x + w * 0.5, top + 3);
    ctx.lineTo(x + w * 0.78, top + 11);
    ctx.lineTo(x + w, top);
    ctx.lineTo(x + w - 20, 400);
    ctx.lineTo(x + 20, 400);
    ctx.closePath();
    ctx.fill();

    /* estratos de roca */
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (var k = 1; k < 5; k++) {
      ctx.fillRect(x + 14 + k, top + k * 24, w - 28 - k * 2, 4);
    }
    /* borde de tierra rota */
    ctx.fillStyle = '#6b431f';
    ctx.fillRect(x - 6, top - 4, 14, 12);
    ctx.fillRect(x + w - 8, top - 4, 14, 12);

    if (glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var lg = ctx.createLinearGradient(0, 340, 0, 400);
      lg.addColorStop(0, 'rgba(255,90,20,0)');
      lg.addColorStop(1, 'rgba(255,120,30,.35)');
      ctx.fillStyle = lg;
      ctx.fillRect(x + 16, 330, w - 32, 70);
      ctx.restore();
    }
  }

  /* 5 · Isla Yoshi agrietada y los Yoshis encadenados */
  anim.cracks = function (ctx, t) {
    var i;

    /* cielo */
    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#2f8fd0'); sk.addColorStop(0.5, '#8fd0ee'); sk.addColorStop(1, '#f0d9a8');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    /* nubes largas */
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (i = 0; i < 5; i++) {
      var cx = ((i * 260 + t * 9) % 1240) - 140;
      U.ellipse(ctx, cx, 52 + i * 11, 74, 13); ctx.fill();
      U.ellipse(ctx, cx + 46, 56 + i * 11, 50, 10); ctx.fill();
    }

    /* montañas de fondo */
    ctx.fillStyle = '#4a7f8a';
    for (i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 230 - 60, 300);
      ctx.lineTo(i * 230 + 90, 150 + (i % 2) * 34);
      ctx.lineTo(i * 230 + 250, 300);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 230 + 60, 196 + (i % 2) * 34);
      ctx.lineTo(i * 230 + 90, 150 + (i % 2) * 34);
      ctx.lineTo(i * 230 + 122, 196 + (i % 2) * 34);
      ctx.closePath(); ctx.fill();
    }

    /* palmeras */
    function palm(px, s) {
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 7 * s; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, 296);
      ctx.quadraticCurveTo(px + 12 * s, 240 * s + 60, px + 4 * s, 196 * s + 40);
      ctx.stroke();
      ctx.fillStyle = '#2f8f3a';
      for (var k = 0; k < 5; k++) {
        var a = -Math.PI / 2 + (k - 2) * 0.52 + Math.sin(t + k) * 0.03;
        ctx.save();
        ctx.translate(px + 4 * s, 196 * s + 40);
        ctx.rotate(a);
        ctx.beginPath();
        U.ellipse(ctx, 34 * s, 0, 36 * s, 9 * s);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#8a5a2b';
      U.ellipse(ctx, px + 4 * s, 196 * s + 46, 6 * s, 5 * s); ctx.fill();
    }
    palm(96, 1); palm(880, 0.86);

    /* suelo */
    ctx.fillStyle = '#4fb04f';
    ctx.fillRect(0, 296, 960, 18);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(0, 314, 960, 86);
    ctx.fillStyle = '#6b431f';
    for (i = 0; i < 960; i += 44) ctx.fillRect(i + 8, 332, 24, 8);
    ctx.fillStyle = '#3f9b46';
    for (i = 0; i < 960; i += 26) {
      ctx.fillRect(i, 292, 5, 6);
      ctx.fillRect(i + 12, 290, 4, 8);
    }

    /* grietas */
    chasm(ctx, 190, 96, 296, false);
    chasm(ctx, 430, 118, 296, true);
    chasm(ctx, 716, 104, 296, false);

    /* trozos de tierra desprendidos flotando */
    ctx.fillStyle = '#8a5a2b';
    for (i = 0; i < 3; i++) {
      var fx = 250 + i * 240, fy = 330 + Math.sin(t * 1.4 + i) * 4;
      ctx.fillRect(fx, fy, 22, 12);
      ctx.fillStyle = '#4fb04f'; ctx.fillRect(fx, fy, 22, 4);
      ctx.fillStyle = '#8a5a2b';
    }

    /* Yoshis encadenados a un poste */
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(620, 214, 12, 84);
    ctx.fillStyle = '#7a6144';
    ctx.fillRect(620, 214, 5, 84);
    ctx.fillStyle = '#3a2d1e';
    U.ellipse(ctx, 626, 298, 18, 6); ctx.fill();

    var b1 = Math.sin(t * 1.7) * 2, b2 = Math.sin(t * 1.9 + 1) * 2;
    RID.Avatar.drawSprite(ctx, 'yoshi', 742, 300 + b1, 3.1, { flip: true });
    RID.Avatar.drawSprite(ctx, 'yoshi', 846, 298 + b2, 2.6, { flip: true });

    chain(ctx, 626, 224, 716, 250 + b1, 20, 8);
    chain(ctx, 626, 232, 826, 254 + b2, 34, 13);

    RID.Avatar.drawPlayer(ctx, 110, 296, 3.0, 'idle', t);
  };

  /* 6 · Roy Koopa */
  anim.boss = function (ctx, t) {
    var i, k;

    /* cielo de tormenta */
    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#1b0f2e'); sk.addColorStop(0.55, '#4a1533'); sk.addColorStop(1, '#7a2b2b');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    /* relámpago ocasional */
    var flash = (Math.sin(t * 0.7) > 0.985) ? 1 : 0;
    if (flash) {
      ctx.fillStyle = 'rgba(255,240,255,.22)';
      ctx.fillRect(0, 0, 960, 400);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(700, 0); ctx.lineTo(680, 70); ctx.lineTo(706, 66);
      ctx.lineTo(676, 150);
      ctx.stroke();
    }

    /* nubes oscuras */
    ctx.fillStyle = 'rgba(20,10,26,.7)';
    for (i = 0; i < 6; i++) {
      var cx = ((i * 220 + t * 6) % 1200) - 130;
      U.ellipse(ctx, cx, 46 + (i % 2) * 16, 96, 26); ctx.fill();
    }

    /* riscos al fondo */
    ctx.fillStyle = '#2a1024';
    for (i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 200 - 40, 320);
      ctx.lineTo(i * 200 + 70, 170 + (i % 3) * 40);
      ctx.lineTo(i * 200 + 190, 320);
      ctx.closePath(); ctx.fill();
    }

    /* plataforma de combate sobre el abismo */
    var gp = ctx.createLinearGradient(0, 300, 0, 400);
    gp.addColorStop(0, '#000'); gp.addColorStop(1, '#3a0d06');
    ctx.fillStyle = gp; ctx.fillRect(0, 300, 960, 100);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var lava = ctx.createLinearGradient(0, 360, 0, 400);
    lava.addColorStop(0, 'rgba(255,80,10,0)');
    lava.addColorStop(1, 'rgba(255,140,30,.45)');
    ctx.fillStyle = lava; ctx.fillRect(0, 350, 960, 50);
    ctx.restore();

    ctx.fillStyle = '#4a3346';
    ctx.fillRect(0, 300, 960, 34);
    ctx.fillStyle = '#63455c';
    ctx.fillRect(0, 300, 960, 8);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    for (i = 0; i < 960; i += 78) ctx.fillRect(i, 308, 3, 26);
    /* grietas en la piedra */
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2;
    for (i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(120 + i * 190, 300);
      ctx.lineTo(136 + i * 190, 318);
      ctx.lineTo(126 + i * 190, 334);
      ctx.stroke();
    }

    /* antorchas de la arena */
    for (i = 0; i < 2; i++) {
      var tx = 120 + i * 720;
      ctx.fillStyle = '#3a2a18'; ctx.fillRect(tx - 5, 214, 10, 88);
      ctx.fillStyle = '#5a4a35'; ctx.fillRect(tx - 12, 206, 24, 10);
      var fl = Math.sin(t * 12 + i) * 4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createRadialGradient(tx, 194, 2, tx, 194, 90);
      fg.addColorStop(0, 'rgba(255,210,120,.35)');
      fg.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(tx, 194, 90, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffb020';
      ctx.beginPath();
      ctx.moveTo(tx - 10, 206);
      ctx.quadraticCurveTo(tx, 172 - fl, tx + 10, 206);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe98a';
      ctx.beginPath();
      ctx.moveTo(tx - 5, 204);
      ctx.quadraticCurveTo(tx, 184 - fl, tx + 5, 204);
      ctx.closePath(); ctx.fill();
    }

    /* Yoshis encadenados mirando desde el fondo */
    RID.Avatar.drawSprite(ctx, 'yoshi', 300, 302, 1.6, { flip: true, alpha: 0.8 });
    RID.Avatar.drawSprite(ctx, 'yoshi', 370, 302, 1.5, { flip: true, alpha: 0.8 });
    chain(ctx, 292, 276, 368, 278, 8, 5);

    /* Roy con sombra */
    var bob = Math.abs(Math.sin(t * 2.2)) * 8;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    U.ellipse(ctx, 700, 302, 62 - bob * 0.6, 12); ctx.fill();
    RID.Avatar.drawSprite(ctx, 'roy', 700, 300 - bob, 6.2, { flip: true });

    /* caparazones que lanza */
    for (i = 0; i < 3; i++) {
      var p = ((t * 0.7 + i / 3) % 1);
      RID.Avatar.drawShell(ctx, 640 - p * 430, 236 + Math.sin(p * 6 + i) * 30, 18, p * 12);
    }

    /* brasas flotando */
    ctx.fillStyle = 'rgba(255,150,60,.7)';
    for (k = 0; k < 18; k++) {
      var ex = (k * 137 + t * 22) % 980 - 10;
      var ey = 400 - ((t * 40 + k * 53) % 320);
      ctx.fillRect(ex, ey, 2, 3);
    }

    RID.Avatar.drawPlayer(ctx, 170, 300, 3.0, 'hurt', t);
  };

  /* 7 · las monedas rodando hacia la grieta */
  anim.coins = function (ctx, t) {
    var i;

    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#ffb84d'); sk.addColorStop(0.45, '#ffd99a'); sk.addColorStop(1, '#c9e88a');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    /* sol bajo */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createRadialGradient(760, 130, 8, 760, 130, 170);
    sg.addColorStop(0, 'rgba(255,250,200,.9)');
    sg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(760, 130, 170, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* colinas */
    ctx.fillStyle = '#2f7a3a';
    for (i = 0; i < 6; i++) { U.ellipse(ctx, i * 210, 330, 190, 96); ctx.fill(); }

    /* suelo */
    ctx.fillStyle = '#4fb04f';
    ctx.fillRect(0, 300, 960, 16);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(0, 316, 960, 84);

    /* grieta principal */
    chasm(ctx, 540, 170, 300, false);

    /* saco roto */
    ctx.fillStyle = '#a5814f';
    ctx.beginPath();
    ctx.moveTo(250, 300);
    ctx.quadraticCurveTo(232, 262, 262, 250);
    ctx.quadraticCurveTo(300, 240, 306, 276);
    ctx.quadraticCurveTo(310, 298, 292, 300);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b5230'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(258, 244, 42, 8);

    /* monedas rodando y girando */
    for (i = 0; i < 7; i++) {
      var p = ((t * 0.55 + i / 7) % 1);
      var x = 300 + p * 300;
      var y = 286 - Math.abs(Math.sin(p * Math.PI * 2)) * 26 + p * 8;
      var wgt = Math.abs(Math.cos(t * 7 + i));
      var w = 6 + wgt * 20;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var cg = ctx.createRadialGradient(x, y, 1, x, y, 26);
      cg.addColorStop(0, 'rgba(255,220,120,.35)');
      cg.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      var gg = ctx.createLinearGradient(x - w / 2, y - 15, x + w / 2, y + 15);
      gg.addColorStop(0, '#fff3b0'); gg.addColorStop(0.5, '#ffd447'); gg.addColorStop(1, '#b8860b');
      ctx.fillStyle = gg;
      U.ellipse(ctx, x, y, Math.max(2, w / 2), 15); ctx.fill();
      ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = 2; ctx.stroke();
      if (w > 12) {
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        U.ellipse(ctx, x - w * 0.12, y - 5, w * 0.10, 4); ctx.fill();
      }
    }

    /* Yoshis dando saltos de agradecimiento */
    RID.Avatar.drawSprite(ctx, 'yoshi', 800, 306 - Math.abs(Math.sin(t * 5)) * 12, 3.0, { flip: true });
    RID.Avatar.drawSprite(ctx, 'yoshi', 892, 304 - Math.abs(Math.sin(t * 5 + 1)) * 9, 2.5, { flip: true });

    RID.Avatar.drawPlayer(ctx, 200, 300, 3.0, 'cheer', t);
  };

  /* 8 · la selva de la Isla Kong */
  anim.jungle = function (ctx, t) {
    var i, k;

    /* fondo con niebla verde */
    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#0d3318'); sk.addColorStop(0.5, '#1d5c2a'); sk.addColorStop(1, '#2f7a3a');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    /* rayos de luz entre el follaje */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 4; i++) {
      var lx = 120 + i * 240;
      var lg = ctx.createLinearGradient(lx, 0, lx + 70, 400);
      lg.addColorStop(0, 'rgba(220,255,190,.20)');
      lg.addColorStop(1, 'rgba(220,255,190,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(lx - 26, 0); ctx.lineTo(lx + 34, 0);
      ctx.lineTo(lx + 128, 400); ctx.lineTo(lx + 24, 400);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    /* troncos lejanos */
    ctx.fillStyle = 'rgba(20,50,26,.75)';
    for (i = 0; i < 7; i++) ctx.fillRect(i * 150 + 30, 40, 26, 340);

    /* troncos cercanos con textura */
    for (i = 0; i < 4; i++) {
      var x = 30 + i * 270;
      ctx.fillStyle = '#4a3324';
      ctx.fillRect(x, 20, 44, 320);
      ctx.fillStyle = '#5f4430';
      ctx.fillRect(x + 4, 20, 12, 320);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      for (k = 0; k < 12; k++) ctx.fillRect(x + 6, 40 + k * 26, 32, 4);
      /* raíces */
      ctx.fillStyle = '#3d2a1c';
      ctx.beginPath();
      ctx.moveTo(x - 16, 344); ctx.lineTo(x + 8, 300);
      ctx.lineTo(x + 36, 300); ctx.lineTo(x + 60, 344);
      ctx.closePath(); ctx.fill();
      /* lianas */
      ctx.strokeStyle = '#3fb950'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 22, 20);
      ctx.quadraticCurveTo(x + 70 + Math.sin(t + i) * 14, 140, x + 34, 250);
      ctx.stroke();
      ctx.fillStyle = '#2f8f3a';
      for (k = 0; k < 4; k++) {
        U.ellipse(ctx, x + 46 + Math.sin(t + i + k) * 6, 60 + k * 46, 11, 6); ctx.fill();
      }
    }

    /* dosel de hojas grandes */
    ctx.fillStyle = '#17491f';
    for (k = 0; k < 12; k++) {
      ctx.save();
      ctx.translate(k * 92, 26);
      ctx.rotate(Math.sin(t * 0.6 + k) * 0.05);
      U.ellipse(ctx, 0, 0, 78, 40); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#1e5c2a';
    for (k = 0; k < 10; k++) { U.ellipse(ctx, k * 110 + 50, 8, 66, 32); ctx.fill(); }

    /* suelo de selva */
    ctx.fillStyle = '#2c4a22';
    ctx.fillRect(0, 340, 960, 60);
    ctx.fillStyle = '#3f6b30';
    ctx.fillRect(0, 340, 960, 10);
    ctx.fillStyle = '#1e3a18';
    for (i = 0; i < 960; i += 34) { U.ellipse(ctx, i, 356, 16, 6); ctx.fill(); }

    /* helechos en primer plano */
    ctx.fillStyle = '#245c28';
    for (i = 0; i < 14; i++) {
      var fx = i * 74 + 10;
      for (k = -2; k <= 2; k++) {
        ctx.save();
        ctx.translate(fx, 386);
        ctx.rotate(k * 0.34 + Math.sin(t * 0.8 + i) * 0.03);
        U.ellipse(ctx, 0, -26, 8, 30);
        ctx.fill();
        ctx.restore();
      }
    }

    /* kart escondido tras las lianas */
    ctx.save();
    ctx.globalAlpha = 0.9;
    RID.Avatar.drawKart(ctx, 790, 344, 0.8, { t: t, driver: false });
    ctx.restore();
    ctx.strokeStyle = 'rgba(63,185,80,.9)'; ctx.lineWidth = 5;
    for (k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(720 + k * 42, 250);
      ctx.quadraticCurveTo(730 + k * 42 + Math.sin(t + k) * 8, 310, 716 + k * 42, 356);
      ctx.stroke();
    }

    /* Koopas al acecho entre los árboles */
    RID.Avatar.drawSprite(ctx, 'koopa', 604, 344, 2.0, { alpha: 0.55, silhouette: true });
    RID.Avatar.drawSprite(ctx, 'koopa', 300, 342, 1.8, { alpha: 0.45, silhouette: true, flip: true });

    /* Donkey Kong tirando del brazo */
    var pull = Math.sin(t * 5) * 6;
    RID.Avatar.drawSprite(ctx, 'dk', 430 + pull, 348, 4.4, { flip: true });
    RID.Avatar.drawPlayer(ctx, 320 + pull * 0.6, 348, 3.0, 'hurt', t);
  };

  /* 9 · el refugio subterráneo y la tienda */
  anim.refuge = function (ctx, t) {
    var i, k;

    /* roca de la cueva */
    var rk = ctx.createLinearGradient(0, 0, 0, 400);
    rk.addColorStop(0, '#160f0a'); rk.addColorStop(0.6, '#2e2113'); rk.addColorStop(1, '#3a2a18');
    ctx.fillStyle = rk; ctx.fillRect(0, 0, 960, 400);

    /* estalactitas */
    ctx.fillStyle = '#241a10';
    for (i = 0; i < 16; i++) {
      var sx = i * 62 + ((i * 37) % 20);
      var sh = 26 + ((i * 53) % 46);
      ctx.beginPath();
      ctx.moveTo(sx, 0); ctx.lineTo(sx + 16, 0); ctx.lineTo(sx + 8, sh);
      ctx.closePath(); ctx.fill();
    }
    /* pared con vetas */
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3;
    for (i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-20 + i * 190, 60 + (i % 2) * 30);
      ctx.quadraticCurveTo(60 + i * 190, 120, -10 + i * 190, 200);
      ctx.stroke();
    }

    /* suelo */
    ctx.fillStyle = '#43301c';
    ctx.fillRect(0, 336, 960, 64);
    ctx.fillStyle = '#55402a';
    ctx.fillRect(0, 336, 960, 9);
    ctx.fillStyle = 'rgba(0,0,0,.30)';
    for (i = 0; i < 960; i += 58) ctx.fillRect(i, 346, 4, 54);

    /* puesto de la tienda con toldo */
    (function stall() {
      var sx = 636, sy = 336;
      ctx.fillStyle = '#4a3320';
      ctx.fillRect(sx, sy - 116, 258, 116);
      ctx.fillStyle = '#3a2614';
      ctx.fillRect(sx + 20, sy - 92, 218, 74);
      /* estanterías con objetos */
      ctx.fillStyle = '#63451f';
      ctx.fillRect(sx + 20, sy - 60, 218, 6);
      ctx.fillRect(sx + 20, sy - 34, 218, 6);
      var cols = ['#ffd447', '#5eb3ff', '#4ade80', '#ff7ba0', '#f28a20'];
      for (k = 0; k < 5; k++) {
        ctx.fillStyle = cols[k];
        ctx.fillRect(sx + 34 + k * 42, sy - 78, 20, 18);
        U.ellipse(ctx, sx + 44 + k * 42, sy - 40, 9, 7); ctx.fill();
      }
      /* toldo a rayas */
      for (k = 0; k < 9; k++) {
        ctx.fillStyle = (k % 2) ? '#c0392b' : '#f2ead6';
        ctx.beginPath();
        ctx.moveTo(sx - 14 + k * 32, sy - 116);
        ctx.lineTo(sx + 18 + k * 32, sy - 116);
        ctx.lineTo(sx + 14 + k * 32, sy - 88);
        ctx.lineTo(sx - 10 + k * 32, sy - 88);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#2b1d10';
      ctx.fillRect(sx - 16, sy - 124, 292, 10);
      U.pixelText(ctx, 'SHOP', sx + 129, sy - 140, 24, '#ffd447');
      /* farolillo */
      ctx.fillStyle = '#3a2a18'; ctx.fillRect(sx + 128, sy - 172, 3, 26);
      ctx.fillStyle = '#ffcf6a';
      U.ellipse(ctx, sx + 129, sy - 142, 8, 10); ctx.fill();
    })();

    /* cajas y barriles */
    ctx.fillStyle = '#6b4a22';
    ctx.fillRect(560, 296, 46, 40);
    ctx.fillStyle = '#8a6330';
    ctx.fillRect(564, 300, 38, 6);
    ctx.fillRect(564, 322, 38, 6);
    ctx.fillStyle = '#5a3f1c';
    U.ellipse(ctx, 528, 336, 22, 8); ctx.fill();
    ctx.fillRect(506, 300, 44, 36);
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(506, 310, 44, 5);
    ctx.fillRect(506, 324, 44, 5);

    /* hoguera central */
    var f = Math.sin(t * 9) * 5;
    ctx.fillStyle = '#2a1d10';
    for (i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(410 + i * 16, 332);
      ctx.rotate((i - 2.5) * 0.32);
      ctx.fillRect(-16, -4, 32, 8);
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var fgd = ctx.createRadialGradient(450, 300, 6, 450, 300, 190 + f * 3);
    fgd.addColorStop(0, 'rgba(255,230,150,.55)');
    fgd.addColorStop(0.35, 'rgba(255,150,50,.26)');
    fgd.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = fgd;
    ctx.beginPath(); ctx.arc(450, 300, 190, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ff8a1a';
    ctx.beginPath();
    ctx.moveTo(428, 330);
    ctx.quadraticCurveTo(450, 268 - f * 2, 472, 330);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffc84d';
    ctx.beginPath();
    ctx.moveTo(438, 330);
    ctx.quadraticCurveTo(450, 288 - f, 462, 330);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff0b0';
    ctx.beginPath();
    ctx.moveTo(444, 330);
    ctx.quadraticCurveTo(450, 306 - f * 0.6, 456, 330);
    ctx.closePath(); ctx.fill();

    /* chispas subiendo */
    ctx.fillStyle = 'rgba(255,180,80,.8)';
    for (k = 0; k < 14; k++) {
      var ex = 450 + Math.sin(t * 2 + k) * (14 + k);
      var ey = 320 - ((t * 60 + k * 42) % 220);
      ctx.fillRect(ex, ey, 2, 3);
    }

    /* gorilas alrededor del fuego */
    RID.Avatar.drawSprite(ctx, 'dk', 250, 340, 3.6);
    RID.Avatar.drawSprite(ctx, 'dk', 344, 338, 2.9, { flip: true });
    RID.Avatar.drawSprite(ctx, 'dk', 560, 338, 2.6, { flip: true });

    RID.Avatar.drawPlayer(ctx, 140, 340, 3.0, 'idle', t);
  };

  /* 11 · Ludwig von Koopa en el trono de Donkey Kong */
  anim.ludwig = function (ctx, t) {
    var i, k;

    var wl = ctx.createLinearGradient(0, 0, 0, 400);
    wl.addColorStop(0, '#1c1712'); wl.addColorStop(1, '#3a2f22');
    ctx.fillStyle = wl; ctx.fillRect(0, 0, 960, 400);

    /* sillería */
    for (var y = 30; y < 330; y += 34) {
      for (var x = -40; x < 960; x += 70) {
        var off = ((y / 34) % 2) ? 35 : 0;
        var v = ((Math.abs(x + off) * 7919 + y * 131) % 15) - 7;
        ctx.fillStyle = 'rgb(' + (74 + v) + ',' + (60 + v) + ',' + (44 + v) + ')';
        ctx.fillRect(x + off, y, 66, 30);
      }
    }

    /* jaulas con gorilas al fondo */
    for (i = 0; i < 2; i++) {
      var cx = 120 + i * 700;
      ctx.fillStyle = 'rgba(10,7,4,.85)';
      ctx.fillRect(cx - 54, 150, 108, 170);
      RID.Avatar.drawSprite(ctx, 'dk', cx, 316, 2.6, { alpha: 0.75, flip: i === 1 });
      ctx.strokeStyle = '#8d92a6'; ctx.lineWidth = 5;
      for (k = 0; k <= 6; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - 54 + k * 18, 150); ctx.lineTo(cx - 54 + k * 18, 320);
        ctx.stroke();
      }
      ctx.fillStyle = '#5d6474';
      ctx.fillRect(cx - 58, 142, 116, 12);
      ctx.fillRect(cx - 58, 314, 116, 10);
    }

    /* antorchas */
    for (i = 0; i < 3; i++) {
      var tx = 300 + i * 180, fl = Math.sin(t * 11 + i) * 4;
      ctx.fillStyle = '#3a2a18'; ctx.fillRect(tx - 5, 120, 10, 34);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createRadialGradient(tx, 108, 2, tx, 108, 100);
      fg.addColorStop(0, 'rgba(255,210,120,.30)');
      fg.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(tx, 108, 100, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffb020';
      ctx.beginPath();
      ctx.moveTo(tx - 9, 122);
      ctx.quadraticCurveTo(tx, 88 - fl, tx + 9, 122);
      ctx.closePath(); ctx.fill();
    }

    /* suelo */
    ctx.fillStyle = '#4a3a24'; ctx.fillRect(0, 330, 960, 70);
    ctx.fillStyle = '#63502f'; ctx.fillRect(0, 330, 960, 8);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    for (i = 0; i < 960; i += 64) ctx.fillRect(i, 338, 3, 62);

    /* trono de piedra */
    ctx.fillStyle = '#6b5a3a';
    ctx.fillRect(596, 200, 120, 130);
    ctx.fillStyle = '#8a7550';
    ctx.fillRect(606, 210, 100, 60);
    ctx.fillStyle = '#4a3a24';
    ctx.fillRect(596, 186, 120, 16);

    actors.ludwig(ctx, t);
  };

  /* 13 · Sarasaland y los Shy Guys hipnotizados */
  anim.sarasa = function (ctx, t) {
    var i, k;

    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#f0a83c'); sk.addColorStop(0.5, '#f8d489'); sk.addColorStop(1, '#e8c47a');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    /* sol grande */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createRadialGradient(780, 96, 12, 780, 96, 170);
    sg.addColorStop(0, 'rgba(255,250,210,.95)');
    sg.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(780, 96, 170, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath(); ctx.arc(780, 96, 40, 0, Math.PI * 2); ctx.fill();

    /* pirámides */
    function pyramid(px, py, w, h, c1, c2) {
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(px - w, py); ctx.lineTo(px, py - h); ctx.lineTo(px + w, py);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(px, py - h); ctx.lineTo(px + w, py);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
      for (var b = 1; b < 6; b++) {
        var f = b / 6;
        ctx.beginPath();
        ctx.moveTo(px - w * (1 - f), py - h * f);
        ctx.lineTo(px + w * (1 - f), py - h * f);
        ctx.stroke();
      }
    }
    pyramid(200, 306, 150, 150, '#d9a94e', '#b8863a');
    pyramid(520, 306, 100, 100, '#cfa04a', '#a87c34');
    pyramid(830, 306, 130, 128, '#d9a94e', '#b8863a');

    /* dunas */
    ctx.fillStyle = '#e0b464';
    for (i = 0; i < 5; i++) { U.ellipse(ctx, i * 250 - 40, 330, 200, 44); ctx.fill(); }
    ctx.fillStyle = '#eec87e';
    ctx.fillRect(0, 322, 960, 78);
    ctx.fillStyle = 'rgba(200,150,70,.5)';
    for (i = 0; i < 960; i += 38) { U.ellipse(ctx, i, 348 + (i % 3) * 8, 22, 4); ctx.fill(); }

    /* auto medio enterrado */
    ctx.save();
    ctx.globalAlpha = 0.95;
    RID.Avatar.drawKart(ctx, 120, 352, 0.72, { t: t, driver: false });
    ctx.restore();
    ctx.fillStyle = '#eec87e';
    U.ellipse(ctx, 120, 356, 78, 16); ctx.fill();

    actors.sarasa(ctx, t);
  };

  /* 14 · Morton Koopa Jr. y sus martillos */
  anim.morton = function (ctx, t) {
    var i;

    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#4a2410'); sk.addColorStop(0.5, '#a05a1e'); sk.addColorStop(1, '#e0a34a');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    /* tormenta de arena */
    ctx.fillStyle = 'rgba(220,170,90,.18)';
    for (i = 0; i < 26; i++) {
      var wx = ((i * 97 + t * 160) % 1100) - 70;
      ctx.fillRect(wx, 40 + (i * 53) % 260, 40, 2);
    }

    /* pirámide grande al fondo */
    ctx.fillStyle = '#8a5f28';
    ctx.beginPath();
    ctx.moveTo(300, 330); ctx.lineTo(560, 60); ctx.lineTo(820, 330);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a87c34';
    ctx.beginPath();
    ctx.moveTo(560, 330); ctx.lineTo(560, 60); ctx.lineTo(820, 330);
    ctx.closePath(); ctx.fill();

    /* columnas rotas */
    for (i = 0; i < 4; i++) {
      var cx = 90 + i * 250;
      ctx.fillStyle = '#c9a45c';
      ctx.fillRect(cx, 210 + (i % 2) * 40, 34, 130);
      ctx.fillStyle = '#e0bd7a';
      ctx.fillRect(cx, 204 + (i % 2) * 40, 34, 10);
    }

    /* suelo de arena compacta */
    ctx.fillStyle = '#b8863a'; ctx.fillRect(0, 330, 960, 70);
    ctx.fillStyle = '#d9a94e'; ctx.fillRect(0, 330, 960, 9);

    actors.morton(ctx, t);
  };

  /* 17 · la tierra de Bowser, infestada de Koopas esqueleto */
  anim.bowserland = function (ctx, t) {
    var i;

    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#1a0208'); sk.addColorStop(0.5, '#6b1410'); sk.addColorStop(1, '#c43b12');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    /* ceniza cayendo */
    ctx.fillStyle = 'rgba(255,170,90,.55)';
    for (i = 0; i < 30; i++) {
      var ax = (i * 137 + t * 14) % 990 - 15;
      var ay = ((t * 46 + i * 61) % 420) - 10;
      ctx.fillRect(ax, ay, 2, 4);
    }

    /* volcán al fondo */
    ctx.fillStyle = '#2a0c10';
    ctx.beginPath();
    ctx.moveTo(520, 320); ctx.lineTo(720, 90); ctx.lineTo(920, 320);
    ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var lg = ctx.createRadialGradient(720, 96, 6, 720, 96, 120);
    lg.addColorStop(0, 'rgba(255,180,60,.7)');
    lg.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(720, 96, 120, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* castillo de Bowser recortado */
    ctx.fillStyle = '#140609';
    ctx.fillRect(120, 150, 240, 172);
    ctx.fillRect(96, 118, 44, 204);
    ctx.fillRect(340, 118, 44, 204);
    for (i = 0; i < 5; i++) ctx.fillRect(150 + i * 42, 132, 26, 24);
    ctx.fillStyle = '#e8871f';
    ctx.fillRect(214, 258, 52, 64);
    ctx.fillStyle = '#140609';
    for (i = 0; i < 4; i++) ctx.fillRect(218 + i * 13, 258, 4, 64);

    /* rocas negras y lava en el suelo */
    ctx.fillStyle = '#231014';
    ctx.fillRect(0, 320, 960, 80);
    ctx.fillStyle = '#3a1a1c';
    for (i = 0; i < 960; i += 62) { U.ellipse(ctx, i, 330, 34, 12); ctx.fill(); }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var lv = ctx.createLinearGradient(0, 366, 0, 400);
    lv.addColorStop(0, 'rgba(255,90,10,0)');
    lv.addColorStop(1, 'rgba(255,140,30,.45)');
    ctx.fillStyle = lv; ctx.fillRect(0, 366, 960, 34);
    ctx.restore();

    actors.bowserland(ctx, t);
  };

  /* 18 · el pasillo de trampas del castillo de Bowser */
  anim.castle = function (ctx, t) {
    var i, k;

    var wl = ctx.createLinearGradient(0, 0, 0, 400);
    wl.addColorStop(0, '#160a12'); wl.addColorStop(1, '#3a1620');
    ctx.fillStyle = wl; ctx.fillRect(0, 0, 960, 400);

    for (var y = 24; y < 330; y += 34) {
      for (var x = -40; x < 960; x += 70) {
        var off = ((y / 34) % 2) ? 35 : 0;
        var v = ((Math.abs(x + off) * 7919 + y * 131) % 15) - 7;
        ctx.fillStyle = 'rgb(' + (70 + v) + ',' + (34 + v) + ',' + (44 + v) + ')';
        ctx.fillRect(x + off, y, 66, 30);
      }
    }

    /* antorchas verdes de Bowser */
    for (i = 0; i < 4; i++) {
      var tx = 130 + i * 240, fl = Math.sin(t * 12 + i) * 4;
      ctx.fillStyle = '#2a1a14'; ctx.fillRect(tx - 5, 128, 10, 34);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createRadialGradient(tx, 112, 2, tx, 112, 110);
      fg.addColorStop(0, 'rgba(120,255,160,.30)');
      fg.addColorStop(1, 'rgba(40,255,120,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(tx, 112, 110, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3fe07a';
      ctx.beginPath();
      ctx.moveTo(tx - 9, 130);
      ctx.quadraticCurveTo(tx, 94 - fl, tx + 9, 130);
      ctx.closePath(); ctx.fill();
    }

    /* cuchillas girando */
    for (i = 0; i < 3; i++) {
      var bx = 260 + i * 260;
      ctx.fillStyle = '#4a2430'; ctx.fillRect(bx - 5, 150, 10, 60);
      ctx.save();
      ctx.translate(bx, 232);
      ctx.rotate(t * 9 + i);
      ctx.fillStyle = '#cfd3df';
      for (k = 0; k < 6; k++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-10, -22); ctx.lineTo(0, -38); ctx.lineTo(10, -22);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#8d92a6';
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* suelo y pinchos */
    ctx.fillStyle = '#3a1620'; ctx.fillRect(0, 330, 960, 70);
    ctx.fillStyle = '#5a2632'; ctx.fillRect(0, 330, 960, 8);
    ctx.fillStyle = '#cfd3df';
    for (i = 0; i < 960; i += 26) {
      ctx.beginPath();
      ctx.moveTo(i, 330); ctx.lineTo(i + 7, 306); ctx.lineTo(i + 14, 330);
      ctx.closePath(); ctx.fill();
    }

    actors.castle(ctx, t);
  };

  /* 19 · el trono de Bowser con todos capturados */
  anim.throne = function (ctx, t) {
    var i;
    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#1a0208'); sk.addColorStop(0.6, '#5a1008'); sk.addColorStop(1, '#a02a0c');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    /* columnas y trono de lava */
    ctx.fillStyle = '#2a1014';
    for (i = 0; i < 5; i++) ctx.fillRect(40 + i * 220, 40, 40, 290);
    ctx.fillStyle = '#3a1a1c';
    ctx.fillRect(600, 150, 190, 180);
    ctx.fillStyle = '#7a1010';
    ctx.fillRect(614, 164, 162, 90);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var lv = ctx.createLinearGradient(0, 300, 0, 400);
    lv.addColorStop(0, 'rgba(255,90,10,0)');
    lv.addColorStop(1, 'rgba(255,150,30,.5)');
    ctx.fillStyle = lv; ctx.fillRect(0, 300, 960, 100);
    ctx.restore();

    ctx.fillStyle = '#231014'; ctx.fillRect(0, 330, 960, 70);
    ctx.fillStyle = '#3a1a1c'; ctx.fillRect(0, 330, 960, 8);

    /* jaula colgando */
    ctx.strokeStyle = '#5d6474'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(430, 0); ctx.lineTo(430, 120); ctx.stroke();
    ctx.fillStyle = 'rgba(10,6,8,.7)';
    ctx.fillRect(378, 120, 104, 110);
    ctx.strokeStyle = '#8d92a6'; ctx.lineWidth = 4;
    for (i = 0; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(378 + i * 17, 120); ctx.lineTo(378 + i * 17, 230); ctx.stroke();
    }
    ctx.fillStyle = '#5d6474';
    ctx.fillRect(372, 112, 116, 12); ctx.fillRect(372, 226, 116, 10);

    actors.throne(ctx, t);
  };

  /* 20 · la fiesta en el castillo de Peach */
  anim.partyscene = function (ctx, t) {
    var i;
    var sk = ctx.createLinearGradient(0, 0, 0, 400);
    sk.addColorStop(0, '#4a3570'); sk.addColorStop(1, '#7a5a86');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, 960, 400);

    for (i = 0; i < 3; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, 34 + i * 24);
      ctx.quadraticCurveTo(480, 84 + i * 28, 980, 34 + i * 24);
      ctx.stroke();
    }
    var cols = ['#ff4d6d', '#ffd447', '#4ade80', '#5eb3ff', '#b197fc'];
    for (i = 0; i < 7; i++) {
      var bx = 80 + i * 130, by = 110 + Math.sin(t * 1.2 + i) * 9;
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, by + 20); ctx.lineTo(bx, by + 62); ctx.stroke();
      ctx.fillStyle = cols[i % cols.length];
      U.ellipse(ctx, bx, by, 16, 20); ctx.fill();
    }

    ctx.fillStyle = '#e6e0ee'; ctx.fillRect(0, 322, 960, 78);
    ctx.fillStyle = '#9c2135'; ctx.fillRect(360, 322, 240, 78);

    actors.partyscene(ctx, t);
  };

  /* 21 · en casa, dormido con la mascota */
  anim.bedroom = function (ctx, t) {
    var i;
    sky(ctx, '#0b1030', '#221a3c');
    stars(ctx, t, 30);
    moon(ctx, 820, 70, 34);

    /* pared y ventana */
    ctx.fillStyle = '#2e2448'; ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = '#1a1430'; ctx.fillRect(700, 40, 180, 130);
    var wg = ctx.createLinearGradient(0, 40, 0, 170);
    wg.addColorStop(0, '#16204a'); wg.addColorStop(1, '#2a3560');
    ctx.fillStyle = wg; ctx.fillRect(708, 48, 164, 114);
    ctx.fillStyle = '#f4f1c8';
    ctx.beginPath(); ctx.arc(840, 82, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    for (i = 0; i < 12; i++) ctx.fillRect(716 + (i * 53) % 150, 56 + (i * 37) % 96, 2, 2);
    ctx.fillStyle = '#4a3a66';
    ctx.fillRect(786, 48, 8, 114); ctx.fillRect(708, 100, 164, 8);

    /* suelo */
    ctx.fillStyle = '#3a2e50'; ctx.fillRect(0, 320, 960, 80);
    ctx.fillStyle = '#4a3c66'; ctx.fillRect(0, 320, 960, 6);

    /* mesita con el trofeo */
    ctx.fillStyle = '#5a3f24'; ctx.fillRect(120, 250, 120, 12);
    ctx.fillRect(132, 262, 12, 58); ctx.fillRect(216, 262, 12, 58);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var tg = ctx.createRadialGradient(180, 218, 4, 180, 218, 90);
    tg.addColorStop(0, 'rgba(255,220,120,.35)');
    tg.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(180, 218, 90, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.moveTo(160, 196); ctx.lineTo(200, 196);
    ctx.quadraticCurveTo(198, 232, 180, 236);
    ctx.quadraticCurveTo(162, 232, 160, 196);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#d4a017';
    ctx.beginPath(); ctx.arc(154, 208, 9, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(206, 208, 9, Math.PI / 2, -Math.PI / 2); ctx.stroke();
    ctx.fillStyle = '#8a6a12'; ctx.fillRect(168, 236, 24, 8);
    ctx.fillRect(158, 244, 44, 7);

    /* --- cama --- */
    /* cabecero con barrotes */
    ctx.fillStyle = '#7a5330';
    ctx.fillRect(330, 214, 20, 122);
    ctx.fillStyle = '#8f6338';
    ctx.fillRect(334, 214, 6, 122);
    ctx.fillStyle = '#7a5330';
    ctx.fillRect(322, 204, 40, 16);
    for (i = 0; i < 4; i++) ctx.fillRect(352 + i * 20, 216, 9, 58);
    ctx.fillRect(348, 210, 92, 12);
    /* piecero */
    ctx.fillStyle = '#7a5330';
    ctx.fillRect(824, 244, 20, 92);
    ctx.fillRect(816, 236, 40, 14);
    /* patas */
    ctx.fillStyle = '#5a3c22';
    ctx.fillRect(336, 330, 12, 22); ctx.fillRect(826, 330, 12, 22);

    /* somier y colchón */
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(346, 300, 484, 34);
    ctx.fillStyle = '#f0ece0';
    U.roundRect(ctx, 350, 276, 476, 30, 6); ctx.fill();
    ctx.fillStyle = '#dcd6c6';
    ctx.fillRect(350, 300, 476, 6);

    /* colcha */
    ctx.fillStyle = '#42589e';
    U.roundRect(ctx, 430, 266, 400, 42, 8); ctx.fill();
    ctx.fillStyle = '#5a72c4';
    ctx.fillRect(430, 266, 400, 8);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    for (i = 0; i < 5; i++) ctx.fillRect(452 + i * 78, 274, 4, 32);
    /* embozo blanco */
    ctx.fillStyle = '#f4f2ea';
    U.roundRect(ctx, 424, 262, 92, 20, 6); ctx.fill();

    /* almohadas */
    ctx.fillStyle = '#f8f6f0';
    U.roundRect(ctx, 360, 250, 96, 34, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(90,90,110,.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#eceadf';
    U.roundRect(ctx, 372, 244, 88, 30, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(90,90,110,.3)'; ctx.stroke();
    ctx.fillStyle = 'rgba(190,190,205,.45)';
    U.ellipse(ctx, 418, 264, 26, 8); ctx.fill();

    /* alfombra */
    ctx.fillStyle = '#5a4470';
    U.ellipse(ctx, 590, 356, 190, 22); ctx.fill();
    ctx.fillStyle = '#6b5285';
    U.ellipse(ctx, 590, 354, 150, 16); ctx.fill();

    actors.bedroom(ctx, t);
  };

  /* ---------- personajes sueltos, para las imágenes del usuario ---------- */

  actors.missing = function (ctx, t) {
    RID.Avatar.drawSprite(ctx, 'bowser', 812, 340, 5, {
      silhouette: true, alpha: 0.22 + 0.18 * Math.abs(Math.sin(t * 1.1))
    });
    RID.Avatar.drawPlayer(ctx, 300, 340, 3.0, 'idle', t);
  };

  actors.mushroom = function (ctx, t) {
    var bob = Math.abs(Math.sin(t * 3)) * 8;
    RID.Avatar.drawSprite(ctx, 'toad', 470, 340 - bob, 3.6);
    ctx.fillStyle = '#f6f2e2';
    U.roundRect(ctx, 500, 206 - bob * 0.3, 118, 46, 10); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(510, 248 - bob * 0.3); ctx.lineTo(498, 266 - bob * 0.3);
    ctx.lineTo(524, 250 - bob * 0.3);
    ctx.closePath(); ctx.fillStyle = '#f6f2e2'; ctx.fill(); ctx.stroke();
    U.pixelText(ctx, 'HELP!', 559, 229 - bob * 0.3, 20, '#1b1b1f');
    RID.Avatar.drawPlayer(ctx, 320, 340, 3.0, 'idle', t);
  };

  actors.letter = function (ctx, t) {
    var fy = Math.sin(t * 2) * 7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var gl = ctx.createRadialGradient(660, 210 + fy, 0, 660, 210 + fy, 140);
    gl.addColorStop(0, 'rgba(255,240,180,.40)');
    gl.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(660, 210 + fy, 140, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(724, 232 + fy * 0.6); ctx.rotate(0.12);
    ctx.fillStyle = '#e8dcb0'; ctx.fillRect(-52, -34, 104, 68);
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.strokeRect(-52, -34, 104, 68);
    ctx.fillStyle = '#8a6a3a'; ctx.fillRect(-58, -38, 8, 76); ctx.fillRect(50, -38, 8, 76);
    ctx.strokeStyle = '#a33'; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(-36, 18); ctx.quadraticCurveTo(-4, -12, 14, 10);
    ctx.quadraticCurveTo(28, 22, 38, -18); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.translate(636, 210 + fy); ctx.rotate(Math.sin(t * 1.2) * 0.07);
    ctx.fillStyle = '#f9f5e6'; ctx.fillRect(-46, -32, 92, 64);
    ctx.strokeStyle = '#c9b98a'; ctx.lineWidth = 2.5; ctx.strokeRect(-46, -32, 92, 64);
    ctx.fillStyle = '#b8a67a';
    ctx.fillRect(-34, -20, 68, 3); ctx.fillRect(-34, -11, 68, 3);
    ctx.fillRect(-34, -2, 68, 3);  ctx.fillRect(-34, 7, 44, 3);
    ctx.fillStyle = '#e05a7a';
    ctx.beginPath(); ctx.arc(26, 20, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    RID.Avatar.drawPlayer(ctx, 300, 344, 3.1, 'idle', t);
  };

  actors.drive = function (ctx, t) {
    var sway = Math.sin(t * 3.2) * 14;
    RID.Avatar.drawKart(ctx, 480 + sway, 392 + Math.sin(t * 15) * 2, 1.15,
                        { t: t, lean: sway * 0.07 });
  };

  actors.cracks = function (ctx, t) {
    var b1 = Math.sin(t * 1.7) * 2, b2 = Math.sin(t * 1.9 + 1) * 2;
    ctx.fillStyle = '#5a4632'; ctx.fillRect(620, 218, 12, 84);
    RID.Avatar.drawSprite(ctx, 'yoshi', 742, 304 + b1, 3.1, { flip: true });
    RID.Avatar.drawSprite(ctx, 'yoshi', 846, 302 + b2, 2.6, { flip: true });
    chain(ctx, 626, 228, 716, 254 + b1, 20, 8);
    chain(ctx, 626, 236, 826, 258 + b2, 34, 13);
    RID.Avatar.drawPlayer(ctx, 110, 300, 3.0, 'idle', t);
  };

  actors.boss = function (ctx, t) {
    var bob = Math.abs(Math.sin(t * 2.2)) * 8, i;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    U.ellipse(ctx, 700, 306, 62 - bob * 0.6, 12); ctx.fill();
    RID.Avatar.drawSprite(ctx, 'roy', 700, 304 - bob, 6.2, { flip: true });
    for (i = 0; i < 3; i++) {
      var p = ((t * 0.7 + i / 3) % 1);
      RID.Avatar.drawShell(ctx, 640 - p * 430, 240 + Math.sin(p * 6 + i) * 30, 18, p * 12);
    }
    RID.Avatar.drawPlayer(ctx, 170, 304, 3.0, 'hurt', t);
  };

  actors.coins = function (ctx, t) {
    var i;
    for (i = 0; i < 7; i++) {
      var p = ((t * 0.55 + i / 7) % 1);
      var x = 300 + p * 300;
      var y = 290 - Math.abs(Math.sin(p * Math.PI * 2)) * 26 + p * 8;
      var w = 6 + Math.abs(Math.cos(t * 7 + i)) * 20;
      var gg = ctx.createLinearGradient(x - w / 2, y - 15, x + w / 2, y + 15);
      gg.addColorStop(0, '#fff3b0'); gg.addColorStop(0.5, '#ffd447'); gg.addColorStop(1, '#b8860b');
      ctx.fillStyle = gg;
      U.ellipse(ctx, x, y, Math.max(2, w / 2), 15); ctx.fill();
      ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = 2; ctx.stroke();
    }
    RID.Avatar.drawSprite(ctx, 'yoshi', 800, 310 - Math.abs(Math.sin(t * 5)) * 12, 3.0, { flip: true });
    RID.Avatar.drawSprite(ctx, 'yoshi', 892, 308 - Math.abs(Math.sin(t * 5 + 1)) * 9, 2.5, { flip: true });
    RID.Avatar.drawPlayer(ctx, 200, 304, 3.0, 'cheer', t);
  };

  actors.jungle = function (ctx, t) {
    var pull = Math.sin(t * 5) * 6;
    RID.Avatar.drawSprite(ctx, 'koopa', 604, 348, 2.0, { alpha: 0.55, silhouette: true });
    RID.Avatar.drawSprite(ctx, 'dk', 430 + pull, 350, 4.4, { flip: true });
    RID.Avatar.drawPlayer(ctx, 320 + pull * 0.6, 350, 3.0, 'hurt', t);
  };

  actors.refuge = function (ctx, t) {
    RID.Avatar.drawSprite(ctx, 'dk', 250, 344, 3.6);
    RID.Avatar.drawSprite(ctx, 'dk', 344, 342, 2.9, { flip: true });
    RID.Avatar.drawSprite(ctx, 'dk', 560, 342, 2.6, { flip: true });
    RID.Avatar.drawPlayer(ctx, 140, 344, 3.0, 'idle', t);
  };

  actors.ludwig = function (ctx, t) {
    var i;
    var bob = Math.abs(Math.sin(t * 2)) * 7;

    /* Ludwig sentado en el trono */
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    U.ellipse(ctx, 656, 334, 52, 11); ctx.fill();
    RID.Avatar.drawSprite(ctx, 'ludwig', 656, 332 - bob, 5.6, { flip: true });

    /* bolas de fuego que salen disparadas */
    for (i = 0; i < 4; i++) {
      var p = ((t * 0.8 + i / 4) % 1);
      var fx = 600 - p * 380, fy = 250 + Math.sin(p * 7 + i) * 34;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(fx, fy, 2, fx, fy, 26);
      g.addColorStop(0, '#fff3b0');
      g.addColorStop(0.4, '#ff8a1a');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx, fy, 26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(fx, fy, 8, 0, Math.PI * 2); ctx.fill();
    }

    RID.Avatar.drawPlayer(ctx, 180, 332, 3.0, 'hurt', t);
  };

  actors.sarasa = function (ctx, t) {
    var i;
    /* Shy Guys caminando en fila, hipnotizados */
    for (i = 0; i < 4; i++) {
      var sx = 360 + i * 92 + Math.sin(t * 1.2 + i) * 5;
      var sy = 340 - Math.abs(Math.sin(t * 3 + i * 0.7)) * 5;
      RID.Avatar.drawSprite(ctx, 'shyguy', sx, sy, 2.9);
      /* espirales de hipnosis sobre la cabeza */
      ctx.strokeStyle = 'rgba(180,110,255,.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (var a = 0; a < 14; a++) {
        var r = a * 1.5, ang = a * 0.7 + t * 4;
        var px = sx + Math.cos(ang) * r, py = sy - 70 + Math.sin(ang) * r * 0.6;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    RID.Avatar.drawPlayer(ctx, 250, 340, 3.0, 'idle', t);
  };

  actors.morton = function (ctx, t) {
    var i;
    var bob = Math.abs(Math.sin(t * 1.8)) * 9;

    ctx.fillStyle = 'rgba(0,0,0,.45)';
    U.ellipse(ctx, 700, 336, 66 - bob * 0.5, 13); ctx.fill();
    RID.Avatar.drawSprite(ctx, 'morton', 700, 334 - bob, 6.4, { flip: true });

    /* martillos girando en el aire */
    for (i = 0; i < 4; i++) {
      var p = ((t * 0.62 + i / 4) % 1);
      var hx = 640 - p * 440, hy = 220 + Math.sin(p * 5 + i) * 60;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(p * 16 + i);
      ctx.fillStyle = '#6b4a22';
      ctx.fillRect(-3, -2, 34, 6);
      ctx.fillStyle = '#8d92a6';
      U.roundRect(ctx, -20, -14, 22, 28, 4); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#c9ccd8';
      ctx.fillRect(-17, -11, 7, 22);
      ctx.restore();
    }

    RID.Avatar.drawPlayer(ctx, 190, 336, 3.0, 'hurt', t);
  };

  actors.bowserland = function (ctx, t) {
    var i;
    for (i = 0; i < 3; i++) {
      var bx = 420 + i * 130;
      RID.Avatar.drawSprite(ctx, 'drybones', bx, 330 - Math.abs(Math.sin(t * 3 + i)) * 6,
                            2.7, { flip: i % 2 === 0 });
    }
    RID.Avatar.drawPlayer(ctx, 190, 330, 3.0, 'run', t);
  };

  actors.castle = function (ctx, t) {
    RID.Avatar.drawPlayer(ctx, 200, 334, 3.0, 'run', t);
    RID.Avatar.drawSprite(ctx, 'drybones', 820, 334, 2.6, { flip: true, alpha: 0.85 });
  };

  actors.throne = function (ctx, t) {
    var i;
    /* amigos atados a los lados */
    var crew = [['mario', 120], ['luigi', 190], ['toad', 258], ['peach', 900], ['daisy', 840]];
    for (i = 0; i < crew.length; i++) {
      RID.Avatar.drawSprite(ctx, crew[i][0], crew[i][1], 336, 2.3, { alpha: 0.9 });
    }
    chain(ctx, 108, 300, 272, 300, 12, 10);

    /* la mascota en la jaula */
    RID.Avatar.drawPet(ctx, 430, 226, 1.5, 'sad', t);

    /* Bowser en el trono */
    var bob = Math.abs(Math.sin(t * 1.6)) * 7;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    U.ellipse(ctx, 690, 334, 66, 12); ctx.fill();
    RID.Avatar.drawSprite(ctx, 'bowser', 690, 332 - bob, 6.4, { flip: true });

    RID.Avatar.drawPlayer(ctx, 200, 336, 3.0, 'hurt', t);
  };

  actors.partyscene = function (ctx, t) {
    var i;
    var crew = [['mario', 150], ['luigi', 240], ['toad', 320], ['peach', 660],
                ['daisy', 750], ['yoshi', 840], ['dk', 900]];
    for (i = 0; i < crew.length; i++) {
      var hop = Math.abs(Math.sin(t * 3 + i * 0.7)) * 8;
      RID.Avatar.drawSprite(ctx, crew[i][0], crew[i][1], 330 - hop, 2.4,
                            { flip: crew[i][1] > 480 });
    }
    /* confeti */
    var cols = ['#ff4d6d', '#ffd447', '#4ade80', '#5eb3ff', '#b197fc'];
    for (i = 0; i < 40; i++) {
      var cx = (i * 97 + Math.sin(t + i) * 20) % 960;
      var cy = ((t * 70 + i * 41) % 420) - 20;
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(cx, cy, 5, 8);
    }
    RID.Avatar.drawPlayer(ctx, 440, 330 - Math.abs(Math.sin(t * 3.2)) * 8, 3.0, 'cheer', t);
    RID.Avatar.drawPet(ctx, 530, 330, 2.6, 'happy', t);
  };

  actors.bedroom = function (ctx, t) {
    var z, i;
    var breathe = Math.sin(t * 1.1) * 2.2;

    /* --- bulto del cuerpo bajo la manta, siguiendo la forma de la cama --- */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(398, 322);
    ctx.quadraticCurveTo(430, 268 - breathe, 486, 262 - breathe);   // hombros
    ctx.quadraticCurveTo(560, 254 - breathe, 604, 276 - breathe);   // cadera
    ctx.quadraticCurveTo(646, 296 - breathe, 668, 322);             // pies
    ctx.closePath();
    ctx.fillStyle = 'rgba(150,180,225,.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,45,80,.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    /* pliegues de la manta */
    ctx.strokeStyle = 'rgba(30,45,80,.22)';
    ctx.lineWidth = 2;
    for (i = 0; i < 4; i++) {
      var fx = 440 + i * 56;
      ctx.beginPath();
      ctx.moveTo(fx, 320);
      ctx.quadraticCurveTo(fx + 8, 292 - breathe * 0.6, fx + 4, 272 - breathe);
      ctx.stroke();
    }
    /* embozo doblado */
    ctx.beginPath();
    ctx.moveTo(404, 300);
    ctx.quadraticCurveTo(440, 276 - breathe, 494, 272 - breathe);
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(238,242,252,.75)';
    ctx.stroke();
    ctx.restore();

    /* --- almohada --- */
    ctx.save();
    ctx.translate(374, 268);
    ctx.rotate(-0.1);
    ctx.fillStyle = '#f4f2ea';
    U.roundRect(ctx, -46, -20, 92, 40, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(90,90,110,.45)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(190,190,205,.5)';
    U.ellipse(ctx, 6, 4, 28, 9); ctx.fill();
    ctx.restore();

    /* --- la cabeza dormida sobre la almohada --- */
    RID.Avatar.drawSleepHead(ctx, 386, 258, 1.9, t);

    /* --- la mascota hecha un ovillo sobre las piernas --- */
    RID.Avatar.drawPet(ctx, 596, 276 - breathe, 2.1, 'sleep', t);

    /* --- zzz --- */
    for (z = 0; z < 3; z++) {
      var p = ((t * 0.45 + z / 3) % 1);
      U.pixelText(ctx, 'z', 424 + p * 46, 236 - p * 66, 11 + p * 13,
                  'rgba(248,246,236,' + (1 - p).toFixed(2) + ')');
    }
  };

  /* ---------- reproducción ---------- */
  function fill(text) {
    return String(text)
      .replace(/\{PLAYER\}/g, RID.state.player.name || 'Hero')
      .replace(/\{PET\}/g, RID.state.pet.name || 'Buddy');
  }

  function pages() {
    if (!scene) return [];
    var byLang = scene.text[RID.state.lang] || scene.text.en || [];
    return byLang;
  }

  function startPage(i) {
    page = i;
    fullText = fill(pages()[i] || '');
    typed = 0; typeT = 0; typing = true;
    var el = U.el('#story-text');
    el.textContent = '';
    el.classList.remove('is-done');
  }

  function finishTyping() {
    typing = false;
    typed = fullText.length;
    var el = U.el('#story-text');
    el.textContent = fullText;
    el.classList.add('is-done');
  }

  function next() {
    if (typing) { finishTyping(); return; }
    if (page + 1 < pages().length) { startPage(page + 1); RID.Audio.sfx('sfx.jump'); return; }
    end();
  }

  function skip() { end(); }

  function end() {
    stopLoop();
    if (scene && RID.state.progress.storySeen.indexOf(scene.id) < 0) {
      RID.state.progress.storySeen.push(scene.id);
      /* algunas escenas regalan monedas la primera vez que se ven */
      if (scene.reward) {
        RID.state.run.coins += scene.reward;
        RID.UI.setCoins(RID.state.run.coins);
        RID.UI.toast('+' + scene.reward + ' coins!', 'coin');
        RID.Audio.sfx('sfx.coin');
      }
      RID.Storage.autosave();
    }
    var cb = onFinish;
    scene = null; onFinish = null;
    RID.Events.emit('story:done');
    if (cb) cb();
  }

  function loop() {
    raf = window.requestAnimationFrame(loop);
    tNow = (U.now() - t0) / 1000;

    /* animación */
    var canvas = U.el('#story-canvas'), ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 960, 400);

    /* Si existe la imagen de fondo de esta escena se usa esa y encima se
       animan solo los personajes. Si no, se dibuja la escena por código. */
    var pic = null;
    if (scene) {
      /* 1º la imagen propia de la escena, 2º el fondo del nivel afín */
      pic = RID.Assets.img('story' + scene.img) ||
            (scene.bgKey ? RID.Assets.img(scene.bgKey) : null);
    }
    if (pic) {
      cover(ctx, pic, 960, 400);
      if (actors[scene.anim]) actors[scene.anim](ctx, tNow);
    } else if (scene && anim[scene.anim]) {
      anim[scene.anim](ctx, tNow);
    } else {
      sky(ctx, '#101425', '#2a3050');
    }

    /* máquina de escribir */
    if (typing) {
      typeT += 1 / 60;
      var target = Math.floor(typeT * TYPE_SPEED);
      if (target > typed) {
        typed = Math.min(target, fullText.length);
        U.el('#story-text').textContent = fullText.slice(0, typed);
        if (typed >= fullText.length) finishTyping();
      }
    }
  }

  function stopLoop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }

  function find(id) {
    for (var i = 0; i < RID.DATA.story.length; i++) if (RID.DATA.story[i].id === id) return RID.DATA.story[i];
    return null;
  }

  /* Escenas que corresponden a un momento ('start' o número de nivel) */
  function scenesAfter(after) {
    return RID.DATA.story.filter(function (s) { return s.after === after; });
  }

  function play(sceneOrId, onEnd) {
    scene = (typeof sceneOrId === 'string') ? find(sceneOrId) : sceneOrId;
    if (!scene) { if (onEnd) onEnd(); return; }

    onFinish = onEnd || null;
    RID.Audio.playMusic('music.story');
    RID.Screens.setHUD(false);
    RID.Screens.closeAllOverlays();
    RID.Screens.setBackground(null);
    RID.Screens.show('story');
    startPage(0);
    stopLoop();
    t0 = U.now();
    loop();
  }

  /* Encadena todas las escenas de un momento dado */
  function playSeries(after, onEnd) {
    var list = scenesAfter(after), i = 0;
    (function step() {
      if (i >= list.length) { if (onEnd) onEnd(); return; }
      play(list[i++], step);
    })();
  }

  function wire() {
    U.on(U.el('#story-next'), 'click', next);
    U.on(U.el('#story-skip'), 'click', skip);
    RID.Events.on('input:key', function (k) {
      if (RID.Screens.current() !== 'story') return;
      if (k === 'action' || k === 'confirm') next();
    });
  }

  return {
    wire: wire, play: play, playSeries: playSeries, scenesAfter: scenesAfter,
    next: next, skip: skip, anim: anim, find: find,
    isPlaying: function () { return !!scene; }
  };
})();


/* =========================================================================
   PARTE 5.5 — RID.Progress
   Datos puros de progresión: qué está superado, qué se desbloquea, cuánto
   falta. No navega ni dibuja; solo responde preguntas y guarda.
   ========================================================================= */

RID.Progress = (function () {

  function worldOf(levelId) {
    return U.clamp(Math.ceil(levelId / CFG.LEVELS_PER_WORLD), 1, CFG.TOTAL_WORLDS);
  }

  function levelsOfWorld(w) {
    var first = (w - 1) * CFG.LEVELS_PER_WORLD + 1, out = [], i;
    for (i = 0; i < CFG.LEVELS_PER_WORLD; i++) out.push(first + i);
    return out;
  }

  function isCleared(id)  { return RID.state.progress.cleared.indexOf(id) >= 0; }
  function isUnlocked(id) { return RID.state.progress.unlocked.indexOf(id) >= 0; }
  function isShop(id)     { return CFG.SHOP_LEVELS.indexOf(id) >= 0; }

  /* ---------- un intento por nivel ---------- */
  function resultOf(id) {
    var r = RID.state.progress.results, i;
    for (i = 0; i < r.length; i++) if (r[i].lvl === id) return r[i];
    return null;
  }

  function isAttempted(id) { return !!resultOf(id); }

  /* Se puede entrar solo si está desbloqueado y NO se ha jugado todavía */
  function canEnter(id) {
    return id >= 1 && id <= CFG.TOTAL_LEVELS && isUnlocked(id) && !isAttempted(id);
  }

  function recordResult(id, correct, total, ok) {
    var r = resultOf(id);
    if (r) { r.c = correct; r.t = total; r.ok = ok; return r; }
    r = { lvl: id, c: correct, t: total, ok: ok };
    RID.state.progress.results.push(r);
    return r;
  }

  /* Suma de aciertos de toda la partida */
  function totals() {
    var r = RID.state.progress.results, i, c = 0, t = 0, passed = 0;
    for (i = 0; i < r.length; i++) {
      c += r[i].c; t += r[i].t;
      if (r[i].ok) passed++;
    }
    return { correct: c, total: t, played: r.length, passed: passed,
             pct: t ? Math.round(c / t * 100) : 0 };
  }

  function unlock(id) {
    if (id < 1 || id > CFG.TOTAL_LEVELS) return;
    if (!isUnlocked(id)) {
      RID.state.progress.unlocked.push(id);
      RID.Events.emit('progress:unlock', { level: id });
    }
  }

  /* El progreso avanza con los niveles JUGADOS, se hayan superado o no */
  function playedCount()  { return RID.state.progress.results.length; }
  function clearedCount() { return RID.state.progress.cleared.length; }
  function percent()      { return Math.round(playedCount() / CFG.TOTAL_LEVELS * 100); }

  function worldDone(w) {
    return levelsOfWorld(w).every(isAttempted);
  }

  function sealWorld(w) {
    if (RID.state.progress.worldSeals.indexOf(w) < 0) RID.state.progress.worldSeals.push(w);
  }

  /* El mapa sustituye al lobby a partir del nivel 3 jugado */
  function mapAvailable() { return isAttempted(CFG.MAP_UNLOCKS_AFTER); }

  function nextLevel(id) { return id >= CFG.TOTAL_LEVELS ? null : id + 1; }

  /* Cierra un nivel — superado o fallido — y devuelve qué toca a continuación.
     Las monedas ya se sumaron durante la partida, aquí NO se vuelven a sumar. */
  function levelDone(id, stats) {
    stats = stats || {};
    var passed = stats.passed !== false;

    recordResult(id, stats.correct || 0, stats.total || 0, passed);
    if (passed && !isCleared(id)) RID.state.progress.cleared.push(id);

    /* el siguiente nivel se desbloquea aunque este se haya fallado */
    var nx = nextLevel(id);
    if (nx) unlock(nx);

    var w = worldOf(id), justSealed = false;
    if (worldDone(w) && RID.state.progress.worldSeals.indexOf(w) < 0) {
      sealWorld(w);
      justSealed = true;
    }

    RID.state.run.level = nx || id;
    RID.state.run.world = worldOf(nx || id);
    RID.Storage.save();
    RID.UI.setProgress();
    RID.Events.emit('progress:level-done', { level: id, stats: stats, sealed: justSealed });

    return {
      next: nx,
      worldSealed: justSealed ? w : null,
      story: RID.Story.scenesAfter(id).length > 0,
      finished: !nx
    };
  }

  function victory() {
    RID.state.progress.worldSeals = [1, 2, 3, 4, 5];
    RID.Storage.save();
    RID.Audio.playMusic('music.final');
    RID.Events.emit('game:victory');
  }

  function resetRun() {
    RID.state.run.lives = CFG.LIVES;
    RID.state.run.gauge = 100;
  }

  return {
    worldOf: worldOf, levelsOfWorld: levelsOfWorld,
    isCleared: isCleared, isUnlocked: isUnlocked, canEnter: canEnter, isShop: isShop,
    isAttempted: isAttempted, resultOf: resultOf, recordResult: recordResult, totals: totals,
    unlock: unlock, clearedCount: clearedCount, playedCount: playedCount, percent: percent,
    worldDone: worldDone, mapAvailable: mapAvailable, nextLevel: nextLevel,
    levelDone: levelDone, victory: victory, resetRun: resetRun
  };
})();


/* =========================================================================
   PARTE 5.6 — RID.Flow (ampliación): secuenciación de la aventura
   historia -> nivel -> historia -> siguiente nivel …
   La parte 7 en adelante engancha 'level:request' para cargar cada nivel.
   ========================================================================= */

(function () {

  /* Empieza la aventura: intro y después el nivel 1 */
  RID.Flow.beginAdventure = function () {
    RID.Progress.resetRun();
    RID.Story.playSeries('start', function () {
      RID.Flow.requestLevel(1);
    });
  };

  /* Retoma una partida guardada: al mapa si ya está disponible */
  RID.Flow.resumeAdventure = function () {
    RID.Progress.resetRun();
    RID.UI.renderHUD();
    var lvl = U.clamp(RID.state.run.level || 1, 1, CFG.TOTAL_LEVELS);
    if (RID.Progress.mapAvailable()) RID.Map.open(lvl);
    else RID.Flow.requestLevel(lvl);
  };

  /* Punto único de entrada a un nivel */
  RID.Flow.requestLevel = function (id) {
    if (!RID.Progress.canEnter(id)) {
      RID.UI.toast('Level ' + id + ' is locked', 'bad');
      return;
    }
    /* Un nivel cuyos datos todavía no existen en DATA.levels no se carga:
       se avisa y se vuelve al título en lugar de dejar la pantalla colgada. */
    if (!RID.Levels || !RID.Levels.exists(id)) {
      RID.UI.toast('Level ' + id + ' is not built yet', 'bad');
      RID.Flow.goTitle();
      return;
    }
    RID.state.run.level = id;
    RID.state.run.world = RID.Progress.worldOf(id);
    RID.Audio.sfx('sfx.door');
    RID.Events.emit('level:request', { id: id });
  };

  /* Lo llama cada nivel al superarse.
     Hasta el nivel 3 los niveles se encadenan solos; a partir de ahí se
     vuelve al MAPA para poder elegir parada o devolverse. */
  RID.Flow.completeLevel = function (id, stats) {
    var res = RID.Progress.levelDone(id, stats);
    RID.Audio.sfx('sfx.clear');

    var goOn = function () {
      RID.Story.playSeries(id, function () {
        if (res.finished) { RID.Progress.victory(); return; }
        if (RID.Progress.mapAvailable()) RID.Map.open(res.next);
        else RID.Flow.requestLevel(res.next);
      });
    };

    /* si este nivel cerró un mundo, primero se entrega su sello */
    if (res.worldSealed) RID.Flow.showWorldClear(res.worldSealed, goOn);
    else goOn();
  };

  /* Enganches de la parte 4 */
  RID.Events.on('game:begin',  function () { RID.Flow.beginAdventure(); });
  RID.Events.on('game:resume', function () { RID.Flow.resumeAdventure(); });
})();


/* Cableado del reproductor de historia al arrancar ------------------------ */
RID.Events.on('boot:ready', function () { RID.Story.wire(); });


/* =========================================================================
   PARTE 6.1 — DATA.questions
   Banco de preguntas de THIRD CONDITIONAL. Siempre en inglés.
   Formato: { q, opts:[4], a:índice correcto, hint, why }
   Categorías:
     vocabulary : vocabulario dentro del tercer condicional   (niveles 1, 7)
     sentences  : formar la oración correcta                  (nivel 2)
     decisions  : decisiones personales / sobre algo          (niveles 3, 4)
     goals      : metas personales                            (niveles 5, 6)
     school     : decisiones escolares                        (reservada)
   Añadir preguntas = añadir objetos a estos arrays.
   ========================================================================= */

RID.DATA.questions = {

  vocabulary: [
    { q: 'If I had ______ the alarm, I would not have missed the bus.',
      opts: ['heard', 'hear', 'hearing', 'hears'], a: 0,
      hint: 'After "had" we always use the past participle.',
      why: '"had heard" is the past perfect: If I had heard…' },
    { q: 'She would have ______ the race if she had trained harder.',
      opts: ['won', 'win', 'winning', 'wins'], a: 0,
      hint: 'After "would have" we use the past participle.',
      why: 'would have + won (past participle of win).' },
    { q: 'If we had ______ a map, we would not have got lost.',
      opts: ['brought', 'bring', 'bringing', 'brings'], a: 0,
      hint: 'The past participle of "bring" is irregular.',
      why: 'bring → brought → brought.' },
    { q: 'They would have ______ us if we had asked for help.',
      opts: ['helped', 'help', 'helping', 'helps'], a: 0,
      hint: 'Regular verb: just add -ed.',
      why: 'would have helped.' },
    { q: 'If he had ______ the truth, everything would have been easier.',
      opts: ['told', 'tell', 'telling', 'tells'], a: 0,
      hint: 'tell → told → told.',
      why: 'If he had told the truth…' },
    { q: 'I would have ______ you sooner if I had known.',
      opts: ['called', 'call', 'calling', 'calls'], a: 0,
      hint: 'would have + -ed for regular verbs.',
      why: 'would have called.' },
    { q: 'If they had ______ earlier, they would have found seats.',
      opts: ['arrived', 'arrive', 'arriving', 'arrives'], a: 0,
      hint: 'had + past participle.',
      why: 'If they had arrived earlier…' },
    { q: 'We would have ______ the museum if it had been open.',
      opts: ['visited', 'visit', 'visiting', 'visits'], a: 0,
      hint: 'would have + past participle.',
      why: 'would have visited.' },
    { q: 'If she had ______ more water, she would not have felt sick.',
      opts: ['drunk', 'drink', 'drank', 'drinking'], a: 0,
      hint: 'drink → drank → drunk. We need the third form.',
      why: 'The past participle of "drink" is "drunk".' },
    { q: 'He would have ______ the letter if he had had a pen.',
      opts: ['written', 'wrote', 'write', 'writing'], a: 0,
      hint: 'write → wrote → written.',
      why: 'would have written.' },
    { q: 'If I had ______ my keys, I would not have waited outside.',
      opts: ['taken', 'took', 'take', 'taking'], a: 0,
      hint: 'take → took → taken.',
      why: 'If I had taken my keys…' },
    { q: 'You would have ______ the answer if you had read the page.',
      opts: ['known', 'knew', 'know', 'knowing'], a: 0,
      hint: 'know → knew → known.',
      why: 'would have known.' },
    { q: 'If the team had ______ better, they would have qualified.',
      opts: ['played', 'play', 'playing', 'plays'], a: 0,
      hint: 'Regular verb after "had".',
      why: 'If the team had played better…' },
    { q: 'I would not have ______ that if I had understood the rules.',
      opts: ['done', 'did', 'do', 'doing'], a: 0,
      hint: 'do → did → done.',
      why: 'would not have done.' },
    { q: 'If we had ______ the bus, we would have been on time.',
      opts: ['caught', 'catch', 'catching', 'catches'], a: 0,
      hint: 'catch → caught → caught.',
      why: 'If we had caught the bus…' },
    { q: 'She would have ______ happier with a different answer.',
      opts: ['been', 'was', 'be', 'being'], a: 0,
      hint: 'be → was/were → been.',
      why: 'would have been.' },
    { q: 'If they had ______ the instructions, nothing would have broken.',
      opts: ['followed', 'follow', 'following', 'follows'], a: 0,
      hint: 'Regular verb: follow + ed.',
      why: 'If they had followed the instructions…' },
    { q: 'We would have ______ the treasure if we had dug deeper.',
      opts: ['found', 'find', 'finding', 'finds'], a: 0,
      hint: 'find → found → found.',
      why: 'would have found.' },
    { q: 'If he had ______ the door, the cat would not have escaped.',
      opts: ['closed', 'close', 'closing', 'closes'], a: 0,
      hint: 'Regular verb after "had".',
      why: 'If he had closed the door…' },
    { q: 'I would have ______ you the money if you had asked me.',
      opts: ['lent', 'lend', 'lending', 'lends'], a: 0,
      hint: 'lend → lent → lent.',
      why: 'would have lent.' }
  ],

  sentences: [
    { q: 'Choose the correct third conditional sentence.',
      opts: ['If I had studied, I would have passed.',
             'If I studied, I would have passed.',
             'If I had studied, I would pass.',
             'If I would study, I had passed.'], a: 0,
      hint: 'If + past perfect, would have + past participle.',
      why: 'Only the first sentence uses both halves correctly.' },
    { q: 'Complete: If she ______ earlier, she would have caught the train.',
      opts: ['had left', 'left', 'would leave', 'has left'], a: 0,
      hint: 'The "if" half needs the past perfect.',
      why: 'If she had left earlier…' },
    { q: 'Complete: If we had saved money, we ______ that bike.',
      opts: ['would have bought', 'would buy', 'had bought', 'buy'], a: 0,
      hint: 'The result half needs "would have" + participle.',
      why: '…we would have bought that bike.' },
    { q: 'Which sentence is WRONG?',
      opts: ['If I would have seen you, I would have said hello.',
             'If I had seen you, I would have said hello.',
             'If he had run, he would have won.',
             'If they had asked, we would have helped.'], a: 0,
      hint: '"would" never goes in the "if" half.',
      why: 'We say "If I had seen…", never "If I would have seen…".' },
    { q: 'Put in order: would / I / have / helped / if / you / had / asked.',
      opts: ['I would have helped if you had asked.',
             'I had helped if you would have asked.',
             'If you had asked, I would ask.',
             'I would help if you had asked.'], a: 0,
      hint: 'Result first, then the "if" half.',
      why: 'I would have helped if you had asked.' },
    { q: 'Complete: If they ______ the map, they would not have got lost.',
      opts: ['had used', 'used', 'would use', 'use'], a: 0,
      hint: 'had + past participle.',
      why: 'If they had used the map…' },
    { q: 'Complete: He would not have failed if he ______ harder.',
      opts: ['had worked', 'worked', 'would work', 'works'], a: 0,
      hint: 'The "if" half is always past perfect.',
      why: '…if he had worked harder.' },
    { q: 'Choose the correct negative sentence.',
      opts: ['If I had not slept late, I would not have been late.',
             'If I not had slept late, I would not be late.',
             'If I did not sleep late, I would not have been late.',
             'If I had not slept late, I not would have been late.'], a: 0,
      hint: '"not" goes after "had" and after "would".',
      why: 'had not slept … would not have been.' },
    { q: 'Complete: If the rain ______, we would have played outside.',
      opts: ['had stopped', 'stopped', 'stops', 'would stop'], a: 0,
      hint: 'Past perfect in the "if" half.',
      why: 'If the rain had stopped…' },
    { q: 'Which sentence talks about the PAST only?',
      opts: ['If I had trained, I would have won.',
             'If I train, I will win.',
             'If I trained, I would win.',
             'If I am training, I win.'], a: 0,
      hint: 'The third conditional imagines a different past.',
      why: 'Only the third conditional describes an impossible past.' },
    { q: 'Complete: We ______ the film if we had arrived on time.',
      opts: ['would have watched', 'watched', 'had watched', 'will watch'], a: 0,
      hint: 'would have + past participle.',
      why: 'We would have watched the film…' },
    { q: 'Complete: If you ______ me, I would have opened the door.',
      opts: ['had called', 'called', 'would call', 'call'], a: 0,
      hint: 'had + participle.',
      why: 'If you had called me…' },
    { q: 'Fix the sentence: "If she had ask, I would have answered."',
      opts: ['If she had asked, I would have answered.',
             'If she had ask, I would answered.',
             'If she asked, I would have answer.',
             'If she has asked, I would have answered.'], a: 0,
      hint: 'After "had" you need the past participle.',
      why: 'ask → asked (past participle).' },
    { q: 'Complete: If the door had been locked, the dog ______ away.',
      opts: ['would not have run', 'would not run', 'had not run', 'did not run'], a: 0,
      hint: 'Negative result: would not have + participle.',
      why: '…would not have run away.' },
    { q: 'Choose the correct question form.',
      opts: ['What would you have done if you had lost the map?',
             'What you would have done if you lost the map?',
             'What had you done if you would have lost the map?',
             'What did you do if you had lost the map?'], a: 0,
      hint: 'Would + subject + have + participle.',
      why: 'What would you have done…?' },
    { q: 'Complete: If I had listened to my friend, this ______.',
      opts: ['would not have happened', 'will not happen', 'had not happened', 'does not happen'], a: 0,
      hint: 'Result half in the past.',
      why: '…this would not have happened.' }
  ],

  decisions: [
    { q: 'You chose the red door and lost a life. What can you say?',
      opts: ['If I had chosen the blue door, I would not have lost a life.',
             'If I choose the blue door, I will not lose a life.',
             'If I chose the blue door, I would not lose a life.',
             'If I had chosen the blue door, I will not lose a life.'], a: 0,
      hint: 'The decision is already in the past.',
      why: 'A past decision with a past result needs the third conditional.' },
    { q: 'You bought a hint instead of a shield. Which sentence fits?',
      opts: ['If I had bought the shield, I would have survived the trap.',
             'If I buy the shield, I survive the trap.',
             'If I bought the shield, I survive the trap.',
             'If I would buy the shield, I had survived.'], a: 0,
      hint: 'had bought … would have survived.',
      why: 'Both halves must be in past forms.' },
    { q: 'Complete: If I ______ that path, I would have found the coins.',
      opts: ['had taken', 'take', 'took', 'would take'], a: 0,
      hint: 'had + past participle.',
      why: 'If I had taken that path…' },
    { q: 'You said yes too fast. Which sentence shows regret?',
      opts: ['If I had thought about it, I would have said no.',
             'If I think about it, I say no.',
             'If I thought about it, I would say no.',
             'If I have thought about it, I would say no.'], a: 0,
      hint: 'Regret about the past = third conditional.',
      why: 'had thought … would have said.' },
    { q: 'Complete: We would have chosen a different plan if we ______ the risk.',
      opts: ['had known', 'knew', 'know', 'would know'], a: 0,
      hint: 'know → knew → known.',
      why: '…if we had known the risk.' },
    { q: 'Which sentence is correct about a past decision?',
      opts: ['If they had asked me first, I would have agreed.',
             'If they ask me first, I would have agreed.',
             'If they had asked me first, I agree.',
             'If they would ask me first, I had agreed.'], a: 0,
      hint: 'Check both halves.',
      why: 'had asked … would have agreed.' },
    { q: 'Complete: If you had told me the plan, I ______ differently.',
      opts: ['would have acted', 'would act', 'had acted', 'act'], a: 0,
      hint: 'Result half: would have + participle.',
      why: '…I would have acted differently.' },
    { q: 'You left the shop without buying anything. Which fits?',
      opts: ['If I had spent my coins, I would not have them now.',
             'If I spend my coins, I would not have them now.',
             'If I had spent my coins, I will not have them.',
             'If I would spend my coins, I had not them.'], a: 0,
      hint: 'The action in the shop is finished.',
      why: 'had spent … would not have.' },
    { q: 'Complete: If we ______ the warning sign, we would have stopped.',
      opts: ['had seen', 'saw', 'see', 'would see'], a: 0,
      hint: 'see → saw → seen.',
      why: 'If we had seen the warning sign…' },
    { q: 'Which sentence blames a past choice correctly?',
      opts: ['If I had not clicked that button, the trap would not have opened.',
             'If I not clicked that button, the trap would not open.',
             'If I do not click that button, the trap would not have opened.',
             'If I would not click that button, the trap had not opened.'], a: 0,
      hint: '"not" after "had" and after "would".',
      why: 'had not clicked … would not have opened.' },
    { q: 'Complete: They would have trusted you if you ______ the truth.',
      opts: ['had told', 'told', 'tell', 'would tell'], a: 0,
      hint: 'tell → told → told.',
      why: '…if you had told the truth.' },
    { q: 'Complete: If I had picked the shorter road, I ______ time.',
      opts: ['would have saved', 'would save', 'had saved', 'save'], a: 0,
      hint: 'would have + participle.',
      why: '…I would have saved time.' },
    { q: 'Choose the sentence with the correct order.',
      opts: ['I would have waited if you had explained the reason.',
             'I had waited if you would have explained the reason.',
             'If you explained the reason, I had waited.',
             'I would wait if you had explained the reason.'], a: 0,
      hint: 'Result + if + past perfect.',
      why: 'would have waited … had explained.' },
    { q: 'Complete: If she had accepted the offer, she ______ this island.',
      opts: ['would have left', 'would leave', 'had left', 'leaves'], a: 0,
      hint: 'leave → left → left.',
      why: '…she would have left this island.' },
    { q: 'Which sentence is grammatically correct?',
      opts: ['If we had decided sooner, nobody would have got hurt.',
             'If we decided sooner, nobody would have got hurt.',
             'If we had decided sooner, nobody will get hurt.',
             'If we would decide sooner, nobody had got hurt.'], a: 0,
      hint: 'Both halves in past forms.',
      why: 'had decided … would have got.' },
    { q: 'Complete: I would not have opened that box if I ______ the danger.',
      opts: ['had imagined', 'imagined', 'imagine', 'would imagine'], a: 0,
      hint: 'Regular verb after "had".',
      why: '…if I had imagined the danger.' }
  ],

  goals: [
    { q: 'Complete: If I had practised every day, I ______ the champion.',
      opts: ['would have become', 'would become', 'had become', 'become'], a: 0,
      hint: 'become → became → become.',
      why: '…I would have become the champion.' },
    { q: 'Which sentence talks about a goal you did NOT reach?',
      opts: ['If I had saved more coins, I would have bought the cape.',
             'If I save more coins, I will buy the cape.',
             'If I saved more coins, I would buy the cape.',
             'If I am saving coins, I buy the cape.'], a: 0,
      hint: 'The chance is gone: use the third conditional.',
      why: 'had saved … would have bought.' },
    { q: 'Complete: She would have finished the marathon if she ______ up.',
      opts: ['had not given', 'did not give', 'would not give', 'not gave'], a: 0,
      hint: 'give up → gave up → given up.',
      why: '…if she had not given up.' },
    { q: 'Complete: If we ______ a plan, we would have reached the goal.',
      opts: ['had made', 'made', 'make', 'would make'], a: 0,
      hint: 'make → made → made.',
      why: 'If we had made a plan…' },
    { q: 'Choose the correct sentence about a lost dream.',
      opts: ['If he had kept training, he would have joined the team.',
             'If he keeps training, he would have joined the team.',
             'If he had kept training, he joins the team.',
             'If he would keep training, he had joined the team.'], a: 0,
      hint: 'keep → kept → kept.',
      why: 'had kept … would have joined.' },
    { q: 'Complete: If I had believed in myself, I ______ the audition.',
      opts: ['would have tried', 'would try', 'had tried', 'try'], a: 0,
      hint: 'would have + participle.',
      why: '…I would have tried the audition.' },
    { q: 'Complete: They would have learned English faster if they ______ every day.',
      opts: ['had studied', 'studied', 'study', 'would study'], a: 0,
      hint: 'Past perfect in the "if" half.',
      why: '…if they had studied every day.' },
    { q: 'Which sentence is correct?',
      opts: ['If I had woken up earlier, I would have finished my project.',
             'If I woke up earlier, I would have finished my project.',
             'If I had woken up earlier, I will finish my project.',
             'If I would wake up earlier, I had finished my project.'], a: 0,
      hint: 'wake → woke → woken.',
      why: 'had woken … would have finished.' },
    { q: 'Complete: If she had asked for help, she ______ her goal sooner.',
      opts: ['would have reached', 'would reach', 'had reached', 'reaches'], a: 0,
      hint: 'would have + participle.',
      why: '…she would have reached her goal sooner.' },
    { q: 'Complete: We would have opened our own shop if we ______ enough money.',
      opts: ['had had', 'had', 'have had', 'would have'], a: 0,
      hint: 'Yes, "had had" is correct here: had + past participle of have.',
      why: 'if we had had enough money…' },
    { q: 'Choose the sentence that shows a missed goal.',
      opts: ['If I had entered the contest, I might have won a prize.',
             'If I enter the contest, I might win a prize.',
             'If I entered the contest, I might win a prize.',
             'If I would enter the contest, I had won a prize.'], a: 0,
      hint: '"might have" also works in the result half.',
      why: 'had entered … might have won.' },
    { q: 'Complete: If you had set smaller goals, you ______ up so soon.',
      opts: ['would not have given', 'would not give', 'had not given', 'do not give'], a: 0,
      hint: 'Negative result: would not have + participle.',
      why: '…you would not have given up so soon.' },
    { q: 'Complete: If the coach had trusted him, he ______ the final match.',
      opts: ['would have played', 'would play', 'had played', 'plays'], a: 0,
      hint: 'would have + participle.',
      why: '…he would have played the final match.' },
    { q: 'Which sentence is WRONG?',
      opts: ['If I had wanted it more, I would want it now.',
             'If I had wanted it more, I would have worked harder.',
             'If she had trained, she would have improved.',
             'If we had planned it, we would have succeeded.'], a: 0,
      hint: 'Both halves must stay in the past.',
      why: 'Mixing "would want" with "had wanted" breaks the third conditional.' },
    { q: 'Complete: I ______ a musician if I had kept my guitar lessons.',
      opts: ['would have been', 'would be', 'had been', 'am'], a: 0,
      hint: 'be → was/were → been.',
      why: 'I would have been a musician…' },
    { q: 'Complete: If they had shared the plan, everyone ______ the goal.',
      opts: ['would have understood', 'would understand', 'had understood', 'understands'], a: 0,
      hint: 'understand → understood → understood.',
      why: '…everyone would have understood the goal.' }
  ],

  /* ---- ESCRIBIR: se teclea la parte que falta (niveles 10, 11, 12 y 14) ---- */
  write: [
    { type: 'write', q: 'Type the missing part:  If I ______ the alarm, I would not have missed the bus.',
      a: 'had heard', alt: ['had hear'], hint: 'had + past participle of "hear".',
      why: 'If I HAD HEARD the alarm…' },
    { type: 'write', q: 'Type the missing part:  She ______ the race if she had trained harder.',
      a: 'would have won', hint: 'would have + past participle of "win".',
      why: 'She WOULD HAVE WON the race…' },
    { type: 'write', q: 'Type the missing part:  If we ______ a map, we would not have got lost.',
      a: 'had brought', alt: ['had had'], hint: 'bring → brought → brought.',
      why: 'If we HAD BROUGHT a map…' },
    { type: 'write', q: 'Type the missing part:  They ______ us if we had asked for help.',
      a: 'would have helped', hint: 'would have + helped.',
      why: 'They WOULD HAVE HELPED us…' },
    { type: 'write', q: 'Type the missing part:  If he ______ the truth, everything would have been easier.',
      a: 'had told', hint: 'tell → told → told.', why: 'If he HAD TOLD the truth…' },
    { type: 'write', q: 'Type the missing part:  I ______ you sooner if I had known.',
      a: 'would have called', hint: 'would have + called.', why: 'I WOULD HAVE CALLED you sooner…' },
    { type: 'write', q: 'Type the missing part:  If they ______ earlier, they would have found seats.',
      a: 'had arrived', hint: 'had + arrived.', why: 'If they HAD ARRIVED earlier…' },
    { type: 'write', q: 'Type the missing part:  We ______ the museum if it had been open.',
      a: 'would have visited', hint: 'would have + visited.', why: 'We WOULD HAVE VISITED the museum…' },
    { type: 'write', q: 'Type the missing part:  If she ______ more water, she would not have felt sick.',
      a: 'had drunk', hint: 'drink → drank → drunk.', why: 'If she HAD DRUNK more water…' },
    { type: 'write', q: 'Type the missing part:  He ______ the letter if he had had a pen.',
      a: 'would have written', hint: 'write → wrote → written.', why: 'He WOULD HAVE WRITTEN the letter…' },
    { type: 'write', q: 'Type the missing part:  If I ______ my keys, I would not have waited outside.',
      a: 'had taken', hint: 'take → took → taken.', why: 'If I HAD TAKEN my keys…' },
    { type: 'write', q: 'Type the missing part:  You ______ the answer if you had read the page.',
      a: 'would have known', hint: 'know → knew → known.', why: 'You WOULD HAVE KNOWN the answer…' },
    { type: 'write', q: 'Type the missing part:  If the team ______ better, they would have qualified.',
      a: 'had played', hint: 'had + played.', why: 'If the team HAD PLAYED better…' },
    { type: 'write', q: 'Type the missing part:  If we ______ the bus, we would have been on time.',
      a: 'had caught', hint: 'catch → caught → caught.', why: 'If we HAD CAUGHT the bus…' },
    { type: 'write', q: 'Type the missing part:  She ______ happier with a different answer.',
      a: 'would have been', hint: 'be → was → been.', why: 'She WOULD HAVE BEEN happier…' },
    { type: 'write', q: 'Type the missing part:  If they ______ the instructions, nothing would have broken.',
      a: 'had followed', hint: 'had + followed.', why: 'If they HAD FOLLOWED the instructions…' },
    { type: 'write', q: 'Type the missing part:  We ______ the treasure if we had dug deeper.',
      a: 'would have found', hint: 'find → found → found.', why: 'We WOULD HAVE FOUND the treasure…' },
    { type: 'write', q: 'Type the missing part:  If he ______ the door, the cat would not have escaped.',
      a: 'had closed', hint: 'had + closed.', why: 'If he HAD CLOSED the door…' },
    { type: 'write', q: 'Type the missing part:  If I had practised every day, I ______ the champion.',
      a: 'would have become', hint: 'become → became → become.', why: 'I WOULD HAVE BECOME the champion.' },
    { type: 'write', q: 'Type the missing part:  If she had asked for help, she ______ her goal sooner.',
      a: 'would have reached', hint: 'would have + reached.', why: 'She WOULD HAVE REACHED her goal sooner.' },
    { type: 'write', q: 'Type the missing part:  If I ______ up earlier, I would have finished my project.',
      a: 'had woken', alt: ['had woken up'], hint: 'wake → woke → woken.', why: 'If I HAD WOKEN UP earlier…' },
    { type: 'write', q: 'Type the missing part:  If you ______ the notes, you would have passed the exam.',
      a: 'had revised', alt: ['had studied'], hint: 'had + past participle.', why: 'If you HAD REVISED the notes…' },
    { type: 'write', q: 'Type the missing part:  He ______ the lesson if he had paid attention.',
      a: 'would have understood', hint: 'understand → understood → understood.',
      why: 'He WOULD HAVE UNDERSTOOD the lesson…' },
    { type: 'write', q: 'Type the missing part:  If we ______ sooner, nobody would have got hurt.',
      a: 'had decided', hint: 'had + decided.', why: 'If we HAD DECIDED sooner…' },
    { type: 'write', q: 'Type the missing part:  I ______ that if I had understood the rules.',
      a: 'would not have done', alt: ['wouldn t have done', 'would never have done'],
      hint: 'Negative: would not have + done.', why: 'I WOULD NOT HAVE DONE that…' },
    { type: 'write', q: 'Type the missing part:  If the rain ______, we would have played outside.',
      a: 'had stopped', hint: 'had + stopped.', why: 'If the rain HAD STOPPED…' }
  ],

  /* ---- ESCRIBIR sobre METAS PERSONALES (nivel 18) ---- */
  goalsWrite: [
    { type: 'write', q: 'Type the missing part:  If I had trained every day, I ______ the champion.',
      a: 'would have become', hint: 'become → became → become.', why: 'I WOULD HAVE BECOME the champion.' },
    { type: 'write', q: 'Type the missing part:  She would have finished the race if she ______ up.',
      a: 'had not given', alt: ['hadn t given'], hint: '"not" goes after "had".', why: '…if she HAD NOT GIVEN up.' },
    { type: 'write', q: 'Type the missing part:  If we ______ a plan, we would have reached our goal.',
      a: 'had made', hint: 'make → made → made.', why: 'If we HAD MADE a plan…' },
    { type: 'write', q: 'Type the missing part:  He ______ the team if he had kept training.',
      a: 'would have joined', hint: 'would have + joined.', why: 'He WOULD HAVE JOINED the team…' },
    { type: 'write', q: 'Type the missing part:  If I had believed in myself, I ______ the audition.',
      a: 'would have tried', hint: 'would have + tried.', why: 'I WOULD HAVE TRIED the audition.' },
    { type: 'write', q: 'Type the missing part:  They would have learned faster if they ______ every day.',
      a: 'had studied', alt: ['had practised', 'had practiced'], hint: 'had + past participle.',
      why: '…if they HAD STUDIED every day.' },
    { type: 'write', q: 'Type the missing part:  If you had set smaller goals, you ______ up so soon.',
      a: 'would not have given', alt: ['wouldn t have given'], hint: 'Negative result.',
      why: '…you WOULD NOT HAVE GIVEN up so soon.' },
    { type: 'write', q: 'Type the missing part:  I ______ a musician if I had kept my guitar lessons.',
      a: 'would have been', hint: 'be → was → been.', why: 'I WOULD HAVE BEEN a musician…' },
    { type: 'write', q: 'Type the missing part:  If she ______ for help, she would have reached her goal.',
      a: 'had asked', hint: 'had + asked.', why: 'If she HAD ASKED for help…' },
    { type: 'write', q: 'Type the missing part:  We ______ our own shop if we had saved enough money.',
      a: 'would have opened', hint: 'would have + opened.', why: 'We WOULD HAVE OPENED our own shop…' }
  ],

  /* ---- ORDENAR: mirar la imagen y montar la frase (nivel 13) ---- */
  order: [
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase1',
      words: ['If', 'I', 'had', 'studied', 'I', 'would', 'have', 'passed'],
      a: 'If I had studied I would have passed',
      hint: 'Start with "If".', why: 'If I had studied, I would have passed.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase2',
      words: ['If', 'she', 'had', 'run', 'faster', 'she', 'would', 'have', 'won'],
      a: 'If she had run faster she would have won',
      hint: 'The "if" half goes first.', why: 'If she had run faster, she would have won.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase3',
      words: ['We', 'would', 'have', 'arrived', 'if', 'the', 'car', 'had', 'worked'],
      a: 'We would have arrived if the car had worked',
      hint: 'Result first, then "if".', why: 'We would have arrived if the car had worked.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase4',
      words: ['If', 'he', 'had', 'eaten', 'breakfast', 'he', 'would', 'not', 'have', 'been', 'hungry'],
      a: 'If he had eaten breakfast he would not have been hungry',
      hint: '"not" goes after "would".', why: 'If he had eaten breakfast, he would not have been hungry.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase5',
      words: ['They', 'would', 'have', 'swum', 'if', 'the', 'water', 'had', 'been', 'warm'],
      a: 'They would have swum if the water had been warm',
      hint: 'swim → swam → swum.', why: 'They would have swum if the water had been warm.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase6',
      words: ['If', 'it', 'had', 'not', 'rained', 'we', 'would', 'have', 'gone', 'out'],
      a: 'If it had not rained we would have gone out',
      hint: '"not" goes after "had".', why: 'If it had not rained, we would have gone out.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase7',
      words: ['She', 'would', 'have', 'bought', 'it', 'if', 'she', 'had', 'saved', 'money'],
      a: 'She would have bought it if she had saved money',
      hint: 'buy → bought → bought.', why: 'She would have bought it if she had saved money.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase8',
      words: ['If', 'we', 'had', 'left', 'earlier', 'we', 'would', 'have', 'caught', 'the', 'train'],
      a: 'If we had left earlier we would have caught the train',
      hint: 'leave → left → left.', why: 'If we had left earlier, we would have caught the train.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase9',
      words: ['I', 'would', 'have', 'helped', 'you', 'if', 'you', 'had', 'called', 'me'],
      a: 'I would have helped you if you had called me',
      hint: 'Result first.', why: 'I would have helped you if you had called me.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase10',
      words: ['If', 'the', 'dog', 'had', 'stayed', 'home', 'it', 'would', 'have', 'been', 'safe'],
      a: 'If the dog had stayed home it would have been safe',
      hint: 'had + stayed.', why: 'If the dog had stayed home, it would have been safe.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase11',
      words: ['He', 'would', 'have', 'seen', 'it', 'if', 'he', 'had', 'looked', 'up'],
      a: 'He would have seen it if he had looked up',
      hint: 'see → saw → seen.', why: 'He would have seen it if he had looked up.' },
    { type: 'order', q: 'Look at the picture and put the sentence in order.', img: 'phrase12',
      words: ['If', 'they', 'had', 'listened', 'they', 'would', 'have', 'understood'],
      a: 'If they had listened they would have understood',
      hint: 'understand → understood → understood.', why: 'If they had listened, they would have understood.' }
  ],

  school: [
    { q: 'Complete: If I had done my homework, the teacher ______ angry.',
      opts: ['would not have been', 'would not be', 'had not been', 'is not'], a: 0,
      hint: 'Negative result in the past.',
      why: '…the teacher would not have been angry.' },
    { q: 'Which sentence fits a bad exam result?',
      opts: ['If I had revised the notes, I would have passed the exam.',
             'If I revise the notes, I will pass the exam.',
             'If I revised the notes, I would pass the exam.',
             'If I would revise the notes, I had passed.'], a: 0,
      hint: 'The exam is already over.',
      why: 'had revised … would have passed.' },
    { q: 'Complete: If we ______ the deadline, we would not have lost points.',
      opts: ['had respected', 'respected', 'respect', 'would respect'], a: 0,
      hint: 'had + past participle.',
      why: 'If we had respected the deadline…' },
    { q: 'Complete: He would have understood the lesson if he ______ attention.',
      opts: ['had paid', 'paid', 'pays', 'would pay'], a: 0,
      hint: 'pay → paid → paid.',
      why: '…if he had paid attention.' },
    { q: 'Choose the correct sentence about choosing subjects.',
      opts: ['If I had chosen art, I would have enjoyed school more.',
             'If I choose art, I would have enjoyed school more.',
             'If I had chosen art, I enjoy school more.',
             'If I would choose art, I had enjoyed school.'], a: 0,
      hint: 'choose → chose → chosen.',
      why: 'had chosen … would have enjoyed.' },
    { q: 'Complete: If she had asked the teacher, she ______ the mistake.',
      opts: ['would have avoided', 'would avoid', 'had avoided', 'avoids'], a: 0,
      hint: 'would have + participle.',
      why: '…she would have avoided the mistake.' },
    { q: 'Complete: They would have joined the science club if they ______ about it.',
      opts: ['had heard', 'heard', 'hear', 'would hear'], a: 0,
      hint: 'hear → heard → heard.',
      why: '…if they had heard about it.' },
    { q: 'Which sentence is grammatically correct?',
      opts: ['If we had studied together, the project would have been better.',
             'If we studied together, the project would have been better.',
             'If we had studied together, the project will be better.',
             'If we would study together, the project had been better.'], a: 0,
      hint: 'Both halves in past forms.',
      why: 'had studied … would have been.' },
    { q: 'Complete: If I had not copied that answer, I ______ in trouble.',
      opts: ['would not have got', 'would not get', 'had not got', 'do not get'], a: 0,
      hint: 'get → got → got.',
      why: '…I would not have got in trouble.' },
    { q: 'Complete: If the class ______ quieter, the teacher would have explained more.',
      opts: ['had been', 'was', 'is', 'would be'], a: 0,
      hint: 'be → was/were → been.',
      why: 'If the class had been quieter…' },
    { q: 'Complete: You would have finished the test if you ______ your time better.',
      opts: ['had managed', 'managed', 'manage', 'would manage'], a: 0,
      hint: 'Regular verb after "had".',
      why: '…if you had managed your time better.' },
    { q: 'Which sentence shows regret about school?',
      opts: ['If I had taken notes, I would have remembered the dates.',
             'If I take notes, I remember the dates.',
             'If I took notes, I would remember the dates.',
             'If I have taken notes, I would remember the dates.'], a: 0,
      hint: 'Past regret = third conditional.',
      why: 'had taken … would have remembered.' },
    { q: 'Complete: If he had read the question carefully, he ______ the answer.',
      opts: ['would have seen', 'would see', 'had seen', 'sees'], a: 0,
      hint: 'see → saw → seen.',
      why: '…he would have seen the answer.' },
    { q: 'Complete: We ______ the trip if the school had collected the money on time.',
      opts: ['would have made', 'would make', 'had made', 'make'], a: 0,
      hint: 'would have + participle.',
      why: 'We would have made the trip…' }
  ]
};


/* =========================================================================
   PARTE 6.2 — RID.Questions
   Reparto sin repeticiones, panel de pregunta, temporizador opcional,
   pistas compradas en la tienda y estadísticas del nivel.
   ========================================================================= */

RID.Questions = (function () {

  var used    = {};        // categoría -> ids ya usados en la partida
  var active  = null;      // pregunta en curso
  var timerId = 0;
  var timeLeft = 0;
  var answered = false;
  var stats = { asked: 0, correct: 0, wrong: 0, timeouts: 0, hints: 0 };
  var wired = false;

  function bank(cat) { return RID.DATA.questions[cat] || []; }

  function keyOf(cat, i) { return cat + '#' + i; }

  /* Devuelve n preguntas de una categoría sin repetir dentro de la partida */
  function deck(cat, n) {
    var list = bank(cat), pool = [], out = [], i;
    if (!list.length) return out;

    used[cat] = used[cat] || [];
    for (i = 0; i < list.length; i++) {
      if (used[cat].indexOf(i) < 0) pool.push(i);
    }
    /* si se agotó el banco, se reinicia el ciclo de esa categoría */
    if (pool.length < n) { used[cat] = []; pool = []; for (i = 0; i < list.length; i++) pool.push(i); }

    pool = U.shuffle(pool).slice(0, Math.min(n, pool.length));
    for (i = 0; i < pool.length; i++) {
      used[cat].push(pool[i]);
      out.push({ cat: cat, index: pool[i], data: list[pool[i]], id: keyOf(cat, pool[i]) });
    }
    return out;
  }

  /* ---------- temporizador ---------- */
  function stopTimer() {
    if (timerId) window.clearInterval(timerId);
    timerId = 0;
    U.el('#q-timer').classList.add('hidden');
  }

  function startTimer(seconds, onTimeout) {
    var box = U.el('#q-timer');
    stopTimer();
    if (!seconds) return;
    timeLeft = seconds;
    box.classList.remove('hidden', 'is-low');
    box.textContent = U.fmtTime(timeLeft);

    timerId = window.setInterval(function () {
      timeLeft--;
      box.textContent = U.fmtTime(Math.max(0, timeLeft));
      box.classList.toggle('is-low', timeLeft <= 10);
      if (timeLeft <= 0) { stopTimer(); onTimeout(); }
    }, 1000);
  }

  /* ---------- panel ----------
     Tres formas de responder según q.data.type:
       'choice' (por defecto) : cuatro opciones
       'write'                : escribir la frase con el teclado
       'order'                : ordenar las palabras, con imagen de apoyo
     ------------------------------------------------------------------ */

  var curCfg = null;        // configuración de la pregunta en curso
  var shownCorrect = -1;    // hueco correcto en opción múltiple

  function typeOf(q) { return (q && q.data && q.data.type) || 'choice'; }

  /* Normaliza para comparar: minúsculas, sin puntuación ni dobles espacios */
  function norm(txt) {
    return String(txt).toLowerCase()
      .replace(/[‘’´`]/g, "'")
      .replace(/[.,;:!?\u0022\u00a1\u00bf]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function answersOf(data) { return [data.a].concat(data.alt || []); }

  function matches(txt, data) {
    var t = norm(txt), list = answersOf(data), i;
    for (i = 0; i < list.length; i++) if (norm(list[i]) === t) return true;
    return false;
  }

  function solutionText(data) {
    if (typeOf({ data: data }) === 'choice') return data.opts[data.a];
    return data.a;
  }

  /* --- a) opción múltiple --- */
  function buildChoice(q) {
    var host = U.el('#q-options'), letters = ['1', '2', '3', '4'];
    q.order = U.shuffle([0, 1, 2, 3]);
    shownCorrect = q.order.indexOf(q.data.a);
    U.clear(host);
    q.order.forEach(function (origIndex, shown) {
      var b = U.make('button', 'q-opt');
      b.type = 'button';
      b.setAttribute('data-slot', shown);
      b.innerHTML = '<span class="q-key">' + letters[shown] + '</span>' +
                    '<span class="q-label"></span>';
      b.lastChild.textContent = q.data.opts[origIndex];
      U.on(b, 'click', function () {
        if (answered) return;
        markResult(shown, shownCorrect);
        lockOptions();
        finish(shown === shownCorrect, false);
      });
      host.appendChild(b);
    });
  }

  function lockOptions() {
    U.els('#q-options .q-opt').forEach(function (b) { b.disabled = true; });
  }

  function markResult(shownPicked, correctSlot) {
    var opts = U.els('#q-options .q-opt');
    if (opts[correctSlot]) opts[correctSlot].classList.add('is-correct');
    if (shownPicked >= 0 && shownPicked !== correctSlot && opts[shownPicked]) {
      opts[shownPicked].classList.add('is-wrong');
    }
  }

  /* --- b) escribir la respuesta --- */
  function buildWrite() {
    var input = U.el('#q-input'), btn = U.el('#q-send');
    input.value = '';
    input.className = 'q-input';
    input.disabled = false;
    btn.disabled = false;
    window.setTimeout(function () { input.focus(); }, 90);
  }

  function submitWrite() {
    if (!active || answered || typeOf(active) !== 'write') return;
    var input = U.el('#q-input');
    var ok = matches(input.value, active.data);
    input.disabled = true;
    U.el('#q-send').disabled = true;
    input.classList.add(ok ? 'is-correct' : 'is-wrong');
    if (!ok) input.value = active.data.a;
    finish(ok, false);
  }

  /* --- c) ordenar la frase --- */
  function buildOrder(q) {
    var slot = U.el('#q-slot'), bank = U.el('#q-bank');
    U.clear(slot); U.clear(bank);
    slot.className = 'q-slot';

    U.shuffle(q.data.words).forEach(function (word) {
      var chip = U.make('button', 'q-word', word);
      chip.type = 'button';
      U.on(chip, 'click', function () {
        if (answered || chip.classList.contains('is-used')) return;
        chip.classList.add('is-used');
        var placed = U.make('button', 'q-word', word);
        placed.type = 'button';
        U.on(placed, 'click', function () {
          if (answered) return;
          chip.classList.remove('is-used');
          if (placed.parentNode) placed.parentNode.removeChild(placed);
        });
        slot.appendChild(placed);
      });
      bank.appendChild(chip);
    });
  }

  function clearOrder() {
    if (answered) return;
    U.clear(U.el('#q-slot'));
    U.els('#q-bank .q-word').forEach(function (c) { c.classList.remove('is-used'); });
  }

  function submitOrder() {
    if (!active || answered || typeOf(active) !== 'order') return;
    var slot = U.el('#q-slot');
    var txt = U.els('.q-word', slot).map(function (c) { return c.textContent; }).join(' ');
    var ok = matches(txt, active.data);
    slot.classList.add(ok ? 'is-correct' : 'is-wrong');
    if (!ok) {
      U.clear(slot);
      active.data.a.split(' ').forEach(function (w) {
        slot.appendChild(U.make('span', 'q-word', w));
      });
    }
    finish(ok, false);
  }

  /* --- pista --- */
  function useHint() {
    if (!active || answered) return;
    if (RID.state.upgrades.hints <= 0) { RID.UI.toast('No hints left', 'bad'); return; }

    RID.state.upgrades.hints--;
    stats.hints++;
    U.el('#q-hint-count').textContent = RID.state.upgrades.hints;
    RID.Storage.autosave();

    var t = typeOf(active), fb = U.el('#q-feedback');

    if (t === 'choice') {
      /* 50/50: apaga dos opciones incorrectas */
      var opts = U.els('#q-options .q-opt'), wrongSlots = [], i;
      for (i = 0; i < active.order.length; i++) {
        if (active.order[i] !== active.data.a && !opts[i].classList.contains('is-dimmed')) wrongSlots.push(i);
      }
      U.shuffle(wrongSlots).slice(0, 2).forEach(function (slot) {
        opts[slot].classList.add('is-dimmed');
        opts[slot].disabled = true;
      });

    } else if (t === 'write') {
      /* revela las tres primeras palabras */
      var input = U.el('#q-input');
      input.value = active.data.a.split(' ').slice(0, 3).join(' ') + ' ';
      input.focus();

    } else {
      /* coloca la primera palabra en su sitio */
      clearOrder();
      var first = active.data.a.split(' ')[0];
      U.els('#q-bank .q-word').some(function (c) {
        if (c.textContent === first) { c.click(); return true; }
        return false;
      });
    }

    fb.textContent = active.data.hint || '';
    fb.className = 'q-feedback';
  }

  /* --- lanzar una pregunta ---
     cfg: { seconds, counter, allowHint, onEnd(result) } */
  function ask(q, cfg) {
    cfg = cfg || {};
    curCfg = cfg;
    active = q;
    answered = false;

    var t = typeOf(q);

    U.el('#q-category').textContent = q.cat;
    U.el('#q-counter').textContent  = cfg.counter || '';
    U.el('#q-prompt').textContent   = q.data.q;
    U.el('#q-feedback').textContent = '';
    U.el('#q-feedback').className   = 'q-feedback';
    U.el('#q-hint-count').textContent = RID.state.upgrades.hints;
    U.show(U.el('#q-hint'), cfg.allowHint !== false);

    /* imagen de apoyo (preguntas de ordenar) */
    var imgEl = U.el('#q-image');
    var pic   = q.data.img ? RID.Assets.img(q.data.img) : null;
    if (pic) { imgEl.src = pic.src; U.show(imgEl, true); }
    else U.show(imgEl, false);

    U.show(U.el('#q-options'), t === 'choice');
    U.show(U.el('#q-write'),   t === 'write');
    U.show(U.el('#q-order'),   t === 'order');

    if (t === 'choice')      buildChoice(q);
    else if (t === 'write')  buildWrite();
    else                     buildOrder(q);

    RID.Screens.openOverlay('question');

    if (cfg.seconds) startTimer(cfg.seconds, function () { finish(false, true); });
    else stopTimer();

    stats.asked++;
  }

  /* --- cerrar la pregunta --- */
  function finish(ok, timedOut) {
    if (answered) return;
    answered = true;
    stopTimer();
    lockOptions();

    var fb = U.el('#q-feedback');

    if (ok) {
      stats.correct++;
      fb.textContent = 'Correct!';
      fb.className = 'q-feedback good';
      RID.Audio.sfx('sfx.correct');
    } else {
      stats.wrong++;
      if (timedOut) stats.timeouts++;
      fb.textContent = (timedOut ? "Time's up!  " : '') +
                       solutionText(active.data) + '  ·  ' + (active.data.why || '');
      fb.className = 'q-feedback bad';
      RID.Audio.sfx('sfx.hit');
    }

    var wait = ok ? 750 : 2200;
    var cfg  = curCfg;
    window.setTimeout(function () {
      RID.Screens.closeOverlay('question');
      var q = active;
      active = null; curCfg = null;
      if (cfg && cfg.onEnd) cfg.onEnd({ correct: ok, timedOut: timedOut, question: q });
    }, wait);
  }

  /* ---------- estadísticas ---------- */
  function resetStats() { stats = { asked: 0, correct: 0, wrong: 0, timeouts: 0, hints: 0 }; }
  function getStats()   { return { asked: stats.asked, correct: stats.correct, wrong: stats.wrong,
                                   timeouts: stats.timeouts, hints: stats.hints }; }

  function cancel() {
    stopTimer();
    answered = true;
    active = null;
    RID.Screens.closeOverlay('question');
  }

  function isOpen() { return !!active; }

  function wire() {
    if (wired) return;
    wired = true;
    U.on(U.el('#q-hint'), 'click', useHint);

    /* escribir la respuesta */
    U.on(U.el('#q-send'), 'click', submitWrite);
    U.on(U.el('#q-input'), 'keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitWrite(); }
    });

    /* ordenar la frase */
    U.on(U.el('#q-order-send'), 'click', submitOrder);
    U.on(U.el('#q-clear'), 'click', clearOrder);

    /* teclas 1-4 solo en opción múltiple */
    RID.Events.on('input:key', function (k) {
      if (!active || answered || typeOf(active) !== 'choice') return;
      var m = /^opt([1-4])$/.exec(k);
      if (!m) return;
      var slot = parseInt(m[1], 10) - 1;
      var btn = U.els('#q-options .q-opt')[slot];
      if (btn && !btn.disabled) btn.click();
    });
  }

  /* Cuenta total de preguntas disponibles (para comprobar el banco) */
  function bankSize() {
    var out = {}, k;
    for (k in RID.DATA.questions) out[k] = RID.DATA.questions[k].length;
    return out;
  }

  return {
    wire: wire, deck: deck, ask: ask, cancel: cancel, isOpen: isOpen,
    startTimer: startTimer, stopTimer: stopTimer,
    resetStats: resetStats, stats: getStats, hint: useHint, bankSize: bankSize
  };
})();

RID.Events.on('boot:ready', function () { RID.Questions.wire(); });


/* =========================================================================
   PARTE 7.1 — DATA.worlds
   ========================================================================= */

/* Paleta de la Senda Arcoíris. La usan IGUAL el nivel jugable y la escena
   de historia, para que la carretera se vea exactamente la misma. */
RID.DATA.rainbow = {
  road:   ['#ff2d9b', '#8b5cf6', '#3d5bff', '#00b7ff', '#34e04a', '#ffe600', '#ff9500', '#ff2d55'],
  rumble: ['#ff2d9b', '#00b7ff', '#34e04a', '#ffe600', '#ff9500', '#8b5cf6']
};

RID.DATA.worlds = [
  { id: 1, name: { es: 'Tierra Champiñón', en: 'Mushroom Land'   }, bg: 'bg.world1', music: 'music.world1', levels: [1, 2, 3, 4]     },
  { id: 2, name: { es: 'Isla de Yoshi',     en: "Yoshi's Island"  }, bg: 'bg.world2', music: 'music.world2', levels: [5, 6, 7, 8]     },
  { id: 3, name: { es: 'Isla Kong',         en: 'Kong Island'     }, bg: 'bg.world3', music: 'music.world3', levels: [9, 10, 11, 12]  },
  { id: 4, name: { es: 'Sarasaland',        en: 'Sarasaland'      }, bg: 'bg.world4', music: 'music.world4', levels: [13, 14, 15, 16] },
  { id: 5, name: { es: 'Reino de Bowser',   en: "Bowser's Kingdom"}, bg: 'bg.world5', music: 'music.world5', levels: [17, 18, 19, 20] }
];

RID.Progress.world = function (id) {
  return RID.DATA.worlds[U.clamp(id, 1, CFG.TOTAL_WORLDS) - 1];
};
RID.Progress.worldName = function (id, lang) {
  var w = RID.Progress.world(id);
  if (!w) return '';
  return w.name[lang || (CFG.UI_LANG === 'auto' ? RID.state.lang : 'en')] || w.name.en;
};


/* =========================================================================
   PARTE 7.2 — DATA.levels (se añade una entrada por nivel en su parte)
   ========================================================================= */

RID.DATA.levels = [
  {
    id: 1, world: 1, type: 'gap-maze',
    name: { es: 'Las alcantarillas', en: 'The Sewers' },
    bg: 'bg.level1', music: 'music.level1',
    params: {
      category: 'vocabulary',
      gaps: 9,             // 9 huecos = 9 preguntas
      seconds: 0,          // sin tiempo
      dark: true,          // linterna con el ratón
      coinsPerCorrect: 10
    }
  },
  {
    id: 2, world: 1, type: 'dodge-run',
    name: { es: 'Trampas del castillo', en: 'Castle Traps' },
    bg: 'bg.level2', music: 'music.level2',
    params: {
      category: 'sentences',   // formar oraciones
      stations: 5,             // 5 cristales de energía = 5 preguntas
      seconds: 60,             // 1 minuto por pregunta (5 minutos en total)
      dir: 1,                  // se avanza hacia la derecha (entrar al castillo)
      drain: 3.0,              // energía por segundo corriendo
      coinsPerCorrect: 10
    }
  },
  {
    id: 3, world: 1, type: 'dodge-run',
    name: { es: 'La salida', en: 'The Way Out' },
    bg: 'bg.level3', music: 'music.level3',
    params: {
      category: 'decisions',   // decisiones personales
      stations: 5,
      seconds: 60,
      dir: -1,                 // el MISMO pasillo, ahora de salida
      drain: 3.2,
      coinsPerCorrect: 10
    }
  },
  {
    id: 4, world: 1, type: 'kart',
    name: { es: 'Senda Arcoíris', en: 'Rainbow Road' },
    bg: 'bg.level4', music: 'music.level4',
    params: {
      category: 'school',      // decisiones escolares
      sections: 5,             // 5 poderes + 5 enemigos + 5 preguntas
      seconds: 0,
      theme: 'rainbow',
      coinsPerCorrect: 10
    }
  },
  {
    id: 5, world: 2, type: 'gap-jump',
    name: { es: 'Las grietas', en: 'The Cracks' },
    bg: 'bg.level5', music: 'music.level5',
    params: {
      category: 'goals',       // metas personales
      pits: 10,                // 10 fosas
      jumpsPerAnswer: 2,       // cada impulso dura dos saltos
      seconds: 0,              // sin tiempo
      coinsPerCorrect: 10
    }
  },
  {
    id: 6, world: 2, type: 'boss-shell',
    name: { es: 'Roy Koopa', en: 'Roy Koopa' },
    bg: 'bg.level6', music: 'music.level6',
    params: {
      category: 'goals',
      hits: 5,                 // cinco caparazonazos para derrotarlo
      seconds: 0,
      throwEvery: 2.1,         // cada cuánto lanza Roy
      boss: 'roy', bossName: 'ROY KOOPA', ammo: 'shell',
      coinsPerCorrect: 10
    }
  },
  {
    id: 7, world: 2, type: 'aim-catch',
    name: { es: 'Lengua de Yoshi', en: "Yoshi's Tongue" },
    bg: 'bg.level7', music: 'music.level7',
    params: {
      category: 'vocabulary',
      coins: 5,                // cinco monedas que no pueden caerse
      seconds: 0,
      rollTime: 7.5,           // segundos hasta que la moneda llega a la grieta
      coinsPerCorrect: 20
    }
  },
  {
    id: 8, world: 2, type: 'kart',
    name: { es: 'Rumbo a la Isla Kong', en: 'Road to Kong Island' },
    bg: 'bg.level8', music: 'music.level8',
    params: {
      /* mismos ajustes que el nivel 4: es la misma Senda Arcoíris */
      category: 'school',
      sections: 5,
      seconds: 0,
      theme: 'rainbow',
      coinsPerCorrect: 10
    }
  },
  {
    id: 9, world: 3, type: 'shop',
    name: { es: 'Refugio de los Kong', en: 'Kong Hideout' },
    bg: 'bg.level9', music: 'music.shop',
    params: {}
  },
  {
    id: 10, world: 3, type: 'dodge-run',
    name: { es: 'Trampas de Ludwig', en: "Ludwig's Traps" },
    bg: 'bg.level10', music: 'music.level10',
    params: {
      category: 'write',       // escribir la parte que falta
      stations: 5,             // 5 cristales = 5 frases
      seconds: 0,              // sin tiempo
      dir: 1,
      drain: 0,
      jumpCost: 22,            // aquí la energía se gasta AL SALTAR
      coinsPerCorrect: 10
    }
  },
  {
    id: 11, world: 3, type: 'boss-shell',
    name: { es: 'Ludwig von Koopa', en: 'Ludwig von Koopa' },
    bg: 'bg.level11', music: 'music.level11',
    params: {
      category: 'write',
      hits: 5,                 // cinco bolas de fuego devueltas
      seconds: 0,
      throwEvery: 2.0,
      boss: 'ludwig', bossName: 'LUDWIG VON KOOPA', ammo: 'fire',
      coinsPerCorrect: 10
    }
  },
  {
    id: 12, world: 3, type: 'kart',
    name: { es: 'Rumbo a Sarasaland', en: 'Road to Sarasaland' },
    bg: 'bg.level12', music: 'music.level12',
    params: {
      category: 'write',       // escribir el trozo que falta
      sections: 6,             // 6 poderes + 6 enemigos + 6 frases
      seconds: 90,             // minuto y medio por frase
      theme: 'rainbow',
      dodgers: true,           // el DOBLE de enemigos: 6 más que solo se esquivan
      speedMul: 1.18,          // más rápido que el 4 y el 8
      aimTol: 0.22,            // y hay que apuntar mejor
      coinsPerCorrect: 10
    }
  },
  {
    id: 13, world: 4, type: 'stomp',
    name: { es: 'Los Shy Guys hipnotizados', en: 'The Hypnotised Shy Guys' },
    bg: 'bg.level13', music: 'music.level13',
    params: {
      category: 'order',       // ver la imagen y ordenar la frase
      enemies: 8,              // Shy Guys que hay que pisar
      boxes: 6,                // 6 cajas de poder = 6 frases
      seconds: 90,             // minuto y medio por frase
      drain: 2.2,              // la energía baja con el tiempo
      starTime: 6,             // segundos de estrella al acertar
      coinsPerCorrect: 10
    }
  },
  {
    id: 14, world: 4, type: 'boss-shell',
    name: { es: 'Morton Koopa Jr.', en: 'Morton Koopa Jr.' },
    bg: 'bg.level14', music: 'music.level14',
    params: {
      category: 'write',       // completar la frase con el teclado
      hits: 7,                 // siete martillazos devueltos
      seconds: 60,             // un minuto por frase
      throwEvery: 1.8,
      boss: 'morton', bossName: 'MORTON KOOPA JR.', ammo: 'hammer',
      canDuck: true,           // los martillos altos se esquivan agachándose
      coinsPerCorrect: 10
    }
  },
  {
    id: 15, world: 4, type: 'shop',
    name: { es: 'Tienda de los Shy Guys', en: "Shy Guys' Shop" },
    bg: 'bg.level15', music: 'music.shop',
    params: {}
  },
  {
    id: 16, world: 4, type: 'kart',
    name: { es: 'Rumbo al Reino de Bowser', en: "Road to Bowser's Kingdom" },
    bg: 'bg.level16', music: 'music.level16',
    params: {
      category: 'order',        // construir la frase mirando la imagen
      sections: 6,
      seconds: 60,              // un minuto por frase
      theme: 'rainbow',
      dodgers: true,
      dodgersPerSection: 2,     // el TRIPLE de enemigos: 6 + 12
      speedMul: 1.25,
      aimTol: 0.20,
      coinsPerCorrect: 10
    }
  },
  {
    id: 17, world: 5, type: 'stomp',
    name: { es: 'Koopas esqueleto', en: 'Dry Bones Wasteland' },
    bg: 'bg.level17', music: 'music.level17',
    params: {
      category: 'write',        // completar la frase escribiendo
      foe: 'drybones',
      label: 'DRY BONES',
      hypno: false,
      enemies: 8,
      boxes: 6,                 // 6 frases
      seconds: 60,              // un minuto por frase
      pits: 6,                  // aquí caerse mata
      drain: 2.0,
      starTime: 6,
      coinsPerCorrect: 10
    }
  },
  {
    id: 18, world: 5, type: 'dodge-run',
    name: { es: 'El castillo de Bowser', en: "Bowser's Castle" },
    bg: 'bg.level18', music: 'music.level18',
    params: {
      category: 'goalsWrite',   // metas personales, escribiendo
      stations: 7,              // 7 frases
      seconds: 60,              // un minuto por frase
      dir: 1,
      drain: 3.6,               // la energía baja más rápido que nunca
      canDuck: true,            // cuchillas a la altura de la cabeza
      coinsPerCorrect: 10
    }
  },
  {
    id: 19, world: 5, type: 'boss-shell',
    name: { es: 'Bowser', en: 'Bowser' },
    bg: 'bg.level19', music: 'music.level19',
    params: {
      /* la pelea final mezcla TODAS las formas de preguntar */
      categories: ['vocabulary', 'sentences', 'decisions', 'goals',
                   'school', 'write', 'order', 'goalsWrite', 'write', 'order'],
      hits: 10,                 // mucha vida
      seconds: 60,              // un minuto por pregunta
      throwEvery: 1.4,          // ataca más rápido que nadie
      speedUp: 1.25,            // y sus proyectiles vuelan más rápido
      boss: 'bowser', bossName: 'BOWSER',
      ammoCycle: ['shell', 'fire', 'hammer'],
      canDuck: true,
      coinsPerCorrect: 20
    }
  },
  {
    id: 20, world: 5, type: 'party',
    name: { es: 'La fiesta de Peach', en: "Peach's Party" },
    bg: 'bg.level20', music: 'music.final',
    params: {}
  }
];


/* =========================================================================
   PARTE 7.3 — RID.Levels
   Registro de mecánicas + carcasa común de todos los niveles:
   fondo, música, HUD, vidas, muerte, pausa, victoria y derrota.
   Cada mecánica implementa { init, start, update, render, destroy } y solo
   habla con el motor a través del objeto "api".
   ========================================================================= */

RID.Levels = (function () {

  var registry = {};
  var mod = null;          // mecánica activa
  var def = null;          // entrada de DATA.levels activa
  var busy = false;        // true durante muerte / transición
  var earned = 0;          // monedas conseguidas EN este nivel
  var wired = false;

  function register(type, module) { registry[type] = module; }

  function definition(id) {
    for (var i = 0; i < RID.DATA.levels.length; i++) {
      if (RID.DATA.levels[i].id === id) return RID.DATA.levels[i];
    }
    return null;
  }

  function exists(id) {
    var d = definition(id);
    return !!(d && registry[d.type]);
  }

  function levelName(d, lang) {
    if (!d || !d.name) return 'Level ' + (d ? d.id : '');
    return d.name[lang || (CFG.UI_LANG === 'auto' ? RID.state.lang : 'en')] || d.name.en;
  }

  /* ---------- la API que reciben las mecánicas ---------- */
  function makeApi() {
    return {
      cfg:    def.params,
      id:     def.id,
      /* true si el jugador aportó la imagen de fondo de este nivel: en ese
         caso la mecánica NO pinta su decorado, para no taparla. */
      hasBg:  !!RID.Assets.img(def.bg),
      world:  def.world,
      state:  RID.state,
      input:  RID.Input,
      fx:     RID.FX,
      audio:  RID.Audio,
      util:   U,
      avatar: RID.Avatar,

      fail: function () { failLevel('gaveup'); },

      ask: function (category, options, cb) {
        var q = RID.Questions.deck(category, 1)[0];
        if (!q) { cb({ correct: true, question: null }); return; }
        options = options || {};
        options.onEnd = cb;
        RID.Questions.ask(q, options);
      },

      askFrom: function (queue, options, cb) {
        var q = queue.shift();
        if (!q) { cb({ correct: true, question: null }); return; }
        options = options || {};
        options.onEnd = cb;
        RID.Questions.ask(q, options);
      },

      deck:      function (cat, n) { return RID.Questions.deck(cat, n); },
      coins:     function (n) { addCoins(n); },
      objective: function (txt) { RID.UI.setObjective(txt); },
      gauge:     function (type, pct) { RID.UI.setGauge(type, pct); },
      sfx:       function (key) { RID.Audio.sfx(key); },
      toast:     function (msg, kind) { RID.UI.toast(msg, kind); },
      loseLife:  function (x, y, onRespawn) { loseLife(x, y, onRespawn); },
      complete:  function (stats) { complete(stats); },
      isBusy:    function () { return busy; }
    };
  }

  /* ---------- monedas ---------- */
  function addCoins(n) {
    if (!n) return;
    earned += n;
    RID.state.run.coins += n;
    RID.UI.setCoins(RID.state.run.coins);
    RID.Audio.sfx('sfx.coin');
    RID.Storage.autosave();
  }

  /* ---------- pérdida de vida ---------- */
  function loseLife(x, y, onRespawn) {
    if (busy) return;

    /* La Armadura de Bowser aguanta un golpe por nivel */
    if (RID.state.run.shield > 0) {
      RID.state.run.shield--;
      RID.FX.hitFlash();
      RID.FX.shake(220);
      RID.Audio.sfx('sfx.hit');
      RID.UI.toast('Armor absorbed the hit!', 'good');
      if (onRespawn) onRespawn();
      return;
    }

    busy = true;
    RID.state.run.lives--;
    var left = RID.state.run.lives;

    RID.UI.setLives(left, true);
    RID.FX.hitFlash();
    RID.FX.shake(350);
    RID.Audio.sfx(left > 0 ? 'sfx.life' : 'sfx.death');
    RID.Storage.autosave();

    RID.FX.playerDeath(x, y, function () {
      RID.UI.showLifeLost(left, function () {
        busy = false;
        if (left <= 0) gameOver();
        else if (onRespawn) onRespawn();
      });
    });
  }

  /* ---------- resultado del nivel ---------- */
  function statsNow(passed) {
    var qs = RID.Questions.stats();
    return {
      correct: qs.correct,
      total:   qs.asked,
      coins:   earned,
      lives:   Math.max(0, RID.state.run.lives),
      passed:  passed
    };
  }

  /* ---------- nivel superado ---------- */
  function complete() {
    if (busy) return;
    busy = true;

    var stats     = statsNow(true);
    var finishedId = def.id;
    var wasShop    = (def.type === 'shop');

    unload();
    RID.Screens.setHUD(false);

    /* la tienda no necesita pantalla de resumen */
    if (wasShop) { RID.Flow.completeLevel(finishedId, stats); return; }

    U.el('#sum-score').textContent = stats.correct + ' / ' + stats.total;
    U.el('#sum-coins').textContent = stats.coins;
    U.el('#sum-lives').textContent = stats.lives;
    RID.Screens.show('level-clear', { level: finishedId, stats: stats });

    var btn = U.el('#clear-next');
    btn.onclick = function () {
      btn.onclick = null;
      RID.Flow.completeLevel(finishedId, stats);
    };
  }

  /* ---------- nivel fallido: NO se repite, se sigue adelante ---------- */
  function failLevel(reason) {
    if (!def) return;
    var id    = def.id;
    var stats = statsNow(false);
    var name  = levelName(definition(id));

    unload();
    RID.Screens.setHUD(false);

    U.el('#game-over-sub').textContent = 'Level ' + id + ' — ' + name +
      (reason === 'gaveup' ? ' (you gave up)' : ' (no paws left)');
    U.el('#fail-score').textContent = stats.correct + ' / ' + stats.total;
    U.el('#fail-coins').textContent = stats.coins;
    RID.Screens.show('game-over');

    var btn = U.el('#over-continue');
    btn.onclick = function () {
      btn.onclick = null;
      RID.Flow.completeLevel(id, stats);
    };
  }

  function gameOver() { failLevel('nolives'); }

  /* ---------- carga / descarga ---------- */
  function unload() {
    RID.Loop.setScene(null);
    RID.Questions.cancel();
    RID.Screens.closeAllOverlays();
    RID.FX.clear();
    RID.UI.setObjective('');
    RID.UI.setGauge(null);
    if (mod && mod.destroy) { try { mod.destroy(); } catch (e) { console.error(e); } }
    mod = null;
    busy = false;
  }

  function load(id) {
    var d = definition(id);
    if (!d || !registry[d.type]) {
      RID.UI.toast('Level ' + id + ' is not built yet', 'bad');
      RID.Flow.goTitle();
      return;
    }

    unload();
    def = d;

    /* estado de la partida */
    RID.state.run.level = d.id;
    RID.state.run.world = d.world;
    RID.state.run.lives  = CFG.LIVES;
    RID.state.run.shield = RID.state.upgrades.shield;
    RID.state.session.levelType = d.type;
    RID.state.session.startedAt = Date.now();
    earned = 0;
    RID.Questions.resetStats();
    RID.Storage.autosave();

    /* presentación */
    RID.Screens.hideAll();
    RID.Screens.closeAllOverlays();
    RID.Screens.setBackground(d.bg);
    RID.Screens.setHUD(true);
    RID.UI.setLevelName(RID.Progress.worldName(d.world), levelName(d));
    RID.UI.renderHUD();
    RID.Audio.playMusic(d.music);

    /* mecánica */
    var api = makeApi();
    mod = Object.create(registry[d.type]);
    if (mod.init) mod.init(api, d.params, d);

    RID.Loop.setScene({
      start:  function () { if (mod && mod.start) mod.start(); },
      update: function (dt) {
        RID.FX.update(dt);
        if (mod && mod.update && !RID.Questions.isOpen()) mod.update(dt);
      },
      render: function (world, fx) {
        if (mod && mod.render) mod.render(world, fx);
        RID.FX.render(fx);
      },
      destroy: function () { }
    });
    RID.Loop.resume();
  }

  /* ---------- pausa ---------- */
  function togglePause() {
    if (!mod) return;
    if (RID.Screens.isOverlayOpen('question')) return;
    if (RID.Screens.isOverlayOpen('pause')) resumeGame();
    else {
      RID.Loop.pause();
      RID.Screens.openOverlay('pause');
    }
  }

  function resumeGame() {
    RID.Screens.closeOverlay('pause');
    RID.Loop.resume();
  }

  function wire() {
    if (wired) return;
    wired = true;

    RID.Events.on('level:request', function (e) { load(e.id); });
    RID.Events.on('input:pause', togglePause);
    U.on(U.el('#hud-pause'), 'click', togglePause);

    U.on(U.el('#pause-resume'),  'click', resumeGame);
    U.on(U.el('#pause-settings'),'click', function () { resumeGame(); RID.Flow.goSettings(); });
    U.on(U.el('#pause-quit'),    'click', function () {
      RID.UI.confirm(RID.UI.t('giveUpAsk'), function () {
        resumeGame();
        failLevel('gaveup');
      });
    });
  }

  return {
    register: register, load: load, unload: unload,
    exists: exists, definition: definition, levelName: levelName,
    fail: failLevel, wire: wire, current: function () { return def; }
  };
})();

RID.Events.on('boot:ready', function () { RID.Levels.wire(); });


/* =========================================================================
   PARTE 7.4 — MECÁNICA 'gap-maze'  (nivel 1: las alcantarillas)
   Túnel oscuro con linterna. Cada hueco pide una pregunta de vocabulary:
   si aciertas aparecen dos piedras para cruzarlo, si fallas te caes.
   ========================================================================= */

RID.Levels.register('gap-maze', (function () {

  var GROUND_TOP = 430;      // altura base del suelo
  var GRAVITY    = 1900;
  var SPEED      = 215;
  var JUMP_V     = 545;
  var TRIGGER    = 96;       // distancia a la que salta la pregunta

  var api, cfg, S;

  /* ---------- construcción del túnel ---------- */
  function buildLayout(gapCount) {
    var plats = [], gaps = [], x = 0, i, y = GROUND_TOP, w;

    /* plataforma inicial larga */
    plats.push({ x: 0, y: y, w: 520 });
    x = 520;

    var heights = [0, -34, 22, -18, 40, -40, 12, -26, 30, 0];
    for (i = 0; i < gapCount; i++) {
      var gw = 128 + (i % 3) * 9;
      gaps.push({ x: x, w: gw, index: i, solved: false, stones: null });
      x += gw;

      y = GROUND_TOP + heights[(i + 1) % heights.length];
      w = (i === gapCount - 1) ? 560 : 300 + (i % 4) * 45;
      plats.push({ x: x, y: y, w: w });
      x += w;
    }
    return { plats: plats, gaps: gaps, width: x, exitX: x - 150 };
  }

  function platAt(px) {
    for (var i = 0; i < S.plats.length; i++) {
      var p = S.plats[i];
      if (px >= p.x && px <= p.x + p.w) return p;
    }
    return null;
  }

  /* Suelo bajo el jugador: plataforma o piedra de un hueco resuelto */
  function groundAt(px, py) {
    var p = platAt(px);
    if (p) return p.y;
    var i, k, st;
    for (i = 0; i < S.gaps.length; i++) {
      if (!S.gaps[i].stones) continue;
      for (k = 0; k < S.gaps[i].stones.length; k++) {
        st = S.gaps[i].stones[k];
        if (px >= st.x && px <= st.x + st.w && py <= st.y + 24) return st.y;
      }
    }
    return null;
  }

  /* Las piedras se colocan RESPECTO A LA PLATAFORMA DE SALIDA, no a la más
     baja: así el primer salto siempre es corto y el segundo hace de escalón
     hacia la otra orilla. Ningún salto pasa de STEP_MAX de altura. */
  var STEP_MAX = 40;

  function spawnStones(gap) {
    var left  = platAt(gap.x - 4), right = platAt(gap.x + gap.w + 4);
    var yl = left  ? left.y  : GROUND_TOP;
    var yr = right ? right.y : GROUND_TOP;

    var s1 = yl - 24;                                       // siempre alcanzable
    var s2 = U.clamp(yr - 24, s1 - STEP_MAX, s1 + STEP_MAX); // escalón suave

    gap.stones = [
      { x: gap.x + gap.w * 0.22 - 26, y: s1, w: 52, t: 0 },
      { x: gap.x + gap.w * 0.68 - 26, y: s2, w: 52, t: 0 }
    ];
  }

  /* ---------- ciclo de vida ---------- */
  return {
    init: function (a, c) {
      api = a; cfg = c;

      var layout = buildLayout(cfg.gaps);
      S = {
        plats: layout.plats,
        gaps: layout.gaps,
        width: layout.width,
        exitX: layout.exitX,
        cam: 0,
        t: 0,
        solvedCount: 0,
        coins: 0,
        phase: 'play',
        queue: api.deck(cfg.category, cfg.gaps),
        player: { x: 90, y: GROUND_TOP, vx: 0, vy: 0, onGround: true, face: 1, spawnX: 90 },
        drops: []
      };

      api.objective('GAP 0/' + cfg.gaps);
      api.gauge(null);
    },

    start: function () {
      api.toast('Find the exit — answer to build a path', 'coin');
    },

    update: function (dt) {
      if (!S) return;
      S.t += dt;
      var p = S.player;

      if (S.phase === 'dead') return;

      /* --- movimiento --- */
      var move = 0;
      if (api.input.isDown('left'))  move -= 1;
      if (api.input.isDown('right')) move += 1;
      if (move) p.face = move;
      p.vx = move * SPEED;

      if (api.input.pressed('action') && p.onGround) {
        p.vy = -JUMP_V;
        p.onGround = false;
        api.sfx('sfx.jump');
      }

      p.vy += GRAVITY * dt;
      var prevX = p.x;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x = U.clamp(p.x, 20, S.width - 20);

      /* --- pared: una plataforma más alta no se atraviesa, se salta --- */
      var side = platAt(p.x);
      if (side && p.y > side.y + 24) { p.x = prevX; p.vx = 0; }

      /* --- suelo --- */
      var g = groundAt(p.x, p.y);
      if (g !== null && p.vy >= 0 && p.y >= g - 2 && p.y <= g + 40) {
        p.y = g;
        p.vy = 0;
        p.onGround = true;
      } else if (g === null || p.y < g - 2) {
        p.onGround = false;
      }

      /* --- caída al vacío --- */
      if (p.y > CFG.H + 90) {
        fall();
        return;
      }

      /* --- pregunta al acercarse a un hueco (solo mientras se camina) --- */
      var i, gap;
      if (S.phase === 'play') {
        for (i = 0; i < S.gaps.length; i++) {
          gap = S.gaps[i];
          if (gap.solved) continue;
          if (p.x + 18 >= gap.x - TRIGGER && p.x < gap.x + gap.w) { askGap(gap); return; }
        }
      }

      /* --- piedras: animación de aparición --- */
      for (i = 0; i < S.gaps.length; i++) {
        if (!S.gaps[i].stones) continue;
        for (var k = 0; k < S.gaps[i].stones.length; k++) {
          S.gaps[i].stones[k].t = Math.min(1, S.gaps[i].stones[k].t + dt * 3);
        }
      }

      /* --- salida --- */
      if (p.x >= S.exitX && S.solvedCount >= cfg.gaps) {
        S.phase = 'done';
        api.sfx('sfx.door');
        api.complete({ coins: S.coins });
        return;
      }

      /* --- cámara --- */
      var target = U.clamp(p.x - 340, 0, Math.max(0, S.width - CFG.W));
      S.cam = U.lerp(S.cam, target, Math.min(1, dt * 6));
    },

    render: function (ctx, fx) {
      if (!S) return;
      var cam = S.cam, i, k;

      /* Con imagen de fondo propia solo se oscurece un poco para que el
         juego se lea encima; el decorado dibujado por código se omite. */
      var deco = !api.hasBg;
      if (!deco) { ctx.fillStyle = 'rgba(6,4,16,.30)'; ctx.fillRect(0, 0, CFG.W, CFG.H); }

      ctx.save();
      ctx.translate(-cam, 0);

      if (deco) {
      /* pared de ladrillo del túnel */
      ctx.fillStyle = '#141826';
      ctx.fillRect(cam, 0, CFG.W, CFG.H);
      ctx.fillStyle = '#1e2438';
      for (i = Math.floor(cam / 48) * 48; i < cam + CFG.W + 48; i += 48) {
        for (k = 60; k < CFG.H; k += 32) {
          var off = ((k / 32) % 2) ? 24 : 0;
          ctx.fillRect(i + off, k, 44, 28);
        }
      }
      /* agua sucia al fondo */
      ctx.fillStyle = 'rgba(30,70,60,.55)';
      ctx.fillRect(cam, CFG.H - 40, CFG.W, 40);
      ctx.fillStyle = 'rgba(90,160,130,.25)';
      for (i = 0; i < 12; i++) {
        var wx = cam + ((i * 97 + S.t * 26) % (CFG.W + 100)) - 50;
        ctx.fillRect(wx, CFG.H - 34 + Math.sin(S.t * 3 + i) * 3, 40, 3);
      }

      /* tuberías decorativas */
      ctx.fillStyle = '#2b6b4a';
      for (i = Math.floor(cam / 520) * 520; i < cam + CFG.W + 520; i += 520) {
        ctx.fillRect(i + 80, 60, 54, 36);
        ctx.fillRect(i + 74, 96, 66, 16);
      }
      }

      /* plataformas */
      for (i = 0; i < S.plats.length; i++) {
        var pl = S.plats[i];
        if (pl.x + pl.w < cam - 60 || pl.x > cam + CFG.W + 60) continue;
        ctx.fillStyle = '#4a4f6b';
        ctx.fillRect(pl.x, pl.y, pl.w, 10);
        ctx.fillStyle = '#2f3450';
        ctx.fillRect(pl.x, pl.y + 10, pl.w, CFG.H - pl.y - 10);
        ctx.fillStyle = '#5c6389';
        for (k = 0; k < pl.w; k += 32) ctx.fillRect(pl.x + k + 2, pl.y + 2, 28, 4);
      }

      /* huecos: borde de peligro y piedras */
      for (i = 0; i < S.gaps.length; i++) {
        var gp = S.gaps[i];
        if (gp.x + gp.w < cam - 60 || gp.x > cam + CFG.W + 60) continue;

        if (!gp.solved) {
          ctx.fillStyle = 'rgba(255,70,70,' + (0.25 + 0.2 * Math.sin(S.t * 4)) + ')';
          ctx.fillRect(gp.x, GROUND_TOP - 60, gp.w, 4);
        }
        if (gp.stones) {
          for (k = 0; k < gp.stones.length; k++) {
            var st = gp.stones[k], e = U.easeOut(st.t);
            ctx.save();
            ctx.globalAlpha = e;
            ctx.translate(st.x, st.y + (1 - e) * 40);
            ctx.fillStyle = '#7d6a4a';
            ctx.fillRect(0, 0, st.w, 16);
            ctx.fillStyle = '#a8916a';
            ctx.fillRect(0, 0, st.w, 5);
            ctx.fillStyle = 'rgba(255,220,120,' + (0.3 + 0.25 * Math.sin(S.t * 6 + k)) + ')';
            ctx.fillRect(-2, -3, st.w + 4, 3);
            ctx.restore();
          }
        }
      }

      /* salida */
      ctx.fillStyle = '#2b1d10';
      ctx.fillRect(S.exitX + 40, GROUND_TOP - 96, 66, 96);
      ctx.fillStyle = S.solvedCount >= cfg.gaps ? '#ffd447' : '#5a5f7a';
      ctx.fillRect(S.exitX + 48, GROUND_TOP - 88, 50, 80);
      U.pixelText(ctx, 'EXIT', S.exitX + 73, GROUND_TOP - 112, 15, '#ffd447');

      /* jugador */
      var pose = !S.player.onGround ? 'jump' : (S.player.vx ? 'run' : 'idle');
      if (!RID.FX.isBusy()) {
        ctx.save();
        if (S.player.face < 0) { ctx.translate(S.player.x * 2, 0); ctx.scale(-1, 1); }
        RID.Avatar.drawPlayer(ctx, S.player.x, S.player.y, 1.55, pose, S.t);
        ctx.restore();
      }

      ctx.restore();

      /* linterna sobre la capa de efectos */
      if (cfg.dark) {
        var m = api.input.mouse();
        RID.FX.flashlight(fx, m.x, m.y, 168, 0.93);
        fx.save();
        fx.globalCompositeOperation = 'lighter';
        var px = S.player.x - cam, py = S.player.y - 36;
        var gl = fx.createRadialGradient(px, py, 0, px, py, 95);
        gl.addColorStop(0, 'rgba(255,235,190,.22)');
        gl.addColorStop(1, 'rgba(255,235,190,0)');
        fx.fillStyle = gl;
        fx.beginPath(); fx.arc(px, py, 95, 0, Math.PI * 2); fx.fill();
        fx.restore();
      }
    },

    destroy: function () { S = null; }
  };

  /* ---------- acciones internas ---------- */
  function askGap(gap) {
    S.phase = 'question';
    S.player.vx = 0;

    var q = S.queue.shift() || api.deck(cfg.category, 1)[0];
    if (!q) { gap.solved = true; S.phase = 'play'; return; }

    RID.Questions.ask(q, {
      counter: (S.solvedCount + 1) + '/' + cfg.gaps,
      seconds: cfg.seconds || 0,
      allowHint: true,
      onEnd: function (res) {
        if (res.correct) {
          gap.solved = true;
          S.solvedCount++;
          spawnStones(gap);
          S.coins += cfg.coinsPerCorrect;
          api.coins(cfg.coinsPerCorrect);
          api.objective('GAP ' + S.solvedCount + '/' + cfg.gaps);
          /* las partículas viven en la capa de efectos: coordenadas de pantalla */
          RID.FX.particles('star', gap.x + gap.w / 2 - S.cam, GROUND_TOP - 20, 14);
          S.player.spawnX = Math.max(40, gap.x - 120);
          S.phase = 'play';
        } else {
          /* el suelo cede: el jugador cae al hueco */
          S.player.x = gap.x + 20;
          S.player.vy = 120;
          S.phase = 'falling';
        }
      }
    });
  }

  function fall() {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    var screenX = S.player.x - S.cam;
    api.loseLife(screenX, CFG.H - 160, function () {
      if (!S) return;
      S.player.x  = S.player.spawnX;
      S.player.y  = GROUND_TOP - 40;
      S.player.vy = 0;
      S.player.vx = 0;
      S.phase = 'play';
    });
  }
})());


/* =========================================================================
   PARTE 7.5 — DATA.sprites  (pixel art de los personajes de Mario)
   Cada sprite es una rejilla de caracteres + su paleta.
     '.' = transparente   ·   'K' = contorno negro
   Se rasterizan UNA vez a un lienzo interno y luego se dibujan escalados
   con el suavizado apagado, así conservan el borde duro de píxel.
   Añadir un personaje = añadir una entrada aquí.
   ========================================================================= */

RID.DATA.sprites = {

  goomba: {
    palette: { K: '#000000', B: '#8a4b1e', T: '#e8c07a', W: '#ffffff', D: '#5a2f10' },
    rows: [
      '....KKKKKK....',
      '..KKBBBBBBKK..',
      '.KBBBBBBBBBBK.',
      '.KBBBBBBBBBBK.',
      'KBBKKBBBBKKBBK',
      'KBBKWWKKWWKBBK',
      'KTTKWKKKKWKTTK',
      '.KTTTTTTTTTTK.',
      '.KTTTTTTTTTTK.',
      '..KTTTTTTTTK..',
      '.KDDKK..KKDDK.',
      '.KKKK....KKKK.'
    ]
  },

  toad: {
    palette: { K: '#000000', W: '#ffffff', R: '#e02020', S: '#f4c88a', B: '#1a4fd0', Y: '#ffd447', N: '#7a4a1e' },
    rows: [
      '.....KKKKKK.....',
      '...KKWWWWWWKK...',
      '..KWWWWWWWWWWK..',
      'KWRRWWRRRRWWRRWK',
      'KWRRWWRRRRWWRRWK',
      'KWRRWWRRRRWWRRWK',
      '.KWWWWRRRRWWWWK.',
      '..KWWWWWWWWWWK..',
      '...KKSSSSSSKK...',
      '..KSSSSSSSSSSK..',
      '..KSSKSSSSKSSK..',
      '..KSSKSSSSKSSK..',
      '..KSSSSSSSSSSK..',
      '...KKSSSSSSKK...',
      '.KSBBYYWWYYBBSK.',
      '.KSBBYYWWYYBBSK.',
      '.KKSSYWWWWYSSKK.',
      '...KWWWWWWWWWK..',
      '..KNNKWWWWKNNK..',
      '..KKKK....KKKK..'
    ]
  },

  yoshi: {
    palette: { K: '#000000', G: '#41c455', W: '#ffffff', E: '#1b1b2e',
               R: '#e02020', O: '#f28a20', N: '#c98a8a' },
    rows: [
      '........KKKKKK......',
      '......KKGGGGGGKK....',
      '.....KGGGGGGGGGGK...',
      '....KGGWWWGGGGGGGK..',
      '....KGWWEEWGGGGGGK..',
      '....KGWWEEWGGGGGGK..',
      '...KKGGWWWGGGGGGGK..',
      '..KWWKGGGGGGGGGGK...',
      '.KWWWWWKGGGGGGGGK...',
      '.KWNWWWWKGGGGGGK....',
      '.KWWWWWWKGGGGGGK....',
      '..KWWWWKKGGGGGK.....',
      '...KKKK..KGGGGK.....',
      '.........KGGGGGK....',
      '........KGGGRRGGK...',
      '.......KGGGGRRGGGK..',
      '......KWWGGGRRGGGGK.',
      '.....KWWWWGGGGGGGGK.',
      '.....KWWWWWGGGGGGK..',
      '.....KWWWWWGGGGGK...',
      '......KWWWGGGGGK....',
      '......KGGKKGGKK.....',
      '.....KOOOKKOOOK.....',
      '.....KKKKK.KKKK.....'
    ]
  },

  koopa: {
    palette: { K: '#000000', G: '#3fb950', D: '#1e6b2a', T: '#f4c88a', Y: '#ffd447', O: '#f28a20', W: '#ffffff' },
    rows: [
      '........KKK...',
      '.......KTTTK..',
      '......KTWKTTK.',
      '......KTTKTTK.',
      '.KKKKKKTTTTK..',
      'KGGGGGGKTTTK..',
      'KGDDGDDGKTTK..',
      'KGDDGDDGKYYK..',
      'KGGGGGGGKYYK..',
      'KGDDGDDGKYYK..',
      'KGDDGDDGKYK...',
      '.KGGGGGGKKK...',
      '..KKKKKKTTK...',
      '.....KTTKTTK..',
      '.....KOOKOOK..',
      '.....KKKKKKK..'
    ]
  },

  peach: {
    palette: { K: '#000000', Y: '#ffd447', H: '#f2d16b', S: '#f7d3a8', P: '#f06fb4', W: '#ffffff' },
    rows: [
      '....KKKKKK....',
      '...KYYYYYYK...',
      '..KKYYYYYYKK..',
      '..KHHHHHHHHK..',
      '.KHHHHHHHHHHK.',
      '.KHHSSSSSSHHK.',
      '.KHSSKSSKSSHK.',
      '.KHSSSSSSSSHK.',
      '.KHHSSKKSSHHK.',
      '..KHHSSSSHHK..',
      '...KKPPPPKK...',
      '..KWPPPPPPWK..',
      '..KWPPPPPPWK..',
      '..KKPPPPPPKK..',
      '..KPPPPPPPPK..',
      '.KPPPPPPPPPPK.',
      '.KPPPPPPPPPPK.',
      'KPPPPPPPPPPPPK',
      'KPPPPPPPPPPPPK',
      'KKKKKKKKKKKKKK'
    ]
  },

  dk: {
    palette: { K: '#000000', B: '#7a4a24', T: '#e8b87a', R: '#e02020' },
    rows: [
      '....KKKKKKK.....',
      '..KKBBBBBBBKK...',
      '.KBBBBBBBBBBBK..',
      '.KBBTTTTTTTBBK..',
      '.KBTTKTTTKTTBK..',
      '.KBTTTTTTTTTBK..',
      '.KBBTTKKKTTBBK..',
      '..KBBBTTTBBBK...',
      '.KBBBBRRRBBBBK..',
      'KBBBBBRRRBBBBBK.',
      'KBBTTBBRRBBTTBK.',
      'KBBTTBBBBBBTTBK.',
      'KBBTTBBBBBBTTBK.',
      '.KKKBBBBBBBBKK..',
      '...KBBKKKKBBK...',
      '...KKKK..KKKK...'
    ]
  },

  roy: {
    palette: { K: '#000000', T: '#e8c07a', M: '#ff3f8f', O: '#e8871f', C: '#f6e3b4' },
    rows: [
      '.....KKKKK......',
      '....KTTTTTK.....',
      '...KTTTTTTTK....',
      '...KMMMMMMMK....',
      '..KMMKKMMKKMK...',
      '...KTTTTTTTK....',
      '...KTTKKKTTK....',
      '..KKTTTTTTTKK...',
      '.KOOKKCCCKKOOK..',
      'KOOKCCCCCCCKOOK.',
      'KOOKCOOOOOCKOOK.',
      'KOOKCOOOOOCKOOK.',
      '.KKKCCOOOCCKKK..',
      '...KCCCCCCCK....',
      '...KCCCCCCCK....',
      '...KKCCCCCKK....',
      '....KTTKTTK.....',
      '....KTTKTTK.....',
      '...KOOKKOOKK....',
      '...KKKK.KKKK....'
    ]
  },

  mario: {
    palette: { K: '#000000', C: '#e03131', S: '#f4c88a', H: '#3b2412',
               O: '#2f6fed', Y: '#ffd447', N: '#6b4a22' },
    rows: [
      '...KKKKKK.....','..KCCCCCCKK...','.KCCCCCCCCCK..','.KHHSSSSSKKK..',
      '.KHSSKSSKSSK..','.KHSSSSSSSSK..','.KSSKKKKKSSK..','..KSSSSSSSK...',
      '...KKSSSKK....','..KCCCCCCCK...','.KCCCOOOCCCK..','KCCCOOOOOCCCK.',
      'KSSCOYOYOCSSK.','KSSCOOOOOCSSK.','.KKCOOOOOCKK..','...KOOKOOK....',
      '...KOOKOOK....','..KNNKKNNK....','..KNNKKNNK....','..KKKK.KKKK...'
    ]
  },

  luigi: {
    palette: { K: '#000000', C: '#3fb950', S: '#f4c88a', H: '#3b2412',
               O: '#2f6fed', Y: '#ffd447', N: '#6b4a22' },
    rows: [
      '...KKKKKK.....','..KCCCCCCKK...','.KCCCCCCCCCK..','.KHHSSSSSKKK..',
      '.KHSSKSSKSSK..','.KHSSSSSSSSK..','.KSSKKKKKSSK..','..KSSSSSSSK...',
      '...KKSSSKK....','..KCCCCCCCK...','.KCCCOOOCCCK..','KCCCOOOOOCCCK.',
      'KSSCOYOYOCSSK.','KSSCOOOOOCSSK.','.KKCOOOOOCKK..','...KOOKOOK....',
      '...KOOKOOK....','..KNNKKNNK....','..KNNKKNNK....','..KKKK.KKKK...'
    ]
  },

  daisy: {
    palette: { K: '#000000', Y: '#ffd447', H: '#8a5a2b', S: '#f7d3a8',
               P: '#f28a20', W: '#ffffff' },
    rows: [
      '....KKKKKK....','...KYYYYYYK...','..KKYYYYYYKK..','..KHHHHHHHHK..',
      '.KHHHHHHHHHHK.','.KHHSSSSSSHHK.','.KHSSKSSKSSHK.','.KHSSSSSSSSHK.',
      '.KHHSSKKSSHHK.','..KHHSSSSHHK..','...KKPPPPKK...','..KWPPPPPPWK..',
      '..KWPPPPPPWK..','..KKPPPPPPKK..','..KPPPPPPPPK..','.KPPPPPPPPPPK.',
      '.KPPPPPPPPPPK.','KPPPPPPPPPPPPK','KPPPPPPPPPPPPK','KKKKKKKKKKKKKK'
    ]
  },

  drybones: {
    palette: { K: '#000000', W: '#f2efe4', Y: '#ffd447' },
    rows: [
      '....KKKKKK....','..KKWWWWWWKK..','.KWWWWWWWWWWK.','.KWWKKWWKKWWK.',
      '.KWWKYWWYKWWK.','.KWWWWWWWWWWK.','..KWWKKKKWWK..','...KKWWWWKK...',
      '....KWWWWK....','..KKWWWWWWKK..','.KWWKWWWWKWWK.','.KWKWWWWWWKWK.',
      '.KWWKWWWWKWWK.','.KWKWWWWWWKWK.','..KWWWWWWWWK..','..KKWWWWWWKK..',
      '...KWWKKWWK...','..KWWKKKKWWK..','..KWWK..KWWK..','..KKKK..KKKK..'
    ]
  },

  shyguy: {
    palette: { K: '#000000', W: '#f4f1e6', R: '#d02020', Y: '#ffd447', B: '#2f6fed' },
    rows: [
      '....KKKKKK....','..KKWWWWWWKK..','.KWWWWWWWWWWK.','.KWWKKWWKKWWK.',
      '.KWWKKWWKKWWK.','.KWWWWWWWWWWK.','.KWWWWKKWWWWK.','..KWWWWWWWWK..',
      '..KKRRRRRRKK..','.KRRRRRRRRRRK.','.KRRRRRRRRRRK.','KRRRRYYYYRRRRK',
      'KRRRRYYYYRRRRK','KRRRRRRRRRRRRK','.KRRRRRRRRRRK.','.KRRRRRRRRRRK.',
      '..KBBKKKKBBK..','..KKKK..KKKK..'
    ]
  },

  ludwig: {
    palette: { K: '#000000', B: '#2f6fed', T: '#e8c07a', O: '#e8871f', C: '#f6e3b4' },
    rows: [
      '...KKK....KKK...','..KBBBK..KBBBK..','.KBBBBBKKBBBBBK.','.KBBBBBBBBBBBBK.',
      '..KBBBBBBBBBBK..','...KTTTTTTTTK...','..KTTKKTTKKTTK..','..KTTTTTTTTTTK..',
      '..KTTKKKKKTTTK..','...KKTTTTTTKK...','.KOOKKKKKKKKOOK.','KOOKCCCCCCCKOOK.',
      'KOOKCOOOOOCKOOK.','KOOKCOOOOOCKOOK.','.KKKCCOOOCCKKK..','...KCCCCCCCK....',
      '...KCCCCCCCK....','...KKCCCCCKK....','....KTTKTTK.....','....KTTKTTK.....',
      '...KOOKKOOKK....','...KKKK.KKKK....'
    ]
  },

  morton: {
    palette: { K: '#000000', D: '#4a4a55', W: '#ffffff', E: '#1b1b2e', O: '#e8871f', C: '#f6e3b4' },
    rows: [
      '......KKKKKK......','....KKDDDDDDKK....','...KDDDDDDDDDDK...','...KDDWWDDWWDDK...',
      '...KDDWEDDWEDDK...','...KDDDDDDDDDDK...','..KKOOOOOOOOOOKK..','..KOOKKKKKKKKOOK..',
      '..KOOOOOOOOOOOOK..','...KKOOOOOOOOKK...','.KDDKKKKKKKKKKDDK.','KDDKCCCCCCCCCCKDDK',
      'KDDKCOOOOOOOOCKDDK','KDDKCOOOOOOOOCKDDK','.KKKCCOOOOOOCCKKK.','...KCCCCCCCCCCK...',
      '...KCCCCCCCCCCK...','....KKCCCCCCKK....','.....KDDKKDDK.....','.....KDDKKDDK.....',
      '....KOOOKKOOOK....','....KKKKK.KKKK....'
    ]
  },

  bowser: {
    palette: { K: '#000000', O: '#e8871f', G: '#3fb950', W: '#f6f2e2' },
    rows: [
      '..........KKKK......',
      '.........KOOOOK.....',
      '........KOWWOOK.....',
      '.......KOOOOOOK.....',
      '......KKOOOOOOKK....',
      '.....KWWOOOOOOWK....',
      '.....KKKOOOKKOOK....',
      '....KWWKOOOOOOK.....',
      '...KGGKKOOOOOKK.....',
      '..KGGGGKOOOOOK......',
      '.KGGWWGGKOOOOK......',
      'KGGWWWWGGKOOOK......',
      'KGGWWWWGGKOOOOK.....',
      'KGGGWWGGGKOOOOK.....',
      '.KGGGGGGKKOOOK......',
      '..KKGGKKKOOOK.......',
      '....KKKKOOOOK.......',
      '.......KOOKOOK......',
      '......KOOKKOOK......',
      '......KWWKKWWK......',
      '......KKKK.KKKK.....'
    ]
  }
};


/* Rasterizado y dibujo de sprites — se añade a RID.Avatar --------------- */
(function () {

  var cache = {};

  /* Convierte la rejilla en un lienzo 1 píxel = 1 celda (una sola vez) */
  function raster(name) {
    if (cache[name]) return cache[name];
    var def = RID.DATA.sprites[name];
    if (!def) return null;

    var w = def.rows[0].length, h = def.rows.length;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d');

    for (var y = 0; y < h; y++) {
      var row = def.rows[y];
      for (var x = 0; x < w; x++) {
        var ch = row.charAt(x);
        if (ch === '.') continue;
        c.fillStyle = def.palette[ch] || '#ff00ff';
        c.fillRect(x, y, 1, 1);
      }
    }
    cache[name] = { canvas: cv, w: w, h: h };
    return cache[name];
  }

  /* Silueta negra del mismo sprite (para sombras y apariciones) */
  function rasterSilhouette(name) {
    var key = name + ':sil';
    if (cache[key]) return cache[key];
    var src = raster(name);
    if (!src) return null;

    var cv = document.createElement('canvas');
    cv.width = src.w; cv.height = src.h;
    var c = cv.getContext('2d');
    c.drawImage(src.canvas, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#000000';
    c.fillRect(0, 0, src.w, src.h);

    cache[key] = { canvas: cv, w: src.w, h: src.h };
    return cache[key];
  }

  /* Silueta negra de una imagen aportada por el usuario */
  function tintImage(name, img) {
    var key = 'pic:' + name;
    if (cache[key]) return cache[key];
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    var c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#000000';
    c.fillRect(0, 0, cv.width, cv.height);
    cache[key] = { canvas: cv, w: cv.width, h: cv.height };
    return cache[key];
  }

  /* x,y = centro de la BASE del sprite (los pies).
     opts: { flip, alpha, silhouette }
     Si el usuario aportó img/<nombre>.png se dibuja esa imagen; si no, el
     pixel art. La ALTURA en pantalla es la misma en ambos casos, así que
     ninguna escena hay que retocarla. */
  function drawSprite(ctx, name, x, y, scale, opts) {
    opts = opts || {};
    var k = scale || 1;
    var grid = raster(name);
    if (!grid) return;

    var pic = RID.Assets.img('char.' + name);
    var src, w, h;

    if (pic && pic.naturalWidth) {
      src = opts.silhouette ? tintImage(name, pic) : { canvas: pic, w: pic.naturalWidth, h: pic.naturalHeight };
      h = grid.h * k;                       // misma altura que el pixel art
      w = h * (src.w / src.h);              // ancho según la proporción real
    } else {
      src = opts.silhouette ? rasterSilhouette(name) : grid;
      if (!src) return;
      w = src.w * k;
      h = src.h * k;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = !pic ? false : true;
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.translate(x - w / 2, y - h);
    if (opts.flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src.canvas, 0, 0, src.w, src.h, 0, 0, w, h);
    ctx.restore();
  }

  function spriteSize(name, scale) {
    var g = raster(name);
    if (!g) return { w: 0, h: 0 };
    var k = scale || 1, h = g.h * k;
    var pic = RID.Assets.img('char.' + name);
    if (pic && pic.naturalWidth) return { w: h * (pic.naturalWidth / pic.naturalHeight), h: h };
    return { w: g.w * k, h: h };
  }

  RID.Avatar.drawSprite = drawSprite;
  RID.Avatar.spriteSize = spriteSize;
})();


/* =========================================================================
   PARTE 8 — MECÁNICA 'dodge-run'  (niveles 2 y 3: el pasillo de trampas)
   Corres por el castillo esquivando pinchos, sierras y bolas de fuego con
   las flechas y la barra espaciadora. La energía se gasta al correr y solo
   se recarga en los cristales, respondiendo una pregunta con 1 minuto.
   El nivel 3 recorre EL MISMO pasillo en sentido contrario (dir: -1).
   ========================================================================= */

RID.Levels.register('dodge-run', (function () {

  var GROUND  = 452;
  var CEIL    = 96;
  var GRAVITY = 2000;
  var SPEED   = 250;
  var SLOW    = 96;          // velocidad sin energía
  var JUMP_V  = 640;
  var LENGTH  = 4600;
  var IDLE_DRAIN = 0.55;     // la antorcha se consume aunque estés quieto

  var api, cfg, S;

  /* ---------- construcción del pasillo ---------- */
  function buildLayout(stationCount) {
    var stations = [], traps = [], i, x;

    for (i = 0; i < stationCount; i++) {
      stations.push({ x: 560 + i * 780, done: false, lit: 0, index: i });
    }

    var kinds = cfg.canDuck
      ? ['spike', 'blade', 'saw', 'fire', 'blade', 'spike', 'saw', 'blade', 'fire']
      : ['spike', 'saw', 'fire', 'spike', 'fire', 'saw', 'spike'];
    x = 340;
    var prev = null;
    while (x < LENGTH - 340) {
      var kind = kinds[traps.length % kinds.length];
      var near = false;
      for (i = 0; i < stations.length; i++) {
        if (Math.abs(stations[i].x - x) < 120) { near = true; break; }
      }
      if (!near) { traps.push(makeTrap(kind, x, traps.length)); prev = kind; }

      /* hueco para reaccionar: más aún al pasar de agacharse a saltar */
      var gap = 210 + (traps.length % 4) * 50;
      if (kind === 'blade' || prev === 'blade') gap += 110;
      if (kind === 'saw') gap += 60;
      x += gap;
    }
    return { stations: stations, traps: traps };
  }

  function makeTrap(kind, x, n) {
    if (kind === 'saw') {
      /* el recorrido de la sierra tiene que caber dentro de un salto */
      var sweep = cfg.canDuck ? 44 : 62;
      return { kind: 'saw', x: x, x0: x - sweep, x1: x + sweep, cx: x,
               dir: (n % 2) ? 1 : -1, spin: 0, speed: cfg.canDuck ? 78 : 96 };
    }
    if (kind === 'fire') {
      /* alturas escalonadas para que no caigan todas a la vez */
      return { kind: 'fire', x: x, y: CEIL + 10 + (n % 5) * 74 };
    }
    if (kind === 'blade') {
      return { kind: 'blade', x: x, w: 66, spin: 0 };
    }
    return { kind: 'spike', x: x, w: 48 };
  }

  /* Caja de colisión de cada trampa */
  function trapBox(tr) {
    if (tr.kind === 'spike') return { x: tr.x, y: GROUND - 26, w: tr.w, h: 26 };
    if (tr.kind === 'saw')   return { x: tr.cx - 21, y: GROUND - 42, w: 42, h: 42 };
    /* cuchilla a la altura de la cabeza: solo se pasa AGACHADO */
    if (tr.kind === 'blade') return { x: tr.x, y: GROUND - 80, w: 66, h: 44 };
    return { x: tr.x - 13, y: tr.y - 13, w: 26, h: 26 };
  }

  function playerBox(p) {
    var h = (S && S.duck) ? 24 : 44;
    return { x: p.x - 11, y: p.y - h, w: 22, h: h };
  }

  /* ¿ya pasó el jugador este punto, según el sentido de la marcha? */
  function reached(p, objX) {
    return cfg.dir > 0 ? (p.x >= objX) : (p.x <= objX);
  }

  return {

    init: function (a, c) {
      api = a; cfg = c;
      var layout = buildLayout(cfg.stations);

      S = {
        stations: layout.stations,
        traps: layout.traps,
        cam: 0,
        t: 0,
        energy: 100,
        answered: 0,
        coins: 0,
        phase: 'play',
        warned: false,
        queue: api.deck(cfg.category, cfg.stations),
        player: {
          x: cfg.dir > 0 ? 90 : LENGTH - 90,
          y: GROUND, vx: 0, vy: 0, onGround: true, face: cfg.dir,
          spawnX: cfg.dir > 0 ? 90 : LENGTH - 90
        },
        exitX: cfg.dir > 0 ? LENGTH - 110 : 110
      };

      api.objective('CRYSTAL 0/' + cfg.stations);
      api.gauge('energy', 100);
    },

    start: function () {
      api.toast('Run! Recharge at every crystal', 'coin');
    },

    update: function (dt) {
      if (!S || S.phase === 'dead') return;
      S.t += dt;
      var p = S.player, i;

      /* --- trampas en movimiento --- */
      for (i = 0; i < S.traps.length; i++) {
        var tr = S.traps[i];
        if (tr.kind === 'saw') {
          tr.cx += tr.dir * (tr.speed || 96) * dt;
          if (tr.cx < tr.x0) { tr.cx = tr.x0; tr.dir = 1; }
          if (tr.cx > tr.x1) { tr.cx = tr.x1; tr.dir = -1; }
          tr.spin += dt * 9;
        } else if (tr.kind === 'fire') {
          tr.y += 470 * dt;
          if (tr.y > GROUND + 10) tr.y = CEIL + 10;
        } else if (tr.kind === 'blade') {
          tr.spin += dt * 11;
        }
      }

      /* --- movimiento --- */
      var move = 0;
      if (api.input.isDown('left'))  move -= 1;
      if (api.input.isDown('right')) move += 1;
      if (move) p.face = move;

      /* Dos formas de gastar energía:
         · sin jumpCost -> se consume con el tiempo al correr (niveles 2 y 3)
         · con jumpCost -> cada SALTO cuesta energía (nivel 10)            */
      var byJump = !!cfg.jumpCost;
      var out = !byJump && S.energy <= 0;
      p.vx = move * (out ? SLOW : SPEED) * (S.duck ? 0.5 : 1);

      if (api.input.pressed('action') && p.onGround) {
        if (byJump && S.energy < cfg.jumpCost) {
          api.toast('No energy to jump — reach a crystal', 'bad');
        } else {
          if (byJump) {
            S.energy = Math.max(0, S.energy - cfg.jumpCost);
            api.gauge('energy', S.energy);
          }
          p.vy = -(out ? JUMP_V * 0.62 : JUMP_V) * RID.state.upgrades.jumpBoost;
          p.onGround = false;
          api.sfx('sfx.jump');
          RID.FX.particles('dust', p.x - S.cam, GROUND, 6);
        }
      }

      p.vy += GRAVITY * dt;
      p.x = U.clamp(p.x + p.vx * dt, 30, LENGTH - 30);
      p.y += p.vy * dt;
      if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true; }

      /* --- energía por tiempo (solo si no se gasta por salto) --- */
      if (!byJump) {
        var drain = IDLE_DRAIN + (move ? cfg.drain : 0);
        S.energy = U.clamp(S.energy - drain * RID.state.upgrades.gaugeDrain * dt, 0, 100);
        api.gauge('energy', S.energy);
      }

      if (S.energy <= 0 && !S.warned) {
        S.warned = true;
        api.toast('No energy! Reach the next crystal', 'bad');
      } else if (S.energy > 20) {
        S.warned = false;
      }

      /* --- cristales de energía --- */
      for (i = 0; i < S.stations.length; i++) {
        var st = S.stations[i];
        if (st.done) { st.lit = Math.min(1, st.lit + dt * 2); continue; }
        if (Math.abs(p.x - st.x) < 46) { askStation(st); return; }
      }

      /* --- choque con trampa --- */
      var pb = playerBox(p);
      for (i = 0; i < S.traps.length; i++) {
        if (U.aabb(pb, trapBox(S.traps[i]))) { hit(); return; }
      }

      /* --- salida --- */
      if (reached(p, S.exitX) && S.answered >= cfg.stations) {
        S.phase = 'done';
        api.sfx('sfx.door');
        api.complete({ coins: S.coins });
        return;
      }

      /* --- cámara --- */
      var target = U.clamp(p.x - CFG.W / 2, 0, Math.max(0, LENGTH - CFG.W));
      S.cam = U.lerp(S.cam, target, Math.min(1, dt * 7));
    },

    render: function (ctx) {
      if (!S) return;
      var cam = S.cam, i, k, x, y;

      /* =========================================================
         CAPA 1 — gran salón al fondo, con vidrieras (parallax .35)
         ========================================================= */
      /* Con imagen de fondo propia solo se oscurece un poco para que el
         juego se lea encima; el decorado dibujado por código se omite. */
      var deco = !api.hasBg;
      if (!deco) { ctx.fillStyle = 'rgba(6,4,16,.30)'; ctx.fillRect(0, 0, CFG.W, CFG.H); }

      if (deco) {
      var farOff = cam * 0.35;
      ctx.fillStyle = '#0f0c1c';
      ctx.fillRect(0, 0, CFG.W, CFG.H);

      ctx.save();
      ctx.translate(-farOff, 0);
      var f0 = Math.floor(farOff / 430) * 430;
      for (x = f0; x < farOff + CFG.W + 430; x += 430) {
        /* hornacina con arco */
        ctx.fillStyle = '#181430';
        ctx.beginPath();
        ctx.moveTo(x + 60, GROUND);
        ctx.lineTo(x + 60, 170);
        ctx.quadraticCurveTo(x + 150, 62, x + 240, 170);
        ctx.lineTo(x + 240, GROUND);
        ctx.closePath(); ctx.fill();

        /* vidriera */
        var vg = ctx.createLinearGradient(0, 96, 0, 330);
        vg.addColorStop(0,   'rgba(126,200,255,.55)');
        vg.addColorStop(0.5, 'rgba(224,90,122,.45)');
        vg.addColorStop(1,   'rgba(60,30,80,.25)');
        ctx.fillStyle = vg;
        ctx.beginPath();
        ctx.moveTo(x + 82, 336);
        ctx.lineTo(x + 82, 176);
        ctx.quadraticCurveTo(x + 150, 86, x + 218, 176);
        ctx.lineTo(x + 218, 336);
        ctx.closePath(); ctx.fill();

        /* plomos de la vidriera */
        ctx.strokeStyle = 'rgba(10,8,22,.75)';
        ctx.lineWidth = 3;
        for (k = 1; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(x + 82 + k * 34, 336);
          ctx.lineTo(x + 82 + k * 34, 130);
          ctx.stroke();
        }
        for (k = 1; k < 5; k++) {
          ctx.beginPath();
          ctx.moveTo(x + 82, 130 + k * 42);
          ctx.lineTo(x + 218, 130 + k * 42);
          ctx.stroke();
        }
        /* haz de luz que entra por la vidriera */
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var lb = ctx.createLinearGradient(x + 150, 130, x + 150, GROUND);
        lb.addColorStop(0, 'rgba(180,200,255,.10)');
        lb.addColorStop(1, 'rgba(180,200,255,0)');
        ctx.fillStyle = lb;
        ctx.beginPath();
        ctx.moveTo(x + 84, 150); ctx.lineTo(x + 216, 150);
        ctx.lineTo(x + 268, GROUND); ctx.lineTo(x + 32, GROUND);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      }

      /* =========================================================
         CAPA 2 — el pasillo en sí
         ========================================================= */
      ctx.save();
      ctx.translate(-cam, 0);

      if (deco) {
      /* --- sillería de piedra --- */
      var bw = 78, bh = 40;
      var b0 = Math.floor(cam / bw) * bw - bw;
      for (y = CEIL; y < GROUND; y += bh) {
        var row = Math.floor((y - CEIL) / bh);
        for (x = b0; x < cam + CFG.W + bw; x += bw) {
          var off = (row % 2) ? bw / 2 : 0;
          /* variación determinista para que no parezca un patrón plano */
          var v = ((Math.abs(Math.floor(x + off)) * 7919 + row * 104729) % 17) - 8;
          ctx.fillStyle = 'rgb(' + (58 + v) + ',' + (52 + v) + ',' + (92 + v) + ')';
          ctx.fillRect(x + off, y, bw - 4, bh - 4);
          /* desgaste en la parte inferior del sillar */
          ctx.fillStyle = 'rgba(0,0,0,.16)';
          ctx.fillRect(x + off, y + bh - 9, bw - 4, 5);
        }
      }
      /* humedad y musgo en la base del muro */
      ctx.fillStyle = 'rgba(40,90,60,.20)';
      for (x = b0; x < cam + CFG.W + bw; x += 46) {
        var mh = 16 + ((Math.abs(Math.floor(x)) * 31) % 26);
        ctx.fillRect(x, GROUND - mh, 40, mh);
      }

      /* --- bóveda del techo --- */
      ctx.fillStyle = '#120f22';
      ctx.fillRect(cam, 0, CFG.W, CEIL);
      var a0 = Math.floor(cam / 200) * 200;
      for (x = a0; x < cam + CFG.W + 200; x += 200) {
        ctx.strokeStyle = '#2a2444';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(x, CEIL);
        ctx.quadraticCurveTo(x + 100, CEIL - 58, x + 200, CEIL);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(120,110,180,.22)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = '#1c1832';
      ctx.fillRect(cam, CEIL - 6, CFG.W, 8);

      /* --- columnas con capitel y basa --- */
      var c0 = Math.floor(cam / 340) * 340;
      for (x = c0; x < cam + CFG.W + 340; x += 340) {
        var cxp = x + 40;
        ctx.fillStyle = '#4e4678';
        ctx.fillRect(cxp, CEIL, 30, GROUND - CEIL);
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        ctx.fillRect(cxp + 4, CEIL, 6, GROUND - CEIL);
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        ctx.fillRect(cxp + 22, CEIL, 8, GROUND - CEIL);
        ctx.fillStyle = '#6a5f9c';
        ctx.fillRect(cxp - 7, CEIL, 44, 18);
        ctx.fillRect(cxp - 7, GROUND - 20, 44, 20);
        ctx.fillStyle = '#7d71b4';
        ctx.fillRect(cxp - 10, CEIL - 6, 50, 8);
        ctx.fillRect(cxp - 10, GROUND - 26, 50, 7);

        /* estandarte de Bowser entre columnas */
        var bx = x + 190;
        ctx.fillStyle = '#7a1020';
        ctx.beginPath();
        ctx.moveTo(bx, CEIL + 6);
        ctx.lineTo(bx + 54, CEIL + 6);
        ctx.lineTo(bx + 54, CEIL + 104);
        ctx.lineTo(bx + 27, CEIL + 88);
        ctx.lineTo(bx, CEIL + 104);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a3162c';
        ctx.fillRect(bx + 6, CEIL + 6, 6, 84);
        ctx.fillStyle = '#e8871f';
        ctx.beginPath(); ctx.arc(bx + 27, CEIL + 46, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b1d10';
        ctx.beginPath(); ctx.arc(bx + 22, CEIL + 42, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + 33, CEIL + 42, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(bx + 20, CEIL + 52, 15, 4);
      }

      /* --- antorchas con llama viva --- */
      var t0 = Math.floor(cam / 260) * 260;
      for (x = t0; x < cam + CFG.W + 260; x += 260) {
        var tx = x + 130, ty = CEIL + 96;
        var flick = Math.sin(S.t * 11 + x) * 0.5 + Math.sin(S.t * 7 + x * 0.3) * 0.5;

        ctx.fillStyle = '#3a2a18';
        ctx.fillRect(tx - 4, ty, 8, 30);
        ctx.fillStyle = '#5a4a35';
        ctx.fillRect(tx - 9, ty - 6, 18, 8);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var fg = ctx.createRadialGradient(tx, ty - 12, 2, tx, ty - 12, 130 + flick * 10);
        fg.addColorStop(0,   'rgba(255,214,140,.32)');
        fg.addColorStop(0.35,'rgba(255,150,50,.14)');
        fg.addColorStop(1,   'rgba(255,120,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(tx, ty - 12, 130, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#ffb020';
        ctx.beginPath();
        ctx.moveTo(tx - 8, ty - 6);
        ctx.quadraticCurveTo(tx - 3, ty - 26 - flick * 6, tx, ty - 34 - flick * 8);
        ctx.quadraticCurveTo(tx + 3, ty - 26 - flick * 6, tx + 8, ty - 6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe98a';
        ctx.beginPath();
        ctx.moveTo(tx - 4, ty - 8);
        ctx.quadraticCurveTo(tx, ty - 20 - flick * 5, tx + 4, ty - 8);
        ctx.closePath(); ctx.fill();

        /* charco de luz en el suelo */
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,170,60,.07)';
        U.ellipse(ctx, tx, GROUND + 14, 96 + flick * 6, 16); ctx.fill();
        ctx.restore();
      }

      /* --- candelabros colgando --- */
      var h0 = Math.floor(cam / 520) * 520;
      for (x = h0; x < cam + CFG.W + 520; x += 520) {
        var hx = x + 260, sway = Math.sin(S.t * 1.3 + x) * 3;
        ctx.strokeStyle = '#3a3358'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx + sway, CEIL + 42); ctx.stroke();
        ctx.fillStyle = '#6a5f9c';
        ctx.fillRect(hx - 34 + sway, CEIL + 42, 68, 7);
        for (k = -1; k <= 1; k++) {
          var kx = hx + sway + k * 26;
          ctx.fillStyle = '#e8e2c8';
          ctx.fillRect(kx - 3, CEIL + 30, 6, 14);
          ctx.fillStyle = '#ffcf6a';
          ctx.beginPath();
          ctx.moveTo(kx - 3, CEIL + 30);
          ctx.quadraticCurveTo(kx, CEIL + 18 + Math.sin(S.t * 9 + k) * 2, kx + 3, CEIL + 30);
          ctx.closePath(); ctx.fill();
        }
      }
      }

      /* --- suelo de losas + alfombra --- */
      ctx.fillStyle = '#3b3560';
      ctx.fillRect(cam, GROUND, CFG.W, CFG.H - GROUND);
      ctx.fillStyle = '#6a5f9c';
      ctx.fillRect(cam, GROUND, CFG.W, 7);
      ctx.fillStyle = 'rgba(0,0,0,.30)';
      for (x = Math.floor(cam / 64) * 64; x < cam + CFG.W + 64; x += 64) {
        ctx.fillRect(x, GROUND + 7, 3, CFG.H - GROUND);
      }
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.fillRect(cam, GROUND + 7, CFG.W, 3);

      ctx.fillStyle = '#6e1626';
      ctx.fillRect(cam, GROUND + 16, CFG.W, 32);
      ctx.fillStyle = '#9c2135';
      ctx.fillRect(cam, GROUND + 20, CFG.W, 22);
      ctx.fillStyle = '#d4a017';
      ctx.fillRect(cam, GROUND + 18, CFG.W, 3);
      ctx.fillRect(cam, GROUND + 43, CFG.W, 3);
      ctx.fillStyle = 'rgba(212,160,23,.5)';
      for (x = Math.floor(cam / 56) * 56; x < cam + CFG.W + 56; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x + 28, GROUND + 24);
        ctx.lineTo(x + 36, GROUND + 31);
        ctx.lineTo(x + 28, GROUND + 38);
        ctx.lineTo(x + 20, GROUND + 31);
        ctx.closePath(); ctx.fill();
      }

      /* --- cristales de energía --- */
      for (i = 0; i < S.stations.length; i++) {
        var st = S.stations[i];
        if (st.x < cam - 90 || st.x > cam + CFG.W + 90) continue;
        var pulse = 0.6 + 0.4 * Math.sin(S.t * 3 + i);

        ctx.fillStyle = '#2b2547';
        ctx.fillRect(st.x - 20, GROUND - 30, 40, 30);
        ctx.fillStyle = '#4e4678';
        ctx.fillRect(st.x - 24, GROUND - 34, 48, 8);

        ctx.save();
        ctx.translate(st.x, GROUND - 66);
        ctx.rotate(S.t * 1.4);
        ctx.fillStyle = st.done ? '#4ade80' : '#5eb3ff';
        ctx.globalAlpha = st.done ? 1 : pulse;
        ctx.beginPath();
        ctx.moveTo(0, -24); ctx.lineTo(16, 0); ctx.lineTo(0, 24); ctx.lineTo(-16, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var gl = ctx.createRadialGradient(st.x, GROUND - 66, 0, st.x, GROUND - 66, 80);
        gl.addColorStop(0, st.done ? 'rgba(80,240,150,.30)' : 'rgba(90,180,255,' + (0.20 * pulse) + ')');
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(st.x, GROUND - 66, 80, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      /* --- trampas --- */
      for (i = 0; i < S.traps.length; i++) {
        var tr = S.traps[i];
        if (tr.x < cam - 140 || tr.x > cam + CFG.W + 140) continue;

        if (tr.kind === 'spike') {
          ctx.fillStyle = '#59524a';
          ctx.fillRect(tr.x - 4, GROUND - 6, tr.w + 8, 8);
          for (k = 0; k < 4; k++) {
            var sx = tr.x + k * 12;
            var grd = ctx.createLinearGradient(sx, GROUND, sx, GROUND - 28);
            grd.addColorStop(0, '#8d92a6'); grd.addColorStop(1, '#eef1f8');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.moveTo(sx, GROUND);
            ctx.lineTo(sx + 6, GROUND - 28);
            ctx.lineTo(sx + 12, GROUND);
            ctx.closePath(); ctx.fill();
          }

        } else if (tr.kind === 'saw') {
          ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(tr.x0, GROUND - 2); ctx.lineTo(tr.x1, GROUND - 2); ctx.stroke();
          ctx.save();
          ctx.translate(tr.cx, GROUND - 21);
          ctx.rotate(tr.spin);
          ctx.fillStyle = '#cfd3df';
          for (k = 0; k < 8; k++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(-6, -20); ctx.lineTo(0, -30); ctx.lineTo(6, -20);
            ctx.closePath(); ctx.fill();
          }
          var sg = ctx.createRadialGradient(-6, -6, 2, 0, 0, 21);
          sg.addColorStop(0, '#eef1f8'); sg.addColorStop(1, '#767b8f');
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2a2440';
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
          ctx.restore();

        } else if (tr.kind === 'blade') {
          /* cuchilla giratoria a la altura de la cabeza */
          ctx.fillStyle = '#4a4270';
          ctx.fillRect(tr.x + 28, GROUND - 132, 10, 54);
          ctx.save();
          ctx.translate(tr.x + 33, GROUND - 58);
          ctx.rotate(tr.spin);
          ctx.fillStyle = '#cfd3df';
          for (k = 0; k < 6; k++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(-9, -20); ctx.lineTo(0, -34); ctx.lineTo(9, -20);
            ctx.closePath(); ctx.fill();
          }
          var bg2 = ctx.createRadialGradient(-6, -6, 2, 0, 0, 22);
          bg2.addColorStop(0, '#eef1f8'); bg2.addColorStop(1, '#767b8f');
          ctx.fillStyle = bg2;
          ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2a2440';
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
          ctx.restore();

        } else {
          ctx.fillStyle = '#3a2a18';
          ctx.fillRect(tr.x - 15, CEIL - 4, 30, 10);
          ctx.fillStyle = '#5a4a35';
          ctx.fillRect(tr.x - 19, CEIL + 4, 38, 6);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          var trail = ctx.createLinearGradient(tr.x, tr.y - 46, tr.x, tr.y);
          trail.addColorStop(0, 'rgba(255,120,0,0)');
          trail.addColorStop(1, 'rgba(255,150,40,.35)');
          ctx.fillStyle = trail;
          ctx.fillRect(tr.x - 7, tr.y - 46, 14, 46);
          ctx.restore();
          var fgd = ctx.createRadialGradient(tr.x, tr.y, 2, tr.x, tr.y, 22);
          fgd.addColorStop(0, '#fff3b0');
          fgd.addColorStop(0.42, '#ff9f1a');
          fgd.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.fillStyle = fgd;
          ctx.beginPath(); ctx.arc(tr.x, tr.y, 22, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath(); ctx.arc(tr.x, tr.y, 7, 0, Math.PI * 2); ctx.fill();
        }
      }

      /* --- portón de salida --- */
      var open = S.answered >= cfg.stations;
      var dx = S.exitX;
      ctx.fillStyle = '#241c3c';
      ctx.beginPath();
      ctx.moveTo(dx - 48, GROUND);
      ctx.lineTo(dx - 48, GROUND - 96);
      ctx.quadraticCurveTo(dx, GROUND - 168, dx + 48, GROUND - 96);
      ctx.lineTo(dx + 48, GROUND);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = open ? '#8a5a1e' : '#3a3358';
      ctx.beginPath();
      ctx.moveTo(dx - 38, GROUND);
      ctx.lineTo(dx - 38, GROUND - 92);
      ctx.quadraticCurveTo(dx, GROUND - 154, dx + 38, GROUND - 92);
      ctx.lineTo(dx + 38, GROUND);
      ctx.closePath(); ctx.fill();

      ctx.strokeStyle = open ? '#d4a017' : '#5a5f7a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(dx, GROUND); ctx.lineTo(dx, GROUND - 128); ctx.stroke();
      ctx.fillStyle = open ? '#d4a017' : '#5a5f7a';
      for (k = 0; k < 4; k++) {
        ctx.fillRect(dx - 34, GROUND - 24 - k * 26, 68, 5);
        ctx.beginPath(); ctx.arc(dx - 24, GROUND - 34 - k * 26, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 24, GROUND - 34 - k * 26, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      if (open) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var dg = ctx.createRadialGradient(dx, GROUND - 70, 4, dx, GROUND - 70, 120);
        dg.addColorStop(0, 'rgba(255,214,120,.28)');
        dg.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(dx, GROUND - 70, 120, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      U.pixelText(ctx, open ? 'EXIT' : 'LOCKED', dx, GROUND - 178, 16,
                  open ? '#ffd447' : '#8a8fa8');

      /* --- jugador --- */
      if (!RID.FX.isBusy()) {
        var pose = !S.player.onGround ? 'jump' : (S.player.vx ? 'run' : 'idle');
        ctx.save();
        if (S.player.face < 0) { ctx.translate(S.player.x * 2, 0); ctx.scale(-1, 1); }
        RID.Avatar.drawPlayer(ctx, S.player.x, S.player.y, 1.55, pose, S.t);
        ctx.restore();
      }

      ctx.restore();

      /* =========================================================
         CAPA 3 — columnas en primer plano y polvo en suspensión
         ========================================================= */
      if (deco) {
      ctx.save();
      ctx.translate(-cam * 1.28, 0);
      var p0 = Math.floor(cam * 1.28 / 700) * 700;
      for (x = p0; x < cam * 1.28 + CFG.W + 700; x += 700) {
        ctx.fillStyle = 'rgba(8,6,18,.72)';
        ctx.fillRect(x, 0, 46, CFG.H);
        ctx.fillStyle = 'rgba(30,24,56,.72)';
        ctx.fillRect(x + 40, 0, 8, CFG.H);
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(255,225,170,.30)';
      for (i = 0; i < 26; i++) {
        var px = (i * 137 + S.t * 12) % (CFG.W + 60) - 30;
        var py = (i * 53 + Math.sin(S.t * 0.7 + i) * 26 + 120) % (GROUND - 110) + 100;
        ctx.fillRect(px, py, 2, 2);
      }
      }

      /* viñeta */
      var vgn = ctx.createRadialGradient(CFG.W / 2, CFG.H / 2, CFG.H * 0.42,
                                         CFG.W / 2, CFG.H / 2, CFG.H * 0.95);
      vgn.addColorStop(0, 'rgba(0,0,0,0)');
      vgn.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = vgn;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
    },

    destroy: function () { S = null; }
  };

  /* ---------- acciones internas ---------- */
  function askStation(st) {
    S.phase = 'question';
    S.player.vx = 0;

    var q = S.queue.shift() || api.deck(cfg.category, 1)[0];
    if (!q) { st.done = true; S.phase = 'play'; return; }

    RID.Questions.ask(q, {
      counter: (S.answered + 1) + '/' + cfg.stations,
      seconds: cfg.seconds,
      allowHint: true,
      onEnd: function (res) {
        st.done = true;
        S.answered++;
        S.player.spawnX = st.x;
        api.objective('CRYSTAL ' + S.answered + '/' + cfg.stations);
        RID.FX.particles(res.correct ? 'star' : 'smoke', st.x - S.cam, GROUND - 66, 16);

        if (res.correct) {
          S.energy = 100;
          S.coins += cfg.coinsPerCorrect;
          api.coins(cfg.coinsPerCorrect);
          api.gauge('energy', S.energy);
          S.phase = 'play';
          return;
        }

        /* fallar la pregunta también cuesta una huella */
        S.energy = Math.max(S.energy, 40);      // recarga parcial: puedes seguir
        api.gauge('energy', S.energy);
        api.toast('Wrong answer — one paw lost!', 'bad');
        wrongPenalty(st);
      }
    });
  }

  /* Penalización por respuesta incorrecta: pierde una vida y vuelve al cristal */
  function wrongPenalty(st) {
    S.phase = 'dead';
    api.loseLife(S.player.x - S.cam, S.player.y - 20, function () {
      if (!S) return;
      S.player.x  = st.x;
      S.player.y  = GROUND;
      S.player.vx = 0;
      S.player.vy = 0;
      S.phase = 'play';
    });
  }

  function fall() {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    api.toast('You fell!', 'bad');
    api.loseLife(S.player.x - S.cam, CFG.H - 150, function () {
      if (!S) return;
      S.player.x  = S.player.spawnX;
      S.player.y  = GROUND - 40;
      S.player.vx = 0; S.player.vy = 0;
      S.phase = 'play';
    });
  }

  function hit() {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    api.loseLife(S.player.x - S.cam, S.player.y - 20, function () {
      if (!S) return;
      S.player.x  = S.player.spawnX;
      S.player.y  = GROUND;
      S.player.vx = 0;
      S.player.vy = 0;
      S.energy    = Math.max(S.energy, 55);
      api.gauge('energy', S.energy);
      S.phase = 'play';
    });
  }
})());


/* =========================================================================
   PARTE 9.1 — DATA.map
   19 paradas = niveles 2 a 20. El nivel 1 es la introducción por la
   alcantarilla y no aparece en el mapa. El recorrido serpentea en 4 filas
   sobre el lienzo de 900x380.
   ========================================================================= */

RID.DATA.map = (function () {
  var nodes = [], rows = [
    { levels: [2, 3, 4, 5, 6],     y: 58,  dir:  1 },
    { levels: [7, 8, 9, 10],       y: 152, dir: -1 },
    { levels: [11, 12, 13, 14, 15], y: 246, dir:  1 },
    { levels: [16, 17, 18, 19, 20], y: 336, dir: -1 }
  ];
  var X0 = 84, STEP = 184;

  rows.forEach(function (row) {
    row.levels.forEach(function (lvl, i) {
      var slot = (row.dir > 0) ? i : (row.levels.length - 1 - i);
      nodes.push({ level: lvl, x: X0 + slot * STEP, y: row.y });
    });
  });
  return nodes;
})();


/* =========================================================================
   PARTE 9.2 — RID.Map   (mapa estilo Super Mario Bros 3)
   Se puede volver atrás a cualquier parada ya desbloqueada.
   ========================================================================= */

RID.Map = (function () {

  var WORLD_COLOR = ['#4fbf5a', '#2fb39a', '#9a6a34', '#e0a83c', '#d8422e'];
  var cursor = 0, raf = 0, t0 = 0, tNow = 0, wired = false;

  function nodes() { return RID.DATA.map; }

  function indexOfLevel(lvl) {
    var list = nodes();
    for (var i = 0; i < list.length; i++) if (list[i].level === lvl) return i;
    return 0;
  }

  function isOpen(i) {
    var n = nodes()[i];
    return !!n && RID.Progress.isUnlocked(n.level);
  }

  /* Nombre visible de una parada */
  function labelOf(lvl) {
    var d = RID.Levels.definition(lvl);
    if (!RID.Progress.isUnlocked(lvl)) return 'Level ' + lvl + ' — locked';

    var r = RID.Progress.resultOf(lvl);
    if (r) {
      return 'Level ' + lvl + ' — ' + (d ? RID.Levels.levelName(d) : '') +
             '  ·  ' + r.c + '/' + r.t + '  ' + RID.UI.t(r.ok ? 'passed' : 'failed');
    }
    if (!d) return 'Level ' + lvl + ' — coming soon';
    return 'Level ' + lvl + ' — ' + RID.Levels.levelName(d);
  }

  function refreshLabel() {
    var n = nodes()[cursor];
    if (!n) return;
    U.el('#map-node-label').textContent = labelOf(n.level);
    U.el('#map-enter').disabled = !(RID.Progress.canEnter(n.level) && RID.Levels.exists(n.level));
  }

  /* ---------- navegación ---------- */
  function move(step) {
    var list = nodes(), i = cursor;
    while (true) {
      i += step;
      if (i < 0 || i >= list.length) return;
      if (isOpen(i)) { cursor = i; break; }
    }
    RID.Audio.sfx('sfx.jump');
    refreshLabel();
  }

  function enter() {
    var n = nodes()[cursor];
    if (!n) return;
    if (RID.Progress.isAttempted(n.level)) {
      RID.UI.toast(RID.UI.t('alreadyPlayed'), 'bad');
      return;
    }
    if (!RID.Progress.canEnter(n.level)) { RID.UI.toast('Locked', 'bad'); return; }
    stop();
    RID.Flow.requestLevel(n.level);
  }

  /* ---------- dibujo ---------- */
  function draw() {
    var cv = U.el('#map-canvas'), ctx = cv.getContext('2d');
    var list = nodes(), i, n, prev;

    ctx.clearRect(0, 0, 900, 380);

    /* fondo del pergamino */
    var g = ctx.createLinearGradient(0, 0, 0, 380);
    g.addColorStop(0, 'rgba(14,18,40,.72)');
    g.addColorStop(1, 'rgba(8,10,24,.86)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 900, 380);

    /* camino punteado entre paradas */
    for (i = 1; i < list.length; i++) {
      prev = list[i - 1]; n = list[i];
      var done = RID.Progress.isCleared(prev.level);
      ctx.strokeStyle = done ? 'rgba(255,204,0,.55)' : 'rgba(120,128,180,.30)';
      ctx.lineWidth = 4;
      ctx.setLineDash([7, 9]);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      if (Math.abs(prev.y - n.y) > 4) {
        ctx.quadraticCurveTo(prev.x + (n.x - prev.x) * 0.15, n.y, n.x, n.y);
      } else {
        ctx.lineTo(n.x, n.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* paradas */
    for (i = 0; i < list.length; i++) {
      n = list[i];
      var w        = RID.Progress.worldOf(n.level);
      var unlocked = RID.Progress.isUnlocked(n.level);
      var res      = RID.Progress.resultOf(n.level);
      var cleared  = !!(res && res.ok);
      var failed   = !!(res && !res.ok);
      var shop     = RID.Progress.isShop(n.level);
      var color    = WORLD_COLOR[w - 1];

      /* base */
      ctx.beginPath();
      ctx.arc(n.x, n.y, 21, 0, Math.PI * 2);
      ctx.fillStyle = !unlocked ? '#232840'
                    : cleared   ? '#1d4a2b'
                    : failed    ? '#4a1d20'
                    : shop      ? '#4a3a10' : '#2c3358';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = !unlocked ? '#3a4160'
                      : failed    ? '#ff4d4d'
                      : shop      ? '#ffd447' : color;
      ctx.stroke();

      if (!unlocked) {
        U.pixelText(ctx, '?', n.x, n.y + 1, 17, '#5a6088');
      } else if (shop && !res) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd447'; ctx.fill();
        U.pixelText(ctx, '$', n.x, n.y + 1, 12, '#6b4e00');
      } else {
        U.pixelText(ctx, String(n.level), n.x, n.y + 1, 15,
          cleared ? '#a6f36b' : (failed ? '#ff9b9b' : '#f4f1e8'));
      }

      /* marca de resultado: un intento por nivel */
      if (res) {
        ctx.beginPath();
        ctx.arc(n.x + 16, n.y - 15, 8, 0, Math.PI * 2);
        ctx.fillStyle = cleared ? '#4ade80' : '#ff4d4d'; ctx.fill();
        U.pixelText(ctx, cleared ? '✓' : '✗', n.x + 16, n.y - 14, 11, '#0b0b16');
        U.pixelText(ctx, res.c + '/' + res.t, n.x, n.y + 32, 11, cleared ? '#a6f36b' : '#ff9b9b');
      }
    }

    /* ficha del jugador saltando sobre la parada actual */
    var cn = list[cursor];
    if (cn) {
      var hop = Math.abs(Math.sin(tNow * 3.6)) * 11;
      RID.Avatar.drawPlayer(ctx, cn.x, cn.y - 24 - hop, 0.92, 'idle', tNow);
      ctx.fillStyle = 'rgba(255,204,0,.85)';
      ctx.beginPath();
      ctx.moveTo(cn.x, cn.y - 34 - hop - 26);
      ctx.lineTo(cn.x - 7, cn.y - 44 - hop - 26);
      ctx.lineTo(cn.x + 7, cn.y - 44 - hop - 26);
      ctx.closePath(); ctx.fill();
    }

    /* banda con el nombre del mundo actual */
    if (cn) {
      var wname = RID.Progress.worldName(RID.Progress.worldOf(cn.level));
      ctx.fillStyle = 'rgba(5,6,13,.72)';
      ctx.fillRect(0, 0, 900, 26);
      U.pixelText(ctx, wname.toUpperCase(), 450, 13, 14, WORLD_COLOR[RID.Progress.worldOf(cn.level) - 1]);
    }
  }

  function loop() {
    raf = window.requestAnimationFrame(loop);
    tNow = (U.now() - t0) / 1000;
    draw();
  }

  function stop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }

  /* ---------- apertura ---------- */
  function open(focusLevel) {
    RID.Screens.hideAll();
    RID.Screens.closeAllOverlays();
    RID.Screens.setHUD(false);
    RID.Loop.setScene(null);

    var target = focusLevel || RID.state.run.level || 2;
    cursor = indexOfLevel(target);
    if (!isOpen(cursor)) {
      /* si esa parada no está abierta, se va a la última desbloqueada */
      for (var i = nodes().length - 1; i >= 0; i--) { if (isOpen(i)) { cursor = i; break; } }
    }

    var w = RID.Progress.worldOf(nodes()[cursor].level);
    RID.Screens.setBackground('bg.world' + w);
    RID.Audio.playMusic('music.lobby');
    RID.Screens.show('map');
    refreshLabel();

    stop();
    t0 = U.now();
    loop();
  }

  function wire() {
    if (wired) return;
    wired = true;

    U.on(U.el('#map-enter'), 'click', enter);
    U.on(U.el('#map-lobby'), 'click', function () {
      stop();
      RID.Lobby.open(RID.Progress.worldOf(nodes()[cursor].level));
    });
    U.on(U.el('#map-results'), 'click', function () {
      stop();
      RID.Flow.showResults(function () { open(nodes()[cursor].level); });
    });

    /* teclado */
    RID.Events.on('input:key', function (k) {
      if (RID.Screens.current() !== 'map') return;
      if (k === 'right' || k === 'down') move(1);
      else if (k === 'left' || k === 'up')  move(-1);
      else if (k === 'confirm' || k === 'action') enter();
    });

    /* clic directo sobre una parada */
    U.on(U.el('#map-canvas'), 'click', function (e) {
      var r = this.getBoundingClientRect();
      var mx = (e.clientX - r.left) * (900 / r.width);
      var my = (e.clientY - r.top)  * (380 / r.height);
      var list = nodes();
      for (var i = 0; i < list.length; i++) {
        if (U.dist(mx, my, list[i].x, list[i].y) <= 24) {
          if (!isOpen(i)) { RID.UI.toast('Locked', 'bad'); return; }
          cursor = i;
          refreshLabel();
          RID.Audio.sfx('sfx.jump');
          return;
        }
      }
    });
  }

  return { open: open, wire: wire, stop: stop, move: move, enter: enter,
           isOpen: function () { return RID.Screens.current() === 'map'; } };
})();


/* =========================================================================
   PARTE 9.3 — RID.Lobby   (vestíbulo de cada mundo)
   ========================================================================= */

RID.Lobby = (function () {

  var current = 1, wired = false;

  function card(levelId) {
    var d        = RID.Levels.definition(levelId);
    var unlocked = RID.Progress.isUnlocked(levelId);
    var res      = RID.Progress.resultOf(levelId);
    var shop     = RID.Progress.isShop(levelId);
    var ready    = RID.Levels.exists(levelId);
    var playable = unlocked && ready && !res;

    var cls = 'lvl-card';
    if (res && res.ok) cls += ' is-cleared';
    if (shop) cls += ' is-shop';
    if (!playable) cls += ' is-locked';

    var el = U.make('div', cls);
    el.appendChild(U.make('span', 'lvl-num', 'LEVEL ' + levelId));
    el.appendChild(U.make('span', 'lvl-name',
      unlocked ? (d ? RID.Levels.levelName(d) : 'Coming soon') : '???'));

    if (res) el.appendChild(U.make('span', 'lvl-tag', res.c + '/' + res.t + ' ' + RID.UI.t(res.ok ? 'passed' : 'failed')));
    else if (shop) el.appendChild(U.make('span', 'lvl-tag', 'SHOP'));

    U.on(el, 'click', function () {
      if (playable) { enterLevel(levelId); return; }
      RID.UI.toast(res ? RID.UI.t('alreadyPlayed') : (unlocked ? 'Not built yet' : 'Locked'), 'bad');
    });
    return el;
  }

  function open(worldId) {
    current = U.clamp(worldId || RID.state.run.world || 1, 1, CFG.TOTAL_WORLDS);
    var w = RID.Progress.world(current);

    RID.Map.stop();
    RID.Screens.hideAll();
    RID.Screens.closeAllOverlays();
    RID.Screens.setHUD(false);
    RID.Loop.setScene(null);

    RID.Screens.setBackground(w.bg);
    RID.Audio.playMusic(w.music);

    U.el('#lobby-world-name').textContent = w.name[RID.state.lang] || w.name.en;
    U.el('#lobby-world-sub').textContent  = 'World ' + current + ' of ' + CFG.TOTAL_WORLDS;

    var host = U.el('#lobby-levels');
    U.clear(host);
    w.levels.forEach(function (id) { host.appendChild(card(id)); });

    U.show(U.el('#lobby-map'), RID.Progress.mapAvailable());
    RID.Screens.show('lobby');
  }

  function enterLevel(id) {
    RID.Audio.sfx('sfx.door');
    RID.Flow.requestLevel(id);
  }

  function close() { RID.Screens.hide('lobby'); }

  function wire() {
    if (wired) return;
    wired = true;
    U.on(U.el('#lobby-map'),   'click', function () { RID.Map.open(); });
    U.on(U.el('#lobby-title'), 'click', function () { RID.Flow.goTitle(); });
  }

  return { open: open, close: close, enterLevel: enterLevel, wire: wire,
           current: function () { return current; } };
})();

RID.Events.on('boot:ready', function () { RID.Map.wire(); RID.Lobby.wire(); });


/* =========================================================================
   PARTE 10 — MECÁNICA 'kart'  (niveles 4 y 8: la Senda Arcoíris)
   Carrera en pseudo-3D estilo Mario Kart 64: la pista se dibuja por
   segmentos proyectados en perspectiva, con curvas y subidas.
   Cada tramo tiene una caja de poder (una pregunta) y un enemigo que
   BLOQUEA el paso: sin poder es imposible pasar. Se conduce, se apunta
   con el volante y se dispara con la barra espaciadora.
   ========================================================================= */

RID.Levels.register('kart', (function () {

  /* ---------- constantes de la cámara y la pista ---------- */
  var SEGL     = 200;        // longitud de un segmento
  var RUMBLE   = 3;          // segmentos por franja de color
  var ROAD_W   = 2000;       // media anchura de la calzada
  var DRAW     = 180;        // segmentos visibles
  var CAM_H    = 1000;
  var FOV      = 100;
  var CAM_D    = 1 / Math.tan((FOV / 2) * Math.PI / 180);
  var MAXSPEED = SEGL * 60;
  var ACCEL    = MAXSPEED / 4.2;
  var BRAKE    = -MAXSPEED / 1.6;
  var DECEL    = -MAXSPEED / 6;
  var OFFROAD  = -MAXSPEED / 2.4;
  var OFFLIMIT = MAXSPEED / 3.6;
  var OFF_EDGE  = 1.16;      // pasado el raíl, se cae al vacío
  var CENTRIF  = 0.32;
  var HIT_RANGE = 40;        // segmentos de alcance del disparo
  var AIM_TOL   = 0.34;      // tolerancia lateral por defecto

  /* Temas visuales de la pista. Añadir uno es añadir una entrada aquí.
     mode 'rainbow' : TODA la calzada es de color (Senda Arcoíris) y los
                      lados quedan transparentes para ver el espacio.
     mode 'road'    : calzada de un color con bordillos de otro. */
  /* Colores del degradado que cruza la calzada de lado a lado */
  var RAIN = RID.DATA.rainbow.road;

  var THEMES = {
    rainbow: {
      mode:   'rainbow',
      rumble: RID.DATA.rainbow.rumble,
      edge:   ['#ffffff', '#cfd8ff'],
      side:   null,
      line:   null
    },
    jungle: {
      mode:   'road',
      rumble: ['#3fb950', '#2f8f3a', '#f2c14e', '#8a5a2b'],
      road:   ['#5a4a35', '#50412e'],
      side:   ['rgba(22,62,28,.55)', 'rgba(14,44,19,.55)'],
      line:   'rgba(255,240,180,.5)'
    }
  };

  var api, cfg, S;

  /* ---------- construcción de la pista ---------- */
  function lastY() { return S.segs.length === 0 ? 0 : S.segs[S.segs.length - 1].p2.world.y; }

  function addSegment(curve, y) {
    var n = S.segs.length;
    S.segs.push({
      index: n,
      p1: { world: { y: lastY(), z: n * SEGL }, camera: {}, screen: {} },
      p2: { world: { y: y,       z: (n + 1) * SEGL }, camera: {}, screen: {} },
      curve: curve,
      color: Math.floor(n / RUMBLE) % 2,
      rumble: S.theme.rumble[Math.floor(n / RUMBLE) % S.theme.rumble.length],
      /* desplazamiento del arcoíris: hace que los colores giren a lo largo */
      phase: Math.floor(n / 7) % RAIN.length
    });
  }

  function easeIn(a, b, p)    { return a + (b - a) * Math.pow(p, 2); }
  function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5); }

  function addRoad(enter, hold, leave, curve, y) {
    var startY = lastY(), endY = startY + y * SEGL, total = enter + hold + leave, n;
    for (n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter),          easeInOut(startY, endY, n / total));
    for (n = 0; n < hold;  n++) addSegment(curve,                                 easeInOut(startY, endY, (enter + n) / total));
    for (n = 0; n < leave; n++) addSegment(easeIn(curve, 0, n / leave),           easeInOut(startY, endY, (enter + hold + n) / total));
  }

  function buildTrack(sections) {
    var CURVES = [0, 2.6, -3.2, 1.8, -2.2, 3.0];
    var HILLS  = [0, 22, -18, 30, -24, 16];
    var i;

    addRoad(20, 40, 20, 0, 0);                     // recta de salida
    for (i = 0; i < sections; i++) {
      addRoad(24, 52, 24, CURVES[(i + 1) % CURVES.length], HILLS[(i + 1) % HILLS.length]);
      addRoad(18, 34, 18, 0, 0);
    }
    addRoad(20, 50, 20, 0, 0);                     // recta de meta
  }

  function buildSections(count) {
    var out = [], kinds = ['goomba', 'koopa', 'goomba', 'koopa', 'goomba'];
    var offs = [-0.52, 0.44, 0.02, 0.58, -0.38];
    var block = Math.floor((S.segs.length - 140) / count);

    for (var i = 0; i < count; i++) {
      var base = 90 + i * block;
      out.push({
        index: i,
        boxSeg:   base,
        enemySeg: base + Math.floor(block * 0.55),
        offset:   offs[i % offs.length],
        kind:     kinds[i % kinds.length],
        answered: false,
        alive:    true
      });
    }
    return out;
  }

  /* Enemigos que NO se pueden matar: hay que esquivarlos con el volante.
     Duplican la cantidad de enemigos en pista sin romper el reparto de poderes. */
  function buildDodgers() {
    var out = [], offs = [0.46, -0.5, 0.30, -0.34, 0.54, -0.22, 0.12, -0.58];
    var kinds = ['koopa', 'goomba'];
    var per = cfg.dodgersPerSection || 1;
    for (var i = 0; i < S.sections.length; i++) {
      var sec = S.sections[i];
      var span = sec.enemySeg - sec.boxSeg;
      for (var k = 0; k < per; k++) {
        out.push({
          seg:    sec.boxSeg + Math.floor(span * (k + 1) / (per + 1)),
          offset: offs[(i * per + k) % offs.length],
          kind:   kinds[(i + k) % kinds.length],
          sec:    sec
        });
      }
    }
    return out;
  }

  function findSegment(z) {
    return S.segs[Math.floor(z / SEGL) % S.segs.length];
  }

  /* ---------- proyección ---------- */
  function project(p, camX, camY, camZ) {
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camZ;
    p.screen.scale = CAM_D / Math.max(1, p.camera.z);
    p.screen.x = Math.round(CFG.W / 2 + p.screen.scale * p.camera.x * CFG.W / 2);
    p.screen.y = Math.round(CFG.H / 2 - p.screen.scale * p.camera.y * CFG.H / 2);
    p.screen.w = Math.round(p.screen.scale * ROAD_W * CFG.W / 2);
  }

  function quad(ctx, color, x1, y1, w1, x2, y2, w2) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1);
    ctx.lineTo(x2 - w2, y2);
    ctx.lineTo(x2 + w2, y2);
    ctx.lineTo(x1 + w1, y1);
    ctx.closePath();
    ctx.fill();
  }

  /* Degradado arcoíris que cruza la calzada de lado a lado, como en la
     Senda Arcoíris original. El desfase por segmento hace que los colores
     rueden a lo largo de la pista. */
  function rainbowFill(ctx, x, y, w, phase) {
    var g = ctx.createLinearGradient(x - w, y, x + w, y), i, n = RAIN.length;
    for (i = 0; i <= n; i++) g.addColorStop(i / n, RAIN[(i + phase) % n]);
    return g;
  }

  /* ---------- ciclo de vida ---------- */
  return {

    init: function (a, c) {
      api = a; cfg = c;
      S = { segs: [], t: 0, position: 0, speed: 0, playerX: 0,
            power: 0, killed: 0, answered: 0, coins: 0, phase: 'play',
            shot: null, queue: null, sections: null, trackLen: 0,
            theme: THEMES[cfg.theme] || THEMES.rainbow,
            maxSpeed: MAXSPEED * (cfg.speedMul || 1) * RID.state.upgrades.kartSpeed,
            dodgers: [],
            aimTol: (cfg.aimTol || AIM_TOL) + RID.state.upgrades.aimAssist * 0.005 };

      buildTrack(cfg.sections);
      S.trackLen = S.segs.length * SEGL;
      S.sections = buildSections(cfg.sections);
      S.dodgers  = cfg.dodgers ? buildDodgers() : [];
      S.queue    = api.deck(cfg.category, cfg.sections);

      api.objective('ENEMIES 0/' + cfg.sections + ' · POWER 0');
      api.gauge('speed', 0);
    },

    start: function () {
      api.toast('UP to drive · SPACE to shoot', 'coin');
    },

    update: function (dt) {
      if (!S || S.phase === 'dead') return;
      S.t += dt;

      var playerSeg = findSegment(S.position);
      var speedPct = S.speed / S.maxSpeed;
      var dx       = dt * 2.4 * speedPct;

      /* --- conducción --- */
      if (api.input.isDown('left'))  S.playerX -= dx;
      if (api.input.isDown('right')) S.playerX += dx;

      /* fuerza centrífuga en las curvas */
      S.playerX -= dx * speedPct * playerSeg.curve * CENTRIF;

      if (api.input.isDown('up'))        S.speed += ACCEL * dt;
      else if (api.input.isDown('down')) S.speed += BRAKE * dt;
      else                               S.speed += DECEL * dt;

      /* sobre el bordillo se frena de golpe: es el último aviso */
      if ((S.playerX < -1 || S.playerX > 1) && S.speed > OFFLIMIT) S.speed += OFFROAD * dt;

      /* más allá del raíl no hay suelo: la Senda Arcoíris flota en el vacío */
      if (S.playerX < -OFF_EDGE || S.playerX > OFF_EDGE) { fallOff(); return; }

      S.playerX = U.clamp(S.playerX, -2.2, 2.2);
      S.speed   = U.clamp(S.speed, 0, S.maxSpeed);
      S.position += S.speed * dt;
      while (S.position >= S.trackLen) S.position -= S.trackLen;

      api.gauge('speed', Math.round(speedPct * 100));

      /* --- disparo --- */
      if (api.input.pressed('action')) shoot();
      if (S.shot) {
        S.shot.life -= dt;
        if (S.shot.life <= 0) S.shot = null;
      }

      /* --- tramos: caja de poder y enemigo --- */
      var idx = playerSeg.index, i, sec;
      for (i = 0; i < S.sections.length; i++) {
        sec = S.sections[i];
        if (!sec.answered && idx >= sec.boxSeg && idx < sec.boxSeg + 12) { askBox(sec); return; }
        if (sec.alive && idx >= sec.enemySeg - 1 && idx <= sec.enemySeg + 2) {
          if (Math.abs(S.playerX - sec.offset) < 0.52) { crash(sec); return; }
        }
      }

      /* --- enemigos que solo se esquivan --- */
      for (i = 0; i < S.dodgers.length; i++) {
        var dg = S.dodgers[i];
        if (idx >= dg.seg - 1 && idx <= dg.seg + 2 &&
            Math.abs(S.playerX - dg.offset) < 0.5) {
          api.toast('Dodge them!', 'bad');
          setback(dg.sec);
          return;
        }
      }

      /* --- meta --- */
      if (idx >= S.segs.length - 24 && S.killed >= cfg.sections) {
        S.phase = 'done';
        api.sfx('sfx.door');
        api.complete({ coins: S.coins });
      }
    },

    render: function (ctx) {
      if (!S) return;

      var base     = findSegment(S.position);
      var basePct  = (S.position % SEGL) / SEGL;
      var camY     = CAM_H + base.p1.world.y;
      var maxy     = CFG.H;
      var x = 0, dx = -(base.curve * basePct);
      var n, seg, visible = [];

      /* --- calzada --- */
      for (n = 0; n < DRAW; n++) {
        seg = S.segs[(base.index + n) % S.segs.length];
        seg.looped = seg.index < base.index;
        seg.clip = maxy;

        project(seg.p1, (S.playerX * ROAD_W) - x,      camY, S.position - (seg.looped ? S.trackLen : 0));
        project(seg.p2, (S.playerX * ROAD_W) - x - dx, camY, S.position - (seg.looped ? S.trackLen : 0));

        x  += dx;
        dx += seg.curve;

        if (seg.p1.camera.z <= CAM_D || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;

        var p1 = seg.p1.screen, p2 = seg.p2.screen;

        var rainbowRoad = (S.theme.mode === 'rainbow');
        var rw1 = p1.w / 5, rw2 = p2.w / 5;

        /* fondo a los lados: en la Senda Arcoíris se deja ver el espacio */
        if (S.theme.side) {
          ctx.fillStyle = S.theme.side[seg.color];
          ctx.fillRect(0, p2.y, CFG.W, p1.y - p2.y);
        }

        if (rainbowRoad) {
          /* raíl de caramelo: rayas blancas y de color alternadas */
          quad(ctx, seg.color ? '#ffffff' : seg.rumble,
               p1.x, p1.y, p1.w + rw1, p2.x, p2.y, p2.w + rw2);

          /* calzada: degradado arcoíris a lo ANCHO de toda la pista */
          ctx.beginPath();
          ctx.moveTo(p1.x - p1.w, p1.y);
          ctx.lineTo(p2.x - p2.w, p2.y);
          ctx.lineTo(p2.x + p2.w, p2.y);
          ctx.lineTo(p1.x + p1.w, p1.y);
          ctx.closePath();
          ctx.fillStyle = (p1.w > 7)
            ? rainbowFill(ctx, p1.x, p1.y, p1.w, seg.phase)
            : RAIN[(seg.phase + 3) % RAIN.length];
          ctx.fill();

          /* damero tenue de la textura original */
          if (!seg.color) { ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fill(); }

          /* neón en los bordes */
          var gw1 = p1.w / 14, gw2 = p2.w / 14;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          quad(ctx, 'rgba(255,255,255,.20)', p1.x - p1.w + gw1, p1.y, gw1,
                                             p2.x - p2.w + gw2, p2.y, gw2);
          quad(ctx, 'rgba(255,255,255,.20)', p1.x + p1.w - gw1, p1.y, gw1,
                                             p2.x + p2.w - gw2, p2.y, gw2);
          ctx.restore();

        } else {
          /* bordillo y calzada de las pistas normales */
          quad(ctx, seg.rumble, p1.x, p1.y, p1.w + rw1, p2.x, p2.y, p2.w + rw2);
          quad(ctx, S.theme.road[seg.color], p1.x, p1.y, p1.w, p2.x, p2.y, p2.w);
        }

        /* línea central (solo en pistas normales) */
        if (S.theme.line && seg.color) {
          var lw1 = p1.w / 32, lw2 = p2.w / 32;
          quad(ctx, S.theme.line, p1.x, p1.y, lw1, p2.x, p2.y, lw2);
        }
        maxy = p2.y;
        visible.push(seg);
      }

      /* --- objetos, de lejos a cerca --- */
      for (n = visible.length - 1; n >= 0; n--) {
        seg = visible[n];
        for (var i = 0; i < S.sections.length; i++) {
          var sec = S.sections[i];
          if (!sec.answered && seg.index === sec.boxSeg)  drawBox(ctx, seg, sec);
          if (sec.alive     && seg.index === sec.enemySeg) drawEnemy(ctx, seg, sec);
        }
        for (i = 0; i < S.dodgers.length; i++) {
          if (seg.index === S.dodgers[i].seg) drawEnemy(ctx, seg, S.dodgers[i]);
        }
      }

      /* --- disparo --- */
      if (S.shot) {
        var a = S.shot.life / 0.28;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 6 * a;
        ctx.beginPath();
        ctx.moveTo(CFG.W / 2 + S.shot.x0, CFG.H - 96);
        ctx.lineTo(CFG.W / 2 + S.shot.x1, CFG.H / 2 + 26);
        ctx.stroke();
        ctx.restore();
      }

      /* --- kart del jugador --- */
      drawKart(ctx);
    },

    destroy: function () { S = null; }
  };

  /* ---------- dibujo de objetos sobre la pista ---------- */
  function spriteOn(ctx, seg, offset, name, sizeFactor, extra) {
    var p = seg.p1.screen;
    if (!p || !p.w) return null;
    var size  = RID.Avatar.spriteSize(name, 1);
    var destH = p.w * sizeFactor;
    if (destH < 2 || p.y - destH > seg.clip) return;
    RID.Avatar.drawSprite(ctx, name, p.x + p.w * offset, p.y, destH / size.h, extra || {});
  }

  function drawEnemy(ctx, seg, sec) {
    spriteOn(ctx, seg, sec.offset, sec.kind, 0.34, { flip: sec.offset > 0 });
  }

  function drawBox(ctx, seg, sec) {
    var p = seg.p1.screen;
    if (!p || !p.w) return;
    var s = p.w * 0.32;
    if (s < 4) return;

    var cx  = p.x + p.w * sec.offset;
    var bob = Math.sin(S.t * 3.4 + sec.index) * s * 0.10;
    var cy  = p.y - s * 0.66 + bob;
    var d   = s * 0.30;
    var ph  = Math.floor(S.t * 6 + sec.index * 2) % 6;
    var h   = s / 2;
    var gx, gy;

    var C = ['#ff5bd0', '#7b6cff', '#3bc9ff', '#4dff9b', '#ffe94d', '#ff8f4d'];
    function iri(x0, y0, x1, y1, k) {
      var g = ctx.createLinearGradient(x0, y0, x1, y1), i;
      for (i = 0; i <= C.length; i++) g.addColorStop(i / C.length, C[(i + k) % C.length]);
      return g;
    }

    ctx.save();
    ctx.translate(cx, cy);

    /* halo */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var hg = ctx.createRadialGradient(0, 0, s * 0.15, 0, 0, s * 1.4);
    hg.addColorStop(0, 'rgba(255,255,255,.30)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(0, 0, s * 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* cara superior */
    ctx.beginPath();
    ctx.moveTo(-h, -h); ctx.lineTo(-h + d, -h - d);
    ctx.lineTo(h + d, -h - d); ctx.lineTo(h, -h);
    ctx.closePath();
    ctx.fillStyle = iri(-h, -h - d, h + d, -h, ph + 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill();

    /* cara derecha */
    ctx.beginPath();
    ctx.moveTo(h, -h); ctx.lineTo(h + d, -h - d);
    ctx.lineTo(h + d, h - d); ctx.lineTo(h, h);
    ctx.closePath();
    ctx.fillStyle = iri(h, -h, h + d, h, ph + 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.fill();

    /* cara frontal */
    ctx.beginPath(); ctx.rect(-h, -h, s, s);
    ctx.fillStyle = iri(-h, -h, h, h, ph); ctx.fill();

    /* lunares */
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    for (gx = -h; gx < h; gx += s * 0.17) {
      for (gy = -h; gy < h; gy += s * 0.17) {
        ctx.beginPath();
        ctx.arc(gx + s * 0.085, gy + s * 0.085, s * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    /* brillo diagonal */
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.moveTo(-h, h * 0.2); ctx.lineTo(h * 0.2, -h);
    ctx.lineTo(h * 0.65, -h); ctx.lineTo(-h, h * 0.65);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    /* aristas */
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.strokeRect(-h, -h, s, s);

    /* interrogante con contorno azul */
    ctx.font = 'bold ' + (s * 0.70) + 'px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, s * 0.15);
    ctx.strokeStyle = '#1aa3ff';
    ctx.strokeText('?', 0, s * 0.03);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('?', 0, s * 0.03);

    ctx.restore();
  }

  function drawKart(ctx) {
    var lean = U.clamp(S.playerX, -1.4, 1.4);
    var bump = Math.sin(S.t * 18) * (S.speed / S.maxSpeed) * 2.6;
    var cx   = CFG.W / 2 + lean * 28;

    RID.Avatar.drawKart(ctx, cx, CFG.H - 24 + bump, 1.3, { t: S.t, lean: lean });

    /* caparazón cargado girando sobre el kart */
    if (S.power > 0) {
      RID.Avatar.drawShell(ctx, cx, CFG.H - 190 + Math.sin(S.t * 3) * 6, 22,
                           Math.sin(S.t * 1.6) * 0.3);
    }
  }

  /* ---------- acciones ---------- */
  function askBox(sec) {
    S.phase = 'question';
    var q = S.queue.shift() || api.deck(cfg.category, 1)[0];
    if (!q) { sec.answered = true; S.phase = 'play'; return; }

    RID.Questions.ask(q, {
      counter: (S.answered + 1) + '/' + cfg.sections,
      seconds: cfg.seconds || 0,
      allowHint: true,
      onEnd: function (res) {
        if (res.correct) {
          sec.answered = true;
          S.answered++;
          S.power++;
          S.coins += cfg.coinsPerCorrect;
          api.coins(cfg.coinsPerCorrect);
          api.toast('Power unlocked! Press SPACE', 'coin');
          RID.FX.particles('star', CFG.W / 2, CFG.H - 150, 16);
          refreshObjective();
          S.phase = 'play';
          return;
        }
        /* fallar la pregunta cuesta una huella; el tramo vuelve a empezar
           con una pregunta nueva, igual que en los niveles 2 y 3 */
        api.toast('Wrong answer — one paw lost!', 'bad');
        setback(sec);
      }
    });
  }

  function refreshObjective() {
    api.objective('ENEMIES ' + S.killed + '/' + cfg.sections + ' · POWER ' + S.power);
  }

  function shoot() {
    if (S.power <= 0) { api.toast('No power', 'bad'); return; }

    var idx = findSegment(S.position).index, i, sec, target = null;
    for (i = 0; i < S.sections.length; i++) {
      sec = S.sections[i];
      if (!sec.alive) continue;
      if (sec.enemySeg >= idx && sec.enemySeg - idx <= HIT_RANGE) { target = sec; break; }
    }

    S.power--;
    api.sfx('sfx.hit');
    S.shot = { life: 0.28, x0: S.playerX * 26, x1: (target ? target.offset : S.playerX) * 200 };

    if (target && Math.abs(S.playerX - target.offset) < S.aimTol) {
      target.alive = false;
      S.killed++;
      RID.FX.particles('hit', CFG.W / 2 + target.offset * 180, CFG.H / 2 + 40, 16);
      api.toast('Enemy down!', 'good');
    } else {
      api.toast('Missed — line up the kart', 'bad');
    }
    refreshObjective();
  }

  /* Caída fuera de la pista */
  function fallOff() {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    S.speed = 0;
    api.toast('You fell off the track!', 'bad');
    RID.FX.particles('star', CFG.W / 2, CFG.H - 140, 18);
    RID.FX.shake(320);

    api.loseLife(CFG.W / 2, CFG.H - 130, function () {
      if (!S) return;
      /* se vuelve un poco atrás, ya centrado en la calzada */
      S.position = Math.max(0, S.position - SEGL * 12);
      S.playerX  = 0;
      S.speed    = 0;
      S.phase    = 'play';
    });
  }

  /* Pierde una huella y devuelve al jugador al inicio del tramo */
  function setback(sec) {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    S.speed = 0;
    RID.FX.particles('smoke', CFG.W / 2, CFG.H - 120, 14);

    api.loseLife(CFG.W / 2, CFG.H - 130, function () {
      if (!S) return;
      S.position = Math.max(0, (sec.boxSeg - 24) * SEGL);
      S.playerX  = 0;
      S.speed    = 0;
      S.phase    = 'play';
      refreshObjective();
    });
  }

  /* Choque contra el enemigo: además, el tramo se reinicia entero */
  function crash(sec) {
    if (S.phase === 'dead') return;
    sec.answered = false;
    if (S.answered > 0) S.answered--;
    setback(sec);
  }
})());


/* =========================================================================
   PARTE 11.1 — MECÁNICA 'gap-jump'  (nivel 5: las grietas de la Isla Yoshi)
   Diez fosas. Saltar cuesta IMPULSO y el impulso solo se consigue
   respondiendo: cada acierto da dos saltos, cada fallo uno.
   ========================================================================= */

RID.Levels.register('gap-jump', (function () {

  var GROUND  = 436;
  var GRAVITY = 1900;
  var SPEED   = 232;
  var JUMP_V  = 625;
  var TRIGGER = 84;

  var api, cfg, S;

  function buildLayout(pits) {
    var plats = [], gaps = [], x = 0, i, y, w;

    plats.push({ x: 0, y: GROUND, w: 430 });
    x = 430;

    /* desniveles suaves: con el impulso se cubren 150 px de vuelo, así que
       ninguna subida pasa de 34 px ni ninguna fosa de 133 px */
    var hs = [0, -18, 12, -22, 8, -12, 18, -14, 0, 10];
    for (i = 0; i < pits; i++) {
      var gw = 110 + (i % 4) * 4;
      gaps.push({ x: x, w: gw, index: i, crossed: false });
      x += gw;
      y = GROUND + hs[i % hs.length];
      w = (i === pits - 1) ? 480 : 250 + (i % 3) * 40;
      plats.push({ x: x, y: y, w: w });
      x += w;
    }
    return { plats: plats, gaps: gaps, width: x, exitX: x - 130 };
  }

  function platAt(px) {
    for (var i = 0; i < S.plats.length; i++) {
      var p = S.plats[i];
      if (px >= p.x && px <= p.x + p.w) return p;
    }
    return null;
  }

  return {

    init: function (a, c) {
      api = a; cfg = c;
      var L = buildLayout(cfg.pits);

      S = {
        plats: L.plats, gaps: L.gaps, width: L.width, exitX: L.exitX,
        cam: 0, t: 0, crossed: 0, coins: 0, jumps: 0, asked: 0, phase: 'play',
        queue: api.deck(cfg.category, Math.ceil(cfg.pits / cfg.jumpsPerAnswer)),
        player: { x: 80, y: GROUND, vx: 0, vy: 0, onGround: true, face: 1, spawnX: 80 }
      };

      api.objective('PITS 0/' + cfg.pits);
      api.gauge('boost', 0);
    },

    start: function () { api.toast('Answer to get boost — 2 jumps each', 'coin'); },

    update: function (dt) {
      if (!S || S.phase === 'dead') return;
      S.t += dt;
      var p = S.player, i, gap;

      var move = 0;
      if (api.input.isDown('left'))  move -= 1;
      if (api.input.isDown('right')) move += 1;
      if (move) p.face = move;
      p.vx = move * SPEED;

      /* saltar consume un impulso */
      if (api.input.pressed('action') && p.onGround) {
        if (S.jumps > 0) {
          S.jumps--;
          p.vy = -JUMP_V * RID.state.upgrades.jumpBoost;
          p.onGround = false;
          api.sfx('sfx.jump');
          api.gauge('boost', S.jumps / cfg.jumpsPerAnswer * 100);
          RID.FX.particles('dust', p.x - S.cam, GROUND, 6);
        } else {
          api.toast('No boost left', 'bad');
        }
      }

      p.vy += GRAVITY * dt;
      var prevX = p.x;
      p.x = U.clamp(p.x + p.vx * dt, 20, S.width - 20);
      p.y += p.vy * dt;

      var side = platAt(p.x);
      if (side && p.y > side.y + 24) { p.x = prevX; p.vx = 0; }

      var g = platAt(p.x);
      if (g && p.vy >= 0 && p.y >= g.y - 2 && p.y <= g.y + 40) {
        p.y = g.y; p.vy = 0; p.onGround = true;
      } else if (!g || p.y < g.y - 2) {
        p.onGround = false;
      }

      if (p.y > CFG.H + 90) { fall(); return; }

      /* fosa superada */
      for (i = 0; i < S.gaps.length; i++) {
        gap = S.gaps[i];
        if (!gap.crossed && p.x > gap.x + gap.w && p.onGround) {
          gap.crossed = true;
          S.crossed++;
          S.player.spawnX = gap.x + gap.w + 40;
          api.objective('PITS ' + S.crossed + '/' + cfg.pits);
        }
      }

      /* sin impulso frente a una fosa: toca responder */
      if (S.phase === 'play' && S.jumps <= 0) {
        for (i = 0; i < S.gaps.length; i++) {
          gap = S.gaps[i];
          if (gap.crossed) continue;
          if (p.x + 16 >= gap.x - TRIGGER && p.x < gap.x) { askBoost(); return; }
        }
      }

      if (p.x >= S.exitX && S.crossed >= cfg.pits) {
        S.phase = 'done';
        api.sfx('sfx.door');
        api.complete({ coins: S.coins });
        return;
      }

      S.cam = U.lerp(S.cam, U.clamp(p.x - 330, 0, Math.max(0, S.width - CFG.W)), Math.min(1, dt * 6));
    },

    render: function (ctx) {
      if (!S) return;
      var cam = S.cam, i, k;

      ctx.save();
      ctx.translate(-cam, 0);

      /* Con imagen de fondo propia solo se oscurece un poco para que el
         juego se lea encima; el decorado dibujado por código se omite. */
      var deco = !api.hasBg;
      if (!deco) { ctx.fillStyle = 'rgba(6,4,16,.30)'; ctx.fillRect(0, 0, CFG.W, CFG.H); }

      if (deco) {
      /* cielo y colinas de la isla */
      var sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, '#7fd6ff'); sky.addColorStop(1, '#dff5c4');
      ctx.fillStyle = sky; ctx.fillRect(cam, 0, CFG.W, CFG.H);
      ctx.fillStyle = 'rgba(63,155,70,.45)';
      for (i = Math.floor(cam / 300) * 300; i < cam + CFG.W + 300; i += 300) {
        U.ellipse(ctx, i + 150, 330, 210, 130); ctx.fill();
      }
      }

      /* plataformas de tierra */
      for (i = 0; i < S.plats.length; i++) {
        var pl = S.plats[i];
        if (pl.x + pl.w < cam - 60 || pl.x > cam + CFG.W + 60) continue;
        ctx.fillStyle = '#63c66a';
        ctx.fillRect(pl.x, pl.y, pl.w, 14);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(pl.x, pl.y + 14, pl.w, CFG.H - pl.y - 14);
        ctx.fillStyle = '#6b431f';
        for (k = 0; k < pl.w; k += 40) ctx.fillRect(pl.x + k + 6, pl.y + 26, 22, 8);
      }

      /* grietas */
      for (i = 0; i < S.gaps.length; i++) {
        var gp = S.gaps[i];
        if (gp.x + gp.w < cam - 60 || gp.x > cam + CFG.W + 60) continue;
        var gr = ctx.createLinearGradient(0, GROUND, 0, CFG.H);
        gr.addColorStop(0, '#241f18'); gr.addColorStop(1, '#000');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(gp.x, GROUND - 40);
        ctx.lineTo(gp.x + gp.w, GROUND - 40);
        ctx.lineTo(gp.x + gp.w - 16, CFG.H);
        ctx.lineTo(gp.x + 16, CFG.H);
        ctx.closePath(); ctx.fill();
        if (!gp.crossed) {
          ctx.fillStyle = 'rgba(255,80,80,' + (0.22 + 0.18 * Math.sin(S.t * 4 + i)) + ')';
          ctx.fillRect(gp.x, GROUND - 46, gp.w, 4);
        }
      }

      /* meta */
      ctx.fillStyle = '#3fb950';
      ctx.fillRect(S.exitX + 30, GROUND - 120, 12, 120);
      ctx.fillStyle = '#ffd447';
      ctx.beginPath();
      ctx.moveTo(S.exitX + 42, GROUND - 120);
      ctx.lineTo(S.exitX + 112, GROUND - 104);
      ctx.lineTo(S.exitX + 42, GROUND - 88);
      ctx.closePath(); ctx.fill();

      if (!RID.FX.isBusy()) {
        var pose = !S.player.onGround ? 'jump' : (S.player.vx ? 'run' : 'idle');
        ctx.save();
        if (S.player.face < 0) { ctx.translate(S.player.x * 2, 0); ctx.scale(-1, 1); }
        RID.Avatar.drawPlayer(ctx, S.player.x, S.player.y, 1.55, pose, S.t);
        ctx.restore();
      }
      ctx.restore();
    },

    destroy: function () { S = null; }
  };

  function askBoost() {
    S.phase = 'question';
    S.player.vx = 0;
    var q = S.queue.shift() || api.deck(cfg.category, 1)[0];
    if (!q) { S.jumps = cfg.jumpsPerAnswer; S.phase = 'play'; return; }

    RID.Questions.ask(q, {
      counter: 'BOOST ' + (++S.asked),
      seconds: cfg.seconds || 0,
      allowHint: true,
      onEnd: function (res) {
        if (res.correct) {
          /* las Spring Boots de la tienda dan un salto extra por impulso */
          S.jumps = cfg.jumpsPerAnswer + RID.state.upgrades.boostBonus;
          S.coins += cfg.coinsPerCorrect;
          api.coins(cfg.coinsPerCorrect);
          RID.FX.particles('star', S.player.x - S.cam, S.player.y - 50, 14);
          api.gauge('boost', S.jumps / cfg.jumpsPerAnswer * 100);
          S.phase = 'play';
          return;
        }
        /* fallar cuesta una huella; queda un salto para poder continuar */
        S.jumps = 1;
        api.gauge('boost', S.jumps / cfg.jumpsPerAnswer * 100);
        api.toast('Wrong answer — one paw lost!', 'bad');
        wrongPenalty();
      }
    });
  }

  /* Penalización por respuesta incorrecta */
  function wrongPenalty() {
    S.phase = 'dead';
    RID.FX.particles('smoke', S.player.x - S.cam, S.player.y - 30, 12);
    api.loseLife(S.player.x - S.cam, S.player.y - 20, function () {
      if (!S) return;
      S.player.x  = S.player.spawnX;
      S.player.y  = GROUND - 40;
      S.player.vx = 0;
      S.player.vy = 0;
      S.phase = 'play';
    });
  }

  function fall() {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    api.loseLife(S.player.x - S.cam, CFG.H - 150, function () {
      if (!S) return;
      S.player.x = S.player.spawnX;
      S.player.y = GROUND - 40;
      S.player.vx = 0; S.player.vy = 0;
      S.phase = 'play';
    });
  }
})());


/* =========================================================================
   PARTE 11.2 — MECÁNICA 'boss-shell'  (nivel 6: Roy Koopa)
   Roy lanza caparazones. Los esquivas, recoges uno y se lo devuelves:
   antes de lanzarlo respondes, y el acierto es lo que da PUNTERÍA.
   Cinco impactos lo derrotan. Un golpe recibido = una huella menos.
   ========================================================================= */

RID.Levels.register('boss-shell', (function () {

  var GROUND  = 452;
  var GRAVITY = 2000;
  var SPEED   = 245;
  var JUMP_V  = 640;
  var ROY_X   = 790;

  var api, cfg, S;

  /* Agachado la caja del jugador baja de 44 a 24 de alto: los proyectiles
     altos pasan por encima. */
  /* La pelea final mezcla TODAS las formas de preguntar: opción múltiple,
     escribir y ordenar. Se van tomando por turnos de cada banco. */
  function buildQueue() {
    var cats = cfg.categories || [cfg.category], out = [], q, i;
    for (i = 0; i < cfg.hits; i++) {
      q = api.deck(cats[i % cats.length], 1)[0];
      if (q) out.push(q);
    }
    return out;
  }

  function playerBox(p) {
    var h = S && S.duck ? 24 : 44;
    return { x: p.x - 11, y: p.y - h, w: 22, h: h };
  }
  function shellBox(s)  { return { x: s.x - 15, y: s.y - 26, w: 30, h: 26 }; }

  return {

    init: function (a, c) {
      api = a; cfg = c;
      S = {
        t: 0, phase: 'play', hits: 0, asked: 0, coins: 0,
        shells: [], carrying: false, throwT: cfg.throwEvery,
        boss: cfg.boss || 'roy',
        bossName: cfg.bossName || 'ROY KOOPA',
        ammo: cfg.ammo || 'shell',
        cycle: cfg.ammoCycle || null,
        speedUp: cfg.speedUp || 1,
        duck: false, thrown: 0,
        flying: null, roy: { y: 0, hurt: 0 },
        queue: buildQueue(),
        player: { x: 180, y: GROUND, vx: 0, vy: 0, onGround: true, face: 1 }
      };
      api.objective('ROY 0/' + cfg.hits);
      api.gauge(null);
    },

    start: function () { api.toast('SPACE to jump · grab a shell and SPACE to throw', 'coin'); },

    update: function (dt) {
      if (!S || S.phase === 'dead' || S.phase === 'done') return;
      S.t += dt;
      var p = S.player, i, sh;

      S.roy.y = Math.sin(S.t * 2.2) * 10;
      if (S.roy.hurt > 0) S.roy.hurt -= dt;

      /* --- movimiento --- */
      S.duck = cfg.canDuck && p.onGround && api.input.isDown('down');

      var move = 0;
      if (api.input.isDown('left'))  move -= 1;
      if (api.input.isDown('right')) move += 1;
      if (move) p.face = move;
      p.vx = move * SPEED * (S.duck ? 0.45 : 1);

      if (api.input.pressed('action')) {
        if (S.carrying) throwShell();
        else if (p.onGround) { p.vy = -JUMP_V; p.onGround = false; api.sfx('sfx.jump'); }
      }
      if (api.input.pressed('up') && p.onGround && !S.carrying) {
        p.vy = -JUMP_V; p.onGround = false; api.sfx('sfx.jump');
      }

      p.vy += GRAVITY * dt;
      p.x = U.clamp(p.x + p.vx * dt, 40, ROY_X - 110);
      p.y += p.vy * dt;
      if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true; }

      /* --- Roy lanza --- */
      S.throwT -= dt;
      if (S.throwT <= 0) {
        S.throwT = cfg.throwEvery;
        S.thrown++;
        /* la munición puede rotar: caparazón, fuego y martillo (Bowser) */
        var kind = S.cycle ? S.cycle[S.thrown % S.cycle.length] : S.ammo;
        var high = cfg.canDuck && (S.thrown % 2 === 1);
        var shot = high
          ? { x: ROY_X - 70, y: GROUND - 62, vx: -350 * S.speedUp, vy: 0, state: 'fly', spin: 0, high: true }
          : { x: ROY_X - 70, y: GROUND, vx: -330 * S.speedUp, vy: -180, state: 'fly', spin: 0 };
        shot.ammo = kind;
        S.shells.push(shot);
        api.sfx('sfx.hit');
      }

      /* --- caparazones --- */
      for (i = S.shells.length - 1; i >= 0; i--) {
        sh = S.shells[i];
        sh.spin += dt * (sh.state === 'fly' ? 10 : 0);

        if (sh.state === 'fly') {
          if (sh.high) {
            /* vuela recto a la altura de la cabeza, ondulando un poco */
            sh.x += sh.vx * dt;
            sh.y = GROUND - 62 + Math.sin(S.t * 7 + sh.x * 0.01) * 6;
          } else {
            sh.vy += GRAVITY * dt;
            sh.y += sh.vy * dt;
            sh.x += sh.vx * dt;
            if (sh.y >= GROUND) { sh.y = GROUND; sh.vy = -Math.abs(sh.vy) * 0.55; }
          }
          if (sh.x < 52) { sh.x = 52; sh.state = 'idle'; sh.vx = 0; sh.vy = 0; sh.y = GROUND; }
          if (U.aabb(playerBox(p), shellBox(sh))) { hurt(); return; }
        } else if (sh.state === 'idle' && !S.carrying) {
          if (Math.abs(p.x - sh.x) < 30 && p.onGround) {
            S.shells.splice(i, 1);
            S.carrying = true;
            api.sfx('sfx.coin');
            S.held = sh.ammo || S.ammo;
          api.toast('Ready — press SPACE', 'coin');
            continue;
          }
        }
        if (sh.x < -60) S.shells.splice(i, 1);
      }

      /* --- caparazón devuelto --- */
      if (S.flying) {
        S.flying.x += S.flying.vx * dt;
        S.flying.y += S.flying.vy * dt;
        S.flying.vy += 340 * dt;
        S.flying.spin += dt * 14;
        if (S.flying.x >= ROY_X - 60) {
          var ok = Math.abs(S.flying.y - (GROUND - 90 + S.roy.y)) < S.flying.tol;
          S.flying = null;
          if (ok) royHit(); else api.toast('It missed him!', 'bad');
        } else if (S.flying.y > CFG.H + 40) {
          S.flying = null;
          api.toast('It missed him!', 'bad');
        }
      }
    },

    render: function (ctx) {
      if (!S) return;
      var i, k;

      /* Con imagen de fondo propia solo se oscurece un poco para que el
         juego se lea encima; el decorado dibujado por código se omite. */
      var deco = !api.hasBg;
      if (!deco) { ctx.fillStyle = 'rgba(6,4,16,.30)'; ctx.fillRect(0, 0, CFG.W, CFG.H); }

      if (deco) {
      /* ---- cielo de tormenta ---- */
      var sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, '#180d2a'); sky.addColorStop(0.5, '#45142f'); sky.addColorStop(1, '#7a2b2b');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CFG.W, CFG.H);

      if (Math.sin(S.t * 0.8) > 0.988) {
        ctx.fillStyle = 'rgba(255,240,255,.18)';
        ctx.fillRect(0, 0, CFG.W, CFG.H);
      }

      /* nubes oscuras en movimiento */
      ctx.fillStyle = 'rgba(18,9,24,.72)';
      for (i = 0; i < 7; i++) {
        var cx = ((i * 210 + S.t * 8) % (CFG.W + 300)) - 150;
        U.ellipse(ctx, cx, 44 + (i % 3) * 18, 104, 28); ctx.fill();
      }

      /* riscos de la isla al fondo */
      ctx.fillStyle = '#2a1024';
      for (i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 175 - 50, GROUND - 70);
        ctx.lineTo(i * 175 + 66, 150 + (i % 3) * 46);
        ctx.lineTo(i * 175 + 182, GROUND - 70);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#3a1730';
      for (i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 250 + 40, GROUND - 40);
        ctx.lineTo(i * 250 + 150, 236 + (i % 2) * 40);
        ctx.lineTo(i * 250 + 260, GROUND - 40);
        ctx.closePath(); ctx.fill();
      }

      /* ---- antorchas de la arena ---- */
      for (i = 0; i < 4; i++) {
        var tx = 90 + i * 260;
        ctx.fillStyle = '#3a2a18'; ctx.fillRect(tx - 6, GROUND - 168, 12, 118);
        ctx.fillStyle = '#5a4a35'; ctx.fillRect(tx - 14, GROUND - 178, 28, 12);
        var fl = Math.sin(S.t * 12 + i) * 5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var fg = ctx.createRadialGradient(tx, GROUND - 196, 2, tx, GROUND - 196, 120);
        fg.addColorStop(0, 'rgba(255,210,120,.32)');
        fg.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(tx, GROUND - 196, 120, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffb020';
        ctx.beginPath();
        ctx.moveTo(tx - 12, GROUND - 178);
        ctx.quadraticCurveTo(tx, GROUND - 218 - fl, tx + 12, GROUND - 178);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe98a';
        ctx.beginPath();
        ctx.moveTo(tx - 6, GROUND - 180);
        ctx.quadraticCurveTo(tx, GROUND - 204 - fl, tx + 6, GROUND - 180);
        ctx.closePath(); ctx.fill();
      }
      }

      /* ---- Yoshis encadenados mirando el combate ---- */
      RID.Avatar.drawSprite(ctx, 'yoshi', 330, GROUND - 4, 1.7, { flip: true, alpha: 0.85 });
      RID.Avatar.drawSprite(ctx, 'yoshi', 408, GROUND - 4, 1.5, { flip: true, alpha: 0.85 });
      drawChain(ctx, 318, GROUND - 46, 400, GROUND - 44, 9, 6);

      /* ---- plataforma de piedra sobre la lava ---- */
      var gp = ctx.createLinearGradient(0, GROUND, 0, CFG.H);
      gp.addColorStop(0, '#000'); gp.addColorStop(1, '#3f0e06');
      ctx.fillStyle = gp; ctx.fillRect(0, GROUND, CFG.W, CFG.H - GROUND);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var lava = ctx.createLinearGradient(0, CFG.H - 54, 0, CFG.H);
      lava.addColorStop(0, 'rgba(255,80,10,0)');
      lava.addColorStop(1, 'rgba(255,150,30,.5)');
      ctx.fillStyle = lava; ctx.fillRect(0, CFG.H - 54, CFG.W, 54);
      ctx.restore();

      ctx.fillStyle = '#4a3346';
      ctx.fillRect(0, GROUND, CFG.W, 38);
      ctx.fillStyle = '#6a4a63';
      ctx.fillRect(0, GROUND, CFG.W, 9);
      ctx.fillStyle = 'rgba(0,0,0,.42)';
      for (i = 0; i < CFG.W; i += 74) ctx.fillRect(i, GROUND + 9, 3, 29);
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2;
      for (i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(110 + i * 160, GROUND);
        ctx.lineTo(128 + i * 160, GROUND + 18);
        ctx.lineTo(116 + i * 160, GROUND + 36);
        ctx.stroke();
      }

      /* ---- barra de vida de Roy ---- */
      var bw = 340, bx = CFG.W / 2 - bw / 2;
      ctx.fillStyle = 'rgba(5,6,13,.78)';
      U.roundRect(ctx, bx - 8, 20, bw + 16, 32, 6); ctx.fill();
      ctx.strokeStyle = '#f4f1e8'; ctx.lineWidth = 2;
      ctx.strokeRect(bx, 30, bw, 16);
      var hpg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      hpg.addColorStop(0, '#ff8a4d'); hpg.addColorStop(1, '#ff2d55');
      ctx.fillStyle = hpg;
      ctx.fillRect(bx, 30, bw * (1 - S.hits / cfg.hits), 16);
      for (k = 1; k < cfg.hits; k++) {
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(bx + (bw / cfg.hits) * k - 1, 30, 2, 16);
      }
      U.pixelText(ctx, S.bossName, CFG.W / 2, 14, 14, '#ffd447');

      /* ---- Roy con sombra ---- */
      var flash = S.roy.hurt > 0 && Math.floor(S.t * 20) % 2 === 0;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      U.ellipse(ctx, ROY_X, GROUND + 4, 62 - Math.abs(S.roy.y) * 0.5, 12); ctx.fill();
      RID.Avatar.drawSprite(ctx, S.boss, ROY_X, GROUND + S.roy.y, 6.0,
        { flip: true, alpha: flash ? 0.45 : 1 });

      /* ---- caparazones ---- */
      for (i = 0; i < S.shells.length; i++) drawAmmo(ctx, S.shells[i], S.shells[i].state === 'idle');
      if (S.flying) drawAmmo(ctx, S.flying, false);

      /* ---- jugador ---- */
      if (!RID.FX.isBusy()) {
        var pose = !S.player.onGround ? 'jump' : (S.player.vx ? 'run' : 'idle');
        ctx.save();
        if (S.player.face < 0) { ctx.translate(S.player.x * 2, 0); ctx.scale(-1, 1); }
        if (S.duck) {
          ctx.translate(S.player.x, S.player.y);
          ctx.scale(1.15, 0.55);
          RID.Avatar.drawPlayer(ctx, 0, 0, 1.6, 'idle', S.t);
        } else {
          RID.Avatar.drawPlayer(ctx, S.player.x, S.player.y, 1.6, pose, S.t);
        }
        ctx.restore();

        if (S.carrying) {
          drawAmmo(ctx, { x: S.player.x, y: S.player.y - 73, spin: S.t * 2.5, ammo: S.held }, false);
        }
      }

      /* ---- brasas ---- */
      ctx.fillStyle = 'rgba(255,150,60,.65)';
      for (k = 0; k < 20; k++) {
        var ex = (k * 137 + S.t * 20) % (CFG.W + 20) - 10;
        var ey = CFG.H - ((S.t * 44 + k * 61) % 360);
        ctx.fillRect(ex, ey, 2, 3);
      }
    },

    destroy: function () { S = null; }
  };

  /* Cadena de eslabones para los Yoshis cautivos */
  function drawChain(ctx, x0, y0, x1, y1, sag, links) {
    var i, p, nx, ang;
    function pt(u) {
      return { x: x0 + (x1 - x0) * u,
               y: y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag };
    }
    for (i = 0; i <= links; i++) {
      p  = pt(i / links);
      nx = pt(Math.min(1, (i + 0.5) / links));
      ang = Math.atan2(nx.y - p.y, nx.x - p.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang + (i % 2 ? Math.PI / 2 : 0));
      ctx.strokeStyle = '#7d8494'; ctx.lineWidth = 3;
      ctx.beginPath(); U.ellipse(ctx, 0, 0, 7, 4.4); ctx.stroke();
      ctx.strokeStyle = '#c3cad8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); U.ellipse(ctx, -1, -1, 7, 4.4); ctx.stroke();
      ctx.restore();
    }
  }

  /* Munición del jefe: caparazón verde (Roy) o bola de fuego (Ludwig) */
  function drawAmmo(ctx, sh, glow) {
    var x = sh.x, y = sh.y - 15;

    var kind = sh.ammo || S.ammo;

    if (kind === 'hammer') {
      if (glow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var hg = ctx.createRadialGradient(x, y, 0, x, y, 40);
        hg.addColorStop(0, 'rgba(255,220,140,.40)');
        hg.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sh.spin || 0);
      ctx.fillStyle = '#6b4a22';
      U.roundRect(ctx, -4, -4, 34, 8, 3); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#8d92a6';
      U.roundRect(ctx, -22, -16, 24, 32, 5); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#c9ccd8';
      ctx.fillRect(-19, -13, 8, 26);
      ctx.restore();
      return;
    }

    if (kind === 'fire') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createRadialGradient(x, y, 2, x, y, glow ? 44 : 30);
      fg.addColorStop(0, 'rgba(255,240,180,.95)');
      fg.addColorStop(0.35, 'rgba(255,150,40,.55)');
      fg.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(x, y, glow ? 44 : 30, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      /* lenguas de fuego girando */
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sh.spin || 0);
      ctx.fillStyle = '#ff8a1a';
      for (var k = 0; k < 5; k++) {
        ctx.rotate(Math.PI * 2 / 5);
        ctx.beginPath();
        ctx.moveTo(-6, -10);
        ctx.quadraticCurveTo(0, -24, 6, -10);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath(); ctx.arc(-2, -2, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }

    if (glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(x, y, 0, x, y, 40);
      g.addColorStop(0, 'rgba(120,255,170,.40)');
      g.addColorStop(1, 'rgba(120,255,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    RID.Avatar.drawShell(ctx, x, y, 17, sh.spin || 0);
  }

  function throwShell() {
    S.phase = 'question';
    var q = S.queue.shift() || api.deck(cfg.category, 1)[0];
    if (!q) { launch(true); return; }

    RID.Questions.ask(q, {
      counter: (S.hits + 1) + '/' + cfg.hits,
      seconds: cfg.seconds || 0,
      allowHint: true,
      onEnd: function (res) {
        S.asked++;
        launch(res.correct);
        /* fallar cuesta una huella además de errar el caparazón */
        if (!res.correct) {
          api.toast('Wrong answer — one paw lost!', 'bad');
          wrongPenalty();
        }
      }
    });
  }

  /* Penalización por respuesta incorrecta */
  function wrongPenalty() {
    S.phase = 'dead';
    RID.FX.particles('smoke', S.player.x, S.player.y - 40, 12);
    api.loseLife(S.player.x, S.player.y - 20, function () {
      if (!S) return;
      S.player.x  = 180;
      S.player.y  = GROUND;
      S.player.vy = 0;
      S.phase = 'play';
    });
  }

  /* La puntería depende de la respuesta: acertar afina el tiro */
  function launch(accurate) {
    S.carrying = false;
    S.phase = 'play';
    var aimY = GROUND - 90 + S.roy.y;
    var err  = accurate ? U.rand(-14, 14) : U.rand(-90, 90);
    var dist = ROY_X - 60 - S.player.x;
    var time = dist / 620;

    S.flying = {
      ammo: S.held,
      x: S.player.x + 20,
      y: S.player.y - 60,
      vx: 620,
      vy: ((aimY + err) - (S.player.y - 60)) / time - 0.5 * 340 * time,
      spin: 0,
      tol: (accurate ? 60 : 26) + RID.state.upgrades.aimAssist
    };
    api.sfx('sfx.jump');
  }

  function royHit() {
    S.hits = Math.min(cfg.hits, S.hits + RID.state.upgrades.hitPower);
    S.roy.hurt = 0.6;
    S.coins += cfg.coinsPerCorrect;
    api.coins(cfg.coinsPerCorrect);
    api.sfx('sfx.hit');
    RID.FX.shake(280);
    RID.FX.particles('hit', ROY_X - 40, GROUND - 90, 18);
    api.objective('ROY ' + S.hits + '/' + cfg.hits);

    if (S.hits >= cfg.hits) {
      S.phase = 'done';
      api.sfx('sfx.clear');
      RID.FX.particles('star', ROY_X - 40, GROUND - 100, 30);
      window.setTimeout(function () { if (S) api.complete({ coins: S.coins }); }, 900);
    }
  }

  function hurt() {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    S.shells.length = 0;
    S.carrying = false;
    api.loseLife(S.player.x, S.player.y - 20, function () {
      if (!S) return;
      S.player.x = 180; S.player.y = GROUND; S.player.vy = 0;
      S.throwT = cfg.throwEvery;
      S.phase = 'play';
    });
  }
})());


/* =========================================================================
   PARTE 11.3 — MECÁNICA 'aim-catch'  (nivel 7: la lengua de Yoshi)
   Cinco monedas ruedan hacia la grieta. Antes de cada moneda respondes:
   acertar da PUNTERÍA amplia, fallar la deja casi imposible.
   Se apunta con el ratón y se dispara la lengua con clic o espacio.
   Si una moneda cae a la grieta, pierdes una huella.
   ========================================================================= */

RID.Levels.register('aim-catch', (function () {

  var GROUND  = 424;
  var YOSHI_X = 150;
  var CRACK_X = 660;
  var CRACK_W = 150;
  var START_X = 300;

  var api, cfg, S;

  return {

    init: function (a, c) {
      api = a; cfg = c;
      S = {
        t: 0, phase: 'idle', index: 0, caught: 0, coins: 0,
        coin: null, tongue: null, tol: 0, asked: 0,
        queue: api.deck(cfg.category, cfg.coins)
      };
      api.objective('COINS 0/' + cfg.coins);
      api.gauge(null);
    },

    start: function () {
      api.toast('Answer, then aim with the mouse and click', 'coin');
      nextCoin();
    },

    update: function (dt) {
      if (!S || S.phase === 'dead' || S.phase === 'done') return;
      S.t += dt;

      /* lengua */
      if (S.tongue) {
        S.tongue.t += dt;
        if (S.tongue.t >= S.tongue.dur) {
          resolveTongue();
        }
      }

      if (S.phase !== 'aim' || !S.coin) return;

      /* la moneda rueda hacia la grieta */
      S.coin.p += dt / cfg.rollTime;
      S.coin.x = START_X + (CRACK_X + 30 - START_X) * S.coin.p;
      S.coin.spin += dt * 7;

      if (S.coin.p >= 1) { dropCoin(); return; }

      /* disparo de la lengua */
      var m = api.input.mouse();
      if ((m.clicked || api.input.pressed('action')) && !S.tongue) {
        S.tongue = { t: 0, dur: 0.34, x: m.x, y: m.y };
        api.sfx('sfx.jump');
      }
    },

    render: function (ctx, fx) {
      if (!S) return;

      /* Con imagen de fondo propia solo se oscurece un poco para que el
         juego se lea encima; el decorado dibujado por código se omite. */
      var deco = !api.hasBg;
      if (!deco) { ctx.fillStyle = 'rgba(6,4,16,.30)'; ctx.fillRect(0, 0, CFG.W, CFG.H); }

      if (deco) {
      /* isla y grieta */
      var sky = ctx.createLinearGradient(0, 0, 0, CFG.H);
      sky.addColorStop(0, '#7fd6ff'); sky.addColorStop(1, '#ffe9b0');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CFG.W, CFG.H);
      }

      ctx.fillStyle = '#63c66a';
      ctx.fillRect(0, GROUND, CFG.W, 16);
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(0, GROUND + 16, CFG.W, CFG.H - GROUND - 16);

      var gr = ctx.createLinearGradient(0, GROUND, 0, CFG.H);
      gr.addColorStop(0, '#241f18'); gr.addColorStop(1, '#000');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(CRACK_X, GROUND);
      ctx.lineTo(CRACK_X + CRACK_W, GROUND);
      ctx.lineTo(CRACK_X + CRACK_W - 22, CFG.H);
      ctx.lineTo(CRACK_X + 22, CFG.H);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,80,80,' + (0.2 + 0.15 * Math.sin(S.t * 4)) + ')';
      ctx.fillRect(CRACK_X, GROUND - 5, CRACK_W, 5);

      /* Yoshi y el jugador */
      RID.Avatar.drawSprite(ctx, 'yoshi', YOSHI_X, GROUND, 4.2, { flip: true });
      RID.Avatar.drawPlayer(ctx, YOSHI_X - 78, GROUND, 1.5, 'idle', S.t);

      /* moneda */
      if (S.coin) {
        var w = Math.abs(Math.cos(S.coin.spin)) * 22 + 6;
        ctx.fillStyle = '#ffd447';
        U.ellipse(ctx, S.coin.x, S.coin.y, w / 2, 15); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#b8860b';
        U.ellipse(ctx, S.coin.x, S.coin.y, w / 4, 8); ctx.fill();
      }

      /* lengua */
      if (S.tongue) {
        var e = Math.sin(Math.min(1, S.tongue.t / S.tongue.dur) * Math.PI);
        var mx = YOSHI_X + 8, my = GROUND - 52;
        var tx = mx + (S.tongue.x - mx) * e, ty = my + (S.tongue.y - my) * e;
        ctx.strokeStyle = '#e8567a'; ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = '#ff7ba0';
        U.ellipse(ctx, tx, ty, 11, 9); ctx.fill();
      }

      /* mira sobre la capa de efectos */
      if (S.phase === 'aim') {
        var m = api.input.mouse();
        fx.strokeStyle = 'rgba(255,204,0,.9)';
        fx.lineWidth = 2;
        fx.beginPath(); fx.arc(m.x, m.y, S.tol, 0, Math.PI * 2); fx.stroke();
        fx.beginPath();
        fx.moveTo(m.x - 16, m.y); fx.lineTo(m.x + 16, m.y);
        fx.moveTo(m.x, m.y - 16); fx.lineTo(m.x, m.y + 16);
        fx.stroke();
      }
    },

    destroy: function () { S = null; }
  };

  function nextCoin() {
    if (S.caught >= cfg.coins) {
      S.phase = 'done';
      api.sfx('sfx.door');
      api.complete({ coins: S.coins });
      return;
    }
    S.coin = { x: START_X, y: GROUND - 16, p: 0, spin: 0 };
    S.tongue = null;
    askAim();
  }

  function askAim() {
    S.phase = 'question';
    var q = S.queue.shift() || api.deck(cfg.category, 1)[0];
    if (!q) { S.tol = 60; S.phase = 'aim'; return; }

    RID.Questions.ask(q, {
      counter: (S.caught + 1) + '/' + cfg.coins,
      seconds: cfg.seconds || 0,
      allowHint: true,
      onEnd: function (res) {
        S.asked++;
        /* puntería según la respuesta, ampliada por la mira de la tienda */
        S.tol = (res.correct ? 62 : 38) + RID.state.upgrades.aimAssist;
        if (res.correct) {
          api.toast('Good aim!', 'good');
          S.phase = 'aim';
          return;
        }
        /* fallar cuesta una huella; la moneda sigue rodando */
        api.toast('Wrong answer — one paw lost!', 'bad');
        S.phase = 'dead';
        RID.FX.particles('smoke', YOSHI_X - 78, GROUND - 40, 12);
        api.loseLife(YOSHI_X - 78, GROUND - 30, function () {
          if (!S) return;
          S.phase = 'aim';
        });
      }
    });
  }

  function resolveTongue() {
    var hit = S.coin && U.dist(S.tongue.x, S.tongue.y, S.coin.x, S.coin.y) <= S.tol;
    S.tongue = null;
    if (!hit) return;                        // se puede volver a intentar

    S.caught++;
    S.coins += cfg.coinsPerCorrect;
    api.coins(cfg.coinsPerCorrect);
    RID.FX.particles('coin', S.coin.x, S.coin.y, 14);
    api.objective('COINS ' + S.caught + '/' + cfg.coins);
    S.coin = null;
    S.phase = 'idle';
    window.setTimeout(function () { if (S) nextCoin(); }, 450);
  }

  function dropCoin() {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    var cx = S.coin ? S.coin.x : CRACK_X;
    S.coin = null;
    S.tongue = null;
    RID.FX.particles('smoke', cx, GROUND, 10);
    api.toast('The coin fell into the crack!', 'bad');

    api.loseLife(cx, GROUND - 40, function () {
      if (!S) return;
      S.phase = 'idle';
      nextCoin();
    });
  }
})());


/* =========================================================================
   PARTE 12 — Sello de mundo
   Al completar los 4 niveles de un mundo se entrega su sello antes de
   continuar con la historia. El sello se dibuja con el color del mundo.
   ========================================================================= */

(function () {

  var SEAL_COLOR = ['#4fbf5a', '#2fb39a', '#9a6a34', '#e0a83c', '#d8422e'];

  function drawSeal(worldId, t) {
    var cv = U.el('#seal-canvas');
    if (!cv) return;
    var ctx = cv.getContext('2d'), c = SEAL_COLOR[worldId - 1] || '#ffcc00';
    var cx = 100, cy = 100, i, a, r;

    ctx.clearRect(0, 0, 200, 200);

    /* destellos girando */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.6);
    ctx.globalAlpha = 0.35;
    for (i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-4, -44); ctx.lineTo(0, -92); ctx.lineTo(4, -44);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    /* medalla */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 + Math.sin(t * 2.4) * 0.03, 1 + Math.sin(t * 2.4) * 0.03);

    ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.fillStyle = '#0e1226'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = c; ctx.stroke();

    /* estrella central */
    ctx.beginPath();
    for (i = 0; i < 10; i++) {
      a = (Math.PI / 5) * i - Math.PI / 2;
      r = (i % 2 === 0) ? 36 : 15;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = c; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#05060d'; ctx.stroke();

    U.pixelText(ctx, String(worldId), 0, 2, 26, '#05060d');
    ctx.restore();
  }

  RID.Flow.showWorldClear = function (worldId, onEnd) {
    var raf = 0, t0 = U.now();

    RID.Screens.hideAll();
    RID.Screens.closeAllOverlays();
    RID.Screens.setHUD(false);
    RID.Loop.setScene(null);
    RID.Audio.sfx('sfx.clear');

    U.el('#world-clear-name').textContent = RID.Progress.worldName(worldId, RID.state.lang);
    RID.Screens.show('world-clear');

    (function loop() {
      raf = window.requestAnimationFrame(loop);
      drawSeal(worldId, (U.now() - t0) / 1000);
    })();

    var btn = U.el('#world-next');
    btn.onclick = function () {
      btn.onclick = null;
      window.cancelAnimationFrame(raf);
      if (onEnd) onEnd();
    };
  };
})();


/* =========================================================================
   PARTE 13.1 — DATA.shop
   Mejoras (efecto permanente sobre RID.state.upgrades) y accesorios
   (se dibujan sobre el personaje). Añadir un artículo = añadir una entrada.
     kind   : 'upgrade' | 'cosmetic'
     repeat : se puede comprar varias veces
     needs  : id de otro artículo obligatorio antes
     slot   : solo accesorios; un accesorio por hueco
   ========================================================================= */

RID.DATA.shop = [
  /* ---- mejoras ---- */
  { id: 'hints3', kind: 'upgrade', price: 60, repeat: true,
    name: 'Hint Pack', desc: '+3 hints to use on any question.',
    apply: function () { RID.state.upgrades.hints += 3; } },

  { id: 'hints8', kind: 'upgrade', price: 140, repeat: true,
    name: 'Big Hint Pack', desc: '+8 hints. Better value than the small one.',
    apply: function () { RID.state.upgrades.hints += 8; } },

  { id: 'torch', kind: 'upgrade', price: 150,
    name: 'Everlasting Torch', desc: 'Energy drains 20% slower in trap levels.',
    apply: function () { RID.state.upgrades.gaugeDrain = 0.8; } },

  { id: 'torch2', kind: 'upgrade', price: 260, needs: 'torch',
    name: 'Eternal Flame', desc: 'Energy drains 40% slower. Needs the torch.',
    apply: function () { RID.state.upgrades.gaugeDrain = 0.6; } },

  { id: 'spring', kind: 'upgrade', price: 200,
    name: 'Spring Boots', desc: 'Every correct answer gives one extra jump.',
    apply: function () { RID.state.upgrades.boostBonus = 1; } },

  { id: 'scope', kind: 'upgrade', price: 180,
    name: 'Yoshi Scope', desc: 'Wider aim when you throw or catch.',
    apply: function () { RID.state.upgrades.aimAssist = 18; } },

  { id: 'boots2', kind: 'upgrade', price: 240,
    name: 'Super Boots', desc: 'Jump 15% higher in every level.',
    apply: function () { RID.state.upgrades.jumpBoost = 1.15; } },

  { id: 'gloves', kind: 'upgrade', price: 300,
    name: 'Power Gloves', desc: 'Every hit on a boss counts double.',
    apply: function () { RID.state.upgrades.hitPower = 2; } },

  { id: 'turbo', kind: 'upgrade', price: 260,
    name: 'Turbo Engine', desc: '12% more top speed on the Rainbow Road.',
    apply: function () { RID.state.upgrades.kartSpeed = 1.12; } },

  { id: 'armor', kind: 'upgrade', price: 420,
    name: "Bowser's Armor", desc: 'Absorbs the first hit of every level. For the final battle.',
    apply: function () { RID.state.upgrades.shield = 1; } },

  /* ---- accesorios ---- */
  { id: 'crown',   kind: 'cosmetic', price: 220, slot: 'head',
    name: 'Golden Crown', desc: 'A royal crown for a real hero.' },
  { id: 'goggles', kind: 'cosmetic', price: 120, slot: 'head',
    name: 'Racing Goggles', desc: 'Kart goggles resting on your forehead.' },
  { id: 'cape',    kind: 'cosmetic', price: 160, slot: 'back',
    name: 'Hero Cape', desc: 'A red cape that waves as you run.' },
  { id: 'skirt',   kind: 'cosmetic', price: 100, slot: 'waist',
    name: 'Adventure Skirt', desc: 'A blue skirt over the overalls.' },
  { id: 'scarf',   kind: 'cosmetic', price: 90,  slot: 'waist',
    name: 'Red Scarf', desc: 'A scarf around your neck.' },
  { id: 'bow',     kind: 'cosmetic', price: 110, slot: 'head',
    name: 'Ribbon Bow', desc: 'A pink bow that sways when you move.' },
  { id: 'hairGold', kind: 'cosmetic', price: 130, slot: 'hair',
    name: 'Golden Hair', desc: 'Dye your hair golden blonde.' },
  { id: 'hairPink', kind: 'cosmetic', price: 130, slot: 'hair',
    name: 'Pink Hair', desc: 'Dye your hair bright pink.' },
  { id: 'hairSnow', kind: 'cosmetic', price: 130, slot: 'hair',
    name: 'Snow Hair', desc: 'Dye your hair icy white.' }
];


/* =========================================================================
   PARTE 13.2 — RID.Shop   (niveles 9, 14 y 18)
   ========================================================================= */

RID.Shop = (function () {

  var tab = 'upgrade', onLeave = null, wired = false;

  function find(id) {
    for (var i = 0; i < RID.DATA.shop.length; i++) {
      if (RID.DATA.shop[i].id === id) return RID.DATA.shop[i];
    }
    return null;
  }

  function owns(id)      { return RID.state.shopOwned.indexOf(id) >= 0; }
  function equipped(id)  {
    var slot = (find(id) || {}).slot;
    return !!slot && RID.state.player.equipped[slot] === id;
  }

  function buy(id) {
    var item = find(id);
    if (!item) return false;
    if (!item.repeat && owns(id)) return false;
    if (item.needs && !owns(item.needs)) {
      RID.UI.toast('Requires ' + find(item.needs).name, 'bad');
      return false;
    }
    if (RID.state.run.coins < item.price) {
      RID.UI.toast(RID.UI.t('notEnough'), 'bad');
      RID.Audio.sfx('sfx.hit');
      return false;
    }

    RID.state.run.coins -= item.price;
    if (!owns(id)) RID.state.shopOwned.push(id);
    if (item.apply) item.apply();
    if (item.kind === 'cosmetic') {
      if (RID.state.player.cosmetics.indexOf(id) < 0) RID.state.player.cosmetics.push(id);
      RID.state.player.equipped[item.slot] = id;      // se pone al comprarlo
    }

    RID.Audio.sfx('sfx.item');
    RID.UI.toast(RID.UI.t('bought') + ' ' + item.name, 'coin');
    RID.UI.setCoins(RID.state.run.coins);
    RID.Storage.save();
    render();
    return true;
  }

  function toggleEquip(id) {
    var item = find(id);
    if (!item || !owns(id)) return;
    var eq = RID.state.player.equipped;
    eq[item.slot] = (eq[item.slot] === id) ? null : id;
    RID.Audio.sfx('sfx.jump');
    RID.Storage.save();
    render();
  }

  /* ---------- interfaz ---------- */
  function itemCard(item) {
    var have  = owns(item.id);
    var afford = RID.state.run.coins >= item.price;
    var blocked = item.needs && !owns(item.needs);

    var el = U.make('div', 'shop-item' + (have && !item.repeat ? ' is-owned' : '') +
                             (!afford ? ' cant-afford' : ''));
    el.appendChild(U.make('span', 'si-name', item.name));
    el.appendChild(U.make('span', 'si-desc', item.desc));

    var price = U.make('span', 'si-price');
    price.appendChild(U.make('span', 'coin-icon'));
    price.appendChild(U.make('span', null, String(item.price)));
    el.appendChild(price);

    var btn = U.make('button', 'btn btn-small');
    btn.type = 'button';

    if (item.kind === 'cosmetic' && have) {
      btn.textContent = equipped(item.id) ? 'REMOVE' : 'WEAR';
      btn.className = 'btn btn-small' + (equipped(item.id) ? '' : ' btn-primary');
      U.on(btn, 'click', function () { toggleEquip(item.id); });
    } else if (have && !item.repeat) {
      btn.textContent = 'OWNED';
      btn.disabled = true;
    } else if (blocked) {
      btn.textContent = 'LOCKED';
      btn.disabled = true;
    } else {
      btn.textContent = 'BUY';
      btn.className = 'btn btn-small btn-primary';
      btn.disabled = !afford;
      U.on(btn, 'click', function () { buy(item.id); });
    }
    el.appendChild(btn);
    return el;
  }

  function render() {
    var host = U.el('#shop-items');
    U.clear(host);
    RID.DATA.shop.forEach(function (item) {
      if (item.kind === tab) host.appendChild(itemCard(item));
    });
    U.el('#shop-coins').textContent = RID.state.run.coins;
    U.els('.shop-tabs .tab').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab') === tab);
    });
  }

  function open(leaveCallback) {
    onLeave = leaveCallback || null;
    tab = 'upgrade';
    render();
    RID.Screens.show('shop');
    RID.UI.toast('Spend your coins wisely', 'coin');
  }

  function close() {
    onLeave = null;
    RID.Screens.hide('shop');
  }

  function leave() {
    var cb = onLeave;
    onLeave = null;
    RID.Screens.hide('shop');
    if (cb) cb();
  }

  function wire() {
    if (wired) return;
    wired = true;
    U.els('.shop-tabs .tab').forEach(function (b) {
      U.on(b, 'click', function () { tab = b.getAttribute('data-tab'); render(); });
    });
    U.on(U.el('#shop-leave'), 'click', leave);
  }

  return { open: open, close: close, buy: buy, owns: owns, equipped: equipped,
           toggleEquip: toggleEquip, wire: wire, find: find };
})();

RID.Events.on('boot:ready', function () { RID.Shop.wire(); });


/* =========================================================================
   PARTE 13.3 — MECÁNICA 'shop'  (niveles 9, 14 y 18)
   La tienda es un nivel más: se entra desde el mapa y se supera al salir.
   ========================================================================= */

RID.Levels.register('shop', (function () {
  var api = null;

  return {
    init: function (a) { api = a; },
    start: function () {
      api.objective('SHOP');
      api.gauge(null);
      RID.Shop.open(function () { api.complete({ coins: 0 }); });
    },
    update: function () { },
    render: function () { },
    destroy: function () { RID.Shop.close(); api = null; }
  };
})());


/* =========================================================================
   PARTE 14 — Boletín de resultados
   Un intento por nivel: aquí se ve cuántas respuestas correctas se tuvieron
   de cuántas, nivel por nivel, y el total de la partida.
   ========================================================================= */

(function () {

  var TOPIC = {
    vocabulary: 'Vocabulary',
    sentences:  'Sentence building',
    decisions:  'Personal decisions',
    goals:      'Personal goals',
    school:     'School decisions'
  };

  function topicOf(def) {
    if (!def) return '—';
    if (def.type === 'shop') return 'Shop';
    var cat = def.params && def.params.category;
    return TOPIC[cat] || '—';
  }

  function render() {
    var body = U.el('#results-body');
    U.clear(body);

    for (var id = 1; id <= CFG.TOTAL_LEVELS; id++) {
      var def = RID.Levels.definition(id);
      var res = RID.Progress.resultOf(id);
      var tr  = U.make('tr');

      if (!res) tr.className = 'is-skipped';

      tr.appendChild(U.make('td', null, String(id)));
      tr.appendChild(U.make('td', null, def ? RID.Levels.levelName(def) : '—'));
      tr.appendChild(U.make('td', 'res-topic', topicOf(def)));

      if (res && res.t > 0) {
        tr.appendChild(U.make('td', 'res-score', res.c + ' / ' + res.t));
      } else if (res) {
        tr.appendChild(U.make('td', 'res-score', '—'));
      } else {
        tr.appendChild(U.make('td', 'res-skip', '—'));
      }

      tr.appendChild(U.make('td',
        res ? (res.ok ? 'res-pass' : 'res-fail') : 'res-skip',
        res ? RID.UI.t(res.ok ? 'passed' : 'failed') : RID.UI.t('notPlayed')));

      body.appendChild(tr);
    }

    var tot = RID.Progress.totals();
    U.el('#results-player').textContent =
      (RID.state.player.name || '') + '  ·  ' + RID.state.pet.name;
    U.el('#results-total').innerHTML =
      RID.UI.t('totalScore') + ': <b>' + tot.correct + ' / ' + tot.total + '</b>' +
      '  (' + tot.pct + '%)  ·  ' +
      RID.UI.t('passed') + ': <b>' + RID.Progress.clearedCount() + ' / ' + CFG.TOTAL_LEVELS + '</b>';
  }

  RID.Flow.showResults = function (onClose) {
    RID.Screens.hideAll();
    RID.Screens.closeAllOverlays();
    RID.Screens.setHUD(false);
    RID.Loop.setScene(null);

    render();
    RID.Screens.show('results');

    var btn = U.el('#results-close');
    btn.onclick = function () {
      btn.onclick = null;
      if (onClose) onClose();
      else RID.Flow.goTitle();
    };
  };

  /* Final del juego: abrazo con la mascota -> boletín -> título */
  RID.Events.on('game:victory', function () {
    RID.Flow.showVictory(function () {
      RID.Flow.showResults(function () { RID.Flow.goTitle(); });
    });
  });
})();


/* =========================================================================
   PARTE 16 — MECÁNICA 'stomp'  (nivel 13: los Shy Guys hipnotizados)
   Se vence a los Shy Guys SALTANDO SOBRE SU CABEZA. Tocarlos de lado
   cuesta una huella. Saltar gasta energía y la energía solo se recupera
   en las cajas de poder, ordenando la frase de la imagen. Acertar da
   además una ESTRELLA: unos segundos en los que basta con rozarlos.
   ========================================================================= */

RID.Levels.register('stomp', (function () {

  var GROUND  = 452;
  var GRAVITY = 1900;
  var SPEED   = 230;
  var JUMP_V  = 600;
  var BOUNCE  = 430;         // rebote al pisar una cabeza
  var LENGTH  = 5200;
  var TRIGGER = 46;

  var api, cfg, S;

  /* ---------- construcción del recorrido ---------- */
  /* El salto cubre unos 145 px, así que ninguna fosa pasa de eso.
     Las fosas se colocan PRIMERO y todo lo demás se aparta de ellas. */
  function buildLayout() {
    var plats = [], boxes = [], foes = [], pits = [], i;

    if (cfg.pits) {
      for (i = 0; i < cfg.pits; i++) {
        pits.push({ x: 760 + i * 700, w: 96 + (i % 3) * 8 });   // 96..112 px
      }
    }

    /* Si x cae sobre una fosa, se pasa al suelo firme de más allá */
    function safeX(x) {
      for (var k = 0; k < pits.length; k++) {
        if (x > pits[k].x - 30 && x < pits[k].x + pits[k].w + 30) {
          return pits[k].x + pits[k].w + 70;
        }
      }
      return x;
    }

    /* Tramo de suelo firme que contiene x */
    function corridor(x) {
      var lo = 40, hi = LENGTH - 60, k, pt;
      for (k = 0; k < pits.length; k++) {
        pt = pits[k];
        if (pt.x + pt.w <= x) lo = Math.max(lo, pt.x + pt.w + 16);
        if (pt.x >= x)        hi = Math.min(hi, pt.x - 16);
      }
      return { lo: lo, hi: hi };
    }

    /* plataformas flotantes, siempre sobre suelo firme */
    var ph = [[1080, 372, 170], [1780, 348, 150], [2480, 366, 180],
              [3180, 340, 150], [3880, 368, 170], [4580, 350, 160]];
    for (i = 0; i < ph.length; i++) {
      plats.push({ x: safeX(ph[i][0]), y: ph[i][1], w: ph[i][2] });
    }

    /* una caja antes de cada fosa, nunca encima de ninguna */
    for (i = 0; i < cfg.boxes; i++) {
      boxes.push({ x: safeX(420 + i * 740), done: false, index: i });
    }

    /* los enemigos de suelo patrullan SOLO dentro de su tramo firme:
       así ninguno se queda flotando sobre una fosa */
    for (i = 0; i < cfg.enemies; i++) {
      var pl = (i % 3 === 2) ? plats[Math.floor(i / 3)] : null;
      if (pl) {
        foes.push({ x: pl.x + pl.w / 2, y: pl.y,
                    x0: pl.x + 18, x1: pl.x + pl.w - 18,
                    dir: (i % 2) ? 1 : -1, alive: true, squash: 0, plat: pl });
      } else {
        var fx = safeX(620 + i * 540);
        var c  = corridor(fx);
        var lo = Math.max(fx - 120, c.lo);
        var hi = Math.min(fx + 120, c.hi);
        if (hi - lo < 60) { lo = c.lo; hi = Math.max(c.lo + 60, c.hi); }
        foes.push({ x: U.clamp(fx, lo, hi), y: GROUND, x0: lo, x1: hi,
                    dir: (i % 2) ? 1 : -1, alive: true, squash: 0, plat: null });
      }
    }
    return { plats: plats, boxes: boxes, foes: foes, pits: pits };
  }

  function platAt(px) {
    for (var i = 0; i < S.plats.length; i++) {
      var p = S.plats[i];
      if (px >= p.x && px <= p.x + p.w) return p;
    }
    return null;
  }

  /* Suelo bajo el jugador: el suelo firme o una plataforma que quede encima */
  function groundAt(px, py) {
    var p = platAt(px);
    if (p && py <= p.y + 26) return p.y;
    return overPit(px) ? null : GROUND;
  }

  function foeBox(f) { return { x: f.x - 20, y: f.y - 46, w: 40, h: 46 }; }
  function playerBox(p) { return { x: p.x - 11, y: p.y - 44, w: 22, h: 44 }; }

  return {

    init: function (a, c) {
      api = a; cfg = c;
      var L = buildLayout();

      S = {
        plats: L.plats, boxes: L.boxes, foes: L.foes, pits: L.pits,
        foeSprite: cfg.foe || 'shyguy',
        cam: 0, t: 0, energy: 100, star: 0,
        beaten: 0, answered: 0, coins: 0, phase: 'play', warned: false,
        queue: api.deck(cfg.category, cfg.boxes),
        player: { x: 90, y: GROUND, vx: 0, vy: 0, onGround: true, face: 1, spawnX: 90 },
        exitX: LENGTH - 150
      };

      S.label = cfg.label || 'SHY GUYS';
      api.objective(S.label + ' 0/' + cfg.enemies);
      api.gauge('energy', 100);
    },

    start: function () {
      api.toast('Jump on their heads! Answer to refill energy', 'coin');
    },

    update: function (dt) {
      if (!S || S.phase === 'dead') return;
      S.t += dt;
      var p = S.player, i, f;

      if (S.star > 0) S.star -= dt;

      /* --- movimiento --- */
      var move = 0;
      if (api.input.isDown('left'))  move -= 1;
      if (api.input.isDown('right')) move += 1;
      if (move) p.face = move;
      p.vx = move * SPEED;

      if (api.input.pressed('action') && p.onGround) {
        if (S.energy <= 0) {
          api.toast('No energy to jump — find a power box', 'bad');
        } else {
          p.vy = -JUMP_V * RID.state.upgrades.jumpBoost;
          p.onGround = false;
          api.sfx('sfx.jump');
          RID.FX.particles('dust', p.x - S.cam, p.y, 6);
        }
      }

      p.vy += GRAVITY * dt;
      var prevX = p.x;
      p.x = U.clamp(p.x + p.vx * dt, 24, LENGTH - 24);
      p.y += p.vy * dt;

      /* pared: una plataforma más alta se salta, no se atraviesa */
      var side = platAt(p.x);
      if (side && p.y > side.y + 26 && p.y < side.y + 90) { p.x = prevX; p.vx = 0; }

      var g = groundAt(p.x, p.y);
      if (g === null) {
        p.onGround = false;
        if (p.y > CFG.H + 80) { fall(); return; }
      } else if (p.vy >= 0 && p.y >= g - 2 && p.y <= g + 42) {
        p.y = g; p.vy = 0; p.onGround = true;
      } else if (p.y < g - 2) {
        p.onGround = false;
      }

      /* --- energía: baja con el tiempo --- */
      S.energy = U.clamp(S.energy - cfg.drain * RID.state.upgrades.gaugeDrain * dt, 0, 100);
      api.gauge('energy', S.energy);
      if (S.energy <= 0 && !S.warned) {
        S.warned = true;
        api.toast('Out of energy!', 'bad');
      } else if (S.energy > 25) {
        S.warned = false;
      }

      /* --- Shy Guys patrullando --- */
      for (i = 0; i < S.foes.length; i++) {
        f = S.foes[i];
        if (!f.alive) { f.squash = Math.min(1, f.squash + dt * 5); continue; }
        f.x += f.dir * 62 * dt;
        if (f.x < f.x0) { f.x = f.x0; f.dir = 1; }
        if (f.x > f.x1) { f.x = f.x1; f.dir = -1; }

        if (!U.aabb(playerBox(p), foeBox(f))) continue;

        var stomping = (p.vy > 0) && (p.y - 12 < f.y - 26);
        if (stomping || S.star > 0) {
          f.alive = false;
          S.beaten++;
          p.vy = -BOUNCE;
          p.onGround = false;
          S.coins += 5;
          api.coins(5);
          api.sfx('sfx.hit');
          RID.FX.particles('star', f.x - S.cam, f.y - 30, 12);
          api.objective(S.label + ' ' + S.beaten + '/' + cfg.enemies);
        } else {
          hit();
          return;
        }
      }

      /* --- cajas de poder --- */
      for (i = 0; i < S.boxes.length; i++) {
        var bx = S.boxes[i];
        if (bx.done) continue;
        if (Math.abs(p.x - bx.x) < TRIGGER) { askBox(bx); return; }
      }

      /* --- salida --- */
      if (p.x >= S.exitX && S.beaten >= cfg.enemies) {
        S.phase = 'done';
        api.sfx('sfx.door');
        api.complete({ coins: S.coins });
        return;
      }

      S.cam = U.lerp(S.cam, U.clamp(p.x - CFG.W / 2, 0, Math.max(0, LENGTH - CFG.W)),
                     Math.min(1, dt * 7));
    },

    render: function (ctx) {
      if (!S) return;
      var cam = S.cam, i, x;

      var deco = !api.hasBg;
      if (!deco) { ctx.fillStyle = 'rgba(20,10,0,.26)'; ctx.fillRect(0, 0, CFG.W, CFG.H); }

      ctx.save();
      ctx.translate(-cam, 0);

      if (deco) {
        /* cielo del desierto */
        var sk = ctx.createLinearGradient(0, 0, 0, CFG.H);
        sk.addColorStop(0, '#f0a83c'); sk.addColorStop(0.55, '#f8d489'); sk.addColorStop(1, '#e8c47a');
        ctx.fillStyle = sk; ctx.fillRect(cam, 0, CFG.W, CFG.H);

        /* pirámides al fondo */
        ctx.fillStyle = 'rgba(184,134,58,.75)';
        for (x = Math.floor(cam / 520) * 520; x < cam + CFG.W + 520; x += 520) {
          ctx.beginPath();
          ctx.moveTo(x, GROUND); ctx.lineTo(x + 190, GROUND - 240); ctx.lineTo(x + 380, GROUND);
          ctx.closePath(); ctx.fill();
        }
        /* dunas */
        ctx.fillStyle = '#e0b464';
        for (x = Math.floor(cam / 260) * 260; x < cam + CFG.W + 260; x += 260) {
          U.ellipse(ctx, x, GROUND + 8, 210, 46); ctx.fill();
        }
      }

      /* suelo de arena */
      ctx.fillStyle = '#d9a94e';
      ctx.fillRect(cam, GROUND, CFG.W, 12);
      ctx.fillStyle = '#b8863a';
      ctx.fillRect(cam, GROUND + 12, CFG.W, CFG.H - GROUND - 12);
      ctx.fillStyle = 'rgba(140,100,40,.45)';
      for (x = Math.floor(cam / 44) * 44; x < cam + CFG.W + 44; x += 44) {
        ctx.fillRect(x + 8, GROUND + 26, 22, 6);
      }

      /* fosas */
      for (i = 0; i < S.pits.length; i++) {
        var pt = S.pits[i];
        if (pt.x + pt.w < cam - 60 || pt.x > cam + CFG.W + 60) continue;
        var pg = ctx.createLinearGradient(0, GROUND, 0, CFG.H);
        pg.addColorStop(0, '#241a10'); pg.addColorStop(1, '#000');
        ctx.fillStyle = pg;
        ctx.fillRect(pt.x, GROUND, pt.w, CFG.H - GROUND);
        ctx.fillStyle = 'rgba(255,80,80,' + (0.2 + 0.15 * Math.sin(S.t * 4 + i)) + ')';
        ctx.fillRect(pt.x, GROUND - 5, pt.w, 5);
      }

      /* plataformas de piedra */
      for (i = 0; i < S.plats.length; i++) {
        var pl = S.plats[i];
        if (pl.x + pl.w < cam - 60 || pl.x > cam + CFG.W + 60) continue;
        ctx.fillStyle = '#c9a45c';
        ctx.fillRect(pl.x, pl.y, pl.w, 14);
        ctx.fillStyle = '#e0bd7a';
        ctx.fillRect(pl.x, pl.y, pl.w, 5);
        ctx.fillStyle = '#8a5f28';
        ctx.fillRect(pl.x, pl.y + 14, pl.w, 12);
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        for (x = 0; x < pl.w; x += 30) ctx.fillRect(pl.x + x + 4, pl.y + 4, 20, 4);
      }

      /* cajas de poder */
      for (i = 0; i < S.boxes.length; i++) {
        var bx = S.boxes[i];
        if (bx.x < cam - 80 || bx.x > cam + CFG.W + 80) continue;
        var bob = Math.sin(S.t * 3 + i) * 5;
        var by = GROUND - 96 + bob;

        if (bx.done) {
          ctx.fillStyle = '#7a6a4a';
          ctx.fillRect(bx.x - 22, by - 22, 44, 44);
          ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
          ctx.strokeRect(bx.x - 22, by - 22, 44, 44);
          continue;
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var gl = ctx.createRadialGradient(bx.x, by, 4, bx.x, by, 70);
        gl.addColorStop(0, 'rgba(255,240,160,.30)');
        gl.addColorStop(1, 'rgba(255,240,160,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(bx.x, by, 70, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#e8a020';
        ctx.fillRect(bx.x - 22, by - 22, 44, 44);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeRect(bx.x - 22, by - 22, 44, 44);
        ctx.fillStyle = '#7a4a10';
        [[-16, -16], [10, -16], [-16, 10], [10, 10]].forEach(function (q) {
          ctx.fillRect(bx.x + q[0], by + q[1], 6, 6);
        });
        U.pixelText(ctx, '?', bx.x, by, 26, '#fff3c0');
      }

      /* Shy Guys */
      for (i = 0; i < S.foes.length; i++) {
        var f = S.foes[i];
        if (f.x < cam - 80 || f.x > cam + CFG.W + 80) continue;
        if (!f.alive) {
          if (f.squash >= 1) continue;
          ctx.save();
          ctx.globalAlpha = 1 - f.squash;
          ctx.translate(f.x, f.y);
          ctx.scale(1 + f.squash * 0.4, Math.max(0.05, 1 - f.squash));
          RID.Avatar.drawSprite(ctx, S.foeSprite, 0, 0, 2.5);
          ctx.restore();
          continue;
        }
        RID.Avatar.drawSprite(ctx, S.foeSprite, f.x, f.y, 2.5, { flip: f.dir > 0 });
        /* espiral de hipnosis (solo los Shy Guys hechizados) */
        if (cfg.hypno) {
          ctx.strokeStyle = 'rgba(180,110,255,.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (var a = 0; a < 12; a++) {
            var r = a * 1.3, ang = a * 0.75 + S.t * 4 + i;
            var px = f.x + Math.cos(ang) * r, py = f.y - 62 + Math.sin(ang) * r * 0.6;
            if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }

      /* salida: la pirámide de Morton */
      var open = S.beaten >= cfg.enemies;
      ctx.fillStyle = open ? '#d9a94e' : '#7a5f38';
      ctx.beginPath();
      ctx.moveTo(S.exitX - 40, GROUND);
      ctx.lineTo(S.exitX + 70, GROUND - 190);
      ctx.lineTo(S.exitX + 180, GROUND);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = open ? '#2b1d10' : '#4a3a24';
      ctx.fillRect(S.exitX + 46, GROUND - 78, 48, 78);
      U.pixelText(ctx, open ? 'ENTER' : 'LOCKED', S.exitX + 70, GROUND - 208, 15,
                  open ? '#ffd447' : '#8a7550');

      /* jugador */
      if (!RID.FX.isBusy()) {
        if (S.star > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          var sg = ctx.createRadialGradient(S.player.x, S.player.y - 34, 4,
                                            S.player.x, S.player.y - 34, 60);
          sg.addColorStop(0, 'rgba(255,240,120,.45)');
          sg.addColorStop(1, 'rgba(255,240,120,0)');
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.arc(S.player.x, S.player.y - 34, 60, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        var pose = !S.player.onGround ? 'jump' : (S.player.vx ? 'run' : 'idle');
        ctx.save();
        if (S.star > 0 && Math.floor(S.t * 14) % 2 === 0) ctx.globalAlpha = 0.75;
        if (S.player.face < 0) { ctx.translate(S.player.x * 2, 0); ctx.scale(-1, 1); }
        RID.Avatar.drawPlayer(ctx, S.player.x, S.player.y, 1.55, pose, S.t);
        ctx.restore();
      }

      ctx.restore();

      /* aviso de estrella activa */
      if (S.star > 0) {
        U.pixelText(ctx, 'STAR ' + S.star.toFixed(1), CFG.W - 90, 96, 16, '#ffe066');
      }
    },

    destroy: function () { S = null; }
  };

  /* ---------- acciones ---------- */
  function askBox(bx) {
    S.phase = 'question';
    S.player.vx = 0;

    var q = S.queue.shift() || api.deck(cfg.category, 1)[0];
    if (!q) { bx.done = true; S.phase = 'play'; return; }

    RID.Questions.ask(q, {
      counter: (S.answered + 1) + '/' + cfg.boxes,
      seconds: cfg.seconds || 0,
      allowHint: true,
      onEnd: function (res) {
        bx.done = true;
        S.answered++;
        S.player.spawnX = bx.x;

        if (res.correct) {
          S.energy = 100;
          S.star = cfg.starTime;
          S.coins += cfg.coinsPerCorrect;
          api.coins(cfg.coinsPerCorrect);
          api.gauge('energy', S.energy);
          api.toast('STAR POWER! Touch them to win', 'coin');
          RID.FX.particles('star', bx.x - S.cam, GROUND - 96, 18);
          S.phase = 'play';
          return;
        }
        S.energy = Math.max(S.energy, 40);
        api.gauge('energy', S.energy);
        api.toast('Wrong answer — one paw lost!', 'bad');
        wrongPenalty(bx);
      }
    });
  }

  function wrongPenalty(bx) {
    S.phase = 'dead';
    RID.FX.particles('smoke', S.player.x - S.cam, S.player.y - 30, 12);
    api.loseLife(S.player.x - S.cam, S.player.y - 20, function () {
      if (!S) return;
      S.player.x = bx.x;
      S.player.y = GROUND;
      S.player.vx = 0; S.player.vy = 0;
      S.phase = 'play';
    });
  }

  function hit() {
    if (S.phase === 'dead') return;
    S.phase = 'dead';
    api.loseLife(S.player.x - S.cam, S.player.y - 20, function () {
      if (!S) return;
      S.player.x  = S.player.spawnX;
      S.player.y  = GROUND;
      S.player.vx = 0; S.player.vy = 0;
      S.energy    = Math.max(S.energy, 55);
      api.gauge('energy', S.energy);
      S.phase = 'play';
    });
  }
})());


/* =========================================================================
   PARTE 19 — MECÁNICA 'party'  (nivel 20: la fiesta en el castillo de Peach)
   No hay enemigos ni preguntas: es la celebración. Mario y sus amigos
   levantan un trofeo gigante con el nombre del jugador grabado y la
   mascota al lado. Se cierra con cualquier tecla.
   ========================================================================= */

RID.Levels.register('party', (function () {

  var GROUND = 470;
  var api, cfg, S;

  /* Quién sostiene el trofeo, en orden de izquierda a derecha */
  var CREW = [
    { id: 'mario',  s: 2.6 }, { id: 'luigi', s: 2.6 }, { id: 'toad',  s: 2.3 },
    { id: 'peach',  s: 2.7 }, { id: 'daisy', s: 2.6 }, { id: 'yoshi', s: 2.4 },
    { id: 'dk',     s: 2.9 }
  ];

  function confetti(n) {
    var out = [], i;
    var cols = ['#ff4d6d', '#ffd447', '#4ade80', '#5eb3ff', '#b197fc', '#ff9500'];
    for (i = 0; i < n; i++) {
      out.push({
        x: U.rand(0, CFG.W), y: U.rand(-CFG.H, 0),
        vy: U.rand(50, 130), vx: U.rand(-24, 24),
        w: U.rand(4, 9), h: U.rand(6, 12),
        rot: U.rand(0, 6.3), spin: U.rand(-4, 4),
        c: cols[i % cols.length]
      });
    }
    return out;
  }

  return {

    init: function (a, c) {
      api = a; cfg = c;
      S = { t: 0, conf: confetti(90), done: false, ready: 0 };
      api.objective('');
      api.gauge(null);
    },

    start: function () {
      api.toast('Press SPACE to finish', 'coin');
      RID.Audio.playMusic('music.final');
    },

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
