// =============================================================
// 農業（たねをまく → 3 だんかいで育つ → 収穫）・畜産（にわとり・うし）・掲示板
// 敵は畑をあらさない・動物をおそわない（10 章）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG, S = RS.sketch, COL = RS.COL, T = RS.T;
  const FM = RS.farm = {};

  // 作物：tiles = 育つだんかいのブロック、crop = とれる物、seed = たね
  FM.CROPS = {
    rice:   { tiles: [T.RICE0, T.RICE1, T.RICE2], crop: 'rice', seed: 'rice_seed', color: '#e9cf8a' },
    carrot: { tiles: [T.CARROT0, T.CARROT1, T.CARROT2], crop: 'carrot', seed: 'carrot_seed', color: '#f3a35b' },
  };
  FM.cropOfTile = (t) => Object.keys(FM.CROPS).find((k) => FM.CROPS[k].tiles.includes(t));

  FM.reset = (game) => { game.world.crops = []; game.animals = []; game.world.boards = {}; game.animalT = 0; };

  // たねをまいたとき
  FM.planted = function (game, x, y, kind) {
    game.world.crops.push({ x, y, kind, stage: 0, t: C.CROP_STAGE_SEC * (0.8 + Math.random() * 0.4) });
  };
  // 育つ（傘の下の雨が水やりになる）
  FM.update = function (game, dt) {
    const w = game.world;
    for (let i = w.crops.length - 1; i >= 0; i--) {
      const c = w.crops[i], def = FM.CROPS[c.kind];
      if (w.get(c.x, c.y) !== def.tiles[c.stage]) { w.crops.splice(i, 1); continue; }
      if (c.stage >= 2) continue;
      c.t -= dt;
      if (c.t <= 0) { c.stage++; c.t = C.CROP_STAGE_SEC * (0.8 + Math.random() * 0.4); w.set(c.x, c.y, def.tiles[c.stage]); }
    }
    updateAnimals(game, dt);
  };
  // 収穫（育ちきった作物を Z）。true なら収穫した
  FM.harvest = function (game, x, y, tile) {
    const kind = FM.cropOfTile(tile);
    if (!kind) return false;
    const def = FM.CROPS[kind];
    if (tile !== def.tiles[2]) { game.toast('まだ育っています'); return true; }
    game.world.set(x, y, T.AIR);
    const n = 1 + (Math.random() < 0.5 ? 1 : 0), sd = 1 + (Math.random() < 0.4 ? 1 : 0);
    game.inv.add(def.crop, n); game.inv.add(def.seed, sd);
    game.floater(x + 0.5, y - 0.2, '+' + n + ' ' + RS.ITEMS[def.crop].name);
    game.burst(x + 0.5, y + 0.5, def.color, 8);
    return true;
  };

  // ---- 動物 ----
  FM.ANIMALS = {
    chicken: { name: 'にわとり', w: 0.7, h: 0.75, speed: 1.2, max: 3, color: '#ffffff' },
    cow:     { name: 'うし', w: 1.5, h: 1.2, speed: 0.9, max: 2, color: '#ffffff' },
  };
  class Animal extends RS.Player {
    constructor(type, x, y) {
      super();
      const d = FM.ANIMALS[type];
      this.type = type; this.def = d; this.w = d.w; this.h = d.h; this.x = x; this.y = y;
      this.spdMul = d.speed / C.MOVE_SPEED; this.dir = 0; this.wander = 0; this.t = Math.random() * 9;
      this.ready = 0; // たまご・ミルクが取れるまでの秒数（0 ならとれる）
      this.heart = 0;
    }
  }
  FM.Animal = Animal;

  function updateAnimals(game, dt) {
    const w = game.world, p = game.player;
    // 昼に、傘の下の草地にあらわれる
    game.animalT -= dt;
    if (game.animalT <= 0) {
      game.animalT = 6;
      if (!RS.enemy.isNight(game)) {
        for (const type of ['chicken', 'cow']) {
          if (game.animals.filter((a) => a.type === type).length >= FM.ANIMALS[type].max || Math.random() > 0.35) continue;
          const x = Math.floor(p.cx() + (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 8));
          if (Math.abs(x - w.umb.x) > w.umb.R - 3) continue;
          const s = w.surface(x);
          if (w.get(x, s) !== T.GRASS || w.get(x, s - 1) !== T.AIR || w.get(x, s - 2) !== T.AIR) continue;
          game.animals.push(new Animal(type, x + 0.1, s - FM.ANIMALS[type].h - 0.01));
          break;
        }
      }
    }
    for (const a of game.animals) {
      a.t += dt; a.ready = Math.max(0, a.ready - dt); a.heart = Math.max(0, a.heart - dt);
      a.wander -= dt;
      if (a.wander <= 0) { a.wander = 2 + Math.random() * 3; a.dir = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1); }
      // 傘の外へは出ない
      if (a.cx() < w.umb.x - w.umb.R + 3) a.dir = 1;
      if (a.cx() > w.umb.x + w.umb.R - 3) a.dir = -1;
      const ahead = a.dir > 0 ? Math.floor(a.x + a.w + 0.1) : Math.floor(a.x - 0.1);
      const jump = a.dir !== 0 && a.onGround && w.isSolid(ahead, Math.floor(a.y + a.h - 0.1));
      let rem = dt;
      while (rem > 0) { const h = Math.min(rem, 1 / 60); a.physics(h, w, a.dir, jump); rem -= h; }
      if (a.dir) a.face = a.dir;
    }
    game.animals = game.animals.filter((a) => Math.hypot(a.cx() - p.cx(), a.cy() - p.cy()) < 90);
  }

  // ねらえる動物（オート：前の近く／マウス：カーソルの所）
  FM.target = function (game, aim) {
    const p = game.player;
    let best = null, bd = Infinity;
    for (const a of game.animals) {
      let ok;
      if (aim) ok = aim.x >= a.x && aim.x <= a.x + a.w && aim.y >= a.y && aim.y <= a.y + a.h && Math.hypot(a.cx() - p.cx(), a.cy() - p.cy()) <= C.MOUSE_REACH + 0.5;
      else { const dx = (a.cx() - p.cx()) * p.face; ok = dx > -0.3 - a.w / 2 && dx < C.ATTACK_REACH + a.w / 2 && Math.abs(a.cy() - p.cy()) < 1.4; }
      const d = Math.hypot(a.cx() - p.cx(), a.cy() - p.cy());
      if (ok && d < bd) { bd = d; best = a; }
    }
    return best;
  };
  // 動物に Z：にわとり → 卵、うし（からのコップを持って）→ ミルク、それ以外はなでる
  FM.interact = function (game, a, def) {
    if (a.type === 'chicken' && a.ready <= 0) {
      game.inv.add('egg', 1); a.ready = C.EGG_SEC;
      game.floater(a.cx(), a.y - 0.3, '+1 たまご');
    } else if (a.type === 'cow' && def && def.fillWater && a.ready <= 0) {
      game.inv.consumeHeld(1); game.inv.add('milk', 1); a.ready = C.MILK_SEC;
      game.floater(a.cx(), a.y - 0.3, '+1 ミルク');
    } else {
      a.heart = 1.2;
      if (a.type === 'cow' && a.ready <= 0) game.toast('からのコップを持って しらべると ミルクがとれます');
    }
  };

  FM.drawAnimals = function (g, game) {
    const Tp = game.T, ox = game.ox(), oy = game.oy();
    for (const a of game.animals) {
      const x = ox + a.cx() * Tp, y = oy + (a.y + a.h) * Tp, w = a.w * Tp, h = a.h * Tp;
      const o = (seed, fill) => ({ fill, stroke: COL.line, lw: Math.max(1.5, Tp * 0.055), seed, amp: Tp * 0.015, step: Tp * 0.2 });
      g.save(); g.translate(x, y); g.scale(a.face || 1, 1);
      const bob = Math.abs(Math.sin(a.t * 6)) * (a.dir ? 0.04 : 0) * Tp;
      if (a.type === 'chicken') {
        S.ellipse(g, -w * 0.05, -h * 0.45 - bob, w * 0.45, h * 0.38, o(1701, '#ffffff'));
        S.ellipse(g, w * 0.32, -h * 0.85 - bob, w * 0.22, h * 0.2, o(1702, '#ffffff'));
        S.shape(g, [[w * 0.28, -h * 1.03 - bob], [w * 0.34, -h * 1.15 - bob], [w * 0.4, -h * 1.03 - bob]], o(1703, '#e58c6c'));
        S.shape(g, [[w * 0.52, -h * 0.88 - bob], [w * 0.66, -h * 0.84 - bob], [w * 0.52, -h * 0.8 - bob]], o(1704, '#f3b65b'));
        g.fillStyle = '#3a2a22'; g.beginPath(); g.arc(w * 0.38, -h * 0.88 - bob, Tp * 0.03, 0, Math.PI * 2); g.fill();
        for (const lx of [-0.1, 0.1]) S.line(g, [[w * lx, -h * 0.1], [w * lx, 0]], { stroke: '#f3b65b', lw: Tp * 0.04, amp: 0 });
      } else {
        for (const lx of [-0.35, -0.15, 0.15, 0.35]) S.rect(g, w * lx - Tp * 0.06, -h * 0.35, Tp * 0.12, h * 0.35, o(1710, '#ffffff'));
        S.rect(g, -w * 0.48, -h * 0.85 - bob, w * 0.85, h * 0.55, o(1711, '#ffffff'));
        S.ellipse(g, -w * 0.15, -h * 0.65 - bob, w * 0.12, h * 0.1, o(1712, '#3a2a22'));
        S.rect(g, w * 0.3, -h * 1.0 - bob, w * 0.26, h * 0.4, o(1713, '#ffffff'));
        S.ellipse(g, w * 0.46, -h * 0.66 - bob, w * 0.1, h * 0.08, o(1714, '#f4b6d2'));
        g.fillStyle = '#3a2a22'; g.beginPath(); g.arc(w * 0.44, -h * 0.85 - bob, Tp * 0.03, 0, Math.PI * 2); g.fill();
      }
      g.restore();
      if (a.heart > 0) RS.ui.text(g, '♡', x, y - h - Tp * 0.4 - (1.2 - a.heart) * Tp * 0.5, Tp * 0.5, { align: 'center', color: '#e58c6c', outline: COL.cream });
      else if (a.ready <= 0 && Math.hypot(a.cx() - game.player.cx(), a.cy() - game.player.cy()) < 3)
        RS.ui.text(g, a.type === 'chicken' ? 'Z：たまご' : 'Z：ミルク（からのコップ）', x, y - h - Tp * 0.3, Tp * 0.32, { align: 'center', outline: COL.cream });
    }
  };

  // ---- 掲示板：写真をはる ----
  const imgCache = new Map();
  function photoImg(id) {
    if (imgCache.has(id)) return imgCache.get(id);
    const e = { img: null };
    imgCache.set(id, e);
    RS.dbTx('readonly', (s) => s.get(id)).then((r) => {
      if (!r) return;
      const img = new Image(); img.src = URL.createObjectURL(r.blob); e.img = img;
    }).catch(() => {});
    return e;
  }
  FM.boardInteract = function (game, x, y) {
    RS.openAlbum(game, (rec) => {
      game.world.boards[x + ',' + y] = rec.id;
      game.toast('掲示板に写真をはりました');
    });
  };
  FM.drawBoards = function (g, game) {
    const w = game.world, Tp = game.T, ox = game.ox(), oy = game.oy();
    for (const k in w.boards) {
      const [x, y] = k.split(',').map(Number);
      if (w.get(x, y) !== T.PHOTOBOARD) { delete w.boards[k]; continue; }
      const e = photoImg(w.boards[k]);
      if (!e.img || !e.img.complete || !e.img.naturalWidth) continue;
      const bw = Tp * 1.5, bh = bw * e.img.naturalHeight / e.img.naturalWidth;
      const bx = ox + (x + 0.5) * Tp - bw / 2, by = oy + y * Tp + Tp * 0.12;
      g.drawImage(e.img, bx, by, bw, Math.min(bh, Tp * 0.8));
      S.rect(g, bx, by, bw, Math.min(bh, Tp * 0.8), { stroke: COL.line, lw: 1.5, r: 2, seed: 1801, amp: 0.5, step: 20 });
    }
  };
})();
