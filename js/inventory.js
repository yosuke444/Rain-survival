// =============================================================
// 持ち物（手持ち9 + インベントリ27）とクラフト
// slots[0..8] = 手持ち（ホットバー）, slots[9..35] = インベントリ
// craft[0..8] = クラフト枠（3x3。2x2 のときは 0,1,3,4 を使う）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG;

  // 2 = 手もと（2x2）、3 = クラフトテーブル（3x3）、'u:<ブロック番号>' = 調理器具（3つの枠）
  const GRID = { 2: [0, 1, 3, 4], 3: [0, 1, 2, 3, 4, 5, 6, 7, 8], c: [0, 1, 2] };
  const gridOf = (size) => GRID[typeof size === 'number' ? size : 'c'];

  const mk = (id, n, data) => (data ? { id, n, data } : { id, n });

  class Inventory {
    constructor() {
      this.slots = new Array(36).fill(null);
      this.craft = new Array(9).fill(null);
      this.cursor = null; // メニューでつかんでいるアイテム
      this.sel = 0;
    }
    static max(id) { return RS.ITEMS[id].max || C.STACK_MAX; }

    held() { return this.slots[this.sel]; }
    consumeHeld(n) {
      const s = this.slots[this.sel];
      if (!s) return;
      s.n -= n || 1;
      if (s.n <= 0) this.slots[this.sel] = null;
    }

    roomFor(id) {
      const max = Inventory.max(id);
      let room = 0;
      for (const s of this.slots) {
        if (!s) room += max;
        else if (s.id === id) room += max - s.n;
      }
      return room;
    }

    // 入りきらなかった数を返す（data = 料理の中身など。同じ中身どうしだけ重なる）
    add(id, n, data) {
      const max = Inventory.max(id);
      const probe = { id, data };
      for (let i = 0; i < 36 && n > 0; i++) {
        const s = this.slots[i];
        if (s && RS.sameStack(s, probe) && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
      }
      // 新しいアイテムは、いま選んでいる空きスロットには入れない（手に持つ物が勝手に変わらないように）
      for (let i = 0; i < 36 && n > 0; i++) {
        if (i === this.sel) continue;
        if (!this.slots[i]) { const k = Math.min(n, max); this.slots[i] = mk(id, k, data); n -= k; }
      }
      if (n > 0 && !this.slots[this.sel]) { const k = Math.min(n, max); this.slots[this.sel] = mk(id, k, data); n -= k; }
      return n;
    }

    // ---- クラフト ----
    match(size) {
      const items = [];
      for (const i of gridOf(size)) if (this.craft[i]) items.push(this.craft[i].id);
      if (!items.length) return null;
      if (typeof size === 'string') return RS.cook.match(items, Number(size.slice(2))); // 調理器具
      const key = items.sort().join('|');
      for (const r of RS.RECIPES) {
        if (r.table && size < 3) continue;
        if (r.key === key) return r;
      }
      return null;
    }
    consumeCraft(size) {
      for (const i of gridOf(size)) {
        const s = this.craft[i];
        if (s) { s.n--; if (s.n <= 0) this.craft[i] = null; }
      }
    }
    // メニューを閉じたとき、クラフト枠とつかんでいる物を持ち物に戻す（入りきらない分はそのまま残す）
    returnAll() {
      for (let i = 0; i < 9; i++) {
        const s = this.craft[i];
        if (s) { const left = this.add(s.id, s.n, s.data); this.craft[i] = left ? mk(s.id, left, s.data) : null; }
      }
      if (this.cursor) {
        const c = this.cursor;
        const left = this.add(c.id, c.n, c.data);
        this.cursor = left ? mk(c.id, left, c.data) : null;
      }
    }

    // ---- メニューのスロット操作 ----
    get(ref) {
      if (ref.k === 'inv') return this.slots[ref.i];
      if (ref.k === 'craft') return this.craft[ref.i];
      return null;
    }
    put(ref, v) {
      if (ref.k === 'inv') this.slots[ref.i] = v;
      else if (ref.k === 'craft') this.craft[ref.i] = v;
    }

    // secondary=false: まとめて持つ/置く/入れ替え  secondary=true: 1個置く/半分持つ
    click(ref, secondary, size) {
      if (ref.k === 'result') {
        const r = this.match(size);
        if (!r) return false;
        const max = Inventory.max(r.out);
        const out = mk(r.out, r.n, r.data);
        if (!this.cursor) this.cursor = out;
        else if (RS.sameStack(this.cursor, out) && this.cursor.n + r.n <= max) this.cursor.n += r.n;
        else return false;
        this.consumeCraft(size);
        return true;
      }
      const s = this.get(ref);
      const cur = this.cursor;
      if (secondary) {
        if (cur) {
          if (!s) { this.put(ref, mk(cur.id, 1, cur.data)); cur.n--; }
          else if (RS.sameStack(s, cur) && s.n < Inventory.max(s.id)) { s.n++; cur.n--; }
          if (cur.n <= 0) this.cursor = null;
        } else if (s) {
          const k = Math.ceil(s.n / 2);
          this.cursor = mk(s.id, k, s.data);
          s.n -= k;
          if (s.n <= 0) this.put(ref, null);
        }
        return true;
      }
      if (!cur && s) { this.cursor = s; this.put(ref, null); }
      else if (cur && !s) { this.put(ref, cur); this.cursor = null; }
      else if (cur && s) {
        const max = Inventory.max(s.id);
        if (RS.sameStack(s, cur) && s.n < max) {
          const k = Math.min(cur.n, max - s.n);
          s.n += k; cur.n -= k;
          if (cur.n <= 0) this.cursor = null;
        } else {
          this.put(ref, cur); this.cursor = s;
        }
      }
      return true;
    }
  }

  Inventory.GRID = GRID;
  Inventory.gridOf = gridOf;
  RS.Inventory = Inventory;
})();
