// =============================================================
// 手書き風の線を描くための道具
// =============================================================
(function () {
  'use strict';
  const RS = window.RS;

  // 座標から決まる乱数（同じ座標なら毎回同じ値）
  RS.hash = function (x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };

  // 種から決まる乱数列
  RS.rng = function (seed) {
    let a = (seed | 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  RS.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const S = RS.sketch = {};

  // 線を細かく分けて、少しずつずらす（フリーハンド風のゆれ）
  S.jitter = function (pts, closed, seed, amp, step) {
    const r = RS.rng(seed);
    const out = [];
    const n = pts.length;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.max(1, Math.round(len / step));
      const nx = -dy / len, ny = dx / len;
      for (let j = 0; j < k; j++) {
        const t = j / k;
        const o = (r() * 2 - 1) * amp;
        out.push([a[0] + dx * t + nx * o, a[1] + dy * t + ny * o]);
      }
    }
    if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
    return out;
  };

  // 点列をなめらかな線でなぞる
  S.trace = function (ctx, p, closed) {
    const n = p.length;
    if (n < 2) return;
    if (closed) {
      ctx.moveTo((p[n - 1][0] + p[0][0]) / 2, (p[n - 1][1] + p[0][1]) / 2);
      for (let i = 0; i < n; i++) {
        const c = p[i], d = p[(i + 1) % n];
        ctx.quadraticCurveTo(c[0], c[1], (c[0] + d[0]) / 2, (c[1] + d[1]) / 2);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < n - 1; i++) {
        const c = p[i], d = p[i + 1];
        ctx.quadraticCurveTo(c[0], c[1], (c[0] + d[0]) / 2, (c[1] + d[1]) / 2);
      }
      ctx.lineTo(p[n - 1][0], p[n - 1][1]);
    }
  };

  // 形を描く。o = { fill, stroke, lw, seed, amp, step, closed }
  S.shape = function (ctx, pts, o) {
    o = o || {};
    const closed = o.closed !== false;
    const amp = o.amp != null ? o.amp : 1.2;
    const p = amp > 0 ? S.jitter(pts, closed, o.seed || 1, amp, o.step || 10) : pts;
    ctx.beginPath();
    S.trace(ctx, p, closed);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) {
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.lw || 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  };

  S.roundRectPts = function (x, y, w, h, r) {
    r = Math.max(0.01, Math.min(r, w / 2, h / 2));
    const p = [];
    const cs = [
      [x + w - r, y + r, -Math.PI / 2],
      [x + w - r, y + h - r, 0],
      [x + r, y + h - r, Math.PI / 2],
      [x + r, y + r, Math.PI],
    ];
    for (const [cx, cy, a0] of cs) {
      for (let i = 0; i <= 3; i++) {
        const a = a0 + (i / 3) * (Math.PI / 2);
        p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    }
    return p;
  };

  S.ellipsePts = function (cx, cy, rx, ry, n) {
    n = n || 14;
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return p;
  };

  S.rect = function (ctx, x, y, w, h, o) {
    o = o || {};
    S.shape(ctx, S.roundRectPts(x, y, w, h, o.r != null ? o.r : Math.min(w, h) * 0.18), o);
  };

  S.ellipse = function (ctx, cx, cy, rx, ry, o) {
    o = o || {};
    S.shape(ctx, S.ellipsePts(cx, cy, rx, ry, o.n || 14), o);
  };

  S.line = function (ctx, pts, o) {
    S.shape(ctx, pts, Object.assign({}, o, { closed: false }));
  };
})();
