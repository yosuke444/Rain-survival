// =============================================================
// 持ち物（手持ち9 + インベントリ27）とクラフト
// slots[0..8] = 手持ち（ホットバー）, slots[9..35] = インベントリ
// craft[0..8] = クラフト枠（3x3。2x2 のときは 0,1,3,4 を使う）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG;

  const GRID = { 2: [0, 1, 3, 4], 3: [0, 1, 2, 3, 4, 5, 6, 7, 8] };

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

    // 入りきらなかった数を返す
    add(id, n) {
      const max = Inventory.max(id);
      for (let i = 0; i < 36 && n > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
      }
      // 新しいアイテムは、いま選んでいる空きスロットには入れない（手に持つ物が勝手に変わらないように）
      for (let i = 0; i < 36 && n > 0; i++) {
        if (i === this.sel) continue;
        if (!this.slots[i]) { const k = Math.min(n, max); this.slots[i] = { id, n: k }; n -= k; }
      }
      if (n > 0 && !this.slots[this.sel]) { const k = Math.min(n, max); this.slots[this.sel] = { id, n: k }; n -= k; }
      return n;
    }

    // ---- クラフト ----
    match(size) {
      const items = [];
      for (const i of GRID[size]) if (this.craft[i]) items.push(this.craft[i].id);
      if (!items.length) return null;
      const key = items.sort().join('|');
      for (const r of RS.RECIPES) {
        if (r.table && size < 3) continue;
        if (r.key === key) return r;
      }
      return null;
    }
    consumeCraft(size) {
      for (const i of GRID[size]) {
        const s = this.craft[i];
        if (s) { s.n--; if (s.n <= 0) this.craft[i] = null; }
      }
    }
    // メニューを閉じたとき、クラフト枠とつかんでいる物を持ち物に戻す（入りきらない分はそのまま残す）
    returnAll() {
      for (let i = 0; i < 9; i++) {
        const s = this.craft[i];
        if (s) { const left = this.add(s.id, s.n); this.craft[i] = left ? { id: s.id, n: left } : null; }
      }
      if (this.cursor) {
        const left = this.add(this.cursor.id, this.cursor.n);
        this.cursor = left ? { id: this.cursor.id, n: left } : null;
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
        if (!this.cursor) this.cursor = { id: r.out, n: r.n };
        else if (this.cursor.id === r.out && this.cursor.n + r.n <= max) this.cursor.n += r.n;
        else return false;
        this.consumeCraft(size);
        return true;
      }
      const s = this.get(ref);
      const cur = this.cursor;
      if (secondary) {
        if (cur) {
          if (!s) { this.put(ref, { id: cur.id, n: 1 }); cur.n--; }
          else if (s.id === cur.id && s.n < Inventory.max(s.id)) { s.n++; cur.n--; }
          if (cur.n <= 0) this.cursor = null;
        } else if (s) {
          const k = Math.ceil(s.n / 2);
          this.cursor = { id: s.id, n: k };
          s.n -= k;
          if (s.n <= 0) this.put(ref, null);
        }
        return true;
      }
      if (!cur && s) { this.cursor = s; this.put(ref, null); }
      else if (cur && !s) { this.put(ref, cur); this.cursor = null; }
      else if (cur && s) {
        const max = Inventory.max(s.id);
        if (s.id === cur.id && s.n < max) {
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
  RS.Inventory = Inventory;
})();
