// =============================================================
// 昼夜と敵
// 10 章のルール：夜の敵は朝・昼に必ず消える／地形・建物・畑をこわさない／
// 味方をおそわない（プレイヤーにぶつかったときだけダメージ）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG, S = RS.sketch, COL = RS.COL;
  const EN = RS.enemy = {};

  // ---- 昼夜（1日 = DAY_SEC 秒。0 = 夜明け） ----
  // 0〜0.05 夜明け / 〜0.6 昼 / 〜0.67 夕方 / 〜0.95 夜 / 〜1 夜明け
  EN.phase = (game) => ((game.clock || 0) / C.DAY_SEC) % 1;
  EN.isNight = (game) => { const p = EN.phase(game); return p >= 0.67 && p < 0.95; };
  // 暗さ 0〜1（夕方・夜明けはなめらかに）
  EN.dark = function (game) {
    const p = EN.phase(game);
    const sm = (a, b, x) => { const t = RS.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    if (p < 0.05) return 1 - sm(0, 0.05, p);
    if (p < 0.6) return 0;
    if (p < 0.67) return sm(0.6, 0.67, p);
    if (p < 0.95) return 1;
    return 1 - sm(0.95, 1, p);
  };
  EN.label = function (game) {
    const p = EN.phase(game);
    if (p < 0.05 || p >= 0.95) return 'あさ';
    if (p < 0.6) return 'ひる';
    if (p < 0.67) return 'ゆうがた';
    return 'よる';
  };

  // ---- 敵の種類（数値は仮） ----
  RS.ENEMIES = {
    shizukun: { name: 'しずくん', hp: 12, dmg: 8, speed: 2.2, jump: 0.75, w: 0.8, h: 0.8, night: true, color: '#8fc4ea',
      drops: [['jelly', 1, 0.8]] },
    fuwakko: { name: 'ふわっこ', hp: 16, dmg: 9, speed: 2.0, jump: 0.7, w: 0.9, h: 0.7, sky: true, color: '#ffffff',
      drops: [['cotton', 1, 0.9], ['skyfruit', 1, 0.3]] },
    ishikoron: { name: 'いしころん', hp: 22, dmg: 10, speed: 1.6, jump: 0.6, w: 0.9, h: 0.85, cave: true, color: '#b8b2a8',
      drops: [['stone', 2, 1], ['mushroom', 1, 0.3]] },
  };

  class Enemy extends RS.Player {
    constructor(type, x, y) {
      super();
      const d = RS.ENEMIES[type];
      this.type = type; this.def = d;
      this.w = d.w; this.h = d.h;
      this.x = x; this.y = y;
      this.hp = d.hp; this.t = Math.random() * 10; this.wander = 0; this.dir = Math.random() < 0.5 ? -1 : 1;
      this.spdMul = d.speed / C.MOVE_SPEED; this.jmpMul = d.jump;
      this.hurtT = 0; this.atkCd = 0; this.appear = 0.4;
    }
  }
  EN.Enemy = Enemy;

  EN.reset = (game) => { game.enemies = []; game.spawnT = 0; };

  // ---- 出現 ----
  function trySpawn(game) {
    const w = game.world, p = game.player, R = w.umb.R;
    const list = game.enemies;
    const night = EN.isNight(game);
    const under = p.y > w.surface(Math.floor(p.cx())) + 3;
    if (night && !under && list.filter((e) => e.def.night).length < C.NIGHT_ENEMY_MAX) {
      // 傘の下の地上。プレイヤーから少しはなれた所
      for (let k = 0; k < 6; k++) {
        const x = Math.floor(p.cx() + (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 10));
        if (Math.abs(x) > R - 2) continue;
        const s = w.surface(x);
        let y = s - 1;
        while (y > s - 30 && w.get(x, y) !== RS.T.AIR) y--;
        if (w.get(x, y) !== RS.T.AIR || w.get(x, y - 1) !== RS.T.AIR) continue;
        list.push(new Enemy('shizukun', x + 0.1, y + 1 - RS.ENEMIES.shizukun.h - 0.01));
        return;
      }
    }
    if (under && list.filter((e) => e.def.cave).length < C.CAVE_ENEMY_MAX) {
      // 洞窟の床
      for (let k = 0; k < 60; k++) {
        const x = Math.floor(p.cx() + (Math.random() - 0.5) * 36), y = Math.floor(p.cy() + (Math.random() - 0.5) * 24);
        if (Math.hypot(x - p.cx(), y - p.cy()) < 9) continue;
        if (y <= w.surface(x) + 6) continue;
        if (w.get(x, y) !== RS.T.AIR || w.get(x, y - 1) !== RS.T.AIR || !RS.TILES[w.get(x, y + 1)].solid) continue;
        if (!w.isProtected(x + 0.5, y)) continue;
        list.push(new Enemy('ishikoron', x + 0.05, y + 1 - RS.ENEMIES.ishikoron.h - 0.01));
        return;
      }
    }
  }

  // 空島の敵：プレイヤーが空島の高さにいるとき、近くの空島の上に出る
  function trySky(game) {
    const w = game.world, p = game.player;
    if (p.y > w.surface(Math.floor(p.cx())) - 10) return;
    if (game.enemies.filter((e) => e.def.sky).length >= 2) return;
    for (const I of w.islands()) {
      if (Math.abs(I.x - p.cx()) > 22 || Math.abs(I.y - p.y) > 14) continue;
      if (!w.isProtected(I.x + 0.5, I.y - 1)) continue;
      const x = I.x + Math.floor((Math.random() * 2 - 1) * (I.w - 2));
      if (Math.abs(x + 0.5 - p.cx()) < 3) continue; // プレイヤーのすぐそばには出さない
      if (w.get(x, I.y - 1) !== RS.T.AIR || w.get(x, I.y - 2) !== RS.T.AIR || !RS.TILES[w.get(x, I.y)].solid) continue;
      game.enemies.push(new Enemy('fuwakko', x + 0.05, I.y - RS.ENEMIES.fuwakko.h - 0.01));
      return;
    }
  }

  EN.update = function (game, dt) {
    const p = game.player, w = game.world;
    game.spawnT = (game.spawnT || 0) - dt;
    if (game.spawnT <= 0) { game.spawnT = C.ENEMY_SPAWN_SEC; trySpawn(game); trySky(game); }
    const night = EN.isNight(game);
    for (const e of game.enemies) {
      e.t += dt;
      e.appear = Math.max(0, e.appear - dt);
      e.hurtT = Math.max(0, e.hurtT - dt);
      e.atkCd = Math.max(0, e.atkCd - dt);
      // 朝になったら夜の敵は消える
      if (e.def.night && !night) { e.gone = true; poof(game, e); continue; }
      if (Math.hypot(e.cx() - p.cx(), e.cy() - p.cy()) > 44) { e.gone = true; continue; }
      // 動き：近くにいたら追いかける、遠いときはうろうろ
      const dx = p.cx() - e.cx(), dy = p.cy() - e.cy();
      let move = 0;
      if (game.state !== 'dead' && Math.abs(dx) < 11 && Math.abs(dy) < 6) move = Math.abs(dx) > 0.3 ? Math.sign(dx) : 0;
      else { e.wander -= dt; if (e.wander <= 0) { e.wander = 1.5 + Math.random() * 2; e.dir = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1); } move = e.dir; }
      // 前がふさがっていたらジャンプ
      const ahead = move > 0 ? Math.floor(e.x + e.w + 0.1) : Math.floor(e.x - 0.1);
      const blocked = move !== 0 && w.isSolid(ahead, Math.floor(e.y + e.h - 0.1));
      const jump = blocked && e.onGround;
      if (e.hurtT > 0.15) move = 0; // ひるみ
      let rem = dt;
      while (rem > 0) { const h = Math.min(rem, 1 / 60); e.physics(h, w, move, jump); rem -= h; }
      if (e.knock) { e.x += e.knock * dt; e.knock *= Math.pow(0.02, dt); if (Math.abs(e.knock) < 0.1) e.knock = 0; if (e.collides(w, e.x, e.y)) e.x -= e.knock * dt; }
      // プレイヤーにぶつかったらダメージ
      if (game.state === 'play') {
        const hit = p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y;
        if (hit && p.hurtT <= 0 && e.appear <= 0) {
          game.damage(e.def.dmg);
          p.vx = Math.sign(p.cx() - e.cx() || 1) * 7; p.vy = -6;
          p.sitting = null;
        }
      }
    }
    game.enemies = game.enemies.filter((e) => !e.gone);
  };

  function poof(game, e) {
    for (let i = 0; i < 10; i++) game.particles.push({ x: e.cx(), y: e.cy(), vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 3, t: 0.5, color: '#ffffff', s: 0.1 });
  }

  // ---- 攻撃 ----
  EN.weaponDmg = function (def) {
    if (!def || !def.tool) return 2;
    if (def.tool === 'sword') return 2 + def.tier * 4;
    return 3;
  };
  // ねらえる敵（オート：前の近く／マウス：カーソルの所）
  EN.target = function (game, aim) {
    const p = game.player;
    let best = null, bd = Infinity;
    for (const e of game.enemies) {
      if (e.appear > 0) continue;
      let ok;
      if (aim) ok = aim.x >= e.x && aim.x <= e.x + e.w && aim.y >= e.y && aim.y <= e.y + e.h && Math.hypot(e.cx() - p.cx(), e.cy() - p.cy()) <= C.MOUSE_REACH + 0.5;
      else {
        const dx = (e.cx() - p.cx()) * p.face;
        ok = dx > -0.3 && dx < C.ATTACK_REACH + e.w / 2 && Math.abs(e.cy() - p.cy()) < 1.4;
      }
      const d = Math.hypot(e.cx() - p.cx(), e.cy() - p.cy());
      if (ok && d < bd) { bd = d; best = e; }
    }
    return best;
  };
  EN.hit = function (game, e, dmg) {
    const p = game.player;
    e.hp -= dmg; e.hurtT = 0.3;
    e.knock = Math.sign(e.cx() - p.cx() || p.face) * 9; e.vy = -5; e.onGround = false;
    game.floater(e.cx(), e.y - 0.2, '-' + dmg, '#3a2a20');
    if (e.hp <= 0) {
      e.gone = true;
      poof(game, e);
      RS.prog.addCP(game, 1, 'たおした');
      let off = 0;
      for (const [id, n, ch] of e.def.drops) {
        if (Math.random() > ch) continue;
        if (!game.inv.add(id, n)) { game.floater(e.cx(), e.y - 0.6 - off, '+' + n + ' ' + RS.ITEMS[id].name); off += 0.5; }
      }
    }
  };

  // ---- 描画（ブロックと同じ手書き風） ----
  EN.draw = function (g, game) {
    const Tp = game.T, ox = game.ox(), oy = game.oy();
    for (const e of game.enemies) {
      const x = ox + e.cx() * Tp, y = oy + (e.y + e.h) * Tp;
      const k = e.appear > 0 ? 1 - e.appear / 0.4 : 1;
      const sq = 1 + Math.sin(e.t * 8) * 0.06 * (e.onGround ? 1 : 0); // ぷにぷに
      g.save();
      g.translate(x, y);
      g.scale(k * (e.x + e.w / 2 < game.player.cx() ? 1 : -1) * (1 / sq), k * sq);
      if (e.hurtT > 0 && Math.floor(e.hurtT * 20) % 2) g.globalAlpha = 0.5;
      const w = e.w * Tp, h = e.h * Tp;
      const o = (seed, fill) => ({ fill, stroke: COL.line, lw: Math.max(1.5, Tp * 0.06), seed, amp: Tp * 0.02, step: Tp * 0.2 });
      if (e.type === 'shizukun') {
        S.shape(g, [[0, -h], [w * 0.35, -h * 0.45], [w * 0.5, -h * 0.15], [w * 0.3, 0], [-w * 0.3, 0], [-w * 0.5, -h * 0.15], [-w * 0.35, -h * 0.45]], o(1101, e.def.color));
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-w * 0.18, -h * 0.55, w * 0.07, h * 0.12, -0.3, 0, Math.PI * 2); g.fill();
      } else if (e.type === 'fuwakko') {
        for (const [cx, cy, r] of [[-0.25, -0.4, 0.3], [0.2, -0.45, 0.32], [0, -0.65, 0.3]]) S.ellipse(g, w * cx, h * cy, w * r, w * r * 0.85, o(1103, '#ffffff'));
        g.fillStyle = 'rgba(245,140,170,0.5)'; g.beginPath(); g.ellipse(w * 0.32, -h * 0.28, Tp * 0.06, Tp * 0.04, 0, 0, Math.PI * 2); g.fill();
      } else {
        S.shape(g, [[-w * 0.5, 0], [-w * 0.45, -h * 0.6], [-w * 0.15, -h], [w * 0.3, -h * 0.9], [w * 0.5, -h * 0.4], [w * 0.45, 0]], o(1102, e.def.color));
        S.line(g, [[-w * 0.25, -h * 0.75], [-w * 0.1, -h * 0.65]], { stroke: COL.stoneDark || '#8d877c', lw: Tp * 0.04, amp: 0 });
      }
      // 目（プレイヤーのほうを見る）
      g.fillStyle = '#3a2a22';
      for (const ex of [0.08, 0.26]) { g.beginPath(); g.ellipse(w * ex, -h * 0.38, Tp * 0.045, Tp * 0.07, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
      // 体力（けがをしているときだけ）
      if (e.hp < e.def.hp) {
        const bw = Tp * 0.8, bx = x - bw / 2, by = oy + e.y * Tp - Tp * 0.25;
        g.fillStyle = 'rgba(255,246,230,0.9)'; g.fillRect(bx, by, bw, Tp * 0.1);
        g.fillStyle = '#e58c6c'; g.fillRect(bx, by, bw * Math.max(0, e.hp / e.def.hp), Tp * 0.1);
      }
    }
  };

  // ---- 夜の暗さと、たき火の明かり ----
  EN.drawNight = function (g, game) {
    const d = EN.dark(game);
    if (d <= 0.01) return;
    g.fillStyle = `rgba(18,24,64,${0.42 * d})`;
    g.fillRect(-game.W, -game.H, game.W * 3, game.H * 3);
    const Tp = game.T, ox = game.ox(), oy = game.oy(), v = game.viewRect(), w = game.world;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let y = Math.floor(v.y0) - 4; y <= v.y1 + 4; y++) {
      for (let x = Math.floor(v.x0) - 4; x <= v.x1 + 4; x++) {
        if (w.get(x, y) !== RS.T.CAMPFIRE) continue;
        const cx = ox + (x + 0.5) * Tp, cy = oy + (y + 0.5) * Tp, r = Tp * 5;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, `rgba(255,170,80,${0.35 * d})`); gr.addColorStop(1, 'rgba(255,170,80,0)');
        g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
    g.restore();
  };
})();
