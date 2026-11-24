// =============================================================
// 画面の表示（体力・食料・手持ち・モード切替・メニュー）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, S = RS.sketch, C = RS.CONFIG, COL = RS.COL;
  const ui = RS.ui = {};

  ui.font = (s) => `${Math.round(s)}px ${RS.art.FONT}`;
  ui.text = function (g, str, x, y, size, o) {
    o = o || {};
    g.font = ui.font(size);
    g.textAlign = o.align || 'left';
    g.textBaseline = o.base || 'middle';
    if (o.maxW) {
      const w = g.measureText(str).width;
      if (w > o.maxW) { size *= o.maxW / w; g.font = ui.font(size); }
    }
    if (o.outline) {
      g.lineWidth = o.olw || size * 0.25;
      g.strokeStyle = o.outline;
      g.lineJoin = 'round';
      g.strokeText(str, x, y);
    }
    g.fillStyle = o.color || COL.line;
    g.fillText(str, x, y);
  };
  ui.inRect = (r, x, y) => !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  // ---------------- スロット ----------------
  ui.drawSlot = function (g, x, y, s, stack, o) {
    o = o || {};
    const m = s * 0.06;
    S.rect(g, x + m, y + m, s - 2 * m, s - 2 * m, {
      fill: o.sel ? '#ffe9b8' : COL.slot,
      stroke: o.hl ? COL.accent : COL.line,
      lw: o.sel || o.hl ? Math.max(2.5, s * 0.08) : Math.max(1.5, s * 0.045),
      r: s * 0.18, seed: o.seed || 1, amp: s * 0.025, step: s * 0.3,
    });
    if (stack) ui.drawStack(g, x, y, s, stack, o.alpha);
    if (o.num) ui.text(g, o.num, x + s * 0.2, y + s * 0.22, s * 0.26, { align: 'center', color: 'rgba(107,74,47,0.6)' });
  };
  ui.drawStack = function (g, x, y, s, stack, alpha) {
    const pad = s * 0.17;
    if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(RS.art.icons[stack.id], x + pad, y + pad, s - 2 * pad, s - 2 * pad);
    g.globalAlpha = 1;
    if (stack.n > 1) ui.text(g, String(stack.n), x + s * 0.86, y + s * 0.76, s * 0.34, { align: 'right', outline: COL.cream });
  };

  // ---------------- HUD ----------------
  ui.hudLayout = function (game) {
    const W = game.W, H = game.H;
    const s = Math.round(RS.clamp(Math.min(W / 10.5, H / 8, 54), 30, 54));
    const L = { s };
    const hbW = 9 * s;
    L.barW = Math.round(RS.clamp(W * 0.28, 110, 210));
    L.barH = Math.round(s * 0.28);
    const modeW = Math.round(s * 2.6), modeH = Math.round(s * 0.8);
    const pauseW = Math.round(s * (game.touch ? 1.7 : 2.3));
    if (game.touch) {
      L.hotbar = { x: Math.round((W - hbW) / 2), y: 8, w: hbW, h: s };
      L.bars = { x: 10, y: 8 + s + 8 };
      L.mode = { x: W - 10 - modeW, y: 8 + s + 8, w: modeW, h: modeH };
      L.nameY = 8 + s + 8 + s * 1.5;
      L.pause = { x: W - 10 - pauseW, y: 8 + s + 16 + modeH, w: pauseW, h: modeH };
    } else {
      L.hotbar = { x: Math.round((W - hbW) / 2), y: H - s - 12, w: hbW, h: s };
      L.bars = { x: 12, y: 12 };
      L.mode = { x: W - 12 - modeW, y: 12, w: modeW, h: modeH };
      L.nameY = H - s - 12 - s * 0.45;
      L.pause = { x: L.mode.x - 8 - pauseW, y: 12, w: pauseW, h: modeH };
    }
    return L;
  };

  ui.hudHit = function (game, x, y) {
    const L = ui.hudLayout(game);
    if (ui.inRect(L.mode, x, y)) return 'mode';
    if (ui.inRect(L.pause, x, y)) return 'pause';
    if (ui.inRect(L.hotbar, x, y)) return Math.min(8, Math.floor((x - L.hotbar.x) / L.s));
    return null;
  };

  function bar(g, x, y, w, h, frac, color, seed) {
    S.rect(g, x, y, w, h, { fill: '#f1e2c8', r: h / 2, seed, amp: 0.8, step: 14 });
    if (frac > 0.01) S.rect(g, x, y, Math.max(h, w * frac), h, { fill: color, r: h / 2, seed: seed + 1, amp: 0.8, step: 14 });
    S.rect(g, x, y, w, h, { stroke: COL.line, lw: 2, r: h / 2, seed: seed + 2, amp: 0.8, step: 14 });
  }

  ui.drawHUD = function (g, game) {
    const L = ui.hudLayout(game), p = game.player, inv = game.inv, s = L.s;

    // 体力・食料
    const lab = s * 0.36, rowH = Math.max(L.barH + 8, lab * 1.3);
    const labW = lab * 5.4;
    const px = L.bars.x, py = L.bars.y;
    S.rect(g, px, py, labW + L.barW + 20, rowH * 2 + 12, { fill: 'rgba(255,246,230,0.8)', stroke: COL.line, lw: 2, r: 10, seed: 41, amp: 1.2, step: 18 });
    const rows = [
      ['たいりょく', p.hp / C.HP_MAX, '#f29a8e', 43],
      ['おなか', p.food / C.FOOD_MAX, p.food > 0 ? '#f3bf65' : '#d9c7a8', 47],
    ];
    rows.forEach(([name, frac, color, seed], i) => {
      const cy = py + 6 + rowH * i + rowH / 2;
      ui.text(g, name, px + 8, cy, lab);
      bar(g, px + 10 + labW, cy - L.barH / 2, L.barW, L.barH, frac, color, seed);
    });
    if (p.food <= 0) ui.text(g, 'おなかぺこぺこ：ダメージ増', px + 8, py + rowH * 2 + 24, lab * 0.85, { color: '#b5543f', outline: COL.cream });

    // モード切替ボタン
    const m = L.mode;
    S.rect(g, m.x, m.y, m.w, m.h, { fill: COL.cream, stroke: COL.line, lw: 2, r: 10, seed: 51, amp: 1.2, step: 14 });
    const modeName = game.mode === 'auto' ? 'オート' : 'マウス';
    ui.text(g, 'モード：' + modeName + (game.touch ? '' : ' (M)'), m.x + m.w / 2, m.y + m.h / 2, s * 0.32, { align: 'center', maxW: m.w - 10 });

    // ゲーム中メニューを開くボタン
    const pz = L.pause;
    S.rect(g, pz.x, pz.y, pz.w, pz.h, { fill: COL.cream, stroke: COL.line, lw: 2, r: 10, seed: 53, amp: 1.2, step: 14 });
    ui.text(g, 'メニュー' + (game.touch ? '' : ' (Esc)'), pz.x + pz.w / 2, pz.y + pz.h / 2, s * 0.32, { align: 'center', maxW: pz.w - 10 });

    // 手持ち
    const hb = L.hotbar;
    for (let i = 0; i < 9; i++) {
      ui.drawSlot(g, hb.x + i * s, hb.y, s, inv.slots[i], { sel: i === inv.sel, seed: 60 + i, num: game.touch ? null : String(i + 1) });
    }

    // 選んだアイテムの名前
    const held = inv.held();
    if (game.selNameT > 0 && held) {
      g.globalAlpha = Math.min(1, game.selNameT / 0.4);
      ui.text(g, RS.ITEMS[held.id].name, game.W / 2, L.nameY, s * 0.38, { align: 'center', outline: COL.cream });
      g.globalAlpha = 1;
    }

    // お知らせ
    if (game.toastT > 0 && game.toastMsg) {
      g.globalAlpha = Math.min(1, game.toastT / 0.4);
      const fs = s * 0.42;
      g.font = ui.font(fs);
      const tw = Math.min(game.W - 30, g.measureText(game.toastMsg).width + fs * 1.6);
      const ty = game.H * 0.3;
      S.rect(g, game.W / 2 - tw / 2, ty - fs, tw, fs * 2, { fill: 'rgba(255,246,230,0.92)', stroke: COL.line, lw: 2, r: fs * 0.6, seed: 71, amp: 1.2, step: 16 });
      ui.text(g, game.toastMsg, game.W / 2, ty, fs, { align: 'center', maxW: tw - fs });
      g.globalAlpha = 1;
    }

    // 倒れたとき
    if (game.state === 'dead') {
      g.fillStyle = 'rgba(255,246,230,0.55)';
      g.fillRect(0, 0, game.W, game.H);
      ui.text(g, 'たおれてしまった…', game.W / 2, game.H * 0.42, s * 0.7, { align: 'center', outline: COL.cream });
      ui.text(g, 'もちものは そのまま。傘の下で 目をさまします', game.W / 2, game.H * 0.42 + s * 0.8, s * 0.36, { align: 'center', maxW: game.W - 20 });
    }
  };

  // ---------------- メニュー（インベントリ・クラフト） ----------------
  ui.menuLayout = function (game) {
    const W = game.W, H = game.H, size = game.menu.size;
    const key = W + 'x' + H + ':' + size;
    if (ui._ml && ui._ml.key === key) return ui._ml;
    const rowsH = 0.8 + size + 0.5 + 3 + 0.3 + 1 + 0.9 + 0.5;
    const s = Math.floor(RS.clamp(Math.min((W - 20) / 9.8, (H - 16) / rowsH), 24, 58));
    const pw = 9.8 * s, ph = rowsH * s;
    const px = Math.round((W - pw) / 2), py = Math.round((H - ph) / 2);
    const L = { key, s, size, panel: { x: px, y: py, w: pw, h: ph }, slots: [] };
    const left = px + 0.4 * s;

    // クラフト枠
    const cw = size * s + 1.3 * s + s;
    const cx = px + (pw - cw) / 2, cy = py + 0.8 * s;
    for (const i of RS.Inventory.GRID[size]) {
      L.slots.push({ ref: { k: 'craft', i }, x: cx + (i % 3) * s, y: cy + Math.floor(i / 3) * s, s });
    }
    const rx = cx + size * s + 1.3 * s, ry = cy + (size * s - s) / 2;
    L.slots.push({ ref: { k: 'result' }, x: rx, y: ry, s });
    L.arrow = { x0: cx + size * s + 0.2 * s, x1: rx - 0.2 * s, y: ry + s / 2 };

    // インベントリ 9x3
    const iy = cy + size * s + 0.5 * s;
    L.invY = iy;
    for (let i = 9; i < 36; i++) {
      L.slots.push({ ref: { k: 'inv', i }, x: left + ((i - 9) % 9) * s, y: iy + Math.floor((i - 9) / 9) * s, s });
    }
    // 手持ち
    const hy = iy + 3 * s + 0.3 * s;
    L.hotY = hy;
    for (let i = 0; i < 9; i++) L.slots.push({ ref: { k: 'inv', i }, x: left + i * s, y: hy, s });

    L.hintY = hy + s + 0.5 * s;
    L.close = { x: px + pw - 0.95 * s, y: py + 0.15 * s, w: 0.8 * s, h: 0.8 * s };
    ui._ml = L;
    return L;
  };

  ui.slotAt = function (L, x, y) {
    for (let i = 0; i < L.slots.length; i++) {
      const sl = L.slots[i];
      if (x >= sl.x && x < sl.x + sl.s && y >= sl.y && y < sl.y + sl.s) return i;
    }
    return -1;
  };

  // キーボードでカーソルを動かす
  ui.navigate = function (L, cur, dir) {
    const a = L.slots[cur] || L.slots[0];
    const ax = a.x + a.s / 2, ay = a.y + a.s / 2;
    let best = cur, bestScore = Infinity;
    L.slots.forEach((b, i) => {
      if (i === cur) return;
      const dx = b.x + b.s / 2 - ax, dy = b.y + b.s / 2 - ay;
      const along = dx * dir[0] + dy * dir[1];
      if (along < a.s * 0.3) return;
      const perp = Math.abs(dx * dir[1] - dy * dir[0]);
      const score = along + perp * 2;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  };

  ui.drawMenu = function (g, game) {
    const L = ui.menuLayout(game), inv = game.inv, s = L.s, P = L.panel;
    g.fillStyle = 'rgba(80,58,38,0.3)';
    g.fillRect(0, 0, game.W, game.H);
    S.rect(g, P.x, P.y, P.w, P.h, { fill: COL.cream, stroke: COL.line, lw: 3, r: s * 0.4, seed: 31, amp: 2, step: 30 });

    // タイトル
    ui.text(g, L.size === 3 ? 'クラフトテーブル' : 'もちもの', P.x + 0.45 * s, P.y + 0.45 * s, s * 0.42);

    // とじるボタン
    const c = L.close;
    S.ellipse(g, c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2, { fill: COL.slot, stroke: COL.line, lw: 2, seed: 33, amp: 1, step: 8 });
    ui.text(g, '×', c.x + c.w / 2, c.y + c.h / 2, s * 0.5, { align: 'center' });

    // 矢印
    const a = L.arrow;
    S.line(g, [[a.x0, a.y], [a.x1, a.y]], { stroke: COL.line, lw: 3, seed: 35, amp: 1, step: 10 });
    S.line(g, [[a.x1 - s * 0.25, a.y - s * 0.2], [a.x1, a.y], [a.x1 - s * 0.25, a.y + s * 0.2]], { stroke: COL.line, lw: 3, amp: 0 });

    // 区切り線
    S.line(g, [[P.x + 0.4 * s, L.hotY - 0.15 * s], [P.x + P.w - 0.4 * s, L.hotY - 0.15 * s]], { stroke: 'rgba(107,74,47,0.4)', lw: 2, seed: 37, amp: 1, step: 20 });

    const recipe = inv.match(L.size);
    const kbd = game.mode === 'auto';
    L.slots.forEach((sl, i) => {
      let stack = null, alpha = null;
      if (sl.ref.k === 'result') { if (recipe) { stack = { id: recipe.out, n: recipe.n }; } }
      else stack = inv.get(sl.ref);
      const sel = sl.ref.k === 'inv' && sl.ref.i === inv.sel;
      ui.drawSlot(g, sl.x, sl.y, s, stack, { sel, hl: kbd && i === game.menu.cursor, seed: 100 + i, alpha });
    });

    // 名前の表示（カーソル・マウスが乗っているスロット）
    let focus = -1;
    if (kbd) focus = game.menu.cursor;
    else if (game.input.mouse.has && !game.touch) focus = ui.slotAt(L, game.input.mouse.x, game.input.mouse.y);
    else if (game.menu.lastPtr) focus = ui.slotAt(L, game.menu.lastPtr.x, game.menu.lastPtr.y);
    const fs = L.slots[focus];
    if (fs) {
      let st = fs.ref.k === 'result' ? (recipe ? { id: recipe.out } : null) : inv.get(fs.ref);
      if (st) ui.text(g, RS.ITEMS[st.id].name, P.x + P.w - 1.2 * s, P.y + 0.45 * s, s * 0.34, { align: 'right', maxW: P.w * 0.45 });
    }

    // 操作の説明
    let hint;
    if (game.touch) hint = 'タップ：もつ・おく　長おし：1こだけ おく / 半分もつ';
    else if (kbd) hint = '矢印/WASD：えらぶ　Z：もつ・おく　C：1こ おく　X：とじる';
    else hint = 'クリック：もつ・おく　右クリック：1こ おく / 半分もつ　X：とじる';
    ui.text(g, hint, P.x + P.w / 2, L.hintY, s * 0.3, { align: 'center', maxW: P.w - s * 0.6, color: 'rgba(107,74,47,0.85)' });

    // つかんでいるアイテム
    if (inv.cursor) {
      let x, y;
      if (!kbd && game.input.mouse.has && !game.touch) { x = game.input.mouse.x - s / 2; y = game.input.mouse.y - s / 2; }
      else if (!kbd && game.menu.lastPtr) { x = game.menu.lastPtr.x - s / 2; y = game.menu.lastPtr.y - s * 1.1; }
      else { const sl = L.slots[game.menu.cursor] || L.slots[0]; x = sl.x + s * 0.35; y = sl.y - s * 0.45; }
      ui.drawStack(g, x, y, s, inv.cursor);
    }
  };
})();
