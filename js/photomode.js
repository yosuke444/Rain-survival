// =============================================================
// 撮影モード（Q）と録画のセットアップ（E）
// 押した瞬間に時間が止まる。ズーム・角度（世界が回る）・位置・フィルターを決めて
// 「撮影完了」で写真を撮る。録画は同じ画面で「何を撮るか」を決めてから始める
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, S = RS.sketch, COL = RS.COL;
  const ui = RS.ui;
  const PM = RS.pm = {};

  PM.FILTERS = ['なし', 'セピア', 'モノクロ', 'あたたかい', 'つめたい', 'ふんわり', 'ビビッド', '夕やけ'];
  PM.ZOOM_MIN = 1; PM.ZOOM_MAX = 3;
  PM.ROT_SPEED = 0.7;   // 角度を変える速さ（ラジアン/秒）
  PM.ZOOM_SPEED = 1.2;  // ズームの速さ（倍/秒）

  PM.blank = () => ({ zoom: 1, rot: 0, px: 0, py: 0, filter: 0 });

  PM.enter = function (game, video) {
    game.pm = Object.assign(PM.blank(), game.pmLast && video ? game.pmLast : {}, { video: !!video, cur: 0, drag: null });
    game.mine.key = null;
    game.showTouch();
  };
  PM.exit = function (game) {
    game.pm = null;
    game.mineLock = true; game.placeCd = 0.3;
    game.showTouch();
  };

  // ---- 画面の変形（世界を回す・拡大する・ずらす） ----
  PM.transform = function (g, W, H, s) {
    g.translate(W / 2, H / 2);
    g.rotate(s.rot);
    g.scale(s.zoom, s.zoom);
    g.translate(-W / 2 + s.px, -H / 2 + s.py);
  };
  // 録画で撮る範囲（画面上の4すみ）
  PM.frameCorners = function (W, H, s) {
    const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    return [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => {
      const dx = (x - W / 2) / s.zoom, dy = (y - H / 2) / s.zoom;
      return [dx * c - dy * sn + W / 2 - s.px, dx * sn + dy * c + H / 2 - s.py];
    });
  };

  // ---- フィルター（どのブラウザでも使える合成のしかたで作る） ----
  PM.filter = function (g, w, h, i, canvas) {
    const name = PM.FILTERS[i];
    if (!name || name === 'なし') return;
    const fill = (op, col, a) => { g.save(); g.globalCompositeOperation = op; g.globalAlpha = a == null ? 1 : a; g.fillStyle = col; g.fillRect(0, 0, w, h); g.restore(); };
    const vignette = (col, a) => {
      const r = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, col);
      g.save(); g.globalAlpha = a; g.fillStyle = r; g.fillRect(0, 0, w, h); g.restore();
    };
    switch (name) {
      case 'モノクロ': fill('saturation', '#808080'); vignette('rgba(0,0,0,1)', 0.25); break;
      case 'セピア': fill('saturation', '#808080'); fill('color', '#b08a5a'); vignette('rgba(60,35,10,1)', 0.35); break;
      case 'あたたかい': fill('soft-light', '#ffb36b', 0.6); break;
      case 'つめたい': fill('soft-light', '#6bb6ff', 0.6); break;
      case 'ふんわり': fill('screen', '#ffffff', 0.18); fill('soft-light', '#ffc6d9', 0.4); vignette('rgba(255,255,255,1)', 0.5); break;
      case 'ビビッド': { g.save(); g.globalCompositeOperation = 'soft-light'; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(canvas, 0, 0); g.restore(); break; }
      case '夕やけ': {
        fill('soft-light', '#ff7a59', 0.55);
        const lg = g.createLinearGradient(0, 0, 0, h);
        lg.addColorStop(0, 'rgba(255,120,80,0.35)'); lg.addColorStop(1, 'rgba(120,60,140,0.25)');
        g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = lg; g.fillRect(0, 0, w, h); g.restore();
        break;
      }
    }
  };

  // ---- ボタン ----
  PM.layout = function (game) {
    const W = game.W, H = game.H;
    const s = Math.round(RS.clamp(Math.min(W / 11, H / 9), 30, 50));
    const pm = game.pm;
    const items = [
      { id: 'zout', label: '－' }, { id: 'zin', label: '＋' },
      { id: 'rl', label: '↺' }, { id: 'rr', label: '↻' },
      { id: 'fprev', label: '◀' }, { id: 'fname', label: PM.FILTERS[pm.filter], wide: 3.2 }, { id: 'fnext', label: '▶' },
      { id: 'reset', label: 'もとに戻す', wide: 2.6 },
      { id: 'cancel', label: 'やめる', wide: 2.0 },
      { id: 'ok', label: pm.video ? '録画開始' : '撮影完了', wide: 2.6, main: true },
    ];
    const gap = 6;
    const units = items.reduce((a, it) => a + (it.wide || 1), 0);
    let unit = s;
    let total = units * unit + gap * (items.length - 1);
    const rows = total > W - 16 ? 2 : 1;
    const L = { s, buttons: [] };
    if (rows === 1) {
      let x = (W - total) / 2;
      for (const it of items) { const w = (it.wide || 1) * unit; L.buttons.push(Object.assign({ x, y: H - s - 12, w, h: s }, it)); x += w + gap; }
    } else {
      const split = 7;
      [items.slice(0, split), items.slice(split)].forEach((row, r) => {
        const u2 = Math.min(s, (W - 16 - gap * (row.length - 1)) / row.reduce((a, it) => a + (it.wide || 1), 0));
        const t2 = row.reduce((a, it) => a + (it.wide || 1) * u2, 0) + gap * (row.length - 1);
        let x = (W - t2) / 2;
        const y = H - (2 - r) * (s + 8) - 4;
        for (const it of row) { const w = (it.wide || 1) * u2; L.buttons.push(Object.assign({ x, y, w, h: s }, it)); x += w + gap; }
      });
    }
    L.top = L.buttons[0].y; // これより上は「位置を動かす」ドラッグの場所
    return L;
  };

  function press(game, id) {
    const pm = game.pm;
    switch (id) {
      case 'zout': pm.zoom = Math.max(PM.ZOOM_MIN, pm.zoom / 1.15); break;
      case 'zin': pm.zoom = Math.min(PM.ZOOM_MAX, pm.zoom * 1.15); break;
      case 'rl': pm.rot -= Math.PI / 36; break;
      case 'rr': pm.rot += Math.PI / 36; break;
      case 'fprev': pm.filter = (pm.filter + PM.FILTERS.length - 1) % PM.FILTERS.length; break;
      case 'fname': case 'fnext': pm.filter = (pm.filter + 1) % PM.FILTERS.length; break;
      case 'reset': Object.assign(pm, PM.blank()); break;
      case 'cancel': PM.exit(game); break;
      case 'ok': finish(game); break;
    }
  }

  function finish(game) {
    const pm = game.pm;
    const setup = { zoom: pm.zoom, rot: pm.rot, px: pm.px, py: pm.py, filter: pm.filter };
    game.pmLast = setup;
    if (pm.video) {
      PM.exit(game);
      RS.rec.start(game, setup);
    } else {
      game.photoReq = true; // この画面のまま撮る（UI は写らない）
      game.photoExit = true;
    }
  }

  PM.update = function (game, dt) {
    const inp = game.input, pm = game.pm;
    const L = PM.layout(game);
    const kbd = game.mode === 'auto';
    // マウス（マウスモード）・タッチ
    for (const e of inp.events) {
      const mouse = e.ptype === 'mouse';
      if (mouse && game.mode !== 'mouse') continue;
      if (e.type === 'down') {
        const b = L.buttons.find((bt) => ui.inRect(bt, e.x, e.y));
        if (b) { inp.markUI(e.id); if (mouse) { press(game, b.id); if (!game.pm) return; } else pm.tap = b.id; continue; }
        if (!mouse || e.button === 0) pm.drag = { id: e.id, x: e.x, y: e.y };
      } else if (e.type === 'up') {
        if (!mouse && pm.tap) {
          const b = L.buttons.find((bt) => ui.inRect(bt, e.x, e.y));
          const id = pm.tap; pm.tap = null;
          if (b && b.id === id) { press(game, id); if (!game.pm) return; }
        }
        if (pm.drag && pm.drag.id === e.id) pm.drag = null;
      }
    }
    // ドラッグで位置を動かす（回転・拡大を考えて、指の動きどおりに動くように戻す）
    if (pm.drag) {
      const p = inp.ptrs.get(pm.drag.id) || (inp.mouse.has ? inp.mouse : null);
      if (p) {
        const dx = p.x - pm.drag.x, dy = p.y - pm.drag.y;
        const c = Math.cos(-pm.rot), sn = Math.sin(-pm.rot);
        pm.px += (dx * c - dy * sn) / pm.zoom; pm.py += (dx * sn + dy * c) / pm.zoom;
        pm.drag.x = p.x; pm.drag.y = p.y;
      }
    }
    if (game.mode === 'mouse' && inp.wheel) pm.zoom = RS.clamp(pm.zoom * Math.pow(1.0015, -inp.wheel), PM.ZOOM_MIN, PM.ZOOM_MAX);
    // キーボード
    if (inp.pressed('esc') || inp.pressed('menu')) { PM.exit(game); return; }
    if (inp.pressed('use') || inp.pressed(pm.video ? 'rec' : 'photo')) { finish(game); return; }
    if (inp.pressed('reset')) Object.assign(pm, PM.blank());
    if (inp.pressed('one')) pm.filter = (pm.filter + 1) % PM.FILTERS.length;
    for (let i = 1; i <= 8; i++) if (inp.pressed('slot' + i)) pm.filter = i - 1;
    const sh = inp.down('shift');
    const h = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
    const v = (inp.down('down') ? 1 : 0) - (inp.down('up') ? 1 : 0);
    if (sh) { // Shift + 矢印で位置を動かす
      pm.px -= h * 300 * dt / pm.zoom; pm.py -= v * 300 * dt / pm.zoom;
    } else {
      pm.rot += h * PM.ROT_SPEED * dt;
      if (v) pm.zoom = RS.clamp(pm.zoom * Math.pow(PM.ZOOM_SPEED, -v * dt * 2), PM.ZOOM_MIN, PM.ZOOM_MAX);
    }
    void kbd;
  };

  PM.drawUI = function (g, game) {
    const pm = game.pm, L = PM.layout(game), s = L.s, W = game.W;
    // 撮影の枠（四すみのかぎ）
    const m = 14, k = 28;
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.lineCap = 'round';
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [W - m, L.top - 10, -1, -1], [m, L.top - 10, 1, -1]]) {
      g.beginPath(); g.moveTo(x, y + dy * k); g.lineTo(x, y); g.lineTo(x + dx * k, y); g.stroke();
    }
    const title = pm.video ? '録画のセットアップ（時間は止まっています）' : '撮影モード（時間は止まっています）';
    ui.text(g, title, W / 2, 26, s * 0.38, { align: 'center', outline: COL.cream, maxW: W - 40 });
    let hint;
    if (game.touch) hint = 'ドラッグで位置を動かす';
    else if (game.mode === 'auto') hint = '↑↓：ズーム　←→：角度　Shift+矢印：位置　C/1〜8：フィルター　R：もとに戻す　Z：' + (pm.video ? '録画開始' : '撮影完了') + '　X：やめる';
    else hint = 'ドラッグ：位置　ホイール：ズーム　ボタンで操作　X：やめる';
    ui.text(g, hint, W / 2, 26 + s * 0.6, s * 0.28, { align: 'center', outline: COL.cream, maxW: W - 30 });
    ui.text(g, '×' + pm.zoom.toFixed(1) + '　' + Math.round((pm.rot * 180) / Math.PI) + '°', W / 2, L.top - s * 0.45, s * 0.32, { align: 'center', outline: COL.cream });
    L.buttons.forEach((b, i) => {
      S.rect(g, b.x, b.y, b.w, b.h, {
        fill: b.main ? '#ffe9b8' : 'rgba(255,246,230,0.92)', stroke: b.main ? COL.accent : COL.line,
        lw: b.main ? 3 : 2, r: s * 0.25, seed: 800 + i, amp: 1, step: 14,
      });
      ui.text(g, b.label, b.x + b.w / 2, b.y + b.h / 2, s * (b.label.length > 2 ? 0.32 : 0.45), { align: 'center', maxW: b.w - 6 });
    });
  };

  // 録画中：撮っている範囲を点線で表示する（録画には写らない）
  PM.drawRecFrame = function (g, game, s) {
    if (!s || (s.zoom === 1 && s.rot === 0 && s.px === 0 && s.py === 0)) return;
    const c = PM.frameCorners(game.W, game.H, s);
    g.save();
    g.setLineDash([8, 6]); g.strokeStyle = 'rgba(217,86,79,0.9)'; g.lineWidth = 2;
    g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    g.restore();
  };
})();
