// =============================================================
// 料理（自由な組み合わせ）
// 料理は「〇系」の食材の組み合わせで決まる。系統に合っていればどの食材でもよく、
// 使った食材で 名前・見た目・特殊効果 が変わる。
// 手の込んだ調理器具（tier 2 以上）だと特殊効果が付き、回復量も少し増える。
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, T = RS.T;
  const CK = RS.cook = {};

  // 食材の系統
  RS.CATS = { fruit: '果物', veg: '野菜', herb: 'ハーブ', mushroom: 'きのこ', water: '水', sweet: '甘味', egg: '卵', grain: '米・穀物', meat: '肉' };

  // 食材（cats = 系統、color = 料理の見た目の色、eff = 手の込んだ料理にしたときの効果、val = 回復の元の値）
  RS.INGS = {
    apple:    { cats: ['fruit'], color: '#ee8577', eff: 'regen', val: 20 },
    berry:    { cats: ['fruit'], color: '#d9435a', eff: 'speed', val: 12 },
    herb:     { cats: ['veg', 'herb'], color: '#7cbf5a', eff: 'full', val: 10 },
    mushroom: { cats: ['mushroom'], color: '#c8a27a', eff: 'mine', val: 15 },
    water:    { cats: ['water'], color: '#bfe3f7', eff: 'jump', val: 6 },
    jelly:    { cats: ['sweet'], color: '#8fc4ea', eff: 'guard', val: 14 },
    skyfruit: { cats: ['fruit'], color: '#c9b8f0', eff: 'jump', val: 14 },
    rice:     { cats: ['grain'], color: '#fff8ea', eff: 'full', val: 16 },
    carrot:   { cats: ['veg'], color: '#f3a35b', eff: 'regen', val: 12 },
    egg:      { cats: ['egg'], color: '#f7d978', eff: 'guard', val: 14 },
    milk:     { cats: ['water'], color: '#fffaf0', eff: 'regen', val: 10 },
  };

  // 調理器具（tier：1 = かんたん、2 = 手の込んだ）
  RS.UTENSILS = {};
  RS.UTENSILS[T.CAMPFIRE] = { id: 'campfire', name: 'たき火', tier: 1 };
  RS.UTENSILS[T.BOARD] = { id: 'board', name: 'まな板', tier: 1 };
  RS.UTENSILS[T.POT] = { id: 'pot', name: 'なべ', tier: 2 };
  RS.UTENSILS[T.PAN] = { id: 'pan', name: 'フライパン', tier: 2 };
  RS.UTENSILS[T.FURNACE] = { id: 'furnace', name: 'かまど', tier: 0, smelt: true };
  // かまど：鉱石＋木 → インゴット
  const SMELT = { copper_ore: 'copper_ingot', iron_ore: 'iron_ingot' };

  // 料理の型。slots = それぞれの枠に入れてよい系統
  const ANY_COOK = ['fruit', 'veg', 'mushroom', 'meat', 'egg'];
  RS.DISHES = [
    { tool: 'campfire', slots: [ANY_COOK], name: (a) => '焼き' + a[0], vessel: 'plate', motion: 'steak', hint: '何か1つ → 焼き〇〇' },
    { tool: 'board', slots: [['fruit'], ['water']], name: (a) => a[0] + 'ジュース', vessel: 'straw', motion: 'straw', kind: 'drink', hint: '果物＋水 → ジュース' },
    { tool: 'board', slots: [['fruit'], ['fruit']], name: (a) => (a[0] === a[1] ? a[0] + 'もり' : a[0] + 'と' + a[1] + 'のフルーツもり'), vessel: 'plate', motion: 'steak', hint: '果物＋果物 → フルーツもり' },
    { tool: 'board', slots: [['fruit'], ['sweet']], name: (a) => a[0] + 'ゼリー', vessel: 'plate', motion: 'steak', hint: '果物＋甘味 → 〇〇ゼリー' },
    { tool: 'board', slots: [['grain'], ['egg']], name: () => 'たまごかけごはん', vessel: 'bowl', motion: 'bowl', hint: '卵＋米 → たまごかけごはん' },
    { tool: 'pot', slots: [['veg', 'mushroom', 'meat'], ['water']], name: (a) => a[0] + 'のスープ', vessel: 'bowl', motion: 'bowl', hint: '野菜/きのこ/肉＋水 → スープ' },
    { tool: 'pot', slots: [['herb'], ['water']], name: (a) => a[0] + 'ティー', vessel: 'cup', motion: 'cup', kind: 'drink', hint: 'ハーブ＋水 → ティー' },
    { tool: 'pot', slots: [['fruit'], ['water']], name: (a) => a[0] + 'のコンポート', vessel: 'bowl', motion: 'bowl', hint: '果物＋水 → コンポート' },
    { tool: 'pan', slots: [['veg', 'mushroom', 'meat', 'egg'], ['veg', 'mushroom', 'meat', 'egg']], name: (a) => (a[0] === a[1] ? a[0] + 'いため' : a[0] + 'と' + a[1] + 'のいため'), vessel: 'plate', motion: 'steak', hint: '野菜/きのこ/肉/卵 ×2 → いため' },
    { tool: 'pan', slots: [['fruit']], name: (a) => a[0] + 'のソテー', vessel: 'plate', motion: 'steak', hint: '果物 → ソテー' },
    { tool: 'pot', slots: [['grain'], ['water']], name: (a) => (a[0] === '米' ? 'ごはん' : a[0] + 'がゆ'), vessel: 'bowl', motion: 'bowl', hint: '米＋水 → ごはん' },
    { tool: 'pan', slots: [['grain'], ['egg', 'veg', 'mushroom', 'meat']], name: (a) => a[1] + 'チャーハン', vessel: 'plate', motion: 'steak', hint: '米＋卵/野菜/きのこ/肉 → チャーハン' },
  ];
  CK.hints = (toolId) => (toolId === 'furnace' ? ['鉱石＋木 → インゴット'] : RS.DISHES.filter((d) => d.tool === toolId).map((d) => d.hint));

  // 食材の並びが料理の枠に合うか（順番は自由）
  function fit(ids, slots) {
    if (ids.length !== slots.length) return null;
    const perms = ids.length === 1 ? [[0]] : [[0, 1], [1, 0]];
    for (const pm of perms) {
      const order = pm.map((i) => ids[i]);
      if (order.every((id, k) => RS.INGS[id] && RS.INGS[id].cats.some((c) => slots[k].includes(c)))) return order;
    }
    return null;
  }

  // 料理を作る：枠の食材 ids と器具 → できる料理のスタック（なければ null）
  CK.match = function (ids, toolTile) {
    const ut = RS.UTENSILS[toolTile];
    if (!ut || !ids.length) return null;
    if (ut.smelt) {
      if (ids.length !== 2 || !ids.includes('log')) return null;
      const ore = ids.find((id) => SMELT[id]);
      return ore ? { out: SMELT[ore], n: 1 } : null;
    }
    for (const d of RS.DISHES) {
      if (d.tool !== ut.id) continue;
      const order = fit(ids, d.slots);
      if (!order) continue;
      const ings = order.map((id) => RS.INGS[id]);
      const tier = ut.tier;
      const amount = Math.round(ings.reduce((a, g) => a + g.val, 0) * (1 + 0.1 * (tier - 1)) + 5 * tier);
      const effects = tier >= 2 ? [...new Set(ings.map((g) => g.eff))].map((id) => ({ id, sec: 120 * (tier - 1) })) : [];
      // 見た目：1つめの食材の色が主役。水は具として描かない
      const solid = ings.filter((g) => !g.cats.includes('water'));
      const look = { main: ings[0].color, top: solid[1] ? solid[1].color : null, side: solid[1] && solid[1] !== solid[0] ? solid[1].color : null };
      if (d.vessel === 'straw') look.main = RS.art.shade(ings[0].color, 1.15);
      const name = d.name(order.map((id) => RS.ITEMS[id].name));
      const data = {
        key: ut.id + ':' + order.join('+'),
        name,
        vessel: d.vessel,
        food: { kind: d.kind || 'eat', amount, motion: d.motion, dur: d.kind === 'drink' ? 8 : 10, look, effects },
      };
      return { out: 'dish', n: 1, data };
    }
    return null;
  };

  // ---- 料理のアイコン（器と色で作る。同じ見た目は使い回す） ----
  const iconCache = new Map();
  CK.icon = function (data) {
    const key = data.vessel + JSON.stringify(data.food.look);
    if (iconCache.has(key)) return iconCache.get(key);
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d'); g.scale(2, 2);
    const M = RS.meal, look = data.food.look;
    const u = 100 / M.K;
    g.save();
    if (data.vessel === 'plate') { g.translate(32, 38); M.drawPlate(g, u * 1.4, look, 3); }
    else if (data.vessel === 'bowl') { g.translate(32, 34); M.drawBowl(g, u * 1.8, look, 1); }
    else { g.translate(32, 46); M.drawGlass(g, u * 1.5, look, 0.85, data.vessel === 'straw'); }
    g.restore();
    iconCache.set(key, c);
    return c;
  };

  // ---- 名前・アイコン（料理はスタックのデータから） ----
  RS.itemName = (st) => (st && st.data && st.data.name) || (st ? RS.ITEMS[st.id].name : '');
  RS.iconOf = (st) => (st.data && st.data.vessel ? CK.icon(st.data) : RS.art.icons[st.id]);
  // 同じ種類として重ねられるか（料理は中身まで同じとき）
  RS.sameStack = (a, b) => a.id === b.id && ((a.data && a.data.key) || '') === ((b.data && b.data.key) || '');
})();
