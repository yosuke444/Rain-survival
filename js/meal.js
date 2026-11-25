// =============================================================
// 食事（10 秒前後のモーション）と特殊効果
// ・動く／ジャンプ／立つ／手持ちを変える／ダメージで中断（食べ物は減らない）
// ・満腹の回復と特殊効果は、食べきった瞬間
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG, S = RS.sketch;
  const M = RS.meal = {};
  const shade = (c, k) => RS.art.shade(c, k);
  const LINE = '#4a3226';

  // ---- 特殊効果（一定時間） ----
  // mult：効果の強さ（掛け算）。値は仮置き
  RS.EFFECTS = {
    speed: { name: 'はやあし', desc: '移動が速くなる', mult: 1.25 },
    jump:  { name: 'ぴょんぴょん', desc: 'ジャンプが高くなる', mult: 1.18 },
    mine:  { name: 'ほりほり', desc: '掘るのが速くなる', mult: 1.4 },
    regen: { name: 'げんき', desc: '体力の回復が速くなる', mult: 2.5 },
    guard: { name: 'まもり', desc: '受けるダメージが減る', mult: 0.7 },
    full:  { name: 'はらもち', desc: 'おなかが減りにくい', mult: 0.5 },
  };
  M.addEffect = function (game, id, sec) {
    const e = game.effects.find((x) => x.id === id);
    if (e) e.t = Math.max(e.t, sec); else game.effects.push({ id, t: sec });
  };
  M.mult = (game, id) => (game.effects.some((x) => x.id === id) ? RS.EFFECTS[id].mult : 1);
  M.updateEffects = function (game, dt) {
    for (const e of game.effects) e.t -= dt;
    game.effects = game.effects.filter((e) => e.t > 0);
  };

  // ---- 食べ物の情報（アイテム、またはスタックに入った料理のデータ） ----
  M.foodOf = function (stack) {
    if (!stack) return null;
    if (stack.data && stack.data.food) return stack.data.food;
    const it = RS.ITEMS[stack.id];
    return it && it.food ? it.food : null;
  };

  // ---- 開始・中断・完了 ----
  M.start = function (game) {
    const st = game.inv.held();
    const f = M.foodOf(st);
    if (!f) return;
    game.eating = { slot: game.inv.sel, id: st.id, food: f, t: 0, dur: f.dur || 10, done: 0 };
    game.player.swinging = false;
    game.mine.key = null;
  };
  M.cancel = function (game, why) {
    if (!game.eating) return;
    game.eating = null;
    game.toast('食事を中断しました（' + (why || '食べ物はそのまま') + '）');
  };
  M.update = function (game, dt) {
    const E = game.eating;
    if (!E) return;
    const inp = game.input;
    const st = game.inv.slots[E.slot];
    if (game.inv.sel !== E.slot || !st || st.id !== E.id) { M.cancel(game); return; }
    if (inp.pressed('left') || inp.pressed('right') || inp.pressed('up')) { M.cancel(game); return; }
    E.t += dt;
    // 演出（ポンと出る・ストローのあわ）
    if (E.food.motion === 'steak' && E.t - dt < 0.5 && E.t >= 0.5) M.sparkle(game, 0.3, -0.6);
    if (E.t >= E.dur) M.finish(game);
  };
  M.finish = function (game) {
    const E = game.eating, p = game.player, f = E.food;
    game.eating = null;
    game.inv.slots[E.slot].n--;
    if (game.inv.slots[E.slot].n <= 0) game.inv.slots[E.slot] = null;
    p.food = Math.min(C.FOOD_MAX, p.food + f.amount);
    const names = [];
    for (const ef of f.effects || []) { M.addEffect(game, ef.id, ef.sec); names.push(RS.EFFECTS[ef.id].name); }
    game.floater(p.cx(), p.y - 0.3, (f.kind === 'drink' ? 'ぷはー！' : 'ごちそうさま！') + ' おなか +' + f.amount);
    if (names.length) game.toast('とくべつな効果：' + names.join('・'));
    M.sparkle(game, 0.1, -1.4);
  };
  M.sparkle = function (game, ox, oy) {
    const p = game.player;
    for (let i = 0; i < 8; i++) {
      game.particles.push({ x: p.cx() + ox * p.face, y: p.y + p.h + oy, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 4 - 1, t: 0.6, color: ['#fff3a8', '#ffd1e0', '#ffffff'][i % 3], s: 0.07 });
    }
  };

  // ---- 腕を目標の位置へ（2 つの関節の計算） ----
  const L1 = 0.15, L2 = 0.13;
  M.ik = function (sh, tg) {
    let dx = tg[0] - sh[0], dy = tg[1] - sh[1];
    let d = Math.hypot(dx, dy);
    const max = L1 + L2 - 0.002;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; }
    d = Math.max(d, 0.04);
    const th = Math.atan2(dx, dy);
    const phi = Math.PI - Math.acos(RS.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const al = Math.acos(RS.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    // ひじが下を向くほうをえらぶ
    const c1 = { a: th - al, e: phi }, c2 = { a: th + al, e: -phi };
    const ey = (c) => sh[1] + L1 * Math.cos(c.a);
    return ey(c1) >= ey(c2) ? c1 : c2;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

  // ---- 小物の絵（u 単位。原点はその小物の中心） ----
  M.K = 1.5; // 小物の大きさ（ゲーム中で見えやすいよう、体より大きめに描く）
  const P = (u, pts) => pts.map(([x, y]) => [x * u, y * u]);
  function shape(g, u, pts, fill, lw) {
    const p = new Path2D(); S.trace(p, P(u, pts), true);
    g.fillStyle = fill; g.fill(p);
    g.strokeStyle = LINE; g.lineWidth = Math.max(0.5, u * (lw || 0.01)); g.stroke(p);
  }
  function ell(g, u, x, y, rx, ry, fill) {
    g.beginPath(); g.ellipse(x * u, y * u, rx * u, ry * u, 0, 0, Math.PI * 2);
    g.fillStyle = fill; g.fill();
    g.strokeStyle = LINE; g.lineWidth = Math.max(0.5, u * 0.01); g.stroke();
  }
  M.drawKnife = function (g, u) {
    u *= M.K;
    shape(g, u, [[-0.012, 0], [0.012, 0], [0.012, 0.07], [-0.012, 0.07]], '#9a7352');
    shape(g, u, [[-0.012, -0.02], [0.016, -0.02], [0.02, -0.17], [-0.004, -0.2], [-0.012, -0.17]], '#e8edf2');
  };
  M.drawFork = function (g, u) {
    u *= M.K;
    shape(g, u, [[-0.012, 0], [0.012, 0], [0.012, 0.07], [-0.012, 0.07]], '#9a7352');
    shape(g, u, [[-0.008, -0.01], [0.008, -0.01], [0.008, -0.1], [-0.008, -0.1]], '#e8edf2');
    for (const x of [-0.022, 0, 0.022]) shape(g, u, [[x - 0.006, -0.1], [x + 0.006, -0.1], [x + 0.006, -0.17], [x - 0.006, -0.17]], '#e8edf2', 0.006);
    shape(g, u, [[-0.03, -0.09], [0.03, -0.09], [0.03, -0.11], [-0.03, -0.11]], '#e8edf2', 0.006);
  };
  M.drawChopsticks = function (g, u) {
    u *= M.K;
    g.strokeStyle = '#8a5a3c'; g.lineCap = 'round';
    g.lineWidth = u * 0.016; g.beginPath(); g.moveTo(-0.01 * u, 0.05 * u); g.lineTo(0.02 * u, -0.2 * u); g.stroke();
    g.beginPath(); g.moveTo(0.012 * u, 0.05 * u); g.lineTo(0.05 * u, -0.19 * u); g.stroke();
  };
  // お皿（pieces = のこりの数、look = 見た目の色）
  M.drawPlate = function (g, u, look, pieces) {
    u *= M.K;
    ell(g, u, 0, 0.02, 0.2, 0.05, '#ffffff');
    ell(g, u, 0, 0.015, 0.14, 0.032, '#f2f0ea');
    for (let i = 0; i < pieces; i++) {
      const x = -0.08 + i * 0.08;
      shape(g, u, [[x - 0.045, 0.01], [x + 0.045, 0.01], [x + 0.04, -0.035], [x - 0.04, -0.04]], look.main);
      if (look.top) { g.fillStyle = look.top; g.beginPath(); g.ellipse(x * u, -0.03 * u, 0.025 * u, 0.012 * u, 0, 0, Math.PI * 2); g.fill(); }
    }
    if (look.side) ell(g, u, 0.12, -0.005, 0.03, 0.02, look.side);
  };
  // お茶碗（level = のこり 0〜1）
  M.drawBowl = function (g, u, look, level) {
    u *= M.K;
    if (level > 0.02) {
      const h = 0.07 * level;
      shape(g, u, [[-0.11, 0], [-0.09, -h], [0, -h - 0.025], [0.09, -h], [0.11, 0]], look.main);
      if (look.top && level > 0.3) ell(g, u, 0.01, -h - 0.01, 0.045, 0.025, look.top);
    }
    shape(g, u, [[-0.13, -0.005], [0.13, -0.005], [0.1, 0.08], [-0.1, 0.08]], look.bowl || '#f4ead8');
    g.strokeStyle = shade(look.bowl || '#f4ead8', 0.75); g.lineWidth = u * 0.012;
    g.beginPath(); g.moveTo(-0.11 * u, 0.025 * u); g.lineTo(0.11 * u, 0.025 * u); g.stroke();
  };
  // コップ（level = のこり 0〜1、straw = ストロー）
  M.drawGlass = function (g, u, look, level, straw) {
    u *= M.K;
    const top = -0.17, bot = 0.03;
    const glass = new Path2D(); S.trace(glass, P(u, [[-0.06, top], [0.06, top], [0.05, bot], [-0.05, bot]]), true);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill(glass);
    g.save(); g.clip(glass);
    const ly = lerp(bot, top + 0.025, level);
    g.fillStyle = look.main; g.fillRect(-0.08 * u, ly * u, 0.16 * u, (bot - ly + 0.02) * u);
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-0.04 * u, (top + 0.01) * u, 0.015 * u, (bot - top) * u);
    g.restore();
    if (straw) {
      g.strokeStyle = look.straw || '#f2a7a0'; g.lineWidth = u * 0.016; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0.01 * u, (bot - 0.03) * u); g.lineTo(0.03 * u, (top - 0.08) * u); g.lineTo(-0.02 * u, (top - 0.13) * u); g.stroke();
    }
    g.strokeStyle = LINE; g.lineWidth = Math.max(0.5, u * 0.01); g.stroke(glass);
  };

  // かじったりんご（bites 回かじった跡）
  const biteCache = {};
  M.bitten = function (id, bites) {
    const key = id + ':' + bites;
    if (biteCache[key]) return biteCache[key];
    const src = RS.art.icons[id];
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    const w = src.width;
    const spots = [[0.78, 0.5], [0.72, 0.72], [0.5, 0.82]];
    for (let i = 0; i < bites; i++) {
      const [x, y] = spots[i];
      for (const [dx, dy] of [[0, -0.07], [0.02, 0], [0, 0.07]]) { g.beginPath(); g.arc((x + dx) * w, (y + dy) * w, w * 0.08, 0, Math.PI * 2); g.fill(); }
    }
    biteCache[key] = c;
    return c;
  };

  // ---- ポーズ（モーションの本体） ----
  // pose を書きかえ、手に持つ物・目の前の小物を描く関数を入れる
  M.pose = function (game, pose) {
    const E = game.eating;
    if (!E) return;
    const f = E.food, t = E.t, T = E.dur, u0 = 1;
    const b = pose.bob;
    const SF = [0.13, -0.72 + b], SB = [-0.15, -0.72 + b];
    const MOUTH = [0.07, -0.9 + b], CHEST = [0.2, -0.6 + b], LAP = [0.16, -0.5 + b];
    const look = f.look || { main: '#ee8577' };
    const endT = T - 0.8; // 最後はにっこり
    const happy = t > endT;
    const setF = (tg) => { pose.armF = M.ik(SF, tg); };
    const setB = (tg) => { pose.armB = M.ik(SB, tg); };
    void u0;
    switch (f.motion) {
      case 'bite': { // 手で持ってかじる（3 回）
        const n = 3, cyc = endT / n, k = Math.min(n - 1, Math.floor(t / cyc)), p = (t - k * cyc) / cyc;
        let bites = Math.min(n, k + (p > 0.38 ? 1 : 0));
        if (happy) bites = n;
        let tg;
        if (happy) tg = CHEST;
        else if (p < 0.25) tg = mix(CHEST, [0.13, -0.88 + b], ease(p / 0.25));
        else if (p < 0.42) tg = [0.13, -0.88 + b];
        else if (p < 0.6) tg = mix([0.13, -0.88 + b], CHEST, ease((p - 0.42) / 0.18));
        else tg = CHEST;
        setF(tg); setB([-0.02, -0.48 + b]);
        pose.mouth = !happy && p > 0.25 && p < 0.42 ? 'open' : (!happy && p >= 0.42 && p < 0.85 ? 'chew' : 'smile');
        if (!happy && p >= 0.45 && p < 0.8) pose.eyes = 'closed';
        if (happy) pose.eyes = 'closed';
        const img = M.bitten(E.id, bites);
        if (bites < n || !happy) pose.heldF = (g, u, rot) => { g.rotate(rot); const sz = u * 0.42; g.drawImage(img, -sz / 2, -sz * 0.75, sz, sz); };
        break;
      }
      case 'steak': { // どこからかナイフとフォーク → 切って食べる（3 回）
        const intro = 1.0, n = 3, body = endT - intro, cyc = body / n;
        const pop = Math.min(1, t / 0.5);
        const k = t < intro ? 0 : Math.min(n - 1, Math.floor((t - intro) / cyc));
        const p = t < intro ? 0 : (t - intro - k * cyc) / cyc;
        const pieces = happy ? 0 : n - k - (p > 0.45 ? 1 : 0);
        const plate = [0.3, -0.55 + b];
        pose.prop = (g, u) => { g.save(); g.translate(plate[0] * u, plate[1] * u); g.scale(pop, pop); M.drawPlate(g, u, look, Math.max(0, pieces)); g.restore(); };
        if (t < intro) { setF([0.24, -0.66 + b]); setB([0.0, -0.62 + b]); }
        else if (happy) { setF(CHEST); setB([-0.02, -0.5 + b]); }
        else if (p < 0.4) { // ナイフで切る
          const saw = Math.sin(p * 40) * 0.025;
          setB([0.26 + saw, -0.6 + b]); setF([0.34, -0.6 + b]);
        } else if (p < 0.62) { // フォークで口へ
          setF(mix([0.34, -0.6 + b], [0.12, -0.86 + b], ease((p - 0.4) / 0.22))); setB([0.05, -0.55 + b]);
          pose.mouth = 'open';
        } else { setF(mix([0.12, -0.86 + b], CHEST, ease(Math.min(1, (p - 0.62) / 0.15)))); setB([0.05, -0.55 + b]); pose.mouth = 'chew'; pose.eyes = 'closed'; }
        if (happy) { pose.eyes = 'closed'; pose.prop = null; }
        else {
          pose.heldF = (g, u, rot) => { g.rotate(rot); g.scale(pop, pop); M.drawFork(g, u); };
          pose.heldB = (g, u, rot) => { g.rotate(rot); g.scale(pop, pop); M.drawKnife(g, u); };
        }
        break;
      }
      case 'bowl': { // お茶碗とおはし（4 口）
        const n = 4, cyc = endT / n, k = Math.min(n - 1, Math.floor(t / cyc)), p = (t - k * cyc) / cyc;
        const level = happy ? 0 : 1 - (k + (p > 0.45 ? 1 : 0)) / n;
        const bowl = [0.24, -0.6 + b];
        pose.prop = (g, u) => { if (!happy) { g.save(); g.translate(bowl[0] * u, bowl[1] * u); M.drawBowl(g, u, look, level); g.restore(); } };
        setB([0.1, -0.55 + b]);
        if (happy) setF(CHEST);
        else if (p < 0.3) setF(mix(CHEST, [0.26, -0.66 + b], ease(p / 0.3)));
        else if (p < 0.5) { setF(mix([0.26, -0.66 + b], [0.12, -0.86 + b], ease((p - 0.3) / 0.2))); pose.mouth = 'open'; }
        else { setF(mix([0.12, -0.86 + b], CHEST, ease(Math.min(1, (p - 0.5) / 0.2)))); pose.mouth = 'chew'; pose.eyes = 'closed'; }
        if (happy) pose.eyes = 'closed';
        else pose.heldF = (g, u, rot) => { g.rotate(rot); M.drawChopsticks(g, u); };
        break;
      }
      case 'straw': // ストローでちゅー（だんだん減る）
      case 'cup': { // コップでごくごく
        const level = happy ? 0 : 1 - Math.min(1, t / endT);
        const straw = f.motion === 'straw';
        const lift = Math.min(1, t / 0.8);
        const hold = straw ? [0.17, -0.74 + b] : [0.14, -0.84 + b];
        setF(mix(CHEST, hold, ease(lift)));
        setB(mix([-0.02, -0.5 + b], [0.08, -0.72 + b], ease(lift)));
        if (!happy) {
          pose.mouth = straw ? 'o' : 'open';
          if (Math.floor(t * 1.3) % 3 === 2) pose.eyes = 'closed';
          pose.heldF = (g, u, rot) => {
            g.rotate(rot + (!straw ? -0.5 * lift : 0));
            M.drawGlass(g, u, look, level, straw);
          };
        } else { pose.eyes = 'closed'; setF(CHEST); }
        break;
      }
    }
  };

  // 手持ちの表示（HUD 用）：残り時間のゲージ
  M.progress = (game) => (game.eating ? game.eating.t / game.eating.dur : 0);
})();
