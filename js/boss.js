// =============================================================
// ボス（最初の世界）
// ・おおしずく：召喚アイテム「しずくの鈴」／夜にたまに自然発生
// ・いわドン：地下の遺跡の最深部の祭壇（扉に銅のツルハシを納める。減らない）
// ・くもくじら：空のほこらの祭壇
// 10 章のルール：建物の中のボスは建物から出ない／対策すれば必ず勝てる動き
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG, S = RS.sketch, COL = RS.COL, T = RS.T;
  const BS = RS.boss = {};

  // ボスの種類（数値は仮）
  Object.assign(RS.ENEMIES, {
    oshizuku: { name: 'おおしずく', boss: true, hp: 150, dmg: 15, speed: 3.2, jump: 1.0, w: 2.2, h: 2.0, color: '#7fb7e6',
      drops: [['bigdrop', 1, 1], ['jelly', 3, 1]] },
    iwadon: { name: 'いわドン', boss: true, hp: 220, dmg: 18, speed: 1.8, jump: 0.8, w: 2.4, h: 2.2, color: '#a39a8c', dungeon: 'ruin',
      drops: [['rockheart', 1, 1], ['iron_ingot', 3, 1]] },
    kujira: { name: 'くもくじら', boss: true, hp: 240, dmg: 16, speed: 0, jump: 0, w: 4.0, h: 1.8, color: '#eef3fb', fly: true, dungeon: 'sky',
      drops: [['whale', 1, 1], ['cotton', 4, 1]] },
  });

  BS.reset = (game) => { game.dungeons = { ruin: { open: false, cleared: false }, sky: { open: true, cleared: false } }; game.wasNight = false; };
  BS.current = (game) => game.enemies.find((e) => e.def.boss && !e.gone);

  function spawn(game, type, x, y, bounds) {
    if (BS.current(game)) { game.toast('もうボスが出ています'); return null; }
    const e = new RS.enemy.Enemy(type, x - RS.ENEMIES[type].w / 2, y - RS.ENEMIES[type].h);
    e.bounds = bounds || null;
    e.appear = 1.0;
    e.baseY = e.y;
    game.enemies.push(e);
    game.toast(e.def.name + ' があらわれた！');
    return e;
  }

  // 召喚アイテム（しずくの鈴）：傘の下の地上で使う。鈴はなくなる
  BS.useSummon = function (game, def) {
    const p = game.player, w = game.world;
    if (p.y > w.surface(Math.floor(p.cx())) + 2 || !w.isProtected(p.cx(), p.y)) { game.toast('傘の下の 地上で 使ってください'); return; }
    const x = Math.round(p.cx() + p.face * 6);
    const sy = w.surface(x);
    if (spawn(game, def.summon, x + 0.5, sy)) game.inv.consumeHeld(1);
  };

  // 夜になった瞬間に、たまにおおしずくが自然に出る（傘レベル 2 から）
  BS.natural = function (game) {
    const night = RS.enemy.isNight(game);
    if (night && !game.wasNight && game.world.umb.level >= 2 && Math.random() < C.BOSS_NATURAL_CHANCE) {
      const p = game.player, w = game.world;
      const x = Math.round(RS.clamp(p.cx() + (Math.random() < 0.5 ? -9 : 9), w.umb.x - w.umb.R + 3, w.umb.x + w.umb.R - 3));
      if (p.y < w.surface(Math.floor(p.cx())) + 3) spawn(game, 'oshizuku', x + 0.5, w.surface(x));
    }
    game.wasNight = night;
  };

  // 祭壇・扉・宝箱をしらべたとき（Z）。しらべた物があれば true
  BS.interact = function (game, x, y, tile) {
    const w = game.world, D = game.dungeons;
    if (tile === T.DDOOR) {
      const d = w.dun.ruin;
      if (game.inv.slots.some((s) => s && s.id === d.key)) {
        w.set(d.door[0], d.door[1], T.AIR); w.set(d.door[0], d.door[1] + 1, T.AIR);
        D.ruin.open = true;
        game.toast(RS.ITEMS[d.key].name + ' を納めた（アイテムはそのまま）。扉がひらいた！');
      } else game.toast('扉には「' + RS.ITEMS[d.key].name + '」を納める必要があります（納めても減りません）');
      return true;
    }
    if (tile === T.BOSS_ALTAR) {
      const key = x === w.dun.ruin.altar[0] && y === w.dun.ruin.altar[1] ? 'ruin' : 'sky';
      const d = w.dun[key];
      const b = d.bounds;
      if (key === 'ruin') spawn(game, d.boss, (b.x0 + b.x1) / 2 - 2, b.y1, b);
      else spawn(game, d.boss, d.altar[0] + 0.5, d.altar[1] - 6, b);
      return true;
    }
    if (tile === T.CHEST) {
      const loot = C.CHEST_LOOT[Math.floor(Math.random() * C.CHEST_LOOT.length)];
      w.set(x, y, T.CHEST_OPEN);
      let msg = [];
      for (const [id, n] of loot) { game.inv.add(id, n); msg.push(RS.ITEMS[id].name + '×' + n); }
      game.toast('宝箱をあけた：' + msg.join('、'));
      return true;
    }
    return false;
  };

  // ボスの動き（EN.update から呼ぶ）。true を返したら、ふつうの動きはしない
  BS.ai = function (game, e, dt) {
    const p = game.player, w = game.world;
    e.bt = (e.bt || 0) + dt;
    if (e.type === 'kujira') {
      // 空を泳ぐ：ゆっくり左右に、ときどき急降下
      const b = e.bounds;
      e.phase = e.phase || 'swim';
      if (e.phase === 'swim') {
        e.x += Math.sin(e.t * 0.6) * 3 * dt;
        e.y = b.y0 + 3 + Math.sin(e.t * 1.3) * 1.2;
        if (e.bt > 4.5) { e.phase = 'dive'; e.bt = 0; e.tx = p.cx(); }
      } else if (e.phase === 'dive') {
        const ty = Math.min(p.y + p.h - e.h, b.y1 - e.h);
        e.x += RS.clamp(e.tx - e.cx(), -8 * dt, 8 * dt);
        e.y += RS.clamp(ty - e.y, -9 * dt, 9 * dt);
        if (e.bt > 1.6) { e.phase = 'rise'; e.bt = 0; }
      } else {
        e.y -= 5 * dt;
        if (e.y <= b.y0 + 3 || e.bt > 1.6) { e.phase = 'swim'; e.bt = 0; }
      }
      e.face = p.cx() > e.cx() ? 1 : -1;
      clamp(e);
      return true;
    }
    if (e.type === 'iwadon') {
      // ふだんはゆっくり。ときどき部屋のはしまで転がる（ジャンプやブロックでよけられる）
      if (!e.roll && e.bt > 5) { e.roll = { dir: Math.sign(p.cx() - e.cx()) || 1, t: 0 }; e.bt = 0; game.toast('いわドンが ころがってくる！'); }
      if (e.roll) {
        e.roll.t += dt;
        e.spdMul = 9 / C.MOVE_SPEED;
        let rem = dt;
        while (rem > 0) { const h = Math.min(rem, 1 / 60); e.physics(h, w, e.roll.dir, false); rem -= h; }
        if (e.vx === 0 || e.roll.t > 2.2) { e.roll = null; e.spdMul = e.def.speed / C.MOVE_SPEED; }
        clamp(e);
        return true;
      }
      return false;
    }
    if (e.type === 'oshizuku') {
      // ぴょんぴょん近づく。ときどき しずくん を呼ぶ（2 体まで）
      if (e.onGround && e.bt > 1.7) { e.vy = -13; e.vx = Math.sign(p.cx() - e.cx()) * 5; e.onGround = false; e.bt = 0; }
      e.calls = (e.calls || 0) + dt;
      if (e.calls > 9 && game.enemies.filter((x) => x.type === 'shizukun').length < 2) {
        e.calls = 0;
        const m = new RS.enemy.Enemy('shizukun', e.cx() + (Math.random() - 0.5) * 2, e.y);
        m.summoned = true;
        game.enemies.push(m);
      }
      let rem = dt;
      while (rem > 0) { const h = Math.min(rem, 1 / 60); e.physics(h, w, 0, false); rem -= h; }
      if (e.onGround) e.vx *= Math.pow(0.02, dt);
      else { const nx = e.x + e.vx * dt; if (!e.collides(w, nx, e.y)) e.x = nx; }
      // 傘の外へは行かない
      e.x = RS.clamp(e.x, w.umb.x - w.umb.R + 1, w.umb.x + w.umb.R - 1 - e.w);
      return true;
    }
    return false;
  };
  function clamp(e) {
    const b = e.bounds;
    if (!b) return;
    e.x = RS.clamp(e.x, b.x0, b.x1 - e.w);
    e.y = RS.clamp(e.y, b.y0, b.y1 - e.h);
  }
  BS.clamp = clamp;

  // ボスをたおしたとき
  BS.defeated = function (game, e) {
    const key = e.def.dungeon;
    if (key) game.dungeons[key].cleared = true;
    RS.prog.addCP(game, 30, 'ボス');
    game.toast(e.def.name + ' をたおした！' + (key ? ' このダンジョンは こわせるようになりました' : ''));
    for (let i = 0; i < 40; i++) game.particles.push({ x: e.cx(), y: e.cy(), vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 8, t: 1.2, color: ['#f7d6d0', '#fdf0c8', '#d7ecd9', '#d9e3f5', '#fff3a8'][i % 5], s: 0.15 });
  };

  // ボスの絵（ブロックと同じ手書き風）
  BS.draw = function (g, e, Tp, w, h, o) {
    if (e.type === 'oshizuku') {
      S.shape(g, [[0, -h], [w * 0.35, -h * 0.45], [w * 0.5, -h * 0.15], [w * 0.3, 0], [-w * 0.3, 0], [-w * 0.5, -h * 0.15], [-w * 0.35, -h * 0.45]], o(1501, e.def.color));
      S.shape(g, [[-w * 0.2, -h * 0.98], [-w * 0.1, -h * 1.15], [0, -h * 1.0], [w * 0.1, -h * 1.15], [w * 0.2, -h * 0.98]], o(1502, '#f7d978')); // かんむり
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-w * 0.18, -h * 0.55, w * 0.06, h * 0.12, -0.3, 0, Math.PI * 2); g.fill();
    } else if (e.type === 'iwadon') {
      g.save();
      if (e.roll) g.rotate(e.t * 10 * e.roll.dir);
      g.translate(0, e.roll ? h * 0.5 : 0);
      S.shape(g, [[-w * 0.5, e.roll ? -h * 0.5 : 0], [-w * 0.48, -h * 0.6], [-w * 0.2, -h], [w * 0.25, -h * 0.95], [w * 0.5, -h * 0.5], [w * 0.45, e.roll ? -h * 0.5 : 0]].map(([x, y]) => [x, e.roll ? y + h * 0.5 : y]), o(1503, e.def.color));
      g.restore();
    } else if (e.type === 'kujira') {
      S.shape(g, [[-w * 0.5, -h * 0.5], [-w * 0.3, -h], [w * 0.3, -h * 0.95], [w * 0.5, -h * 0.55], [w * 0.4, -h * 0.1], [-w * 0.35, 0], [-w * 0.62, -h * 0.25], [-w * 0.72, -h * 0.6]], o(1504, e.def.color));
      g.fillStyle = 'rgba(180,200,230,0.5)'; g.beginPath(); g.ellipse(w * 0.05, -h * 0.25, w * 0.3, h * 0.12, 0, 0, Math.PI * 2); g.fill();
    }
  };

  // 画面上のボスの体力バー（近くにいるとき）
  BS.drawBar = function (g, game) {
    const e = BS.current(game);
    if (!e || Math.hypot(e.cx() - game.player.cx(), e.cy() - game.player.cy()) > 40) return;
    const W = game.W, bw = Math.min(W * 0.6, 520), bh = 14, x = (W - bw) / 2, y = game.touch ? game.H * 0.33 : 76;
    RS.ui.text(g, e.def.name, W / 2, y - 12, 20, { align: 'center', outline: COL.cream });
    S.rect(g, x, y, bw, bh, { fill: '#f1e2c8', r: 7, seed: 1601, amp: 0.8, step: 16 });
    S.rect(g, x, y, Math.max(bh, bw * Math.max(0, e.hp) / e.def.hp), bh, { fill: '#d9564f', r: 7, seed: 1602, amp: 0.8, step: 16 });
    S.rect(g, x, y, bw, bh, { stroke: COL.line, lw: 2, r: 7, seed: 1603, amp: 0.8, step: 16 });
  };
})();
