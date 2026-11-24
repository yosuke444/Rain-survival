// =============================================================
// キャラメイク画面
// 部位（顔・目・髪・頭飾り・服・ズボン・靴・装飾）ごとに、形と色を選ぶ
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, S = RS.sketch, COL = RS.COL, CH = RS.char;
  const ui = RS.ui;

  // ---- 見た目の保存（ブラウザ内） ----
  RS.loadLook = function () {
    const look = JSON.parse(JSON.stringify(RS.DEFAULT_LOOK));
    try {
      const saved = JSON.parse(localStorage.getItem('rs.look') || 'null');
      if (saved) {
        for (const k in look) {
          const v = saved[k];
          if (v && CH.TYPES[k][v.type] !== undefined && typeof v.color === 'string') look[k] = { type: v.type, color: v.color };
        }
      }
    } catch (_) { /* 初期の見た目のまま */ }
    return look;
  };
  RS.saveLook = function (look) {
    try { localStorage.setItem('rs.look', JSON.stringify(look)); } catch (_) { /* 保存できなくても続ける */ }
  };

  const COLS = 8; // 色見本の1行の数

  function layout(game) {
    const W = game.W, H = game.H, m = 12;
    const s = Math.round(RS.clamp(Math.min(W, H) / 9, 30, 56));
    const land = W >= H;
    const L = { s };
    if (land) {
      L.preview = { x: m, y: m, w: Math.round(W * 0.4), h: H - m * 2 };
      L.cx = L.preview.x + L.preview.w + m; L.cy = m; L.cw = W - L.cx - m;
    } else {
      L.preview = { x: m, y: m, w: W - m * 2, h: Math.round(H * 0.36) };
      L.cx = m; L.cy = L.preview.y + L.preview.h + m; L.cw = W - m * 2;
    }
    let y = L.cy;
    L.titleY = y + s * 0.4; y += s * 0.9;
    L.tabs = [];
    const tw = L.cw / 4, th = Math.round(s * 0.85);
    CH.PARTS.forEach((p, i) => L.tabs.push({ x: L.cx + (i % 4) * tw, y: y + Math.floor(i / 4) * th, w: tw, h: th }));
    y += th * 2 + s * 0.25;
    L.shapeY = y;
    L.left = { x: L.cx, y, w: s, h: s };
    L.right = { x: L.cx + L.cw - s, y, w: s, h: s };
    L.nameBox = { x: L.cx + s + 6, y, w: L.cw - s * 2 - 12, h: s };
    y += s + s * 0.3;
    L.swY = y;
    L.sw = Math.floor(Math.min(s * 0.8, L.cw / COLS));
    y += L.sw * 3 + s * 0.3;
    L.done = { x: L.cx + L.cw * 0.2, y, w: L.cw * 0.6, h: s };
    return L;
  }

  function swatches(L, part) {
    const pal = CH.PALETTE[part];
    const ox = L.cx + (L.cw - Math.min(pal.length, COLS) * L.sw) / 2;
    return pal.map((c, i) => ({ c, x: ox + (i % COLS) * L.sw, y: L.swY + Math.floor(i / COLS) * L.sw, w: L.sw, h: L.sw }));
  }

  function partKey(game) { return CH.PARTS[game.cm.part][0]; }

  function cycleType(game, d) {
    const k = partKey(game);
    const keys = Object.keys(CH.NAMES[k]);
    const i = keys.indexOf(game.look[k].type);
    game.look[k].type = keys[(i + d + keys.length) % keys.length];
  }
  function cycleColor(game, d) {
    const k = partKey(game);
    const pal = CH.PALETTE[k];
    const i = pal.indexOf(game.look[k].color);
    game.look[k].color = pal[(i < 0 ? 0 : i + d + pal.length) % pal.length];
  }
  function finish(game) {
    RS.saveLook(game.look);
    game.backScreen();
  }

  function pressAt(game, L, x, y) {
    const inR = ui.inRect;
    const ti = L.tabs.findIndex((t) => inR(t, x, y));
    if (ti >= 0) { game.cm.part = ti; game.cm.row = 0; return; }
    if (inR(L.left, x, y)) { cycleType(game, -1); game.cm.row = 1; return; }
    if (inR(L.right, x, y) || inR(L.nameBox, x, y)) { cycleType(game, 1); game.cm.row = 1; return; }
    const k = partKey(game);
    const si = swatches(L, k).findIndex((sw) => inR(sw, x, y));
    if (si >= 0) { game.look[k].color = CH.PALETTE[k][si]; game.cm.row = 2; return; }
    if (inR(L.done, x, y)) finish(game);
  }

  RS.SCREENS.charmake = {
    custom: true,
    update(game) {
      const inp = game.input;
      if (!game.cm) game.cm = { part: 0, row: 0 };
      const L = layout(game);
      for (const e of inp.events) {
        const mouse = e.ptype === 'mouse';
        if (e.type === 'down' && mouse && game.mode === 'mouse' && e.button === 0) pressAt(game, L, e.x, e.y);
        if (e.type === 'up' && !mouse && !e.long) pressAt(game, L, e.x, e.y);
        if (game.screens[game.screens.length - 1] !== 'charmake') return;
      }
      if (inp.pressed('esc') || inp.pressed('menu')) { finish(game); return; }
      if (game.mode !== 'auto') return;
      const cm = game.cm;
      if (inp.pressed('up')) cm.row = (cm.row + 3) % 4;
      if (inp.pressed('down')) cm.row = (cm.row + 1) % 4;
      const d = (inp.pressed('right') ? 1 : 0) - (inp.pressed('left') ? 1 : 0);
      if (d) {
        if (cm.row === 0) cm.part = (cm.part + d + CH.PARTS.length) % CH.PARTS.length;
        else if (cm.row === 1) cycleType(game, d);
        else if (cm.row === 2) cycleColor(game, d);
      }
      if (inp.pressed('use') && cm.row === 3) finish(game);
    },

    draw(g, game) {
      if (!game.cm) game.cm = { part: 0, row: 0 };
      const L = layout(game), s = L.s, cm = game.cm, kbd = game.mode === 'auto';
      g.fillStyle = 'rgba(80,58,38,0.35)';
      g.fillRect(0, 0, game.W, game.H);
      S.rect(g, 6, 6, game.W - 12, game.H - 12, { fill: COL.cream, stroke: COL.line, lw: 3, r: s * 0.4, seed: 601, amp: 2, step: 30 });

      // 見本（大きく表示）
      const P = L.preview;
      S.rect(g, P.x, P.y, P.w, P.h, { fill: game.world.theme.sky, stroke: COL.line, lw: 2, r: s * 0.3, seed: 603, amp: 1.5, step: 24 });
      const u = Math.min(P.w / 1.5, P.h / 2.0);
      const pose = CH.pose();
      pose.bob = Math.sin(game.time * 2) * 0.008;
      if ((game.time % 3.7) < 0.13) pose.eyes = 'blink';
      g.save();
      g.translate(P.x + P.w / 2, P.y + P.h - u * 0.15);
      CH.draw(g, u, game.look, pose, null, game.time);
      g.restore();

      ui.text(g, 'キャラメイク', L.cx + L.cw / 2, L.titleY, s * 0.5, { align: 'center' });

      // 部位のタブ
      CH.PARTS.forEach(([k, name], i) => {
        const t = L.tabs[i], on = i === cm.part;
        S.rect(g, t.x + 2, t.y + 2, t.w - 4, t.h - 4, {
          fill: on ? '#ffe9b8' : COL.slot, stroke: kbd && cm.row === 0 && on ? COL.accent : COL.line,
          lw: on ? 3 : 1.5, r: s * 0.2, seed: 610 + i, amp: 1, step: 16,
        });
        ui.text(g, name, t.x + t.w / 2, t.y + t.h / 2, s * 0.34, { align: 'center', maxW: t.w - 8 });
      });

      // 形
      const k = partKey(game);
      const hlRow = (r) => kbd && cm.row === r;
      for (const [r, ch] of [[L.left, '◀'], [L.right, '▶']]) {
        S.rect(g, r.x, r.y, r.w, r.h, { fill: COL.slot, stroke: COL.line, lw: 2, r: s * 0.25, seed: 620 + (ch === '◀' ? 0 : 1), amp: 1, step: 12 });
        ui.text(g, ch, r.x + r.w / 2, r.y + r.h / 2, s * 0.4, { align: 'center' });
      }
      const nb = L.nameBox;
      S.rect(g, nb.x, nb.y, nb.w, nb.h, { fill: '#fff', stroke: hlRow(1) ? COL.accent : COL.line, lw: hlRow(1) ? 3.5 : 2, r: s * 0.25, seed: 625, amp: 1, step: 16 });
      ui.text(g, 'かたち：' + CH.NAMES[k][game.look[k].type], nb.x + nb.w / 2, nb.y + nb.h / 2, s * 0.38, { align: 'center', maxW: nb.w - 10 });

      // 色
      const sws = swatches(L, k);
      sws.forEach((sw, i) => {
        const on = CH.PALETTE[k][i] === game.look[k].color;
        S.rect(g, sw.x + 3, sw.y + 3, sw.w - 6, sw.h - 6, {
          fill: sw.c, stroke: on ? (hlRow(2) ? COL.accent : COL.line) : 'rgba(107,74,47,0.5)',
          lw: on ? 3.5 : 1.5, r: sw.w * 0.25, seed: 630 + i, amp: 0.8, step: 12,
        });
      });
      if (hlRow(2)) {
        const sb = sws[0];
        S.line(g, [[sb.x - 2, sb.y], [sb.x - 2, sb.y + L.sw * Math.ceil(sws.length / COLS)]], { stroke: COL.accent, lw: 3, amp: 0 });
      }

      // できた
      const d = L.done;
      S.rect(g, d.x, d.y, d.w, d.h, { fill: hlRow(3) ? '#ffe9b8' : COL.slot, stroke: hlRow(3) ? COL.accent : COL.line, lw: hlRow(3) ? 3.5 : 2, r: s * 0.3, seed: 640, amp: 1.2, step: 16 });
      ui.text(g, 'できた', d.x + d.w / 2, d.y + d.h / 2, s * 0.42, { align: 'center' });

      let hint;
      if (game.touch) hint = 'タップで えらぶ';
      else if (kbd) hint = '↑↓：項目　←→：かえる　Z：できた';
      else hint = 'クリックで えらぶ';
      ui.text(g, hint, L.cx + L.cw / 2, Math.min(game.H - 20, d.y + d.h + s * 0.45), s * 0.28, { align: 'center', maxW: L.cw, color: 'rgba(107,74,47,0.8)' });
    },
  };
})();
