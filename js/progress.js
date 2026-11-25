// =============================================================
// 傘の成長（最初の世界の目標）
// ・チルパワー：新しいアイテムを見つける／新しい料理を作る／鉱石を掘る／敵を倒すと増える（減らない）
// ・納品：指定のアイテムを見せて登録する（アイテムは減らない）
// ・両方そろうと傘を大きくできる。最大になるとドアが出る
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG, S = RS.sketch, COL = RS.COL, T = RS.T;
  const ui = RS.ui;
  const PG = RS.prog = {};

  // 料理の条件（名前の終わりで見る）
  const dishEnds = (end, label) => ({ key: 'dish:' + end, label, test: (st) => st.id === 'dish' && st.data && st.data.name.endsWith(end) });
  const item = (id) => ({ key: id, label: null, test: (st) => st.id === id, id });

  // 段階ごとの条件（数値・アイテムは仮）。i 番目 = レベル i+1 → i+2 に上げる条件
  PG.STEPS = [
    { cp: 30, items: [item('table'), item('wood_pickaxe'), item('apple')] },
    { cp: 90, items: [item('stone_pickaxe'), item('pot'), dishEnds('ジュース', 'ジュース（どれでも）')] },
    { cp: 170, items: [item('copper_pickaxe'), item('chair'), dishEnds('スープ', 'スープ（どれでも）'), item('skystone')] },
    { cp: 280, items: [item('iron_pickaxe'), item('bigdrop'), item('pan'), item('cotton')] },
    { cp: 420, items: [item('crystal'), item('iron_sword'), dishEnds('いため', 'いため（どれでも）'), item('rockheart'), item('whale')] },
  ];
  PG.MAX = C.UMBRELLA_RADII.length;
  const labelOf = (r) => r.label || RS.ITEMS[r.id].name;

  PG.reset = (game) => { game.prog = { cp: 0, delivered: {}, seen: {}, dishes: {}, cleared: false }; };

  PG.addCP = function (game, n, why) {
    game.prog.cp += n;
    const p = game.player;
    game.floater(p.cx(), p.y - 0.7, '✦ チル +' + n + (why ? '（' + why + '）' : ''), '#8a5a8c');
  };

  // 1 秒ごとに持ち物を見て、新しいアイテム・料理を見つけたらチルパワー
  PG.update = function (game, dt) {
    game.progT = (game.progT || 0) - dt;
    if (game.progT > 0) return;
    game.progT = 1;
    const pr = game.prog;
    for (const st of game.inv.slots) {
      if (!st) continue;
      if (st.id === 'dish') {
        if (!pr.dishes[st.data.key]) { pr.dishes[st.data.key] = true; PG.addCP(game, 8, '新しい料理'); }
      } else if (!pr.seen[st.id]) { pr.seen[st.id] = true; PG.addCP(game, 5, '新しいアイテム'); }
    }
  };

  const step = (game) => PG.STEPS[game.world.umb.level - 1];
  PG.ready = function (game) {
    const s = step(game);
    return !!s && game.prog.cp >= s.cp && s.items.every((r) => game.prog.delivered[r.key]);
  };

  // 持ち物にある条件のアイテムを登録（減らさない）
  PG.deliver = function (game) {
    const s = step(game);
    if (!s) return 0;
    let n = 0;
    for (const r of s.items) {
      if (game.prog.delivered[r.key]) continue;
      if (game.inv.slots.some((st) => st && r.test(st))) { game.prog.delivered[r.key] = true; n++; }
    }
    return n;
  };

  PG.levelUp = function (game) {
    if (!PG.ready(game)) return;
    const w = game.world;
    w.setUmbrella(w.umb.level + 1);
    game.toast('傘が大きくなった！ 探索できる範囲が広がりました');
    for (let i = 0; i < 40; i++) {
      game.particles.push({ x: w.umb.x + (Math.random() - 0.5) * 6, y: w.umb.peak + Math.random() * 3, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 6, t: 1.2, color: ['#f7d6d0', '#fdf0c8', '#d7ecd9', '#d9e3f5', '#fff3a8'][i % 5], s: 0.14 });
    }
    if (w.umb.level >= PG.MAX) PG.placeDoor(game);
  };

  // 傘が最大になったら、台座のとなりにドアが出る
  PG.placeDoor = function (game) {
    const w = game.world, x = -1;
    let y = w.surface(x) - 1;
    while (w.get(x, y) !== T.AIR && y > w.surface(x) - 20) y--;
    w.set(x, y, T.DOOR);
    game.prog.cleared = true;
    game.toast('傘が最大になった！ 世界をつなぐドアがあらわれました');
  };

  // ---- 傘の画面 ----
  function layout(game) {
    const W = game.W, H = game.H;
    const s = Math.round(RS.clamp(Math.min(W, H) / 10, 30, 52));
    const pw = Math.min(W - 20, s * 13), ph = Math.min(H - 20, s * 10);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const L = { s, px, py, pw, ph, els: [] };
    const by = py + ph - s * 1.3;
    L.els.push({ kind: 'deliver', label: '納品する', x: px + s * 0.5, y: by, w: s * 3.4, h: s });
    L.els.push({ kind: 'up', label: '傘を大きくする', x: px + pw / 2 - s * 2.3, y: by, w: s * 4.6, h: s });
    L.els.push({ kind: 'close', label: 'とじる', x: px + pw - s * 3.4, y: by, w: s * 2.9, h: s });
    return L;
  }
  function act(game, el) {
    if (el.kind === 'close') { game.backScreen(); return; }
    if (el.kind === 'deliver') {
      const n = PG.deliver(game);
      game.umbMsg = n ? n + ' こ 納品しました（アイテムは そのまま）' : '納品できるアイテムが 持ち物にありません';
    }
    if (el.kind === 'up') {
      if (PG.ready(game)) { PG.levelUp(game); game.backScreen(); }
      else game.umbMsg = 'まだ条件がそろっていません';
    }
  }
  RS.SCREENS.umbrella = {
    custom: true,
    update(game) {
      const inp = game.input;
      if (game.umbCur == null) game.umbCur = 0;
      for (const e of inp.events) {
        const mouse = e.ptype === 'mouse';
        const hit = (mouse && e.type === 'down' && game.mode === 'mouse' && e.button === 0) || (!mouse && e.type === 'up' && !e.long);
        if (!hit) continue;
        const el = layout(game).els.find((b) => ui.inRect(b, e.x, e.y));
        if (el) act(game, el);
        if (game.screens[game.screens.length - 1] !== 'umbrella') return;
      }
      if (inp.pressed('esc') || inp.pressed('menu')) { game.backScreen(); return; }
      if (game.mode !== 'auto') return;
      if (inp.pressed('left')) game.umbCur = (game.umbCur + 2) % 3;
      if (inp.pressed('right')) game.umbCur = (game.umbCur + 1) % 3;
      if (inp.pressed('use')) act(game, layout(game).els[game.umbCur]);
    },
    draw(g, game) {
      const L = layout(game), s = L.s, w = game.world, lv = w.umb.level, st = step(game), pr = game.prog;
      g.fillStyle = 'rgba(80,58,38,0.35)'; g.fillRect(0, 0, game.W, game.H);
      S.rect(g, L.px, L.py, L.pw, L.ph, { fill: COL.cream, stroke: COL.line, lw: 3, r: s * 0.4, seed: 1301, amp: 2, step: 30 });
      let y = L.py + s * 0.7;
      ui.text(g, '傘　レベル ' + lv + ' / ' + PG.MAX + '（半径 ' + w.umb.R + ' マス）', L.px + s * 0.5, y, s * 0.5, { maxW: L.pw - s });
      y += s * 0.9;
      if (!st) {
        ui.text(g, pr.cleared ? '傘は最大です。ドアの先の世界は、つぎの開発でつながります。' : '傘は最大です。', L.px + s * 0.5, y, s * 0.38, { maxW: L.pw - s });
      } else {
        const need = st.cp, cp = Math.min(pr.cp, need);
        ui.text(g, 'チルパワー　' + pr.cp + ' / ' + need, L.px + s * 0.5, y, s * 0.4);
        y += s * 0.55;
        const bw = L.pw - s, bh = s * 0.3;
        S.rect(g, L.px + s * 0.5, y, bw, bh, { fill: '#f1e2c8', r: bh / 2, seed: 1302, amp: 0.8, step: 14 });
        if (cp > 0) S.rect(g, L.px + s * 0.5, y, Math.max(bh, bw * cp / need), bh, { fill: '#c9a7e8', r: bh / 2, seed: 1303, amp: 0.8, step: 14 });
        S.rect(g, L.px + s * 0.5, y, bw, bh, { stroke: COL.line, lw: 2, r: bh / 2, seed: 1304, amp: 0.8, step: 14 });
        y += s * 0.85;
        ui.text(g, '納品するもの（納品してもアイテムは減りません）', L.px + s * 0.5, y, s * 0.36);
        y += s * 0.65;
        for (const r of st.items) {
          const ok = pr.delivered[r.key];
          const has = game.inv.slots.some((x) => x && r.test(x));
          ui.text(g, (ok ? '✔ ' : has ? '○ ' : '・ ') + labelOf(r) + (ok ? '（納品ずみ）' : has ? '（持っている）' : ''), L.px + s * 0.8, y, s * 0.38, { color: ok ? '#5e9c62' : COL.line, maxW: L.pw - s * 1.3 });
          y += s * 0.6;
        }
        ui.text(g, 'チルパワーは、新しいアイテムや料理・鉱石・敵をたおすと増えます', L.px + s * 0.5, y + s * 0.1, s * 0.3, { color: 'rgba(107,74,47,0.8)', maxW: L.pw - s });
      }
      if (game.umbMsg) ui.text(g, game.umbMsg, L.px + L.pw / 2, L.els[0].y - s * 0.45, s * 0.34, { align: 'center', color: '#8a5a8c', maxW: L.pw - s });
      const kbd = game.mode === 'auto';
      L.els.forEach((el, i) => {
        const hl = kbd && i === game.umbCur, dis = el.kind === 'up' && !PG.ready(game);
        S.rect(g, el.x, el.y, el.w, el.h, { fill: hl ? '#ffe9b8' : dis ? '#eee3d0' : COL.slot, stroke: hl ? COL.accent : COL.line, lw: hl ? 3 : 2, r: s * 0.25, seed: 1310 + i, amp: 1, step: 16 });
        ui.text(g, el.label, el.x + el.w / 2, el.y + el.h / 2, s * 0.36, { align: 'center', maxW: el.w - 8, color: dis ? 'rgba(107,74,47,0.45)' : COL.line });
      });
    },
  };
  RS.openUmbrella = function (game) { game.umbMsg = ''; game.umbCur = 0; game.openScreen('umbrella'); };
})();
