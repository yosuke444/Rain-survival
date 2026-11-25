// =============================================================
// ブロック・アイテム・レシピの定義
// =============================================================
(function () {
  'use strict';
  const RS = window.RS;

  // ブロックの番号
  const T = RS.T = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, LOG: 4, LEAVES: 5, PLANKS: 6, TABLE: 7, SAPLING: 8, CHAIR_R: 9, CHAIR_L: 10,
    CAMPFIRE: 11, BOARD: 12, POT: 13, PAN: 14, MUSHROOM: 15 };

  // solid: ぶつかるか / terrain: 地形として縁取りするか / hard: 素手で掘る秒数
  // tool: 速く掘れる道具 / needTool: その道具がないと掘れない / drop: 掘ると手に入るアイテム
  RS.TILES = [];
  RS.TILES[T.AIR]     = { name: '空気', solid: false };
  RS.TILES[T.GRASS]   = { name: '草',   solid: true,  terrain: true, hard: 0.6,  tool: 'shovel',  drop: 'dirt',   color: '#a5d47f' };
  RS.TILES[T.DIRT]    = { name: '土',   solid: true,  terrain: true, hard: 0.6,  tool: 'shovel',  drop: 'dirt',   color: '#d0a274' };
  RS.TILES[T.STONE]   = { name: '石',   solid: true,  terrain: true, hard: 1.6,  tool: 'pickaxe', drop: 'stone',  color: '#bdb8ae', needTool: true };
  RS.TILES[T.LOG]     = { name: '木',   solid: false, hard: 1.4,  tool: 'axe',     drop: 'log',     color: '#a97b50' };
  RS.TILES[T.LEAVES]  = { name: '葉',   solid: false, hard: 0.25, tool: 'axe',     drop: null,      color: '#93c96f', leaf: true };
  RS.TILES[T.PLANKS]  = { name: '板',   solid: true,  terrain: true, hard: 1.0,  tool: 'axe',     drop: 'planks', color: '#e8c08a' };
  RS.TILES[T.TABLE]   = { name: 'クラフトテーブル', solid: false, hard: 1.0, tool: 'axe', drop: 'table', color: '#c89560' };
  RS.TILES[T.SAPLING] = { name: '苗木', solid: false, hard: 0.05, tool: null,      drop: 'sapling', color: '#93c96f' };
  // いす（右向き・左向き）。座れる
  RS.TILES[T.CHAIR_R] = { name: '木のいす', solid: false, hard: 1.0, tool: 'axe', drop: 'chair', color: '#c89560', seat: 1 };
  RS.TILES[T.CHAIR_L] = { name: '木のいす', solid: false, hard: 1.0, tool: 'axe', drop: 'chair', color: '#c89560', seat: -1 };
  // 調理器具（近くで X を押すと料理ができる）
  RS.TILES[T.CAMPFIRE] = { name: 'たき火', solid: false, hard: 0.8, tool: 'axe', drop: 'campfire', color: '#f3a35b', utensil: true };
  RS.TILES[T.BOARD] = { name: 'まな板', solid: false, hard: 0.8, tool: 'axe', drop: 'board', color: '#e8c08a', utensil: true };
  RS.TILES[T.POT] = { name: 'なべ', solid: false, hard: 1.2, tool: 'pickaxe', drop: 'pot', color: '#9a9aa6', utensil: true };
  RS.TILES[T.PAN] = { name: 'フライパン', solid: false, hard: 1.2, tool: 'pickaxe', drop: 'pan', color: '#5f6b8a', utensil: true };
  // 洞窟の床に生えるきのこ
  RS.TILES[T.MUSHROOM] = { name: 'きのこ', solid: false, hard: 0.1, tool: null, drop: 'mushroom', color: '#c8a27a' };

  // アイテム。place: 設置するとなるブロック / food: 食べられる / max: 重ねられる数
  RS.ITEMS = {
    dirt:    { name: '土', place: T.DIRT },
    stone:   { name: '石', place: T.STONE },
    log:     { name: '木', place: T.LOG },
    planks:  { name: '板', place: T.PLANKS },
    table:   { name: 'クラフトテーブル', place: T.TABLE },
    sapling: { name: '苗木', place: T.SAPLING, needsSoil: true },
    stick:   { name: '棒' },
    apple:   { name: 'りんご', food: { kind: 'eat', amount: 25, motion: 'bite', dur: 8, look: { main: '#ee8577' } } },
    chair:   { name: '木のいす', place: T.CHAIR_R, chair: true },
    // 食材
    berry:    { name: '野いちご', food: { kind: 'eat', amount: 10, motion: 'bite', dur: 5, look: { main: '#d9435a' } } },
    herb:     { name: '野草' },
    mushroom: { name: 'きのこ' },
    water:    { name: '雨水', food: { kind: 'drink', amount: 8, motion: 'cup', dur: 6, look: { main: '#bfe3f7' } }, max: 10 },
    cup:      { name: 'からのコップ', fillWater: true, max: 10 },
    // 調理器具
    campfire: { name: 'たき火', place: T.CAMPFIRE },
    board:    { name: 'まな板', place: T.BOARD },
    pot:      { name: 'なべ', place: T.POT },
    pan:      { name: 'フライパン', place: T.PAN },
    // 料理（名前・見た目・効果はスタックのデータに入る）
    dish:     { name: '料理', food: true, max: 10 },
  };

  // レシピ（材料がそろえば作れる形式。1スロットにつき1個使う）
  RS.RECIPES = [
    { out: 'planks', n: 4, in: ['log'] },
    { out: 'stick',  n: 4, in: ['planks', 'planks'] },
    { out: 'table',  n: 1, in: ['planks', 'planks', 'planks', 'planks'] },
  ];

  // ツール（クラフトテーブルが必要）
  const tools = [['pickaxe', 'ツルハシ'], ['axe', 'アックス'], ['shovel', 'シャベル'], ['sword', 'ソード']];
  const mats = [['wood', '木の', 1, 'planks'], ['stone', '石の', 2, 'stone']];
  const toolIn = { pickaxe: [3, 2], axe: [2, 2], shovel: [1, 2], sword: [2, 1] }; // [素材の数, 棒の数]
  for (const [mid, mname, tier, mat] of mats) {
    for (const [tid, tname] of tools) {
      const id = mid + '_' + tid;
      RS.ITEMS[id] = { name: mname + tname, tool: tid, tier, mat: mid, max: 1 };
      const [a, b] = toolIn[tid];
      RS.RECIPES.push({ out: id, n: 1, table: true, in: [...Array(a).fill(mat), ...Array(b).fill('stick')] });
    }
  }
  // いす（クラフトテーブルが必要。仮のレシピ）
  RS.RECIPES.push({ out: 'chair', n: 1, table: true, in: ['planks', 'planks', 'planks', 'stick'] });
  // 料理の道具（仮のレシピ）
  RS.RECIPES.push({ out: 'campfire', n: 1, in: ['log', 'stick', 'stick'] });
  RS.RECIPES.push({ out: 'board', n: 1, table: true, in: ['planks', 'log'] });
  RS.RECIPES.push({ out: 'cup', n: 2, table: true, in: ['planks', 'stick'] });
  RS.RECIPES.push({ out: 'pot', n: 1, table: true, in: ['stone', 'stone', 'stone', 'stone'] });
  RS.RECIPES.push({ out: 'pan', n: 1, table: true, in: ['stone', 'stone', 'planks'] });
  for (const r of RS.RECIPES) r.key = [...r.in].sort().join('|');
})();
