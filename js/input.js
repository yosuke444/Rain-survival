// =============================================================
// 入力（キーボード・マウス・タッチ）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG;

  // キーの割り当て
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',          // ジャンプ
    ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'use',                         // 採掘・設置
    KeyX: 'menu',                        // メニュー（インベントリ）
    KeyC: 'one',                         // メニューで1個だけ置く（仮）
    KeyM: 'mode',                        // オート/マウスの切り替え（仮）
    Escape: 'esc',                       // ゲーム中メニュー（仮）
  };
  for (let i = 1; i <= 9; i++) { KEYMAP['Digit' + i] = 'slot' + i; KEYMAP['Numpad' + i] = 'slot' + i; }

  class Input {
    constructor(canvas) {
      this.src = new Map();   // 操作名 → 押している元の集合
      this.pr = new Set();    // このフレームで押された操作
      this.events = [];       // ポインタのできごと
      this.ptrs = new Map();  // 押されているポインタ
      this.mouse = { x: 0, y: 0, has: false };

      addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = KEYMAP[e.code];
        if (!k) return;
        e.preventDefault();
        this.hold(k, 'k:' + e.code, true);
      });
      addEventListener('keyup', (e) => {
        const k = KEYMAP[e.code];
        if (k) this.hold(k, 'k:' + e.code, false);
      });
      addEventListener('blur', () => this.src.clear());

      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* なし */ }
        if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.has = true; }
        const p = { id: e.pointerId, x: e.clientX, y: e.clientY, ptype: e.pointerType, button: e.button, long: false, ui: false };
        this.ptrs.set(e.pointerId, p);
        this.events.push({ type: 'down', id: p.id, x: p.x, y: p.y, ptype: p.ptype, button: p.button });
        if (e.pointerType !== 'mouse') {
          p.timer = setTimeout(() => {
            if (this.ptrs.get(p.id) === p) {
              p.long = true;
              this.events.push({ type: 'long', id: p.id, x: p.x, y: p.y, ptype: p.ptype });
            }
          }, C.LONG_PRESS_MS);
        }
      });
      canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.has = true; }
        const p = this.ptrs.get(e.pointerId);
        if (p) { p.x = e.clientX; p.y = e.clientY; }
      });
      const up = (e) => {
        const p = this.ptrs.get(e.pointerId);
        if (!p) return;
        clearTimeout(p.timer);
        this.ptrs.delete(e.pointerId);
        this.events.push({ type: 'up', id: p.id, x: e.clientX, y: e.clientY, ptype: p.ptype, button: p.button, long: p.long, ui: p.ui });
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
    }

    hold(k, src, on) {
      let s = this.src.get(k);
      if (!s) { s = new Set(); this.src.set(k, s); }
      if (on) { if (s.size === 0) this.pr.add(k); s.add(src); }
      else s.delete(src);
    }
    down(k) { const s = this.src.get(k); return !!(s && s.size); }
    pressed(k) { return this.pr.has(k); }
    markUI(id) { const p = this.ptrs.get(id); if (p) p.ui = true; }
    endFrame() { this.pr.clear(); this.events.length = 0; }
  }

  RS.Input = Input;
})();
