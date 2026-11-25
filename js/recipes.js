// =============================================================
// クラフト画面のレシピ一覧
// 出すもの：材料のどれか1つを持ったことがあるアイテムで作れるもの／
//           それで作れるもの（つながり）／次の目標（傘の納品）で必要なもの
// 選ぶと：作れる → 材料を自動でセット、作れない → プレビュー（たりない物）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS;
  const RC = RS.recipes = {};

  // 持っている数（持ち物・クラフト枠・つかんでいる物）
  function counts(inv) {
    const c = {};
    const add = (s) => { if (s && !s.data) c[s.id] = (c[s.id] || 0) + s.n; };
    inv.slots.forEach(add); inv.craft.forEach(add); add(inv.cursor);
    return c;
  }
  const need = (ids) => ids.reduce((m, id) => { m[id] = (m[id] || 0) + 1; return m; }, {});
  // 料理の枠ごとに、合う食材を持ち物からえらぶ
  function pickIngs(slots, c) {
    const left = Object.assign({}, c), out = [];
    for (const cats of slots) {
      const id = Object.keys(left).find((k) => left[k] > 0 && RS.INGS[k] && RS.INGS[k].cats.some((x) => cats.includes(x)));
      if (!id) return null;
      left[id]--; out.push(id);
    }
    return out;
  }

  // 一覧を作る（size：2 = 手もと、3 = クラフトテーブル、'u:番号' = 調理器具）
  RC.list = function (game) {
    const size = game.menu.size, inv = game.inv, c = counts(inv);
    if (typeof size === 'string') {
      const t = Number(size.slice(2)), ut = RS.UTENSILS[t];
      if (ut.smelt) {
        return [['copper_ore', 'copper_ingot'], ['iron_ore', 'iron_ingot']].map(([ore, out]) => ({
          kind: 'craft', r: { out, n: 1, in: [ore, 'log'] }, stack: { id: out, n: 1 }, ok: (c[ore] || 0) >= 1 && (c.log || 0) >= 1, name: RS.ITEMS[out].name,
        }));
      }
      return RS.DISHES.filter((d) => d.tool === ut.id).map((d) => {
        const ids = pickIngs(d.slots, c);
        const sample = { vessel: d.vessel, food: { look: { main: '#f3b65b', top: '#a5d47f' } } };
        return { kind: 'dish', d, ok: !!ids, ids, stack: { id: 'dish', n: 1, data: sample }, name: d.hint };
      });
    }
    // 見えるレシピ（持ったことがある材料 → そこから作れる物 → …）
    const seen = new Set(Object.keys(game.prog.seen));
    for (const s of inv.slots) if (s) seen.add(s.id);
    const goal = new Set();
    const st = RS.prog.STEPS[game.world.umb.level - 1];
    if (st) for (const r of st.items) if (r.id) goal.add(r.id);
    // 棒のようにどのレシピにも使う材料は、それだけでは一覧に出す理由にしない
    const COMMON = new Set(['stick']);
    const key = (r, have) => r.in.some((id) => have.has(id) && !COMMON.has(id)) || r.in.every((id) => COMMON.has(id) && have.has(id));
    const vis = new Set();
    for (const r of RS.RECIPES) if (key(r, seen) || goal.has(r.out)) vis.add(r);
    // 1 だんだけつなげる：一覧に出た物で作れる物
    const outs = new Set([...vis].map((r) => r.out));
    for (const r of RS.RECIPES) if (!vis.has(r) && key(r, outs)) vis.add(r);
    const list = RS.RECIPES.filter((r) => vis.has(r)).map((r) => {
      const n = need(r.in);
      const has = Object.keys(n).every((id) => (c[id] || 0) >= n[id]);
      const table = !!r.table && size !== 3;
      return { kind: 'craft', r, stack: { id: r.out, n: r.n }, ok: has && !table, has, table, goal: goal.has(r.out), name: RS.ITEMS[r.out].name + (r.n > 1 ? ' ×' + r.n : '') };
    });
    // 作れる → 目標 → その他
    return list.sort((a, b) => (b.ok - a.ok) || (b.goal - a.goal));
  };

  // 持ち物から id を n こ取り出す
  function take(inv, id, n) {
    for (let i = 0; i < 36 && n > 0; i++) {
      const s = inv.slots[i];
      if (!s || s.id !== id || s.data) continue;
      const k = Math.min(n, s.n);
      s.n -= k; n -= k;
      if (s.n <= 0) inv.slots[i] = null;
    }
  }

  // えらんだとき
  RC.select = function (game, e) {
    const inv = game.inv, size = game.menu.size;
    game.menu.preview = null;
    if (!e.ok) {
      // プレビュー：材料の見本と、たりない物
      const ids = e.kind === 'dish' ? e.d.slots.map((cats) => cats.map((x) => RS.CATS[x]).join('/')) : e.r.in;
      const missing = [];
      if (e.kind === 'craft') {
        const c = counts(inv), n = need(e.r.in);
        for (const id in n) if ((c[id] || 0) < n[id]) missing.push(RS.ITEMS[id].name + '×' + (n[id] - (c[id] || 0)));
        if (e.table) missing.push('クラフトテーブルが必要');
      } else missing.push('食材：' + ids.join(' ＋ '));
      game.menu.preview = { ids: e.kind === 'craft' ? e.r.in : [], missing };
      return;
    }
    inv.returnAll();
    if (inv.cursor) { game.toast('持ち物がいっぱいです'); return; }
    const grid = RS.Inventory.gridOf(size);
    const ids = e.kind === 'dish' ? pickIngs(e.d.slots, counts(inv)) : e.r.in;
    if (!ids) return;
    // 何回分作れるか（同じ材料をまとめて入れる）
    const c = counts(inv), n = need(ids);
    let m = Infinity;
    for (const id in n) m = Math.min(m, Math.floor((c[id] || 0) / n[id]));
    if (e.kind === 'dish') m = Math.min(m, 1);
    m = Math.max(1, Math.min(m, 64));
    ids.forEach((id, k) => { take(inv, id, m); inv.craft[grid[k]] = { id, n: m }; });
  };
})();
