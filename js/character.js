// =============================================================
// キャラクター（1.8頭身のミニキャラ）
// 部位ごとに描く。ポーズ（腕・脚の角度、目・口の状態）を毎フレーム指定して描く
// 座標の単位は u（1マスの大きさ）。原点は足もと、右向き。y は上がマイナス
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, S = RS.sketch, COL = RS.COL;
  const CH = RS.char = {};
  const shade = (hex, k) => RS.art.shade(hex, k);
  const LINE = '#4a3226';
  const EYE_LINE = '#3d2a20';

  // 初期の見た目（キャラメイクで変えられる）
  RS.DEFAULT_LOOK = {
    face:  { type: 'round',     color: '#ffe4cc' }, // 顔の形・肌の色
    eyes:  { type: 'anime',     color: '#6f8fd8' }, // 目の形・目の色
    hair:  { type: 'bob',       color: '#8a5a3c' },
    head:  { type: 'none',      color: '#f2a7a0' }, // 頭飾り
    top:   { type: 'raincoat',  color: '#f7d978' }, // 服
    pants: { type: 'leggings',  color: '#5f6b8a' },
    shoes: { type: 'rainboots', color: '#8fbfe0' },
    acc:   { type: 'none',      color: '#e58c6c' }, // 装飾
  };

  // ポーズの初期値。a = 付け根の角度（0 で真下、+ で前へ）、e/k = ひじ・ひざの曲げ
  CH.pose = function () {
    return {
      bob: 0, dy: 0,
      armF: { a: 0.15, e: 0.25 }, armB: { a: -0.1, e: 0.2 },
      legF: { a: 0, k: 0 }, legB: { a: 0, k: 0 },
      eyes: 'open',   // open / blink / closed（にっこり） / squeeze（ぎゅっ）
      mouth: 'smile', // smile / open / chew / o
    };
  };

  // ---- プレイヤーキャラ用の描き方（細い線・ゆれなし・影つき）----
  // ほかの絵（ブロック・UI）は手書き風だが、プレイヤーキャラだけは絵に近づける
  let U = 40; // いま描いている大きさ（CH.draw で設定）
  const X = {};
  X.path = (pts, closed) => { const p = new Path2D(); S.trace(p, pts, closed !== false); return p; };
  X.lw = (lw) => Math.max(0.6, Math.min(lw || U, U * 0.015)); // 輪郭線の太さ（1マスの1.5%まで）
  // 形をずらして重ね、はみ出た部分だけを塗る（ふちに沿った帯になる）
  function band(g, p, dx, dy, col) {
    const q = new Path2D();
    q.addPath(p);
    q.addPath(p, new DOMMatrix([1, 0, 0, 1, dx, dy]));
    g.fillStyle = col;
    g.fill(q, 'evenodd');
  }
  // 塗り → ツヤ（上・前側）→ 影2段（下・うしろ側）→ 細い線。光は前の上から当たる
  X.shape = function (g, pts, opt) {
    const p = X.path(pts);
    if (opt.fill) {
      g.fillStyle = opt.fill; g.fill(p);
      if (!opt.flat && typeof opt.fill === 'string') {
        const d = U * 0.05;
        g.save(); g.clip(p);
        band(g, p, -d * 0.35, d * 0.7, shade(opt.fill, 1.1));
        band(g, p, d * 0.5, -d, shade(opt.fill, 0.84));
        band(g, p, d * 0.22, -d * 0.45, shade(opt.fill, 0.7));
        g.restore();
      }
    }
    if (opt.stroke) { g.strokeStyle = LINE; g.lineWidth = X.lw(opt.lw); g.lineJoin = 'round'; g.stroke(p); }
    return p;
  };
  X.rect = (g, x, y, w, h, opt) => X.shape(g, S.roundRectPts(x, y, w, h, opt.r != null ? opt.r : Math.min(w, h) * 0.18), opt);
  X.ellipse = (g, cx, cy, rx, ry, opt) => X.shape(g, S.ellipsePts(cx, cy, rx, ry, Math.max(opt.n || 0, 24)), opt);
  X.line = function (g, pts, opt) {
    g.strokeStyle = opt.stroke || LINE; g.lineWidth = X.lw(opt.lw); g.lineCap = 'round'; g.lineJoin = 'round';
    g.stroke(X.path(pts, false));
  };

  const o = (u, seed, extra) => Object.assign({ stroke: LINE, lw: u * 0.02, seed }, extra);
  // 下向きに伸びる丸い棒（腕・脚の一節）
  function seg(g, u, len, w, fill, seed) {
    X.rect(g, -w / 2 * u, -w * 0.3 * u, w * u, (len + w * 0.6) * u, o(u, seed, { fill, r: w / 2 * u }));
  }

  // ---------------- 部位の種類 ----------------
  // 顔の形
  // 顔の形（輪郭の点を返す）
  const FACES = {
    round: (u) => S.ellipsePts(0, 0, 0.47 * u, 0.43 * u, 32),
    egg: (u) => {
      const pts = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2, sy = Math.sin(a);
        const rx = 0.45 * (sy > 0 ? 1 - sy * 0.18 : 1); // あごを細く
        pts.push([Math.cos(a) * rx * u, sy * (sy > 0 ? 0.47 : 0.43) * u]);
      }
      return pts;
    },
    mochi: (u) => S.ellipsePts(0, 0.02 * u, 0.5 * u, 0.41 * u, 32),
  };

  // ---- 目 ----
  // 描き方のスタイル。A = 今風アニメ（決定）、B = まんまる目の形で使う
  CH.EYE_STYLES = {
    A: { name: '今風アニメ', ry: 1.35, iris: 0.92, lid: 0.034, wing: true, lash: 0, low: 1, hl: 'two', cover: 0, lidCol: '#2e1f19' },
    B: { name: 'ゆるかわ', ry: 1.12, iris: 1.0, lid: 0.022, wing: false, lash: 0, low: 0, hl: 'big', cover: 0, lidCol: '#3a2a22' },
  };
  CH.eyeStyle = 'A';

  // 1つの目。原点が目の中心。flip = -1 のとき左右反転（奥の目）。目じりが +x 側
  function eyeArt(g, u, w, col, skin, state, st, flip) {
    const rx = w, ry = w * st.ry;
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (state === 'blink' || state === 'closed' || state === 'squeeze') {
      g.strokeStyle = st.lidCol; g.lineWidth = Math.max(0.8, u * 0.024);
      g.beginPath();
      if (state === 'closed') { g.moveTo(-rx, ry * 0.15); g.quadraticCurveTo(0, -ry * 0.55, rx, ry * 0.15); }
      else if (state === 'squeeze') { g.moveTo(-rx * 0.8, -ry * 0.35); g.lineTo(rx * 0.6, 0); g.lineTo(-rx * 0.8, ry * 0.35); }
      else { g.moveTo(-rx, 0); g.quadraticCurveTo(0, ry * 0.35, rx, 0); }
      g.stroke();
      return;
    }
    // 白目
    const ep = new Path2D();
    ep.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.save();
    g.fillStyle = '#fffdfb'; g.fill(ep);
    g.clip(ep);
    // 黒目（虹彩）
    const ir = rx * st.iris, iy = ry * 0.1;
    const gr = g.createLinearGradient(0, iy - ry, 0, iy + ry * 0.9);
    gr.addColorStop(0, shade(col, 0.3)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, 1.35));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(0, iy, ir, ry * 0.92, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = shade(col, 0.3); g.lineWidth = Math.max(0.4, u * 0.008); g.stroke();
    // 瞳孔
    g.fillStyle = shade(col, 0.18);
    g.beginPath(); g.ellipse(0, iy + ry * 0.05, ir * 0.42, ry * 0.46, 0, 0, Math.PI * 2); g.fill();
    // 下の照り返し
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath(); g.ellipse(0, iy + ry * 0.58, ir * 0.62, ry * 0.24, 0, 0, Math.PI * 2); g.fill();
    // 上まぶたの影
    const sh = g.createLinearGradient(0, -ry, 0, -ry * 0.2);
    sh.addColorStop(0, 'rgba(60,40,60,0.45)'); sh.addColorStop(1, 'rgba(60,40,60,0)');
    g.fillStyle = sh; g.fillRect(-rx, -ry, rx * 2, ry);
    // 半分とじたまぶた：上の部分を肌の色でかくす
    const lidLine = (x) => -ry + ry * 2 * st.cover - Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) * ry * 0.12;
    if (st.cover > 0) {
      g.fillStyle = skin; g.beginPath(); g.moveTo(-rx, -ry * 1.1);
      for (let i = 0; i <= 12; i++) { const x = -rx + (2 * rx * i) / 12; g.lineTo(x, lidLine(x)); }
      g.lineTo(rx, -ry * 1.1); g.closePath(); g.fill();
    }
    // ハイライト（光の向きは左右の目でそろえる）
    const hx = (x) => x * flip;
    g.fillStyle = '#fff';
    const top = -ry + ry * 2 * st.cover;
    if (st.hl === 'big') {
      g.beginPath(); g.arc(hx(-rx * 0.28), top + ry * 0.62, rx * 0.36, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(hx(rx * 0.32), ry * 0.45, rx * 0.16, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(hx(rx * 0.05), ry * 0.2, rx * 0.07, 0, Math.PI * 2); g.fill();
    } else {
      g.beginPath(); g.ellipse(hx(-rx * 0.3), top + ry * 0.55, rx * 0.3, ry * 0.2, -0.4 * flip, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(hx(rx * 0.32), ry * 0.48, rx * 0.13, 0, Math.PI * 2); g.fill();
      if (st.hl === 'sparkle') {
        g.beginPath(); g.arc(hx(rx * 0.35), top + ry * 0.5, rx * 0.08, 0, Math.PI * 2); g.fill();
        const sx = hx(-rx * 0.1), sy = ry * 0.32, k = rx * 0.22;
        g.beginPath();
        g.moveTo(sx, sy - k); g.quadraticCurveTo(sx, sy, sx + k, sy); g.quadraticCurveTo(sx, sy, sx, sy + k);
        g.quadraticCurveTo(sx, sy, sx - k, sy); g.quadraticCurveTo(sx, sy, sx, sy - k); g.fill();
      }
    }
    g.restore();
    // 白目のふち（うすく）
    g.strokeStyle = 'rgba(74,50,38,0.35)'; g.lineWidth = Math.max(0.4, u * 0.006); g.stroke(ep);
    // 上まぶた（目じりほど太い線を、塗りで描く）
    const n = 16, th = u * st.lid;
    const lidPt = (t) => {
      if (st.cover > 0) { const x = -rx * 1.02 + rx * 2.04 * t; return [x, lidLine(x)]; }
      const a = Math.PI * (1.04 + 0.94 * t);
      return [Math.cos(a) * rx * 1.02, Math.sin(a) * ry * 1.02];
    };
    g.fillStyle = st.lidCol;
    g.beginPath();
    for (let i = 0; i <= n; i++) { const [x, y] = lidPt(i / n); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    for (let i = n; i >= 0; i--) {
      const t = i / n, [x, y] = lidPt(t);
      const k = th * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (0.5 + t * 0.6));
      g.lineTo(x, y - k);
    }
    g.closePath(); g.fill();
    // 目じりのはね
    if (st.wing) {
      g.beginPath();
      g.moveTo(rx * 0.92, -ry * 0.42); g.quadraticCurveTo(rx * 1.25, -ry * 0.5, rx * 1.42, -ry * 0.72);
      g.quadraticCurveTo(rx * 1.2, -ry * 0.3, rx * 0.95, -ry * 0.15); g.closePath(); g.fill();
    }
    // まつげ
    g.strokeStyle = st.lidCol; g.lineWidth = Math.max(0.5, u * 0.011);
    for (let i = 0; i < st.lash; i++) {
      const a = Math.PI * (1.62 + i * 0.12), x = Math.cos(a) * rx * 1.05, y = Math.sin(a) * ry * 1.05 + ry * 2 * st.cover;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rx * 0.25, y - ry * 0.12, x + rx * 0.4, y - ry * 0.32 + i * ry * 0.08); g.stroke();
    }
    // 二重のすじ
    g.strokeStyle = 'rgba(74,50,38,0.45)'; g.lineWidth = Math.max(0.4, u * 0.007);
    g.beginPath(); g.ellipse(0, ry * 2 * st.cover, rx * 1.15, ry * 1.18, 0, Math.PI * 1.25, Math.PI * 1.75); g.stroke();
    // 下まぶた・下まつげ
    if (st.low > 0) {
      g.strokeStyle = st.lidCol; g.lineWidth = Math.max(0.4, u * 0.008);
      g.beginPath(); g.ellipse(0, 0, rx * 1.0, ry * 1.02, 0, Math.PI * 0.12, Math.PI * 0.42); g.stroke();
      for (let i = 0; i < st.low - 1; i++) {
        const a = Math.PI * (0.18 + i * 0.12), x = Math.cos(a) * rx, y = Math.sin(a) * ry * 1.02;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + rx * 0.12, y + ry * 0.14); g.stroke();
      }
    }
  }

  // 奥の目（小さめ・左右反転）と手前の目を描く。tilt + で目じりが下がる
  const twoEyes = (tilt, forceStyle) => (g, u, c, state, skin) => {
    const st = CH.EYE_STYLES[forceStyle || CH.eyeStyle];
    for (const [x, w, flip] of [[-0.06, 0.088, -1], [0.21, 0.105, 1]]) {
      g.save();
      g.translate(x * u, 0.09 * u);
      g.scale(flip, 1);
      g.rotate(tilt);
      eyeArt(g, u, w * u, c, skin, state, st, flip);
      g.restore();
    }
  };
  const EYES = {
    anime: twoEyes(0),        // ぱっちり
    tare: twoEyes(0.16),      // たれ目
    tsuri: twoEyes(-0.18),    // つり目
    maru: twoEyes(0, 'B'),    // まんまる
  };

  function mouth(g, u, state, t) {
    const x = 0.1 * u, y = 0.25 * u;
    g.strokeStyle = '#7a3e32'; g.lineWidth = Math.max(0.6, u * 0.014); g.lineCap = 'round';
    if (state === 'open' || (state === 'chew' && Math.sin(t * 12) > 0)) {
      g.fillStyle = '#c9675e';
      g.beginPath(); g.ellipse(x, y + 0.01 * u, 0.04 * u, 0.035 * u, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    } else if (state === 'o') {
      g.beginPath(); g.arc(x, y, 0.022 * u, 0, Math.PI * 2); g.stroke();
    } else {
      g.beginPath(); g.moveTo(x - 0.035 * u, y - 0.005 * u); g.quadraticCurveTo(x, y + 0.03 * u, x + 0.035 * u, y - 0.005 * u); g.stroke();
    }
  }

  // 髪型：back = 顔の後ろ、front = 顔の上
  const P = (u, pts) => pts.map(([x, y]) => [x * u, y * u]);
  const HAIRS = {
    bob: {
      back: (g, u, c) => X.shape(g, P(u, [[-0.5, -0.05], [-0.53, 0.2], [-0.46, 0.4], [-0.2, 0.38], [0.0, 0.2], [0.25, 0.1], [0.4, -0.1], [0.3, -0.4], [0, -0.5], [-0.35, -0.42]]), o(u, 51, { fill: shade(c, 0.85), flat: true })),
      frontPts: (u) => P(u, [[-0.5, 0.02], [-0.53, -0.2], [-0.38, -0.43], [-0.05, -0.53], [0.3, -0.46], [0.48, -0.26], [0.53, -0.06],
        [0.47, -0.08], [0.4, -0.02], [0.33, -0.13], [0.24, -0.05], [0.15, -0.15], [0.06, -0.07], [-0.04, -0.17], [-0.14, -0.09],
        [-0.22, -0.18], [-0.3, -0.02], [-0.35, 0.18], [-0.48, 0.2]]),
      front: (g, u, c) => hairFront(g, u, c, HAIRS.bob.frontPts(u)),
    },
    short: {
      back: () => {},
      frontPts: (u) => P(u, [[-0.48, 0.05], [-0.52, -0.2], [-0.38, -0.43], [-0.05, -0.52], [0.3, -0.46], [0.48, -0.26], [0.5, -0.1],
        [0.42, -0.14], [0.34, -0.08], [0.26, -0.2], [0.14, -0.12], [0.04, -0.22], [-0.08, -0.14], [-0.2, -0.24], [-0.3, -0.12], [-0.4, 0.06]]),
      front: (g, u, c) => hairFront(g, u, c, HAIRS.short.frontPts(u)),
    },
    long: {
      back: (g, u, c) => X.shape(g, P(u, [[-0.5, -0.1], [-0.56, 0.3], [-0.52, 0.72], [-0.3, 0.8], [-0.1, 0.7], [0.05, 0.3], [0.3, 0.12], [0.42, -0.1], [0.3, -0.4], [0, -0.5], [-0.35, -0.42]]), o(u, 55, { fill: shade(c, 0.85), flat: true })),
      frontPts: (u) => HAIRS.bob.frontPts(u),
      front: (g, u, c) => HAIRS.bob.front(g, u, c),
    },
    twin: {
      back: (g, u, c) => {
        for (const [x, sd] of [[-0.52, 56], [0.46, 57]]) {
          X.shape(g, P(u, [[x - 0.08, -0.25], [x + 0.1, -0.25], [x + 0.14, 0.2], [x + 0.06, 0.62], [x - 0.08, 0.66], [x - 0.12, 0.2]]), o(u, sd, { fill: shade(c, 0.9) }));
          X.ellipse(g, (x + 0.01) * u, -0.24 * u, 0.06 * u, 0.06 * u, o(u, sd + 10, { fill: '#e58c6c', n: 8 }));
        }
      },
      frontPts: (u) => HAIRS.short.frontPts(u),
      front: (g, u, c) => HAIRS.short.front(g, u, c),
    },
    pony: {
      back: (g, u, c) => X.shape(g, P(u, [[-0.4, -0.35], [-0.62, -0.25], [-0.78, 0.05], [-0.74, 0.42], [-0.6, 0.55], [-0.62, 0.2], [-0.5, -0.05], [-0.3, -0.2]]), o(u, 58, { fill: shade(c, 0.9) })),
      frontPts: (u) => HAIRS.short.frontPts(u),
      front: (g, u, c) => HAIRS.short.front(g, u, c),
    },
  };
  // 前髪：塗り・影 → 毛の流れのすじ → ツヤ（天使の輪）
  function hairFront(g, u, c, pts) {
    const p = X.shape(g, pts, o(u, 53, { fill: c }));
    g.save(); g.clip(p);
    g.strokeStyle = shade(c, 0.72); g.lineWidth = Math.max(0.4, u * 0.009); g.lineCap = 'round';
    for (const [x0, x1, y1] of [[-0.25, -0.18, -0.12], [-0.05, 0.02, -0.1], [0.12, 0.17, -0.09], [0.28, 0.33, -0.07], [0.4, 0.47, -0.04]]) {
      g.beginPath(); g.moveTo(x0 * u, -0.46 * u); g.quadraticCurveTo((x0 + x1) / 2 * u + 0.03 * u, -0.3 * u, x1 * u, y1 * u); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = u * 0.03;
    g.beginPath(); g.moveTo(-0.32 * u, -0.3 * u); g.quadraticCurveTo(-0.2 * u, -0.38 * u, -0.08 * u, -0.38 * u); g.stroke();
    g.beginPath(); g.moveTo(0.02 * u, -0.39 * u); g.quadraticCurveTo(0.16 * u, -0.38 * u, 0.28 * u, -0.32 * u); g.stroke();
    g.restore();
    g.strokeStyle = LINE; g.lineWidth = X.lw(u * 0.02); g.stroke(p);
  }

  // 頭飾り・装飾（none = なし）
  const HEADS = {
    none: null,
    ribbon: (g, u, c) => {
      X.shape(g, P(u, [[-0.2, -0.5], [-0.4, -0.62], [-0.42, -0.4], [-0.22, -0.44], [-0.05, -0.36], [0.0, -0.58]]), o(u, 91, { fill: c }));
      X.ellipse(g, -0.21 * u, -0.48 * u, 0.06 * u, 0.06 * u, o(u, 92, { fill: shade(c, 0.85), n: 8 }));
    },
    beret: (g, u, c) => {
      X.shape(g, P(u, [[-0.5, -0.3], [-0.42, -0.55], [-0.1, -0.66], [0.3, -0.6], [0.5, -0.42], [0.42, -0.34], [0.0, -0.4]]), o(u, 93, { fill: c }));
      X.line(g, P(u, [[0.02, -0.66], [0.06, -0.74]]), { stroke: LINE, lw: u * 0.04, amp: 0 });
    },
    rainhat: (g, u, c) => {
      X.shape(g, P(u, [[-0.4, -0.3], [-0.36, -0.58], [0.0, -0.66], [0.36, -0.58], [0.4, -0.3]]), o(u, 94, { fill: c }));
      X.shape(g, P(u, [[-0.62, -0.24], [-0.4, -0.34], [0.4, -0.34], [0.64, -0.24], [0.4, -0.2], [-0.4, -0.2]]), o(u, 95, { fill: shade(c, 0.9) }));
    },
    flower: (g, u, c) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        X.ellipse(g, (0.3 + Math.cos(a) * 0.06) * u, (-0.36 + Math.sin(a) * 0.06) * u, 0.05 * u, 0.05 * u, o(u, 96 + i, { fill: c, lw: u * 0.025, n: 8 }));
      }
      X.ellipse(g, 0.3 * u, -0.36 * u, 0.035 * u, 0.035 * u, o(u, 101, { fill: '#f7d978', lw: u * 0.02, n: 8 }));
    },
  };
  // 装飾。layer: face = 顔の上、body = 体の上
  const ACCS = {
    none: null,
    scarf: { layer: 'body', draw: (g, u, c) => {
      X.shape(g, P(u, [[-0.22, -0.84], [0.2, -0.84], [0.22, -0.74], [-0.22, -0.72]]), o(u, 111, { fill: c }));
      X.shape(g, P(u, [[-0.16, -0.76], [-0.06, -0.76], [-0.08, -0.52], [-0.2, -0.54]]), o(u, 112, { fill: shade(c, 0.9) }));
    } },
    glasses: { layer: 'face', draw: (g, u, c) => {
      g.strokeStyle = c; g.lineWidth = u * 0.03;
      g.beginPath(); g.ellipse(-0.04 * u, 0.07 * u, 0.11 * u, 0.12 * u, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(0.21 * u, 0.07 * u, 0.12 * u, 0.13 * u, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(0.07 * u, 0.04 * u); g.lineTo(0.09 * u, 0.04 * u); g.stroke();
    } },
  };

  // 服：back = 体の後ろ側（フードなど）、front = 体
  const TOPS = {
    raincoat: {
      back: (g, u, c) => X.ellipse(g, -0.2 * u, -0.8 * u, 0.2 * u, 0.13 * u, o(u, 61, { fill: shade(c, 0.88) })),
      front: (g, u, c) => {
        X.shape(g, P(u, [[-0.17, -0.81], [0.17, -0.81], [0.22, -0.55], [0.28, -0.25], [0, -0.23], [-0.28, -0.25], [-0.22, -0.55]]), o(u, 63, { fill: c }));
        X.line(g, P(u, [[0.07, -0.78], [0.08, -0.5], [0.09, -0.25]]), { stroke: shade(c, 0.7), lw: u * 0.025, amp: 0 });
        X.shape(g, P(u, [[-0.13, -0.81], [0.03, -0.81], [-0.04, -0.7]]), o(u, 65, { fill: shade(c, 1.08), lw: u * 0.03 }));
        X.shape(g, P(u, [[0.03, -0.81], [0.17, -0.81], [0.1, -0.7]]), o(u, 66, { fill: shade(c, 1.08), lw: u * 0.03 }));
        for (const y of [-0.62, -0.46]) X.ellipse(g, 0.13 * u, y * u, 0.025 * u, 0.025 * u, o(u, 67, { fill: '#fff6e6', lw: u * 0.02, n: 8 }));
        folds(g, u, c, [[[-0.2, -0.3], [-0.16, -0.4]], [[-0.06, -0.26], [-0.04, -0.36]], [[0.2, -0.28], [0.17, -0.38]], [[-0.13, -0.66], [-0.15, -0.56]]]);
      },
    },
    hoodie: {
      back: (g, u, c) => X.ellipse(g, -0.18 * u, -0.8 * u, 0.18 * u, 0.12 * u, o(u, 68, { fill: shade(c, 0.85) })),
      front: (g, u, c) => {
        X.shape(g, P(u, [[-0.2, -0.81], [0.2, -0.81], [0.24, -0.5], [0.23, -0.3], [-0.23, -0.3], [-0.24, -0.5]]), o(u, 69, { fill: c }));
        X.rect(g, -0.06 * u, -0.48 * u, 0.24 * u, 0.12 * u, o(u, 70, { fill: shade(c, 0.92), lw: u * 0.03, r: 0.03 * u }));
        X.line(g, P(u, [[0.04, -0.8], [0.05, -0.66]]), { stroke: '#fff6e6', lw: u * 0.025, amp: 0 });
        X.line(g, P(u, [[0.12, -0.8], [0.13, -0.66]]), { stroke: '#fff6e6', lw: u * 0.025, amp: 0 });
        folds(g, u, c, [[[-0.18, -0.34], [-0.16, -0.44]], [[0.18, -0.36], [0.16, -0.46]]]);
      },
    },
    dress: {
      back: () => {},
      front: (g, u, c) => {
        X.shape(g, P(u, [[-0.16, -0.81], [0.16, -0.81], [0.18, -0.6], [0.32, -0.2], [0, -0.17], [-0.32, -0.2], [-0.18, -0.6]]), o(u, 72, { fill: c }));
        X.shape(g, P(u, [[-0.14, -0.81], [0.02, -0.81], [-0.05, -0.72]]), o(u, 73, { fill: '#fff6e6', lw: u * 0.03 }));
        X.shape(g, P(u, [[0.02, -0.81], [0.16, -0.81], [0.1, -0.72]]), o(u, 74, { fill: '#fff6e6', lw: u * 0.03 }));
        X.line(g, P(u, [[-0.24, -0.26], [0.0, -0.22], [0.24, -0.26]]), { stroke: '#fff6e6', lw: u * 0.03, amp: 0 });
        folds(g, u, c, [[[-0.18, -0.22], [-0.12, -0.45]], [[0.0, -0.2], [0.0, -0.42]], [[0.17, -0.22], [0.11, -0.45]]]);
      },
    },
  };

  // 服のしわ（細い線）
  function folds(g, u, c, lines) {
    g.strokeStyle = shade(c, 0.68); g.lineWidth = Math.max(0.4, u * 0.009); g.lineCap = 'round';
    for (const [[x0, y0], [x1, y1]] of lines) {
      g.beginPath(); g.moveTo(x0 * u, y0 * u); g.quadraticCurveTo((x0 + x1) / 2 * u + 0.015 * u, (y0 + y1) / 2 * u, x1 * u, y1 * u); g.stroke();
    }
  }

  // ズボン（太もも）
  const PANTS = {
    leggings: (g, u, c, seed) => seg(g, u, 0.13, 0.13, c, seed),
    wide: (g, u, c, seed) => seg(g, u, 0.13, 0.17, c, seed),
    shorts: (g, u, c, seed, skin) => { seg(g, u, 0.13, 0.12, skin, seed); X.rect(g, -0.08 * u, -0.05 * u, 0.16 * u, 0.1 * u, o(u, seed + 1, { fill: c, r: 0.03 * u })); },
  };

  // 靴（すね＋足）
  const SHOES = {
    sneakers: (g, u, c, seed, shin) => {
      seg(g, u, 0.12, 0.12, shin, seed + 5);
      X.ellipse(g, 0.04 * u, 0.14 * u, 0.1 * u, 0.055 * u, o(u, seed, { fill: c, n: 12 }));
      X.line(g, [[-0.05 * u, 0.17 * u], [0.13 * u, 0.17 * u]], { stroke: '#fff6e6', lw: u * 0.02, amp: 0 });
    },
    ankleboots: (g, u, c, seed, shin) => {
      seg(g, u, 0.08, 0.12, shin, seed + 5);
      X.ellipse(g, 0.04 * u, 0.14 * u, 0.1 * u, 0.055 * u, o(u, seed, { fill: c, n: 12 }));
      X.rect(g, -0.07 * u, 0.04 * u, 0.14 * u, 0.11 * u, o(u, seed + 1, { fill: c, r: 0.04 * u }));
    },
    rainboots: (g, u, c, seed) => {
      X.ellipse(g, 0.04 * u, 0.14 * u, 0.1 * u, 0.055 * u, o(u, seed, { fill: c, n: 12 }));
      X.rect(g, -0.075 * u, -0.02 * u, 0.15 * u, 0.17 * u, o(u, seed + 1, { fill: c, r: 0.04 * u }));
      X.rect(g, -0.085 * u, -0.035 * u, 0.17 * u, 0.045 * u, o(u, seed + 2, { fill: shade(c, 1.12), r: 0.02 * u, lw: u * 0.03 }));
    },
  };

  // キャラメイク画面で表示する名前（種類の数は仮）
  CH.PARTS = [
    ['face', '顔'], ['eyes', '目'], ['hair', '髪'], ['head', '頭飾り'],
    ['top', '服'], ['pants', 'ズボン'], ['shoes', '靴'], ['acc', '装飾'],
  ];
  CH.NAMES = {
    face: { round: 'まる', egg: 'たまご', mochi: 'もち' },
    eyes: { anime: 'ぱっちり', tare: 'たれ目', tsuri: 'つり目', maru: 'まんまる' },
    hair: { bob: 'ボブ', short: 'ショート', long: 'ロング', twin: 'ツインテール', pony: 'ポニーテール' },
    head: { none: 'なし', ribbon: 'リボン', beret: 'ベレー帽', rainhat: 'レインハット', flower: 'お花' },
    top: { raincoat: 'レインコート', hoodie: 'パーカー', dress: 'ワンピース' },
    pants: { leggings: 'レギンス', wide: 'ワイドパンツ', shorts: 'ショートパンツ' },
    shoes: { rainboots: '長靴', sneakers: 'スニーカー', ankleboots: 'ショートブーツ' },
    acc: { none: 'なし', scarf: 'マフラー', glasses: 'メガネ' },
  };
  // 色はパレットから選ぶ（仮）
  const PAL = ['#ffffff', '#f6e7cc', '#f7d978', '#f3b65b', '#e58c6c', '#d9564f', '#f2a7a0', '#f4b6d2',
    '#c9a7e8', '#9fb8ef', '#6f8fd8', '#8fbfe0', '#9fd4c0', '#a5d47f', '#5e9c62', '#e9cf8a',
    '#b07a4f', '#8a5a3c', '#5f6b8a', '#9a9aa6', '#4a4a55', '#2b2320'];
  const SKIN = ['#fff0e4', '#ffe4cc', '#ffd9b8', '#f6d6c9', '#f2c29e', '#e0a77e', '#c58660', '#9a6446'];
  CH.PALETTE = { face: SKIN, eyes: PAL, hair: PAL, head: PAL, top: PAL, pants: PAL, shoes: PAL, acc: PAL };

  CH.TYPES = { face: FACES, eyes: EYES, hair: HAIRS, head: HEADS, top: TOPS, pants: PANTS, shoes: SHOES, acc: ACCS };

  // ---------------- 手足 ----------------
  function leg(g, u, look, hx, hy, L, seed, dark) {
    const k = dark ? 0.85 : 1;
    g.save();
    g.translate(hx * u, hy * u);
    g.rotate(-L.a);
    const skin = shade(look.face.color, k);
    PANTS[look.pants.type](g, u, shade(look.pants.color, k), seed, skin);
    g.translate(0, 0.13 * u);
    g.rotate(L.k);
    const shin = look.pants.type === 'shorts' ? skin : shade(look.pants.color, k);
    SHOES[look.shoes.type](g, u, shade(look.shoes.color, k), seed + 3, shin);
    g.restore();
  }

  function arm(g, u, look, sx, sy, A, seed, dark, held) {
    const c = shade(look.top.color, dark ? 0.85 : 1);
    g.save();
    g.translate(sx * u, sy * u);
    g.rotate(-A.a);
    seg(g, u, 0.15, 0.12, c, seed);
    g.translate(0, 0.15 * u);
    g.rotate(-A.e);
    seg(g, u, 0.11, 0.11, c, seed + 1);
    g.translate(0, 0.13 * u);
    if (held) held(g);
    X.ellipse(g, 0, 0, 0.065 * u, 0.065 * u, o(u, seed + 2, { fill: look.face.color, n: 10 }));
    g.restore();
  }

  // ---------------- 全身 ----------------
  // look = 見た目、pose = ポーズ、held = 手前の手に持つ物を描く関数（手の位置が原点）
  CH.draw = function (g, u, look, pose, held, t) {
    U = u;
    const b = pose.bob;
    g.save();
    g.translate(0, pose.dy * u);
    arm(g, u, look, -0.09, -0.72 + b, pose.armB, 71, true, null);
    leg(g, u, look, -0.07, -0.3, pose.legB, 81, true);
    leg(g, u, look, 0.07, -0.3, pose.legF, 85, false);
    g.save();
    g.translate(0, b * u);
    const top = TOPS[look.top.type];
    top.back(g, u, look.top.color);
    top.front(g, u, look.top.color);
    g.fillStyle = 'rgba(60,30,20,0.16)'; // あごの下の影
    g.beginPath(); g.ellipse(0.05 * u, -0.8 * u, 0.2 * u, 0.05 * u, 0, 0, Math.PI * 2); g.fill();
    // 頭
    g.translate(0.04 * u, -1.17 * u);
    const hair = HAIRS[look.hair.type];
    hair.back(g, u, look.hair.color);
    const skin = look.face.color;
    const fp = X.path(FACES[look.face.type](u));
    g.fillStyle = skin; g.fill(fp);
    g.save(); g.clip(fp);
    g.translate(0.015 * u, 0.06 * u); // 前髪が顔に落とす影
    g.fillStyle = shade(skin, 0.9); g.fill(X.path(hair.frontPts(u)));
    g.restore();
    g.strokeStyle = LINE; g.lineWidth = X.lw(u * 0.02); g.stroke(fp);
    for (const [bx, by] of [[-0.12, 0.21], [0.33, 0.21]]) { // ほおの赤み
      const rg = g.createRadialGradient(bx * u, by * u, 0, bx * u, by * u, 0.09 * u);
      rg.addColorStop(0, 'rgba(245,130,130,0.45)'); rg.addColorStop(1, 'rgba(245,130,130,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(bx * u, by * u, 0.09 * u, 0.06 * u, 0, 0, Math.PI * 2); g.fill();
    }
    EYES[look.eyes.type](g, u, look.eyes.color, pose.eyes, skin);
    mouth(g, u, pose.mouth, t || 0);
    hair.front(g, u, look.hair.color);
    const acc = ACCS[look.acc.type];
    if (acc && acc.layer === 'face') acc.draw(g, u, look.acc.color);
    if (HEADS[look.head.type]) HEADS[look.head.type](g, u, look.head.color);
    g.restore();
    if (acc && acc.layer === 'body') { g.save(); g.translate(0, b * u); acc.draw(g, u, look.acc.color); g.restore(); }
    arm(g, u, look, 0.03, -0.72 + b, pose.armF, 75, false, held);
    g.restore();
  };
})();
