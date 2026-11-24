// =============================================================
// ブロック・アイテム・レシピの定義
// =============================================================
(function () {
  'use strict';
  const RS = window.RS;

  // ブロックの番号
  const T = RS.T = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, LOG: 4, LEAVES: 5, PLANKS: 6, TABLE: 7, SAPLING: 8 };

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

  // アイテム。place: 設置するとなるブロック / food: 食べられる / max: 重ねられる数
  RS.ITEMS = {
    dirt:    { name: '土', place: T.DIRT },
    stone:   { name: '石', place: T.STONE },
    log:     { name: '木', place: T.LOG },
    planks:  { name: '板', place: T.PLANKS },
    table:   { name: 'クラフトテーブル', place: T.TABLE },
    sapling: { name: '苗木', place: T.SAPLING, needsSoil: true },
    stick:   { name: '棒' },
    apple:   { name: 'りんご', food: true },
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
  for (const r of RS.RECIPES) r.key = [...r.in].sort().join('|');
})();
