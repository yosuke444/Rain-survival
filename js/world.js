// =============================================================
// 世界（無限に広がるマス目・地形の自動生成・傘の位置）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, T = RS.T, C = RS.CONFIG;
  const CS = 32; // チャンク（まとめて作る単位）の大きさ

  const smooth = (t) => t * t * (3 - 2 * t);

  // 木の葉の形（幹のてっぺんからの位置）
  const LEAF = new Set(['-1,-2', '0,-2', '1,-2', '-2,-1', '-1,-1', '0,-1', '1,-1', '2,-1', '-2,0', '-1,0', '1,0', '2,0', '-1,1', '1,1']);
  const LEAF_LIST = [...LEAF].map((s) => s.split(',').map(Number));

  class World {
    constructor(seed) {
      this.seed = seed;
      this.chunks = new Map();
      this.surfCache = new Map();
      this.saplings = [];
      this.modified = new Set(); // 掘ったり置いたりして変わったチャンク（保存する）
      this.lk = null; this.lc = null;
      this.theme = RS.THEMES.plains; // この世界の色
      // 傘：中心のマスの真ん中に立つ。段階（level）で大きさが変わる
      this.umb = { x: 0.5 };
      this.setUmbrella(1);
      this.umb.dispR = this.umb.R;
      // 傘の台座（柱のすぐ右）
      const ax = 1, ay = this.surface(1) - 1;
      this.chunk(ax >> 5, ay >> 5)[(ay & 31) * CS + (ax & 31)] = T.ALTAR;
      this.buildStructures();
    }

    // 生成のときに置く（保存の対象にしない）
    put(x, y, t) { this.chunk(x >> 5, y >> 5)[(y & 31) * CS + (x & 31)] = t; }

    // ダンジョン・建物（決まった場所）
    buildStructures() {
      const s0 = this.surface(0);
      this.dun = {};
      // ① 地下の遺跡（ボス：いわドン）。入り口の扉に「銅のツルハシ」を納める
      const rx = 8, ry = s0 + 22;
      for (let ly = 0; ly <= 12; ly++) for (let lx = 0; lx <= 22; lx++) this.put(rx + lx, ry + ly, T.RUIN_BRICK);
      for (let ly = 1; ly <= 3; ly++) for (let lx = 1; lx <= 21; lx++) this.put(rx + lx, ry + ly, T.AIR); // 上の通路
      for (let ly = 4; ly <= 5; ly++) for (let lx = 17; lx <= 19; lx++) this.put(rx + lx, ry + ly, T.AIR); // 下へのあな
      for (let ly = 6; ly <= 11; ly++) for (let lx = 8; lx <= 21; lx++) this.put(rx + lx, ry + ly, T.AIR); // ボスの部屋
      this.put(rx, ry + 2, T.DDOOR); this.put(rx, ry + 3, T.DDOOR);
      this.put(rx + 9, ry + 11, T.BOSS_ALTAR);
      this.put(rx, s0 - 1 + (this.surface(rx) - s0), T.RUIN_BRICK); // 地上の目じるし
      this.put(rx, this.surface(rx) - 2, T.RUIN_BRICK);
      this.dun.ruin = { door: [rx, ry + 2], altar: [rx + 9, ry + 11], key: 'copper_pickaxe', boss: 'iwadon',
        bounds: { x0: rx + 8, x1: rx + 22, y0: ry + 6, y1: ry + 12 } };
      // ② 空のほこら（ボス：くもくじら）。いちばんはじめの空島の上
      const I = this.islands()[0];
      for (const dx of [-3, 3]) this.put(I.x + dx, I.y - 3, T.SKY_BRICK); // アーチ（下はくぐれる）
      for (let dx = -3; dx <= 3; dx++) this.put(I.x + dx, I.y - 4, T.SKY_BRICK);
      this.put(I.x, I.y - 1, T.BOSS_ALTAR);
      this.dun.sky = { altar: [I.x, I.y - 1], boss: 'kujira', bounds: { x0: I.x - 14, x1: I.x + 15, y0: I.y - 16, y1: I.y } };
      // ③ 古い倉庫（ボスなし）。宝箱が 2 つ
      const wx = -40, base = this.surface(-37);
      for (let x = wx; x <= wx + 6; x++) {
        for (let y = base; y <= this.surface(x) + 1; y++) this.put(x, y, T.DIRT); // 土台
        for (let y = base - 5; y < base; y++) this.put(x, y, T.AIR);
        this.put(x, base, T.PLANKS);
        this.put(x, base - 5, T.PLANKS);
      }
      for (let y = base - 4; y < base; y++) { this.put(wx, y, T.PLANKS); this.put(wx + 6, y, T.PLANKS); }
      this.put(wx + 6, base - 1, T.AIR); this.put(wx + 6, base - 2, T.AIR); // 入り口
      this.put(wx + 2, base - 1, T.CHEST); this.put(wx + 4, base - 1, T.CHEST);
    }

    // ---- ノイズ ----
    noise1(x, s) {
      const i = Math.floor(x), f = x - i;
      const a = RS.hash(i, 0, this.seed + s), b = RS.hash(i + 1, 0, this.seed + s);
      return a + (b - a) * smooth(f);
    }
    fbm1(x, s) {
      let v = 0, amp = 0.5, f = 1, tot = 0;
      for (let o = 0; o < 4; o++) { v += this.noise1(x * f, s + o * 101) * amp; tot += amp; amp *= 0.5; f *= 2; }
      return v / tot;
    }
    noise2(x, y, s) {
      const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
      const sd = this.seed + s;
      const a = RS.hash(ix, iy, sd), b = RS.hash(ix + 1, iy, sd), c = RS.hash(ix, iy + 1, sd), d = RS.hash(ix + 1, iy + 1, sd);
      const top = a + (b - a) * fx, bot = c + (d - c) * fx;
      return top + (bot - top) * fy;
    }

    // ---- 地表の高さ（中央から離れるほど険しくなる） ----
    surface(x) {
      let v = this.surfCache.get(x);
      if (v === undefined) { v = this.calcSurface(x); this.surfCache.set(x, v); }
      return v;
    }
    calcSurface(x) {
      const d = Math.abs(x);
      const rough = Math.min(1, Math.max(0, (d - C.UMBRELLA_RADIUS * 0.7) / 80));
      const far = Math.min(1, d / 600);
      const big = (this.fbm1(x / 48, 11) - 0.5) * 2 * (2 + rough * 16 + far * 20);
      const small = (this.fbm1(x / 11, 23) - 0.5) * 2 * (0.8 + rough * 3 + far * 3);
      return Math.round(big + small);
    }

    // その列に木が生えるか（生えるなら幹の高さ）
    treeAt(x) {
      const cw = 6;
      const cell = Math.floor(x / cw);
      const off = 1 + Math.floor(RS.hash(cell, 1, this.seed + 31) * 4);
      if (x !== cell * cw + off) return 0;
      if (Math.abs(x) <= 2) return 0; // 傘の柱のそば
      const near = Math.abs(cell) <= 4;
      if (!near && RS.hash(cell, 2, this.seed + 31) > 0.55) return 0;
      const s = this.surface(x);
      if (Math.abs(this.surface(x - 1) - s) > 1 || Math.abs(this.surface(x + 1) - s) > 1) return 0;
      return 4 + Math.floor(RS.hash(cell, 3, this.seed + 31) * 3);
    }

    isCave(x, y, depth) {
      const v = this.noise2(x / 16, y / 9, 51) * 0.65 + this.noise2(x / 5, y / 5, 77) * 0.35;
      const thr = 0.66 - Math.min(depth / 400, 0.06) - Math.min(Math.abs(x) / 2000, 0.04);
      return v > thr;
    }

    // 空島（決まった場所に浮かぶ。種から作る）
    islands() {
      if (this._isl) return this._isl;
      const r = RS.rng(this.seed * 7 + 13), list = [];
      const s0 = this.surface(0);
      // 空のほこらの島（高め・左。傘レベル 5 で届く）
      list.push({ x: -34, y: s0 - 47, w: 9, d: 4, seed: 99 });
      for (let i = 0; i < 12; i++) {
        // はじめの 3 つは低め・近め（傘レベル 2〜3 で届く）。ほかの島と重ならないようにする
        for (let tries = 0; tries < 12; tries++) {
          let x = Math.round((r() * 2 - 1) * (i < 3 ? 26 : 80));
          if (Math.abs(x) < 7) x += x < 0 ? -8 : 8;
          const hgt = i < 3 ? 13 + i * 4 + Math.floor(r() * 3) : 14 + Math.floor(r() * 52);
          const I = { x, y: s0 - hgt, w: 5 + Math.floor(r() * 5), d: 3 + Math.floor(r() * 3), seed: i };
          if (list.some((J) => Math.abs(I.x - J.x) < I.w + J.w + 3 && Math.abs(I.y - J.y) < I.d + J.d + 7)) continue;
          list.push(I);
          break;
        }
      }
      return (this._isl = list);
    }
    islandTile(x, y) {
      for (const I of this.islands()) {
        const dx = x - I.x;
        if (Math.abs(dx) > I.w || y < I.y - 1 || y > I.y + I.d) continue;
        const k = 1 - (dx / I.w) ** 2; // 下にいくほど細くなる
        const bottom = I.y + Math.round(I.d * k + RS.hash(x, I.seed, this.seed) * 0.8);
        const top = I.y + (Math.abs(dx) > I.w - 1 ? 1 : 0);
        if (y < top || y > bottom) continue;
        if (y === top) return T.SKYGRASS;
        if (y > top + 1 && RS.hash(x, y, this.seed + 501) < 0.22) return T.SKYORE;
        return y <= top + 1 ? T.DIRT : T.STONE;
      }
      return 0;
    }

    genTile(x, y) {
      const s = this.surface(x);
      if (y < s - 8) { const it = this.islandTile(x, y); if (it) return it; }
      if (y < s) {
        const h0 = this.treeAt(x);
        if (h0 && y >= s - h0 && y <= s - 1) return T.LOG;
        for (let dx = -2; dx <= 2; dx++) {
          const tx = x - dx;
          const h = this.treeAt(tx);
          if (!h) continue;
          const top = this.surface(tx) - h;
          if (LEAF.has(dx + ',' + (y - top))) return T.LEAVES;
        }
        return T.AIR;
      }
      if (y === s) return T.GRASS;
      const depth = y - s;
      const minCave = Math.abs(x) < C.UMBRELLA_RADIUS + 8 ? 14 : 6;
      if (depth >= minCave && this.isCave(x, y, depth)) {
        // 洞窟の床にはときどききのこが生える
        if (!this.isCave(x, y + 1, depth + 1) && RS.hash(x, y, this.seed + 71) < 0.08) return T.MUSHROOM;
        return T.AIR;
      }
      if (depth <= 3 + (RS.hash(x, 7, this.seed) < 0.5 ? 1 : 0)) return T.DIRT;
      // 鉱石：深いほど強いもの（小さなかたまりで出る）
      const vein = (s, sc) => this.noise2(x / sc, y / sc, s);
      if (depth > 45 && vein(431, 2.2) > 0.9) return T.CRYSTAL;
      if (depth > 25 && vein(421, 2.6) > 0.86) return T.IRON;
      if (depth > 8 && vein(411, 2.8) > 0.83) return T.COPPER;
      return T.STONE;
    }

    // ---- マスの読み書き ----
    chunk(cx, cy) {
      const k = cx * 65536 + cy;
      if (k === this.lk) return this.lc;
      let c = this.chunks.get(k);
      if (!c) {
        c = new Uint8Array(CS * CS);
        for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) c[j * CS + i] = this.genTile(cx * CS + i, cy * CS + j);
        this.chunks.set(k, c);
      }
      this.lk = k; this.lc = c;
      return c;
    }
    get(x, y) { return this.chunk(x >> 5, y >> 5)[(y & 31) * CS + (x & 31)]; }
    set(x, y, v) {
      this.chunk(x >> 5, y >> 5)[(y & 31) * CS + (x & 31)] = v;
      this.modified.add((x >> 5) * 65536 + (y >> 5));
    }
    isSolid(x, y) { return RS.TILES[this.get(x, y)].solid; }

    // ---- 傘 ----
    // 傘の上面の高さ（x が傘の範囲外なら null）
    canopyY(x) {
      const dx = (x - this.umb.x) / this.umb.R;
      if (Math.abs(dx) > 1) return null;
      return this.umb.peak + (this.umb.rim + 3 - this.umb.peak) * dx * dx;
    }
    // 傘の段階を変える（半径と高さが大きくなる）
    setUmbrella(level) {
      const R = C.UMBRELLA_RADII;
      this.umb.level = Math.max(1, Math.min(R.length, level));
      this.umb.R = R[this.umb.level - 1];
      this.umb.rim = this.surface(0) - C.UMBRELLA_HEIGHTS[this.umb.level - 1];
      this.umb.floor = this.surface(0) + C.UMBRELLA_DEPTHS[this.umb.level - 1]; // 下限（ここに雨雲）
      this.umb.peak = this.umb.rim - 6 - this.umb.level;
    }
    // 酸性雨が届かない場所か（傘の範囲内で、傘より下）
    isProtected(x, y) {
      const c = this.canopyY(x);
      return c !== null && y >= c && y <= this.umb.floor;
    }

    // ---- 苗木の成長 ----
    update(dt) {
      for (let i = this.saplings.length - 1; i >= 0; i--) {
        const sp = this.saplings[i];
        if (this.get(sp.x, sp.y) !== T.SAPLING) { this.saplings.splice(i, 1); continue; }
        sp.t -= dt;
        if (sp.t <= 0) {
          if (this.growTree(sp.x, sp.y)) this.saplings.splice(i, 1);
          else sp.t = 30; // 場所がないときは少し待ってから再挑戦
        }
      }
    }
    growTree(x, y) {
      const h = 4 + Math.floor(Math.random() * 3);
      const top = y - h + 1;
      for (let yy = top; yy < y; yy++) if (this.get(x, yy) !== T.AIR) return false;
      for (let yy = top; yy <= y; yy++) this.set(x, yy, T.LOG);
      for (const [dx, dy] of LEAF_LIST) {
        if (this.get(x + dx, top + dy) === T.AIR) this.set(x + dx, top + dy, T.LEAVES);
      }
      return true;
    }
  }

  RS.World = World;
})();
