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
  };

  // 目の形
  function animeEye(g, u, x, y, rx, ry, col, state, seed) {
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
    g.beginPath(); g.moveTo(x + rx * 0.9, y - ry * 0.45); g.lineTo(x + rx * 1.3, y - ry * 0.7); g.stroke();
    // 下まぶた
    g.lineWidth = u * 0.015;
    g.beginPath(); g.ellipse(x, y, rx * 0.95, ry * 1.0, 0, Math.PI * 0.35, Math.PI * 0.65); g.stroke();
  }
  const EYES = {
    // 顔の中心から見た位置に、奥の目と手前の目を描く（右向きなので顔のパーツは右寄り）
    anime: (g, u, c, state) => {
      animeEye(g, u, -0.04 * u, 0.06 * u, 0.075 * u, 0.115 * u, c, state, 41);
      animeEye(g, u, 0.2 * u, 0.06 * u, 0.088 * u, 0.125 * u, c, state, 43);
    },
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
        S.line(g, P(u, [[-0.2, -0.38], [0.0, -0.43], [0.18, -0.4]]), { stroke: 'rgba(255,255,255,0.45)', lw: u * 0.035, amp: 0 });
      },
    },
  };

  // 頭飾り・装飾（none = なし）
  const HEADS = { none: null };
  const ACCS = { none: null };

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
  };

  // ズボン（太もも）
  const PANTS = {
    leggings: (g, u, c, seed) => seg(g, u, 0.13, 0.13, c, seed),
  };

  // 靴（すね＋足）
  const SHOES = {
    rainboots: (g, u, c, seed) => {
      S.ellipse(g, 0.04 * u, 0.14 * u, 0.1 * u, 0.055 * u, o(u, seed, { fill: c, n: 12 }));
      S.rect(g, -0.075 * u, -0.02 * u, 0.15 * u, 0.17 * u, o(u, seed + 1, { fill: c, r: 0.04 * u }));
      S.rect(g, -0.085 * u, -0.035 * u, 0.17 * u, 0.045 * u, o(u, seed + 2, { fill: shade(c, 1.12), r: 0.02 * u, lw: u * 0.03 }));
    },
  };

  CH.TYPES = { face: FACES, eyes: EYES, hair: HAIRS, head: HEADS, top: TOPS, pants: PANTS, shoes: SHOES, acc: ACCS };

  // ---------------- 手足 ----------------
  function leg(g, u, look, hx, hy, L, seed, dark) {
    const k = dark ? 0.85 : 1;
    g.save();
    g.translate(hx * u, hy * u);
    g.rotate(-L.a);
    PANTS[look.pants.type](g, u, shade(look.pants.color, k), seed);
    g.translate(0, 0.13 * u);
    g.rotate(L.k);
    SHOES[look.shoes.type](g, u, shade(look.shoes.color, k), seed + 3);
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
    if (HEADS[look.head.type]) HEADS[look.head.type](g, u, look.head.color);
    g.restore();
    if (ACCS[look.acc.type]) ACCS[look.acc.type](g, u, look.acc.color);
    arm(g, u, look, 0.03, -0.72 + b, pose.armF, 75, false, held);
    g.restore();
  };
})();
