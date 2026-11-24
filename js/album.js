// =============================================================
// アルバム画面（写真の一覧・お気に入り・削除・ダウンロード）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, S = RS.sketch, COL = RS.COL, PH = RS.photo;
  const ui = RS.ui;

  // 矢印キーで、ならんだボタンの中を動く
  function nav(els, cur, dir) {
    const a = els[cur];
    if (!a) return 0;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    let best = cur, bs = Infinity;
    els.forEach((b, i) => {
      if (i === cur) return;
      const dx = b.x + b.w / 2 - ax, dy = b.y + b.h / 2 - ay;
      const along = dx * dir[0] + dy * dir[1];
      if (along < 4) return;
      const sc = along + Math.abs(dx * dir[1] - dy * dir[0]) * 2;
      if (sc < bs) { bs = sc; best = i; }
    });
    return best;
  }

  function state(game) {
    if (!game.album) game.album = { list: null, imgs: new Map(), filter: 'all', page: 0, cursor: 0, view: -1, confirm: 0 };
    return game.album;
  }

  RS.openAlbum = function (game) {
    const A = state(game);
    A.list = null; A.view = -1; A.cursor = 0; A.page = 0; A.confirm = 0;
    PH.list().then((l) => {
      A.list = l;
      for (const r of l) {
        if (A.imgs.has(r.id)) continue;
        const url = URL.createObjectURL(r.blob);
        const img = new Image();
        img.src = url;
        A.imgs.set(r.id, { img, url });
      }
    }).catch((e) => { console.error(e); A.list = []; A.error = true; });
    game.openScreen('album');
  };

  function shown(A) {
    if (!A.list) return [];
    return A.filter === 'fav' ? A.list.filter((r) => r.fav) : A.list;
  }

  function layout(game) {
    const A = state(game), W = game.W, H = game.H, m = 10;
    const s = Math.round(RS.clamp(Math.min(W, H) / 10, 30, 52));
    const L = { s, els: [], m };
    const top = m + s * 0.3;
    if (A.view < 0) {
      L.titleY = top + s * 0.5;
      L.els.push({ kind: 'tab', v: 'all', label: 'すべて', x: m + s * 0.4, y: top + s * 1.1, w: s * 2.6, h: s * 0.85 });
      L.els.push({ kind: 'tab', v: 'fav', label: '★ お気に入り', x: m + s * 3.2, y: top + s * 1.1, w: s * 3.6, h: s * 0.85 });
      L.els.push({ kind: 'back', label: 'もどる', x: W - m - s * 3, y: top, w: s * 2.6, h: s * 0.85 });
      const gy = top + s * 2.2, gh = H - gy - s * 1.6, gw = W - m * 2 - s * 0.8;
      const cols = W >= H ? 4 : 2;
      const cw = gw / cols, th = Math.min(cw * 0.95 * H / W, gh);
      const rows = Math.max(1, Math.floor(gh / (th + s * 0.3)));
      L.per = cols * rows;
      const list = shown(A);
      L.pages = Math.max(1, Math.ceil(list.length / L.per));
      A.page = Math.min(A.page, L.pages - 1);
      for (let k = 0; k < L.per; k++) {
        const i = A.page * L.per + k;
        if (i >= list.length) break;
        L.els.push({ kind: 'thumb', i, x: m + s * 0.4 + (k % cols) * cw + cw * 0.025, y: gy + Math.floor(k / cols) * (th + s * 0.3), w: cw * 0.95, h: th });
      }
      const by = H - m - s * 1.2;
      L.pageY = by + s * 0.45;
      if (L.pages > 1) {
        L.els.push({ kind: 'prev', label: '◀', x: W / 2 - s * 3, y: by, w: s, h: s * 0.9 });
        L.els.push({ kind: 'next', label: '▶', x: W / 2 + s * 2, y: by, w: s, h: s * 0.9 });
      }
    } else {
      const bh = s * 0.9, by = H - m - bh - s * 0.3;
      L.img = { x: m + s * 0.4, y: top + s * 0.9, w: W - m * 2 - s * 0.8, h: by - top - s * 1.3 };
      const rec = shown(A)[A.view];
      const items = [
        { kind: 'vprev', label: '◀' },
        { kind: 'dl', label: game.touch ? '保存' : 'ダウンロード' },
        { kind: 'fav', label: rec && rec.fav ? '★ お気に入り' : '☆ お気に入り' },
        { kind: 'del', label: A.confirm > 0 ? 'ほんとうに消す？' : '削除' },
        { kind: 'vback', label: 'もどる' },
        { kind: 'vnext', label: '▶' },
      ];
      const ws = items.map((it) => (it.label.length <= 1 ? 1 : Math.max(2.4, it.label.length * 0.62 + 0.8)));
      const total = ws.reduce((a, b) => a + b, 0);
      const unit = Math.min(s, (W - m * 2 - s * 0.4 - items.length * 6) / total);
      let x = (W - (total * unit + (items.length - 1) * 6)) / 2;
      items.forEach((it, i) => { L.els.push(Object.assign(it, { x, y: by, w: ws[i] * unit, h: bh, fs: Math.min(s * 0.36, unit * 0.42) })); x += ws[i] * unit + 6; });
      L.dateY = top + s * 0.45;
    }
    return L;
  }

  function act(game, el) {
    const A = state(game);
    const list = shown(A);
    switch (el.kind) {
      case 'tab': A.filter = el.v; A.page = 0; break;
      case 'back': game.backScreen(); break;
      case 'prev': A.page = Math.max(0, A.page - 1); break;
      case 'next': A.page = A.page + 1; break;
      case 'thumb': A.view = el.i; A.confirm = 0; A.cursor = 1; break;
      case 'vprev': if (list.length) A.view = (A.view - 1 + list.length) % list.length; A.confirm = 0; break;
      case 'vnext': if (list.length) A.view = (A.view + 1) % list.length; A.confirm = 0; break;
      case 'vback': A.view = -1; A.cursor = 0; break;
      case 'dl': { const r = list[A.view]; if (r) PH.download(r.blob, PH.fileName(r.time, 'png')); break; }
      case 'fav': {
        const r = list[A.view];
        if (r) {
          r.fav = !r.fav;
          PH.put(r).catch((e) => console.error(e));
          if (A.filter === 'fav' && !r.fav) { // お気に入り一覧から外れた
            const n = shown(A).length;
            if (!n) { A.view = -1; A.cursor = 0; } else A.view = Math.min(A.view, n - 1);
          }
        }
        break;
      }
      case 'del': {
        if (A.confirm <= 0) { A.confirm = 3; break; } // もう一度おすと消える
        const r = list[A.view];
        if (r) {
          PH.remove(r.id).catch((e) => console.error(e));
          A.list = A.list.filter((x) => x.id !== r.id);
          const im = A.imgs.get(r.id);
          if (im) { URL.revokeObjectURL(im.url); A.imgs.delete(r.id); }
          const n = shown(A).length;
          if (!n) { A.view = -1; A.cursor = 0; } else A.view = Math.min(A.view, n - 1);
        }
        A.confirm = 0;
        break;
      }
    }
  }

  function back(game) {
    const A = state(game);
    if (A.view >= 0) { A.view = -1; A.cursor = 0; } else game.backScreen();
  }

  RS.SCREENS.album = {
    custom: true,
    update(game, dt) {
      const A = state(game), inp = game.input;
      if (A.confirm > 0) A.confirm -= 1 / 60;
      for (const e of inp.events) {
        const mouse = e.ptype === 'mouse';
        const hit = (mouse && e.type === 'down' && game.mode === 'mouse' && e.button === 0) || (!mouse && e.type === 'up' && !e.long);
        if (!hit) continue;
        const L = layout(game);
        const i = L.els.findIndex((el) => ui.inRect(el, e.x, e.y));
        if (i >= 0) { A.cursor = i; act(game, L.els[i]); }
        if (game.screens[game.screens.length - 1] !== 'album') return;
      }
      if (inp.pressed('esc') || inp.pressed('menu')) { back(game); return; }
      if (game.mode !== 'auto') return;
      const L = layout(game);
      A.cursor = Math.min(A.cursor, L.els.length - 1);
      const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
      for (const k in dirs) if (inp.pressed(k)) A.cursor = nav(L.els, A.cursor, dirs[k]);
      if (inp.pressed('use') && L.els[A.cursor]) act(game, L.els[A.cursor]);
    },

    draw(g, game) {
      const A = state(game), L = layout(game), s = L.s, kbd = game.mode === 'auto';
      g.fillStyle = 'rgba(80,58,38,0.35)';
      g.fillRect(0, 0, game.W, game.H);
      S.rect(g, 6, 6, game.W - 12, game.H - 12, { fill: COL.cream, stroke: COL.line, lw: 3, r: s * 0.4, seed: 701, amp: 2, step: 30 });
      const list = shown(A);

      if (A.view < 0) {
        ui.text(g, 'アルバム', L.m + s * 0.5, L.titleY, s * 0.55);
        if (!A.list) ui.text(g, 'よみこみ中…', game.W / 2, game.H / 2, s * 0.45, { align: 'center' });
        else if (!list.length) {
          const msg = A.error ? '写真を読みこめませんでした'
            : A.filter === 'fav' ? 'お気に入りの写真は まだありません'
              : 'まだ写真がありません（' + (game.touch ? '「しゃしん」ボタン' : 'Q キー') + 'で とれます）';
          ui.text(g, msg, game.W / 2, game.H / 2, s * 0.4, { align: 'center', maxW: game.W - 40 });
        }
        if (L.pages > 1) ui.text(g, (A.page + 1) + ' / ' + L.pages, game.W / 2, L.pageY, s * 0.4, { align: 'center' });
      } else {
        const r = list[A.view];
        if (r) {
          const im = A.imgs.get(r.id);
          const B = L.img;
          if (im && im.img.complete && im.img.naturalWidth) {
            const k = Math.min(B.w / im.img.naturalWidth, B.h / im.img.naturalHeight);
            const w = im.img.naturalWidth * k, h = im.img.naturalHeight * k;
            const x = B.x + (B.w - w) / 2, y = B.y + (B.h - h) / 2;
            g.drawImage(im.img, x, y, w, h);
            S.rect(g, x, y, w, h, { stroke: COL.line, lw: 3, r: 4, seed: 705, amp: 1.5, step: 30 });
          }
          const d = new Date(r.time);
          ui.text(g, `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}　(${A.view + 1} / ${list.length})`,
            game.W / 2, L.dateY, s * 0.38, { align: 'center', maxW: game.W - 40 });
        }
      }

      L.els.forEach((el, i) => {
        const hl = kbd && i === A.cursor;
        if (el.kind === 'thumb') {
          const r = list[el.i], im = r && A.imgs.get(r.id);
          g.fillStyle = '#e8dcc6'; g.fillRect(el.x, el.y, el.w, el.h);
          if (im && im.img.complete && im.img.naturalWidth) g.drawImage(im.img, el.x, el.y, el.w, el.h);
          S.rect(g, el.x, el.y, el.w, el.h, { stroke: hl ? COL.accent : COL.line, lw: hl ? 4 : 2, r: 4, seed: 710 + i, amp: 1, step: 24 });
          if (r && r.fav) ui.text(g, '★', el.x + el.w - s * 0.35, el.y + s * 0.35, s * 0.5, { align: 'center', color: '#f3b65b', outline: COL.cream });
          return;
        }
        const on = el.kind === 'tab' && el.v === A.filter;
        S.rect(g, el.x, el.y, el.w, el.h, {
          fill: on || hl ? '#ffe9b8' : COL.slot, stroke: hl ? COL.accent : COL.line, lw: hl || on ? 3 : 2,
          r: s * 0.25, seed: 730 + i, amp: 1, step: 16,
        });
        ui.text(g, el.label, el.x + el.w / 2, el.y + el.h / 2, el.fs || s * 0.36, { align: 'center', maxW: el.w - 8 });
      });
    },
  };
})();
