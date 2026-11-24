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

  // キャラクターの見た目（キャラメイクは今回の範囲外のため固定）
  const LOOK = RS.LOOK = { hair: '#8a5a3c', skin: '#ffe4cc', shirt: '#f4a9a0', pants: '#86a9cf', shoes: '#9a7352' };

  const art = RS.art = { FONT: "'Yomogi','Hiragino Maru Gothic ProN','Yu Gothic UI',sans-serif" };

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
    return `rgb(${r},${g},${b})`;
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
    const L = COL.line;
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
      case T.SAPLING:
        S.line(g, [[0.5 * u, u], [0.47 * u, 0.75 * u], [0.52 * u, 0.5 * u]], { stroke: '#5f8f45', lw: u * 0.07, amp: 0 });
        S.ellipse(g, 0.36 * u, 0.54 * u, 0.14 * u, 0.07 * u, { fill: COL.leaf, stroke: L, lw: u * 0.035, seed: sd(r), amp: u * 0.01 });
        S.ellipse(g, 0.66 * u, 0.44 * u, 0.15 * u, 0.075 * u, { fill: COL.leaf, stroke: L, lw: u * 0.035, seed: sd(r), amp: u * 0.01 });
        break;
    }
  }
  art.drawTileArt = drawTileArt;

  function makeTile(type, v, u, dpr) {
    const pad = PAD[type] || 0;
    const size = u * (1 + 2 * pad);
    const cv = mk(size * dpr, size * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(pad * u, pad * u);
    drawTileArt(g, type, u, RS.rng(type * 131 + v * 17 + 3));
    return { cv, pad };
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

  // ---------------- キャラクター（2.5頭身） ----------------
  function leg(g, u, x, pc, sc, seed, lift) {
    S.rect(g, (x - 0.07) * u, (-0.46 - lift) * u, 0.14 * u, 0.4 * u, { fill: pc, stroke: COL.line, lw: u * 0.05, r: 0.05 * u, seed, amp: u * 0.01, step: u * 0.12 });
    S.ellipse(g, (x + 0.03) * u, (-0.06 - lift) * u, 0.11 * u, 0.07 * u, { fill: sc, stroke: COL.line, lw: u * 0.05, seed: seed + 1, amp: u * 0.01, n: 12 });
  }

  function drawBody(g, u, f) {
    const L = COL.line;
    const o = (seed, extra) => Object.assign({ stroke: L, lw: u * 0.05, seed, amp: u * 0.012, step: u * 0.12 }, extra);
    const bob = f.bob;
    leg(g, u, f.b, shade(LOOK.pants, 0.85), shade(LOOK.shoes, 0.85), 11, 0);
    leg(g, u, f.a, LOOK.pants, LOOK.shoes, 13, f.lift || 0);
    S.rect(g, -0.22 * u, (-0.87 + bob) * u, 0.12 * u, 0.34 * u, o(15, { fill: shade(LOOK.shirt, 0.85), r: 0.06 * u }));
    S.rect(g, -0.22 * u, (-0.97 + bob) * u, 0.42 * u, 0.55 * u, o(17, { fill: LOOK.shirt, r: 0.13 * u }));
    const hx = 0.03 * u, hy = (-1.33 + bob) * u;
    S.ellipse(g, hx, hy, 0.4 * u, 0.36 * u, o(19, { fill: LOOK.skin, n: 18 }));
    const hp = [[-0.41, 0.1], [-0.44, -0.12], [-0.3, -0.33], [0, -0.42], [0.3, -0.34], [0.43, -0.1], [0.41, 0.0],
      [0.32, -0.12], [0.24, -0.04], [0.14, -0.15], [0.04, -0.06], [-0.06, -0.16], [-0.16, -0.06], [-0.2, 0.08],
      [-0.28, 0.26], [-0.4, 0.24]].map(([x, y]) => [hx + x * u, hy + y * u]);
    S.shape(g, hp, o(21, { fill: LOOK.hair }));
    g.fillStyle = '#4a3424';
    for (const ex of [0.13, 0.29]) {
      g.beginPath(); g.ellipse(hx + ex * u, hy + 0.05 * u, 0.035 * u, 0.055 * u, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(240,140,140,0.45)';
    for (const ex of [0.07, 0.35]) {
      g.beginPath(); g.ellipse(hx + ex * u, hy + 0.15 * u, 0.06 * u, 0.035 * u, 0, 0, Math.PI * 2); g.fill();
    }
    S.line(g, [[hx + 0.18 * u, hy + 0.17 * u], [hx + 0.21 * u, hy + 0.195 * u], [hx + 0.24 * u, hy + 0.17 * u]], { stroke: L, lw: u * 0.03, amp: 0 });
  }

  function makePlayer(u, dpr) {
    const frames = {
      idle:  { a: 0.09, b: -0.09, bob: 0 },
      walk1: { a: 0.2, b: -0.16, bob: -0.03 },
      walk2: { a: -0.12, b: 0.14, bob: -0.03 },
      jump:  { a: 0.18, b: -0.12, bob: -0.02, lift: 0.08 },
    };
    const out = {};
    const w = 1.5 * u, h = 2.0 * u, oy = h - 0.04 * u;
    for (const k in frames) {
      const cv = mk(w * dpr, h * dpr);
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(w / 2, oy);
      drawBody(g, u, frames[k]);
      out[k] = { cv, w, h, ox: w / 2, oy, bob: frames[k].bob };
    }
    return out;
  }

  // 前側の腕と、手に持っているもの（毎フレーム描く）
  art.drawArm = function (g, u, ang, bob, held) {
    g.save();
    g.translate(0.02 * u, (-0.86 + bob) * u);
    g.rotate(-ang);
    if (held) {
      const it = RS.ITEMS[held.id];
      const big = it.tool || held.id === 'stick';
      const sz = u * (big ? 0.78 : 0.5);
      g.save();
      g.translate(0, 0.34 * u);
      g.drawImage(art.icons[held.id], -0.22 * sz, -0.78 * sz, sz, sz);
      g.restore();
    }
    S.rect(g, -0.06 * u, -0.03 * u, 0.12 * u, 0.36 * u, { fill: LOOK.shirt, stroke: COL.line, lw: u * 0.045, r: 0.06 * u, seed: 5, amp: u * 0.01, step: u * 0.1 });
    S.ellipse(g, 0, 0.36 * u, 0.075 * u, 0.075 * u, { fill: LOOK.skin, stroke: COL.line, lw: u * 0.04, seed: 6, amp: u * 0.006, n: 10 });
    g.restore();
  };

  // 画面サイズが変わるたびに作り直す
  art.build = function (u, dpr) {
    art.T = u; art.dpr = dpr;
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
    art.player = makePlayer(u, dpr);
    if (!art.icons) art.icons = makeIcons();
  };
})();
