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
  const LINE = '#5a3d28';
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

  const o = (u, seed, extra) => Object.assign({ stroke: LINE, lw: u * 0.045, seed, amp: u * 0.008, step: u * 0.1 }, extra);
  // 下向きに伸びる丸い棒（腕・脚の一節）
  function seg(g, u, len, w, fill, seed) {
    S.rect(g, -w / 2 * u, -w * 0.3 * u, w * u, (len + w * 0.6) * u, o(u, seed, { fill, r: w / 2 * u }));
  }

  // ---------------- 部位の種類 ----------------
  // 顔の形
  const FACES = {
    round: (g, u, c) => S.ellipse(g, 0, 0, 0.47 * u, 0.43 * u, o(u, 31, { fill: c, n: 22 })),
    egg: (g, u, c) => {
      const pts = [];
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2, sy = Math.sin(a);
        const rx = 0.45 * (sy > 0 ? 1 - sy * 0.18 : 1); // あごを細く
        pts.push([Math.cos(a) * rx * u, sy * (sy > 0 ? 0.47 : 0.43) * u]);
      }
      S.shape(g, pts, o(u, 32, { fill: c }));
    },
    mochi: (g, u, c) => S.ellipse(g, 0, 0.02 * u, 0.5 * u, 0.41 * u, o(u, 33, { fill: c, n: 22 })),
  };

  // 目の形
  function animeEye(g, u, x, y, rx, ry, col, state, tilt, flick) {
    tilt = tilt || 0; flick = flick == null ? -0.7 : flick;
    g.save(); g.translate(x, y); g.rotate(tilt); x = 0; y = 0;
    drawEye(g, u, rx, ry, col, state, flick);
    g.restore();
  }
  function drawEye(g, u, rx, ry, col, state, flick) {
    const x = 0, y = 0;
    if (state === 'blink' || state === 'closed' || state === 'squeeze') {
      g.strokeStyle = EYE_LINE; g.lineWidth = u * 0.035; g.lineCap = 'round';
      g.beginPath();
      if (state === 'closed') { // にっこり（∩）
        g.moveTo(x - rx, y + ry * 0.2); g.quadraticCurveTo(x, y - ry * 0.7, x + rx, y + ry * 0.2);
      } else if (state === 'squeeze') { // ぎゅっ（＞）
        g.moveTo(x - rx * 0.8, y - ry * 0.4); g.lineTo(x + rx * 0.6, y); g.lineTo(x - rx * 0.8, y + ry * 0.4);
      } else { // まばたき
        g.moveTo(x - rx, y + ry * 0.1); g.quadraticCurveTo(x, y + ry * 0.45, x + rx, y + ry * 0.1);
      }
      g.stroke();
      return;
    }
    g.save();
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = '#fff'; g.fill();
    g.clip();
    // 黒目（上が濃いグラデーション）
    const gr = g.createLinearGradient(0, y - ry, 0, y + ry);
    gr.addColorStop(0, shade(col, 0.45)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, 1.25));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y + ry * 0.12, rx * 0.86, ry * 0.88, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = shade(col, 0.3);
    g.beginPath(); g.ellipse(x, y + ry * 0.18, rx * 0.4, ry * 0.48, 0, 0, Math.PI * 2); g.fill();
    // ハイライト
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.25, rx * 0.34, ry * 0.26, -0.3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + rx * 0.35, y + ry * 0.45, rx * 0.15, 0, Math.PI * 2); g.fill();
    g.restore();
    // 上まぶた（太め）と、目じりのまつげ
    g.strokeStyle = EYE_LINE; g.lineCap = 'round';
    g.lineWidth = u * 0.04;
    g.beginPath(); g.ellipse(x, y, rx * 1.02, ry * 1.02, 0, Math.PI * 1.08, Math.PI * 1.95); g.stroke();
    g.lineWidth = u * 0.03;
    g.beginPath(); g.moveTo(x + rx * 0.9, y - ry * 0.45); g.lineTo(x + rx * 1.3, y + ry * flick); g.stroke();
    // 下まぶた
    g.lineWidth = u * 0.015;
    g.beginPath(); g.ellipse(x, y, rx * 0.95, ry * 1.0, 0, Math.PI * 0.35, Math.PI * 0.65); g.stroke();
  }
  // まんまるの目（白目なし）
  function maruEye(g, u, x, y, r, col, state) {
    if (state !== 'open') { animeEye(g, u, x, y, r, r, col, state); return; }
    g.fillStyle = shade(col, 0.35);
    g.beginPath(); g.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.ellipse(x, y + r * 0.35, r * 0.6, r * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x - r * 0.25, y - r * 0.35, r * 0.32, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + r * 0.3, y + r * 0.3, r * 0.12, 0, Math.PI * 2); g.fill();
  }
  // 顔の中心から見た位置に、奥の目と手前の目を描く（右向きなので顔のパーツは右寄り）
  const twoEyes = (tilt, flick) => (g, u, c, state) => {
    animeEye(g, u, -0.04 * u, 0.06 * u, 0.075 * u, 0.115 * u, c, state, -tilt, flick);
    animeEye(g, u, 0.2 * u, 0.06 * u, 0.088 * u, 0.125 * u, c, state, tilt, flick);
  };
  const EYES = {
    anime: twoEyes(0, -0.7),   // ぱっちり
    tare: twoEyes(0.18, -0.1), // たれ目
    tsuri: twoEyes(-0.2, -1.0),// つり目
    maru: (g, u, c, state) => { maruEye(g, u, -0.03 * u, 0.07 * u, 0.07 * u, c, state); maruEye(g, u, 0.2 * u, 0.07 * u, 0.08 * u, c, state); },
  };

  function mouth(g, u, state, t) {
    const x = 0.1 * u, y = 0.25 * u;
    g.strokeStyle = LINE; g.lineWidth = u * 0.025; g.lineCap = 'round';
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
      back: (g, u, c) => S.shape(g, P(u, [[-0.5, -0.05], [-0.53, 0.2], [-0.46, 0.4], [-0.2, 0.38], [0.0, 0.2], [0.25, 0.1], [0.4, -0.1], [0.3, -0.4], [0, -0.5], [-0.35, -0.42]]), o(u, 51, { fill: shade(c, 0.85) })),
      front: (g, u, c) => {
        S.shape(g, P(u, [[-0.5, 0.02], [-0.53, -0.2], [-0.38, -0.43], [-0.05, -0.53], [0.3, -0.46], [0.48, -0.26], [0.53, -0.06],
          [0.47, -0.08], [0.4, -0.02], [0.33, -0.13], [0.24, -0.05], [0.15, -0.15], [0.06, -0.07], [-0.04, -0.17], [-0.14, -0.09],
          [-0.22, -0.18], [-0.3, -0.02], [-0.35, 0.18], [-0.48, 0.2]]), o(u, 53, { fill: c }));
        shine(g, u);
      },
    },
    short: {
      back: () => {},
      front: (g, u, c) => {
        S.shape(g, P(u, [[-0.48, 0.05], [-0.52, -0.2], [-0.38, -0.43], [-0.05, -0.52], [0.3, -0.46], [0.48, -0.26], [0.5, -0.1],
          [0.42, -0.14], [0.34, -0.08], [0.26, -0.2], [0.14, -0.12], [0.04, -0.22], [-0.08, -0.14], [-0.2, -0.24], [-0.3, -0.12], [-0.4, 0.06]]), o(u, 54, { fill: c }));
        shine(g, u);
      },
    },
    long: {
      back: (g, u, c) => S.shape(g, P(u, [[-0.5, -0.1], [-0.56, 0.3], [-0.52, 0.72], [-0.3, 0.8], [-0.1, 0.7], [0.05, 0.3], [0.3, 0.12], [0.42, -0.1], [0.3, -0.4], [0, -0.5], [-0.35, -0.42]]), o(u, 55, { fill: shade(c, 0.85) })),
      front: (g, u, c) => HAIRS.bob.front(g, u, c),
    },
    twin: {
      back: (g, u, c) => {
        for (const [x, sd] of [[-0.52, 56], [0.46, 57]]) {
          S.shape(g, P(u, [[x - 0.08, -0.25], [x + 0.1, -0.25], [x + 0.14, 0.2], [x + 0.06, 0.62], [x - 0.08, 0.66], [x - 0.12, 0.2]]), o(u, sd, { fill: shade(c, 0.9) }));
          S.ellipse(g, (x + 0.01) * u, -0.24 * u, 0.06 * u, 0.06 * u, o(u, sd + 10, { fill: '#e58c6c', n: 8 }));
        }
      },
      front: (g, u, c) => HAIRS.short.front(g, u, c),
    },
    pony: {
      back: (g, u, c) => S.shape(g, P(u, [[-0.4, -0.35], [-0.62, -0.25], [-0.78, 0.05], [-0.74, 0.42], [-0.6, 0.55], [-0.62, 0.2], [-0.5, -0.05], [-0.3, -0.2]]), o(u, 58, { fill: shade(c, 0.9) })),
      front: (g, u, c) => HAIRS.short.front(g, u, c),
    },
  };
  function shine(g, u) {
    S.line(g, P(u, [[-0.2, -0.38], [0.0, -0.43], [0.18, -0.4]]), { stroke: 'rgba(255,255,255,0.45)', lw: u * 0.035, amp: 0 });
  }

  // 頭飾り・装飾（none = なし）
  const HEADS = {
    none: null,
    ribbon: (g, u, c) => {
      S.shape(g, P(u, [[-0.2, -0.5], [-0.4, -0.62], [-0.42, -0.4], [-0.22, -0.44], [-0.05, -0.36], [0.0, -0.58]]), o(u, 91, { fill: c }));
      S.ellipse(g, -0.21 * u, -0.48 * u, 0.06 * u, 0.06 * u, o(u, 92, { fill: shade(c, 0.85), n: 8 }));
    },
    beret: (g, u, c) => {
      S.shape(g, P(u, [[-0.5, -0.3], [-0.42, -0.55], [-0.1, -0.66], [0.3, -0.6], [0.5, -0.42], [0.42, -0.34], [0.0, -0.4]]), o(u, 93, { fill: c }));
      S.line(g, P(u, [[0.02, -0.66], [0.06, -0.74]]), { stroke: LINE, lw: u * 0.04, amp: 0 });
    },
    rainhat: (g, u, c) => {
      S.shape(g, P(u, [[-0.4, -0.3], [-0.36, -0.58], [0.0, -0.66], [0.36, -0.58], [0.4, -0.3]]), o(u, 94, { fill: c }));
      S.shape(g, P(u, [[-0.62, -0.24], [-0.4, -0.34], [0.4, -0.34], [0.64, -0.24], [0.4, -0.2], [-0.4, -0.2]]), o(u, 95, { fill: shade(c, 0.9) }));
    },
    flower: (g, u, c) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        S.ellipse(g, (0.3 + Math.cos(a) * 0.06) * u, (-0.36 + Math.sin(a) * 0.06) * u, 0.05 * u, 0.05 * u, o(u, 96 + i, { fill: c, lw: u * 0.025, n: 8 }));
      }
      S.ellipse(g, 0.3 * u, -0.36 * u, 0.035 * u, 0.035 * u, o(u, 101, { fill: '#f7d978', lw: u * 0.02, n: 8 }));
    },
  };
  // 装飾。layer: face = 顔の上、body = 体の上
  const ACCS = {
    none: null,
    scarf: { layer: 'body', draw: (g, u, c) => {
      S.shape(g, P(u, [[-0.22, -0.84], [0.2, -0.84], [0.22, -0.74], [-0.22, -0.72]]), o(u, 111, { fill: c }));
      S.shape(g, P(u, [[-0.16, -0.76], [-0.06, -0.76], [-0.08, -0.52], [-0.2, -0.54]]), o(u, 112, { fill: shade(c, 0.9) }));
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
      back: (g, u, c) => S.ellipse(g, -0.2 * u, -0.8 * u, 0.2 * u, 0.13 * u, o(u, 61, { fill: shade(c, 0.88) })),
      front: (g, u, c) => {
        S.shape(g, P(u, [[-0.17, -0.81], [0.17, -0.81], [0.22, -0.55], [0.28, -0.25], [0, -0.23], [-0.28, -0.25], [-0.22, -0.55]]), o(u, 63, { fill: c }));
        S.line(g, P(u, [[0.07, -0.78], [0.08, -0.5], [0.09, -0.25]]), { stroke: shade(c, 0.7), lw: u * 0.025, amp: 0 });
        S.shape(g, P(u, [[-0.13, -0.81], [0.03, -0.81], [-0.04, -0.7]]), o(u, 65, { fill: shade(c, 1.08), lw: u * 0.03 }));
        S.shape(g, P(u, [[0.03, -0.81], [0.17, -0.81], [0.1, -0.7]]), o(u, 66, { fill: shade(c, 1.08), lw: u * 0.03 }));
        for (const y of [-0.62, -0.46]) S.ellipse(g, 0.13 * u, y * u, 0.025 * u, 0.025 * u, o(u, 67, { fill: '#fff6e6', lw: u * 0.02, n: 8 }));
      },
    },
    hoodie: {
      back: (g, u, c) => S.ellipse(g, -0.18 * u, -0.8 * u, 0.18 * u, 0.12 * u, o(u, 68, { fill: shade(c, 0.85) })),
      front: (g, u, c) => {
        S.shape(g, P(u, [[-0.2, -0.81], [0.2, -0.81], [0.24, -0.5], [0.23, -0.3], [-0.23, -0.3], [-0.24, -0.5]]), o(u, 69, { fill: c }));
        S.rect(g, -0.06 * u, -0.48 * u, 0.24 * u, 0.12 * u, o(u, 70, { fill: shade(c, 0.92), lw: u * 0.03, r: 0.03 * u }));
        S.line(g, P(u, [[0.04, -0.8], [0.05, -0.66]]), { stroke: '#fff6e6', lw: u * 0.025, amp: 0 });
        S.line(g, P(u, [[0.12, -0.8], [0.13, -0.66]]), { stroke: '#fff6e6', lw: u * 0.025, amp: 0 });
      },
    },
    dress: {
      back: () => {},
      front: (g, u, c) => {
        S.shape(g, P(u, [[-0.16, -0.81], [0.16, -0.81], [0.18, -0.6], [0.32, -0.2], [0, -0.17], [-0.32, -0.2], [-0.18, -0.6]]), o(u, 72, { fill: c }));
        S.shape(g, P(u, [[-0.14, -0.81], [0.02, -0.81], [-0.05, -0.72]]), o(u, 73, { fill: '#fff6e6', lw: u * 0.03 }));
        S.shape(g, P(u, [[0.02, -0.81], [0.16, -0.81], [0.1, -0.72]]), o(u, 74, { fill: '#fff6e6', lw: u * 0.03 }));
        S.line(g, P(u, [[-0.24, -0.26], [0.0, -0.22], [0.24, -0.26]]), { stroke: '#fff6e6', lw: u * 0.03, amp: 0 });
      },
    },
  };

  // ズボン（太もも）
  const PANTS = {
    leggings: (g, u, c, seed) => seg(g, u, 0.13, 0.13, c, seed),
    wide: (g, u, c, seed) => seg(g, u, 0.13, 0.17, c, seed),
    shorts: (g, u, c, seed, skin) => { seg(g, u, 0.13, 0.12, skin, seed); S.rect(g, -0.08 * u, -0.05 * u, 0.16 * u, 0.1 * u, o(u, seed + 1, { fill: c, r: 0.03 * u })); },
  };

  // 靴（すね＋足）
  const SHOES = {
    sneakers: (g, u, c, seed, shin) => {
      seg(g, u, 0.12, 0.12, shin, seed + 5);
      S.ellipse(g, 0.04 * u, 0.14 * u, 0.1 * u, 0.055 * u, o(u, seed, { fill: c, n: 12 }));
      S.line(g, [[-0.05 * u, 0.17 * u], [0.13 * u, 0.17 * u]], { stroke: '#fff6e6', lw: u * 0.02, amp: 0 });
    },
    ankleboots: (g, u, c, seed, shin) => {
      seg(g, u, 0.08, 0.12, shin, seed + 5);
      S.ellipse(g, 0.04 * u, 0.14 * u, 0.1 * u, 0.055 * u, o(u, seed, { fill: c, n: 12 }));
      S.rect(g, -0.07 * u, 0.04 * u, 0.14 * u, 0.11 * u, o(u, seed + 1, { fill: c, r: 0.04 * u }));
    },
    rainboots: (g, u, c, seed) => {
      S.ellipse(g, 0.04 * u, 0.14 * u, 0.1 * u, 0.055 * u, o(u, seed, { fill: c, n: 12 }));
      S.rect(g, -0.075 * u, -0.02 * u, 0.15 * u, 0.17 * u, o(u, seed + 1, { fill: c, r: 0.04 * u }));
      S.rect(g, -0.085 * u, -0.035 * u, 0.17 * u, 0.045 * u, o(u, seed + 2, { fill: shade(c, 1.12), r: 0.02 * u, lw: u * 0.03 }));
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
    S.ellipse(g, 0, 0, 0.065 * u, 0.065 * u, o(u, seed + 2, { fill: look.face.color, n: 10 }));
    g.restore();
  }

  // ---------------- 全身 ----------------
  // look = 見た目、pose = ポーズ、held = 手前の手に持つ物を描く関数（手の位置が原点）
  CH.draw = function (g, u, look, pose, held, t) {
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
    // 頭
    g.translate(0.04 * u, -1.17 * u);
    const hair = HAIRS[look.hair.type];
    hair.back(g, u, look.hair.color);
    FACES[look.face.type](g, u, look.face.color);
    g.fillStyle = 'rgba(245,140,140,0.35)';
    g.beginPath(); g.ellipse(-0.1 * u, 0.2 * u, 0.07 * u, 0.04 * u, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(0.32 * u, 0.2 * u, 0.07 * u, 0.04 * u, 0, 0, Math.PI * 2); g.fill();
    EYES[look.eyes.type](g, u, look.eyes.color, pose.eyes);
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
