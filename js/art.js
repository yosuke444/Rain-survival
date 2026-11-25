// =============================================================
// 絵の準備（ブロック・アイテムアイコン・キャラクター）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, S = RS.sketch, T = RS.T;

  const COL = RS.COL = {
    line: '#6b4a2f',        // 基本の線の色（茶色）
    sky: '#cfeaf6',         // 背景（薄い水色）
    dirt: '#d0a274', dirtDark: '#a97c52',
    grass: '#a5d47f', grassDark: '#6fa356',
    stone: '#bdb8ae', stoneDark: '#8d877c',
    plank: '#e8c08a', plankDark: '#b98d58',
    bark: '#a97b50', barkDark: '#7c5636',
    leaf: '#93c96f', leafLight: '#bfe39b',
    wall: '#b5916c',        // 地下の奥の壁
    cream: '#fff6e6', slot: '#f6e7cc', accent: '#e58c6c',
  };

  // 世界ごとの色（背景色・ブロックや傘の縁の色）。新しい世界はここに足していく
  RS.THEMES = {
    plains: { name: '平原', sky: '#a9d6f5', line: '#6b4a2f' }, // 青寄りの水色（仮の色）
  };


  const art = RS.art = { FONT: "'Yomogi','Hiragino Maru Gothic ProN','Yu Gothic UI',sans-serif" };

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // 色を暗く（k < 1）・明るく（k > 1）する。'#rrggbb' と 'rgb(r,g,b)' のどちらも受け付ける
  function shade(col, k) {
    let r, g, b;
    if (col[0] === '#') {
      const n = parseInt(col.slice(1), 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else {
      [r, g, b] = col.match(/[\d.]+/g).map(Number);
    }
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  art.shade = shade;

  // ブロックの絵がマスからはみ出す量（葉・草）
  const PAD = { [T.LEAVES]: 0.25, [T.GRASS]: 0.15 };

  function specks(g, u, r, col, n, ymin) {
    ymin = ymin || 0;
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = r() * u * 0.85 + u * 0.07;
      const y = ymin * u + r() * u * (1 - ymin) * 0.85 + u * 0.05;
      g.beginPath();
      g.ellipse(x, y, u * (0.03 + r() * 0.03), u * (0.02 + r() * 0.02), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  const sd = (r) => (r() * 1e6) | 0;

  // 1マス分のブロックの絵（u = マスの大きさ）
  function drawTileArt(g, type, u, r) {
    const L = art.lineColor || COL.line;
    switch (type) {
      case T.DIRT:
        g.fillStyle = COL.dirt; g.fillRect(0, 0, u, u);
        specks(g, u, r, COL.dirtDark, 5);
        break;
      case T.GRASS: {
        g.fillStyle = COL.dirt; g.fillRect(0, 0, u, u);
        specks(g, u, r, COL.dirtDark, 3, 0.45);
        const wave = [];
        for (let i = 4; i >= 0; i--) wave.push([(i / 4) * u, (0.28 + (i % 2 ? 0.08 : 0) + (r() - 0.5) * 0.05) * u]);
        g.beginPath();
        g.moveTo(0, 0); g.lineTo(u, 0);
        for (const p of wave) g.lineTo(p[0], p[1]);
        g.closePath();
        g.fillStyle = COL.grass; g.fill();
        S.line(g, wave, { stroke: COL.grassDark, lw: u * 0.04, amp: 0 });
        for (let i = 0; i < 3; i++) {
          const x = (0.15 + r() * 0.7) * u;
          S.line(g, [[x, 0.02 * u], [x + (r() - 0.5) * 0.1 * u, -0.12 * u]], { stroke: COL.grassDark, lw: u * 0.045, amp: 0 });
        }
        break;
      }
      case T.STONE:
        g.fillStyle = COL.stone; g.fillRect(0, 0, u, u);
        specks(g, u, r, COL.stoneDark, 3);
        for (let i = 0; i < 2; i++) {
          S.ellipse(g, (0.25 + r() * 0.5) * u, (0.25 + r() * 0.5) * u, (0.1 + r() * 0.08) * u, (0.07 + r() * 0.05) * u,
            { stroke: COL.stoneDark, lw: u * 0.035, seed: sd(r), amp: u * 0.012, step: u * 0.1 });
        }
        break;
      case T.PLANKS:
        g.fillStyle = COL.plank; g.fillRect(0, 0, u, u);
        for (const y of [u / 3, (2 * u) / 3]) {
          S.line(g, [[0, y], [u, y]], { stroke: COL.plankDark, lw: u * 0.035, seed: sd(r), amp: u * 0.012, step: u * 0.25 });
        }
        for (let row = 0; row < 3; row++) {
          const x = (0.2 + r() * 0.6) * u;
          S.line(g, [[x, (row / 3) * u + 2], [x, ((row + 1) / 3) * u - 2]], { stroke: COL.plankDark, lw: u * 0.03, amp: 0 });
        }
        break;
      case T.LOG:
        g.fillStyle = COL.bark; g.fillRect(0.2 * u, 0, 0.6 * u, u);
        for (const x of [0.38, 0.6]) {
          S.line(g, [[x * u, 0.1 * u], [(x + (r() - 0.5) * 0.06) * u, 0.9 * u]], { stroke: COL.barkDark, lw: u * 0.035, seed: sd(r), amp: u * 0.015, step: u * 0.2 });
        }
        for (const x of [0.2, 0.8]) {
          S.line(g, [[x * u, 0], [x * u, u]], { stroke: L, lw: u * 0.06, seed: sd(r), amp: u * 0.012, step: u * 0.25 });
        }
        break;
      case T.LEAVES: {
        const cs = [];
        for (let i = 0; i < 6; i++) cs.push([(0.12 + r() * 0.76) * u, (0.12 + r() * 0.76) * u, (0.26 + r() * 0.12) * u, sd(r)]);
        // 先に太い線で全体の縁、その上から塗る（外側の縁だけが残る）
        for (const c of cs) S.ellipse(g, c[0], c[1], c[2], c[2], { stroke: L, lw: u * 0.1, seed: c[3], amp: u * 0.02, step: u * 0.12 });
        for (const c of cs) S.ellipse(g, c[0], c[1], c[2], c[2], { fill: COL.leaf, seed: c[3], amp: u * 0.02, step: u * 0.12 });
        for (let i = 0; i < 2; i++) {
          const x = (0.25 + r() * 0.5) * u, y = (0.25 + r() * 0.5) * u;
          S.line(g, [[x, y], [x + 0.08 * u, y - 0.06 * u], [x + 0.16 * u, y - 0.04 * u]], { stroke: COL.leafLight, lw: u * 0.05, amp: 0 });
        }
        break;
      }
      case T.TABLE: {
        const o = (extra) => Object.assign({ stroke: L, lw: u * 0.05, seed: sd(r), amp: u * 0.012, step: u * 0.15 }, extra);
        S.rect(g, 0.14 * u, 0.42 * u, 0.12 * u, 0.56 * u, o({ fill: COL.plankDark, r: 0.03 * u }));
        S.rect(g, 0.74 * u, 0.42 * u, 0.12 * u, 0.56 * u, o({ fill: COL.plankDark, r: 0.03 * u }));
        S.line(g, [[0.26 * u, 0.72 * u], [0.74 * u, 0.72 * u]], o({ lw: u * 0.05 }));
        S.rect(g, 0.04 * u, 0.28 * u, 0.92 * u, 0.18 * u, o({ fill: COL.plank, r: 0.05 * u }));
        // 天板の上の小さなかなづち
        S.line(g, [[0.52 * u, 0.27 * u], [0.68 * u, 0.1 * u]], o({ stroke: COL.barkDark, lw: u * 0.05 }));
        S.rect(g, 0.6 * u, 0.02 * u, 0.2 * u, 0.1 * u, o({ fill: '#b9b4aa', lw: u * 0.035, r: 0.02 * u }));
        break;
      }
      case T.CHAIR_L: // 右向きを左右反転
        g.save(); g.translate(u, 0); g.scale(-1, 1);
        drawTileArt(g, T.CHAIR_R, u, r);
        g.restore();
        break;
      case T.CHAIR_R: { // 右向き（背もたれが左）
        const o = (extra) => Object.assign({ stroke: L, lw: u * 0.05, seed: sd(r), amp: u * 0.01, step: u * 0.15 }, extra);
        S.rect(g, 0.16 * u, 0.04 * u, 0.12 * u, 0.96 * u, o({ fill: COL.plankDark, r: 0.04 * u }));
        S.rect(g, 0.72 * u, 0.55 * u, 0.1 * u, 0.45 * u, o({ fill: COL.plankDark, r: 0.03 * u }));
        S.rect(g, 0.12 * u, 0.48 * u, 0.76 * u, 0.12 * u, o({ fill: COL.plank, r: 0.04 * u }));
        S.line(g, [[0.22 * u, 0.2 * u], [0.22 * u, 0.4 * u]], { stroke: COL.plank, lw: u * 0.05, amp: 0 });
        break;
      }
      case T.SAPLING:
        S.line(g, [[0.5 * u, u], [0.47 * u, 0.75 * u], [0.52 * u, 0.5 * u]], { stroke: '#5f8f45', lw: u * 0.07, amp: 0 });
        S.ellipse(g, 0.36 * u, 0.54 * u, 0.14 * u, 0.07 * u, { fill: COL.leaf, stroke: L, lw: u * 0.035, seed: sd(r), amp: u * 0.01 });
        S.ellipse(g, 0.66 * u, 0.44 * u, 0.15 * u, 0.075 * u, { fill: COL.leaf, stroke: L, lw: u * 0.035, seed: sd(r), amp: u * 0.01 });
        break;
    }
  }
  art.drawTileArt = drawTileArt;

  function makeTile(type, v, u, dpr) {
    // はみ出す量はピクセル単位で丸める（半端な位置だとマスの境目にすき間の線が出るため）
    const padPx = Math.round((PAD[type] || 0) * u);
    const size = u + 2 * padPx;
    const cv = mk(size * dpr, size * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(padPx, padPx);
    drawTileArt(g, type, u, RS.rng(type * 131 + v * 17 + 3));
    return { cv, padPx };
  }

  // ---------------- アイテムのアイコン（64x64 基準） ----------------
  function drawIcon(g, id) {
    const it = RS.ITEMS[id];
    const L = COL.line;
    if (it.place != null) {
      const t = it.place, u = 44;
      g.save();
      g.translate(10, 10);
      if (RS.TILES[t].terrain) {
        g.save();
        g.beginPath(); S.trace(g, S.roundRectPts(0, 0, u, u, 7), true); g.clip();
        drawTileArt(g, t, u, RS.rng(t * 7 + 1));
        g.restore();
        S.rect(g, 0, 0, u, u, { stroke: L, lw: 3, r: 7, seed: t * 3 + 1, amp: 1, step: 8 });
      } else {
        drawTileArt(g, t, u, RS.rng(t * 7 + 1));
        if (t === T.LOG) {
          S.line(g, [[0.2 * u, 0], [0.8 * u, 0]], { stroke: L, lw: 3, amp: 0.8, step: 8 });
          S.line(g, [[0.2 * u, u], [0.8 * u, u]], { stroke: L, lw: 3, amp: 0.8, step: 8 });
        }
      }
      g.restore();
      return;
    }
    if (id === 'stick') {
      S.line(g, [[16, 50], [48, 14]], { stroke: L, lw: 9, amp: 0.8, step: 10 });
      S.line(g, [[16, 50], [48, 14]], { stroke: COL.bark, lw: 4.5, amp: 0 });
      return;
    }
    if (id === 'apple') {
      S.ellipse(g, 32, 38, 17, 16, { fill: '#ee8577', stroke: L, lw: 3, seed: 3, amp: 1, step: 8 });
      S.line(g, [[32, 24], [34, 13]], { stroke: L, lw: 3, amp: 0 });
      S.ellipse(g, 41, 16, 7, 4, { fill: COL.leaf, stroke: L, lw: 2, seed: 4, amp: 0.5 });
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.ellipse(25, 32, 4, 6, -0.4, 0, Math.PI * 2); g.fill();
      return;
    }
    if (it.tool) {
      const head = it.mat === 'wood' ? '#dcae72' : '#bdb8ae';
      const handle = (a, b) => {
        S.line(g, [a, b], { stroke: L, lw: 8, amp: 0.6, step: 10 });
        S.line(g, [a, b], { stroke: COL.bark, lw: 4, amp: 0 });
      };
      if (it.tool === 'pickaxe') {
        handle([14, 52], [44, 20]);
        const arc = [[22, 12], [38, 12], [50, 22], [54, 38]];
        S.line(g, arc, { stroke: L, lw: 12, amp: 0 });
        S.line(g, arc, { stroke: head, lw: 6.5, amp: 0 });
      } else if (it.tool === 'axe') {
        handle([14, 52], [44, 20]);
        S.shape(g, [[36, 16], [48, 6], [58, 16], [56, 32], [44, 30]], { fill: head, stroke: L, lw: 3, seed: 8, amp: 0.8, step: 8 });
      } else if (it.tool === 'shovel') {
        handle([12, 54], [38, 28]);
        const pts = S.ellipsePts(0, 0, 9, 13, 12).map(([x, y]) => {
          const a = Math.PI / 4;
          return [46 + x * Math.cos(a) - y * Math.sin(a), 19 + x * Math.sin(a) + y * Math.cos(a)];
        });
        S.shape(g, pts, { fill: head, stroke: L, lw: 3, seed: 9, amp: 0.8, step: 8 });
      } else if (it.tool === 'sword') {
        S.shape(g, [[20, 40], [48, 10], [55, 8], [53, 15], [25, 45]], { fill: head, stroke: L, lw: 3, seed: 10, amp: 0.6, step: 8 });
        S.line(g, [[14, 36], [28, 50]], { stroke: L, lw: 8, amp: 0 });
        S.line(g, [[14, 36], [28, 50]], { stroke: head, lw: 4, amp: 0 });
        handle([10, 54], [20, 44]);
      }
    }
  }

  function makeIcons() {
    const icons = {};
    for (const id in RS.ITEMS) {
      const cv = mk(128, 128);
      const g = cv.getContext('2d');
      g.scale(2, 2);
      drawIcon(g, id);
      icons[id] = cv;
    }
    return icons;
  }

  // 画面サイズが変わるたびに作り直す
  art.build = function (u, dpr, lineColor) {
    art.T = u; art.dpr = dpr;
    art.lineColor = lineColor || COL.line;
    art.tiles = [];
    for (let t = 1; t < RS.TILES.length; t++) {
      art.tiles[t] = [];
      for (let v = 0; v < 4; v++) art.tiles[t][v] = makeTile(t, v, u, dpr);
    }
    // 地形の縁の線（8種類のゆれ）
    art.edges = [];
    for (let i = 0; i < 8; i++) {
      const r = RS.rng(900 + i);
      const pts = [[0, 0]];
      for (let k = 1; k < 4; k++) pts.push([k / 4 + (r() - 0.5) * 0.06, (r() - 0.5) * 0.09]);
      pts.push([1, 0]);
      art.edges.push(pts);
    }
    if (!art.icons) art.icons = makeIcons();
  };
})();
