// =============================================================
// ワールドの保存（ブラウザ内 IndexedDB）と、ワールドをえらぶ画面
// ブラウザのデータを消すと、保存したワールドも消える
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, S = RS.sketch, COL = RS.COL, C = RS.CONFIG;
  const ui = RS.ui;
  const SV = RS.save = {};
  const tx = (mode, fn) => RS.dbTx(mode, fn, 'worlds');

  SV.list = () => tx('readonly', (s) => s.getAll())
    .then((a) => (a || []).map((r) => ({ id: r.id, name: r.name, updated: r.updated, created: r.created })).sort((x, y) => y.updated - x.updated));
  SV.get = (id) => tx('readonly', (s) => s.get(id));
  SV.remove = (id) => tx('readwrite', (s) => s.delete(id));

  // ---- いまのワールドを、保存できる形にする ----
  SV.serialize = function (game) {
    const w = game.world, p = game.player, inv = game.inv;
    const chunks = {};
    for (const k of w.modified) { const c = w.chunks.get(k); if (c) chunks[k] = c; }
    return {
      v: 1,
      chunks,
      saplings: w.saplings.map((s) => ({ x: s.x, y: s.y, t: s.t })),
      player: { x: p.x, y: p.y, hp: Math.max(1, p.hp), food: p.food, face: p.face },
      inv: { slots: inv.slots, craft: inv.craft, cursor: inv.cursor, sel: inv.sel },
      time: game.time,
      effects: game.effects.map((e) => ({ id: e.id, t: e.t })),
    };
  };

  SV.saveCurrent = function (game, quiet) {
    if (!game.worldId || SV.busy) return Promise.resolve();
    SV.busy = true;
    const rec = { id: game.worldId, name: game.worldName, seed: game.world.seed, created: game.worldCreated, updated: Date.now(), data: SV.serialize(game) };
    return tx('readwrite', (s) => s.put(rec))
      .then(() => { if (!quiet) game.savedT = 1.5; })
      .catch((e) => { console.error(e); game.toast('保存できませんでした'); })
      .finally(() => { SV.busy = false; game.saveT = 0; });
  };

  // ---- 保存したワールドを読みこんで、ゲームに入れる ----
  SV.apply = function (game, rec) {
    game.resetWorld(rec.seed);
    game.worldId = rec.id; game.worldName = rec.name; game.worldCreated = rec.created;
    const d = rec.data;
    if (!d) return;
    const w = game.world;
    for (const k in d.chunks) { w.chunks.set(Number(k), d.chunks[k]); w.modified.add(Number(k)); }
    w.lk = null; w.lc = null;
    w.saplings = (d.saplings || []).map((s) => ({ x: s.x, y: s.y, t: s.t }));
    const p = game.player;
    Object.assign(p, d.player || {});
    if (!(p.hp > 0)) p.hp = C.HP_MAX;
    const inv = game.inv;
    if (d.inv) { inv.slots = d.inv.slots; inv.craft = d.inv.craft || new Array(9).fill(null); inv.cursor = d.inv.cursor || null; inv.sel = d.inv.sel || 0; }
    game.time = d.time || 0;
    game.effects = (d.effects || []).filter((e) => RS.EFFECTS[e.id]);
    if (p.collides(w, p.x, p.y)) game.spawn();
    game.cam.x = p.cx(); game.cam.y = p.cy() - 2;
  };

  SV.create = function (game, name) {
    const seed = (Math.random() * 1e9) | 0;
    const now = Date.now();
    const rec = { name, seed, created: now, updated: now, data: null };
    return tx('readwrite', (s) => s.add(rec)).then((id) => { rec.id = id; SV.apply(game, rec); return SV.saveCurrent(game, true); });
  };

  SV.load = (game, id) => SV.get(id).then((rec) => { if (!rec) throw new Error('not found'); SV.apply(game, rec); });

  // ---- ワールドをえらぶ画面 ----
  function st(game) {
    if (!game.ws) game.ws = { list: null, cursor: 0, page: 0, confirm: null, busy: false };
    return game.ws;
  }
  RS.openWorlds = function (game) {
    const W = st(game);
    W.list = null; W.cursor = 0; W.page = 0; W.confirm = null;
    SV.list().then((l) => { W.list = l; }).catch((e) => { console.error(e); W.list = []; W.error = true; });
    game.openScreen('worlds');
  };

  const fmt = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

  function layout(game) {
    const W = st(game), m = 10, w = game.W, h = game.H;
    const s = Math.round(RS.clamp(Math.min(w, h) / 10, 30, 52));
    const pw = Math.min(w - m * 2, s * 13), px = (w - pw) / 2;
    const L = { s, els: [], px, pw };
    L.titleY = m + s * 0.8;
    L.els.push({ kind: 'new', label: '＋ あたらしいワールド', x: px + s * 0.4, y: m + s * 1.5, w: Math.min(pw - s * 4.2, s * 6.5), h: s * 0.9 });
    L.els.push({ kind: 'back', label: 'もどる', x: px + pw - s * 3.2, y: m + s * 1.5, w: s * 2.8, h: s * 0.9 });
    const top = m + s * 2.8, rowH = s * 1.15;
    const per = Math.max(1, Math.floor((h - top - s * 1.6) / rowH));
    const list = W.list || [];
    L.pages = Math.max(1, Math.ceil(list.length / per));
    W.page = Math.min(W.page, L.pages - 1);
    for (let k = 0; k < per; k++) {
      const i = W.page * per + k;
      if (i >= list.length) break;
      const y = top + k * rowH;
      const bw = s * 2.3;
      L.els.push({ kind: 'play', i, x: px + s * 0.4, y, w: pw - s * 0.8 - bw * 2 - 12, h: s });
      L.els.push({ kind: 'rename', i, label: '名前', x: px + pw - s * 0.4 - bw * 2 - 6, y, w: bw, h: s });
      L.els.push({ kind: 'del', i, label: W.confirm === list[i].id ? '消す？' : 'けす', x: px + pw - s * 0.4 - bw, y, w: bw, h: s });
    }
    if (L.pages > 1) {
      const by = h - m - s * 1.2;
      L.els.push({ kind: 'prev', label: '◀', x: w / 2 - s * 3, y: by, w: s, h: s * 0.9 });
      L.els.push({ kind: 'next', label: '▶', x: w / 2 + s * 2, y: by, w: s, h: s * 0.9 });
      L.pageY = by + s * 0.45;
    }
    return L;
  }

  function act(game, el) {
    const W = st(game);
    if (W.busy) return;
    const list = W.list || [];
    const switchTo = (p) => { W.busy = true; SV.saveCurrent(game, true).then(p).then(() => game.startGame()).catch((e) => { console.error(e); game.toast('ワールドを読みこめませんでした'); }).finally(() => { W.busy = false; }); };
    switch (el.kind) {
      case 'back': game.backScreen(); break;
      case 'prev': W.page = Math.max(0, W.page - 1); break;
      case 'next': W.page += 1; break;
      case 'new': {
        const name = window.prompt('ワールドの名前', 'ワールド' + (list.length + 1));
        if (name == null) return;
        switchTo(() => SV.create(game, name.trim() || ('ワールド' + (list.length + 1))));
        break;
      }
      case 'play': switchTo(() => SV.load(game, list[el.i].id)); break;
      case 'rename': {
        const r = list[el.i];
        const name = window.prompt('あたらしい名前', r.name);
        if (name == null || !name.trim()) return;
        SV.get(r.id).then((rec) => { rec.name = name.trim(); return tx('readwrite', (s) => s.put(rec)); })
          .then(() => { r.name = name.trim(); if (game.worldId === r.id) game.worldName = r.name; })
          .catch((e) => console.error(e));
        break;
      }
      case 'del': {
        const r = list[el.i];
        if (W.confirm !== r.id) { W.confirm = r.id; return; } // もう一度おすと消える
        W.confirm = null;
        SV.remove(r.id).then(() => {
          W.list = list.filter((x) => x.id !== r.id);
          if (game.worldId === r.id) { game.worldId = null; game.started = false; }
        }).catch((e) => console.error(e));
        break;
      }
    }
  }

  RS.SCREENS.worlds = {
    custom: true,
    update(game) {
      const W = st(game), inp = game.input;
      for (const e of inp.events) {
        const mouse = e.ptype === 'mouse';
        const hit = (mouse && e.type === 'down' && game.mode === 'mouse' && e.button === 0) || (!mouse && e.type === 'up' && !e.long);
        if (!hit) continue;
        const L = layout(game);
        const i = L.els.findIndex((el) => ui.inRect(el, e.x, e.y));
        if (i >= 0) { W.cursor = i; act(game, L.els[i]); }
        if (game.screens[game.screens.length - 1] !== 'worlds') return;
      }
      if (inp.pressed('esc') || inp.pressed('menu')) { game.backScreen(); return; }
      if (game.mode !== 'auto') return;
      const L = layout(game);
      W.cursor = Math.min(W.cursor, L.els.length - 1);
      const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
      for (const k in dirs) if (inp.pressed(k)) W.cursor = ui.navRects(L.els, W.cursor, dirs[k]);
      if (inp.pressed('use') && L.els[W.cursor]) act(game, L.els[W.cursor]);
    },
    draw(g, game) {
      const W = st(game), L = layout(game), s = L.s, kbd = game.mode === 'auto';
      g.fillStyle = 'rgba(80,58,38,0.35)'; g.fillRect(0, 0, game.W, game.H);
      S.rect(g, L.px, 6, L.pw, game.H - 12, { fill: COL.cream, stroke: COL.line, lw: 3, r: s * 0.4, seed: 901, amp: 2, step: 30 });
      ui.text(g, 'ワールドをえらぶ', L.px + s * 0.5, L.titleY, s * 0.55);
      const list = W.list || [];
      if (!W.list) ui.text(g, 'よみこみ中…', game.W / 2, game.H / 2, s * 0.45, { align: 'center' });
      else if (!list.length) ui.text(g, 'まだワールドがありません。「あたらしいワールド」から作れます', game.W / 2, game.H / 2, s * 0.38, { align: 'center', maxW: L.pw - s });
      L.els.forEach((el, i) => {
        const hl = kbd && i === W.cursor;
        const cur = el.kind === 'play' && list[el.i].id === game.worldId;
        S.rect(g, el.x, el.y, el.w, el.h, {
          fill: hl || cur ? '#ffe9b8' : COL.slot, stroke: hl ? COL.accent : COL.line, lw: hl ? 3 : 2,
          r: s * 0.25, seed: 910 + i, amp: 1, step: 16,
        });
        if (el.kind === 'play') {
          const r = list[el.i];
          ui.text(g, r.name, el.x + s * 0.3, el.y + el.h / 2, s * 0.4, { maxW: el.w - s * 3.3 });
          ui.text(g, fmt(r.updated), el.x + el.w - s * 0.3, el.y + el.h / 2, s * 0.3, { align: 'right', color: 'rgba(107,74,47,0.7)' });
        } else ui.text(g, el.label, el.x + el.w / 2, el.y + el.h / 2, s * 0.36, { align: 'center', maxW: el.w - 8 });
      });
      if (L.pages > 1) ui.text(g, (W.page + 1) + ' / ' + L.pages, game.W / 2, L.pageY, s * 0.4, { align: 'center' });
    },
  };
})();
