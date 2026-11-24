// =============================================================
// ゲーム本体（進行・採掘/設置・描画）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG, T = RS.T, S = RS.sketch, COL = RS.COL;

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      this.input = new RS.Input(this.canvas);
      this.seed = (Math.random() * 1e9) | 0;
      this.world = new RS.World(this.seed);
      this.player = new RS.Player();
      this.inv = new RS.Inventory();
      this.rain = new RS.Rain();
      this.settings = RS.loadSettings();
      this.mode = this.settings.mode; // 'auto' または 'mouse'
      this.screens = ['title'];    // 重ねて表示する画面（空ならゲーム中）
      this.screenCursor = 0;
      this.started = false;
      this.look = RS.loadLook(); // キャラの見た目
      this.state = 'play';         // 'play' / 'menu' / 'dead'
      this.menu = { size: 2, cursor: 0, lastPtr: null };
      this.cam = { x: 0, y: 0 };
      this.particles = []; this.floaters = [];
      this.toastMsg = null; this.toastT = 0; this.selNameT = 0;
      this.mine = { key: null, t: 0, need: 1, x: 0, y: 0 };
      this.placeCd = 0; this.target = null; this.time = 0;
      this.exposed = false; this.ptrUsePressed = false;
      this.touch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);
      this.setupTouch();
      this.resize();
      addEventListener('resize', () => this.resize());
      this.spawn();
      this.cam.x = this.player.cx(); this.cam.y = this.player.cy() - 2;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------------- 準備 ----------------
    setupTouch() {
      const box = document.getElementById('touch');
      box.querySelectorAll('button').forEach((b) => {
        const k = b.dataset.key;
        const on = (e) => {
          e.preventDefault();
          try { b.setPointerCapture(e.pointerId); } catch (_) { /* なし */ }
          this.input.hold(k, 't:' + e.pointerId, true);
          b.classList.add('on');
        };
        const off = (e) => { this.input.hold(k, 't:' + e.pointerId, false); b.classList.remove('on'); };
        b.addEventListener('pointerdown', on);
        b.addEventListener('pointerup', off);
        b.addEventListener('pointercancel', off);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
      });
      this.showTouch();
    }
    // メニューを開いている間はボタンを隠す（メニューはタップで操作し、×で閉じる）
    showTouch() {
      const box = document.getElementById('touch');
      const hide = !this.touch || this.state === 'menu' || this.screens.length > 0;
      box.classList.toggle('hidden', hide);
      if (hide) {
        // 隠したボタンが押されたままにならないように離す
        for (const s of this.input.src.values()) for (const k of [...s]) if (k.startsWith('t:')) s.delete(k);
        box.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      }
    }

    resize() {
      const W = innerWidth, H = innerHeight;
      this.W = W; this.H = H;
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(W * this.dpr);
      this.canvas.height = Math.round(H * this.dpr);
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
      this.T = Math.round(RS.clamp(Math.min(W / C.VIEW_TILES_W, H / C.VIEW_TILES_H), C.TILE_MIN, C.TILE_MAX));
      RS.art.build(this.T, this.dpr, this.world.theme.line);
    }

    // 傘の下（中心のすぐ横）で目をさます
    spawn() {
      const p = this.player;
      const x = 2;
      p.x = x + (1 - p.w) / 2;
      p.y = this.world.surface(x) - p.h - 0.01;
      let guard = 0;
      while (p.collides(this.world, p.x, p.y) && guard++ < 300) p.y -= 1;
      p.vx = 0; p.vy = 0;
    }

    // 画面上の原点（マス座標 0,0 が画面のどこか）
    ox() { return Math.round(this.W / 2 - this.cam.x * this.T); }
    oy() { return Math.round(this.H / 2 - this.cam.y * this.T); }
    viewRect() {
      const hw = this.W / 2 / this.T, hh = this.H / 2 / this.T;
      return { x0: this.cam.x - hw, x1: this.cam.x + hw, y0: this.cam.y - hh, y1: this.cam.y + hh };
    }

    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      try {
        this.update(dt);
        this.render();
      } catch (e) {
        console.error(e);
      }
      this.input.endFrame();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------------- 進行 ----------------
    update(dt) {
      this.time += dt;
      const inp = this.input, p = this.player;

      // タイトル・ゲーム中メニュー・設定を開いている間は、ゲームは止める（雨だけ動かす）
      if (this.screens.length) {
        this.updateScreen();
        this.rain.update(dt, this.viewRect(), this.world);
        return;
      }
      if (inp.pressed('mode')) this.toggleMode();
      if (inp.pressed('esc')) {
        if (this.state === 'menu') this.closeMenu();
        else if (this.state === 'play') { this.openScreen('pause'); return; }
      }
      for (let i = 1; i <= 9; i++) if (inp.pressed('slot' + i)) { this.inv.sel = i - 1; this.showSelName(); }

      this.ptrUsePressed = false;
      this.processPointer();

      if (this.state === 'play') { if (inp.pressed('menu')) this.openMenu(); }
      else if (this.state === 'menu') this.updateMenuKeys();

      const playing = this.state === 'play';
      const useHeld = playing && (inp.down('use') || this.ptrUseHeld());
      let move = 0, jump = false;
      if (playing) {
        move = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
        // オートモードで Z を押している間の ↑ は「上をねらう」に使う
        jump = inp.down('up') && !(useHeld && this.mode === 'auto');
      }
      if (this.state !== 'dead') {
        let rem = dt;
        while (rem > 0) { const h = Math.min(rem, 1 / 60); p.physics(h, this.world, move, jump); rem -= h; }
      }
      p.walkT += Math.abs(p.vx) * dt;
      p.swingT = Math.max(0, p.swingT - dt);

      if (playing) this.updateUse(dt, useHeld);
      else { this.mine.key = null; this.target = null; p.swinging = false; }

      this.updateSurvival(dt);
      this.world.update(dt);

      const k = 1 - Math.pow(0.001, dt);
      this.cam.x += (p.cx() - this.cam.x) * k;
      this.cam.y += (p.cy() - 2 - this.cam.y) * k;

      this.rain.update(dt, this.viewRect(), this.world);
      this.updateFx(dt);
      this.toastT = Math.max(0, this.toastT - dt);
      this.selNameT = Math.max(0, this.selNameT - dt);
    }

    toggleMode() {
      this.mode = this.mode === 'auto' ? 'mouse' : 'auto';
      this.settings.mode = this.mode;
      RS.saveSettings(this.settings);
      this.mine.key = null;
      this.toast(this.mode === 'auto'
        ? 'オートモード：向いている方向の いちばん近い所'
        : 'マウスモード：' + (this.touch ? 'タップした所' : 'カーソルの先') + '（' + C.MOUSE_REACH + 'マスまで）');
    }
    toast(msg) { this.toastMsg = msg; this.toastT = 2.4; }

    // ---------------- 画面の切り替え ----------------
    openScreen(name) {
      this.screens.push(name);
      this.screenCursor = 0;
      this.mine.key = null;
      this.showTouch();
    }
    backScreen() {
      if (this.screens.length <= 1 && this.screens[0] === 'title') return;
      this.screens.pop();
      this.screenCursor = 0;
      this.mineLock = true; this.placeCd = 0.3;
      this.showTouch();
    }
    startGame() {
      this.started = true;
      this.screens = [];
      this.mineLock = true; this.placeCd = 0.3; // 決定に使った Z で掘ったり置いたりしない
      this.showTouch();
    }
    toTitle() {
      this.screens = ['title'];
      this.screenCursor = 0;
      this.showTouch();
    }
    updateScreen() {
      const inp = this.input;
      const name = this.screens[this.screens.length - 1];
      if (RS.SCREENS[name].custom) { RS.SCREENS[name].update(this); return; }
      const L = RS.ui.screenLayout(this, name);
      const n = L.buttons.length;
      this.screenCursor = Math.min(this.screenCursor, n - 1);
      for (const e of inp.events) {
        const mouse = e.ptype === 'mouse';
        if (!mouse && !this.touch) { this.touch = true; }
        // マウスはマウスモードのときだけ。タッチはいつでも
        if (e.type === 'down' && (!mouse ? false : (this.mode === 'mouse' && e.button === 0))) this.pressScreenAt(L, e.x, e.y);
        if (e.type === 'up' && !mouse && !e.long) this.pressScreenAt(L, e.x, e.y);
      }
      if (this.screens[this.screens.length - 1] !== name) return; // 画面が変わった
      if (inp.pressed('mode')) this.toggleMode();
      if (this.mode === 'auto') {
        if (inp.pressed('up')) this.screenCursor = (this.screenCursor + n - 1) % n;
        if (inp.pressed('down')) this.screenCursor = (this.screenCursor + 1) % n;
        if (inp.pressed('use')) L.buttons[this.screenCursor].act();
      }
      if (inp.pressed('esc') || inp.pressed('menu')) this.backScreen();
    }
    pressScreenAt(L, x, y) {
      const i = L.buttons.findIndex((b) => RS.ui.inRect(b, x, y));
      if (i >= 0) { this.screenCursor = i; L.buttons[i].act(); }
    }
    showSelName() { this.selNameT = 1.8; }

    // ---------------- ポインタ（マウス・タッチ） ----------------
    processPointer() {
      const inp = this.input;
      for (const e of inp.events) {
        const mouse = e.ptype === 'mouse';
        if (!mouse && !this.touch) { this.touch = true; this.showTouch(); }

        if (this.state === 'menu') {
          const L = RS.ui.menuLayout(this);
          if (e.type === 'down') {
            if (RS.ui.inRect(L.close, e.x, e.y)) { this.closeMenu(); continue; }
            if (mouse) {
              if (this.mode !== 'mouse') continue; // オートモードではキーボードで操作
              const i = RS.ui.slotAt(L, e.x, e.y);
              if (i < 0) continue;
              this.menu.cursor = i;
              this.inv.click(L.slots[i].ref, e.button === 2, this.menu.size);
            } else {
              this.menu.lastPtr = { x: e.x, y: e.y };
            }
          } else if ((e.type === 'up' && !mouse && !e.long) || e.type === 'long') {
            const i = RS.ui.slotAt(L, e.x, e.y);
            this.menu.lastPtr = { x: e.x, y: e.y };
            if (i >= 0) { this.menu.cursor = i; this.inv.click(L.slots[i].ref, e.type === 'long', this.menu.size); }
          }
          continue;
        }

        if (e.type === 'down') {
          const h = RS.ui.hudHit(this, e.x, e.y);
          if (h === 'mode') { this.toggleMode(); inp.markUI(e.id); continue; }
          if (h === 'pause') { if (this.state === 'play') this.openScreen('pause'); inp.markUI(e.id); continue; }
          if (typeof h === 'number' && (!mouse || this.mode === 'mouse')) {
            this.inv.sel = h; this.showSelName(); inp.markUI(e.id); continue;
          }
          if (this.state === 'play' && this.mode === 'mouse' && (!mouse || e.button === 0)) this.ptrUsePressed = true;
        }
      }
    }
    ptrUseHeld() {
      if (this.mode !== 'mouse') return false;
      for (const p of this.input.ptrs.values()) {
        if (p.ui) continue;
        if (p.ptype !== 'mouse' || p.button === 0) return true;
      }
      return false;
    }
    aimPoint() {
      for (const p of this.input.ptrs.values()) if (!p.ui && p.ptype !== 'mouse') return p;
      return this.input.mouse.has ? this.input.mouse : null;
    }

    // ---------------- メニュー ----------------
    nearTable() {
      const p = this.player, cx = p.cx(), cy = p.cy(), R = C.TABLE_REACH;
      for (let y = Math.floor(cy - R); y <= Math.floor(cy + R); y++) {
        for (let x = Math.floor(cx - R); x <= Math.floor(cx + R); x++) {
          if (this.world.get(x, y) === T.TABLE && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= R + 0.5) return true;
        }
      }
      return false;
    }
    openMenu() {
      this.menu.size = this.nearTable() ? 3 : 2;
      this.state = 'menu';
      this.showTouch();
      this.menu.lastPtr = null;
      const L = RS.ui.menuLayout(this);
      this.menu.cursor = Math.max(0, L.slots.findIndex((s) => s.ref.k === 'inv' && s.ref.i === this.inv.sel));
    }
    closeMenu() {
      this.inv.returnAll();
      if (this.inv.cursor) this.toast('もちものが いっぱいで しまえない物があります');
      this.state = 'play';
      this.showTouch();
    }
    updateMenuKeys() {
      const inp = this.input;
      if (inp.pressed('menu')) { this.closeMenu(); return; }
      if (this.mode !== 'auto') return;
      const L = RS.ui.menuLayout(this);
      const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
      for (const k in dirs) if (inp.pressed(k)) this.menu.cursor = RS.ui.navigate(L, this.menu.cursor, dirs[k]);
      const sl = L.slots[this.menu.cursor];
      if (!sl) return;
      if (inp.pressed('use')) this.inv.click(sl.ref, false, this.menu.size);
      if (inp.pressed('one')) this.inv.click(sl.ref, true, this.menu.size);
    }

    // ---------------- 生存（体力・食料・酸性雨） ----------------
    updateSurvival(dt) {
      const p = this.player;
      if (this.state === 'dead') {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          p.hp = C.HP_MAX; p.acidT = 0; p.hurtT = 0;
          this.spawn();
          this.state = 'play';
        }
        return;
      }
      p.foodT += dt;
      if (p.foodT >= C.FOOD_DECAY_SEC) { p.foodT -= C.FOOD_DECAY_SEC; p.food = Math.max(0, p.food - 1); }
      if (p.food > 0 && p.hp < C.HP_MAX) {
        p.regenT += dt;
        if (p.regenT >= C.HP_REGEN_SEC) { p.regenT = 0; p.hp = Math.min(C.HP_MAX, p.hp + 1); }
      }
      p.hurtT = Math.max(0, p.hurtT - dt);

      const wasExposed = this.exposed;
      this.exposed = !this.world.isProtected(p.cx(), p.y + 0.1);
      if (this.exposed) {
        if (!wasExposed) this.toast('酸性雨！ 傘の下へ もどろう');
        p.acidT -= dt;
        if (p.acidT <= 0) { p.acidT = C.ACID_INTERVAL; this.damage(C.ACID_DAMAGE); }
      } else p.acidT = 0;
    }
    damage(n) {
      const p = this.player;
      const mult = p.food <= 0 ? C.STARVING_DAMAGE_MULT : 1;
      const d = Math.round(n * mult);
      p.hp -= d;
      p.hurtT = 0.4;
      this.floater(p.cx(), p.y - 0.2, '-' + d, '#3a2a20');
      this.burst(p.cx(), p.cy(), '#17120e', 6);
      if (p.hp <= 0) this.die();
    }
    die() {
      const p = this.player;
      p.hp = 0;
      if (this.state === 'menu') this.inv.returnAll();
      this.state = 'dead';
      this.showTouch();
      p.respawnT = C.RESPAWN_DELAY;
      this.mine.key = null;
    }

    // ---------------- 採掘・設置・食べる ----------------
    updateUse(dt, useHeld) {
      const usePressed = this.input.pressed('use') || this.ptrUsePressed;
      const p = this.player;
      const held = this.inv.held();
      const def = held ? RS.ITEMS[held.id] : null;
      this.target = this.computeTarget(def, useHeld);
      p.swinging = false;

      if (def && def.food) { this.mine.key = null; if (usePressed) { this.eat(); this.mineLock = true; } return; }

      if (def && def.place != null) {
        this.mine.key = null;
        this.placeCd -= dt;
        if (useHeld && this.placeCd <= 0) {
          const t = this.target;
          if (t && t.valid) { this.placeAt(t.x, t.y, held.id); this.placeCd = C.PLACE_INTERVAL; p.swingT = 0.25; this.mineLock = true; }
          else if (usePressed) this.explain(t, true);
        }
        if (!useHeld) this.placeCd = 0;
        return;
      }

      const t = this.target;
      if (!useHeld) { this.mine.key = null; this.mine.t = 0; this.mineLock = false; return; }
      // 最後の1個を置いて手が空になっても、ボタンを離すまでは掘り始めない（置いた物をすぐ掘らないように）
      if (this.mineLock) return;
      if (!t || !t.valid) { this.mine.key = null; if (usePressed) this.explain(t, false); return; }
      const tile = this.world.get(t.x, t.y);
      const info = this.mineInfo(tile, def);
      if (!info.ok) { if (usePressed) this.toast(info.msg); this.mine.key = null; return; }
      const drop = RS.TILES[tile].drop;
      if (drop && this.inv.roomFor(drop) < 1) { if (usePressed) this.toast('もちものが いっぱい'); this.mine.key = null; return; }
      const key = t.x + ',' + t.y;
      if (key !== this.mine.key) { this.mine.key = key; this.mine.t = 0; this.mine.x = t.x; this.mine.y = t.y; this.mine.need = info.time; }
      this.mine.t += dt;
      p.swinging = true;
      if (this.mine.t >= info.time) { this.breakTile(t.x, t.y, tile); this.mine.key = null; this.mine.t = 0; }
    }

    explain(t, placing) {
      if (this.mode === 'mouse') {
        if (t && !t.inRange) this.toast('とどかない（' + C.MOUSE_REACH + 'マスまで）');
        else if (placing) this.toast('ここには おけない');
      } else {
        this.toast(placing ? '近くに おける場所がない' : '近くに ほれる物がない');
      }
    }

    mineInfo(tile, def) {
      const td = RS.TILES[tile];
      const right = !!(def && def.tool && def.tool === td.tool);
      if (td.needTool && !right) return { ok: false, msg: td.name + 'を ほるには ツルハシが ひつよう' };
      const mult = right ? C.TOOL_MULT[def.tier] : 1;
      return { ok: true, time: td.hard / mult };
    }

    breakTile(x, y, tile) {
      const td = RS.TILES[tile];
      this.world.set(x, y, T.AIR);
      const gained = [];
      if (td.leaf) {
        if (Math.random() < C.APPLE_CHANCE) gained.push('apple');
        if (Math.random() < C.SAPLING_CHANCE) gained.push('sapling');
      } else if (td.drop) gained.push(td.drop);
      let off = 0;
      for (const id of gained) {
        if (!this.inv.add(id, 1)) { this.floater(x + 0.5, y - off, '+1 ' + RS.ITEMS[id].name); off += 0.5; }
      }
      this.burst(x + 0.5, y + 0.5, td.color, 8);
    }

    canPlace(x, y, def) {
      const w = this.world;
      if (w.get(x, y) !== T.AIR) return false;
      const td = RS.TILES[def.place];
      const p = this.player;
      if (td.solid && p.x < x + 1 && p.x + p.w > x && p.y < y + 1 && p.y + p.h > y) return false;
      const below = w.get(x, y + 1);
      if (def.needsSoil && below !== T.GRASS && below !== T.DIRT) return false;
      if (def.place === T.TABLE && !RS.TILES[below].solid) return false;
      return w.get(x - 1, y) !== T.AIR || w.get(x + 1, y) !== T.AIR || w.get(x, y - 1) !== T.AIR || below !== T.AIR;
    }

    placeAt(x, y, id) {
      const def = RS.ITEMS[id];
      this.world.set(x, y, def.place);
      this.inv.consumeHeld(1);
      if (def.place === T.SAPLING) {
        this.world.saplings.push({ x, y, t: C.SAPLING_GROW_MIN + Math.random() * (C.SAPLING_GROW_MAX - C.SAPLING_GROW_MIN) });
      }
      this.burst(x + 0.5, y + 0.5, RS.TILES[def.place].color, 4);
    }

    eat() {
      const p = this.player;
      if (p.food >= C.FOOD_MAX) { this.toast('おなかは いっぱい'); return; }
      p.food = Math.min(C.FOOD_MAX, p.food + C.APPLE_FOOD);
      this.inv.consumeHeld(1);
      p.swingT = 0.25;
      this.floater(p.cx(), p.y - 0.2, 'おなか +' + C.APPLE_FOOD);
    }

    // ---------------- ねらう場所 ----------------
    computeTarget(def, useHeld) {
      if (def && def.food) return null;
      const placing = !!(def && def.place != null);
      const w = this.world, p = this.player;
      if (this.mode === 'mouse') {
        const a = this.aimPoint();
        if (!a) return null;
        const tx = Math.floor((a.x - this.ox()) / this.T), ty = Math.floor((a.y - this.oy()) / this.T);
        const inRange = Math.hypot(tx + 0.5 - p.cx(), ty + 0.5 - p.cy()) <= C.MOUSE_REACH + 0.5;
        const valid = inRange && (placing ? this.canPlace(tx, ty, def) : w.get(tx, ty) !== T.AIR);
        return { x: tx, y: ty, valid, inRange, kind: placing ? 'place' : 'mine' };
      }
      const inp = this.input;
      const vdir = inp.down('down') ? 1 : (inp.down('up') && useHeld ? -1 : 0);
      return placing ? this.autoPlace(def, vdir) : this.autoMine(vdir);
    }

    bodyCells() {
      const p = this.player;
      return {
        c0: Math.floor(p.x), c1: Math.floor(p.x + p.w - 1e-6),
        r0: Math.floor(p.y), r1: Math.floor(p.y + p.h - 1e-6),
        cx: Math.floor(p.cx()),
      };
    }

    autoMine(vdir) {
      const w = this.world, p = this.player, R = C.AUTO_REACH;
      const b = this.bodyCells();
      const hit = (x, y) => w.get(x, y) !== T.AIR;
      const mk = (x, y) => ({ x, y, valid: true, inRange: true, kind: 'mine' });
      if (vdir !== 0) {
        for (let d = 1; d <= R; d++) {
          const y = vdir > 0 ? b.r1 + d : b.r0 - d;
          if (hit(b.cx, y)) return mk(b.cx, y);
        }
        return null;
      }
      const f = p.face;
      const cols = [];
      for (const c of (f > 0 ? [b.c1, b.c0] : [b.c0, b.c1])) if (!cols.includes(c)) cols.push(c); // 重なっている木など
      const start = f > 0 ? b.c1 + 1 : b.c0 - 1;
      for (let d = 0; d < R; d++) cols.push(start + f * d);
      for (const x of cols) for (let y = b.r1; y >= b.r0; y--) if (hit(x, y)) return mk(x, y);
      return null;
    }

    autoPlace(def, vdir) {
      const w = this.world, p = this.player, R = C.AUTO_REACH;
      const b = this.bodyCells();
      const cand = [];
      if (vdir !== 0) {
        for (let d = 1; d <= R; d++) {
          const y = vdir > 0 ? b.r1 + d : b.r0 - d;
          if (w.get(b.cx, y) !== T.AIR) break;
          cand.push([b.cx, y]);
        }
      } else {
        const f = p.face;
        const start = f > 0 ? b.c1 + 1 : b.c0 - 1;
        for (let d = 0; d < R; d++) {
          const x = start + f * d;
          for (let y = b.r1; y >= b.r0; y--) cand.push([x, y]);
          cand.push([x, b.r1 + 1]);
        }
      }
      for (const [x, y] of cand) if (this.canPlace(x, y, def)) return { x, y, valid: true, inRange: true, kind: 'place' };
      return null;
    }

    // ---------------- 演出 ----------------
    burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        this.particles.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 6 - 1, t: 0.5 + Math.random() * 0.3, color, s: 0.08 + Math.random() * 0.08 });
      }
    }
    floater(x, y, text, color) { this.floaters.push({ x, y, text, color: color || COL.line, t: 1.3 }); }
    updateFx(dt) {
      for (const q of this.particles) { q.vy += 25 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.t -= dt; }
      this.particles = this.particles.filter((q) => q.t > 0);
      for (const f of this.floaters) { f.y -= 0.8 * dt; f.t -= dt; }
      this.floaters = this.floaters.filter((f) => f.t > 0);
    }

    // ---------------- 描画 ----------------
    render() {
      const g = this.ctx;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = this.world.theme.sky;
      g.fillRect(0, 0, this.W, this.H);
      this.rain.drawNormal(g, this);
      this.drawUmbrella(g);
      this.drawTerrain(g);
      this.drawTarget(g);
      this.drawPlayer(g);
      this.rain.drawAcid(g, this);
      this.drawFx(g);
      if (!this.screens.includes('title')) {
        RS.ui.drawHUD(g, this);
        if (this.state === 'menu') RS.ui.drawMenu(g, this);
      }
      if (this.screens.length) {
        const name = this.screens[this.screens.length - 1];
        if (RS.SCREENS[name].custom) RS.SCREENS[name].draw(g, this);
        else RS.ui.drawScreen(g, this, name);
      }
    }

    drawUmbrella(g) {
      const w = this.world, Tp = this.T, ox = this.ox(), oy = this.oy();
      const R = C.UMBRELLA_RADIUS, x0 = w.umb.x, rim = w.umb.rim, peak = w.umb.peak;
      const v = this.viewRect();
      const ground = w.surface(0);
      if (x0 + R < v.x0 - 2 || x0 - R > v.x1 + 2 || peak - 2 > v.y1 || ground < v.y0) return;
      const X = (x) => ox + x * Tp, Y = (y) => oy + y * Tp;
      const lw = Math.max(2, Tp * 0.08);

      // 柱
      S.rect(g, X(x0) - 0.18 * Tp, Y(peak), 0.36 * Tp, (ground - peak + 0.5) * Tp,
        { fill: '#f4ead8', stroke: w.theme.line, lw, r: Tp * 0.12, seed: 77, amp: Tp * 0.03, step: Tp * 1.5 });

      // 布（8枚）
      const N = 8;
      const colors = ['#f7d6d0', '#fdf0c8', '#d7ecd9', '#d9e3f5'];
      const tip = (i) => { const d = -1 + (2 * i) / N; return [x0 + d * R, rim + 3 * d * d]; };
      const rib = (i, s) => {
        const d = -1 + (2 * i) / N; const ty = rim + 3 * d * d;
        return [x0 + d * R * (1 - s), ty + (peak - ty) * (1 - (1 - s) * (1 - s))];
      };
      for (let i = 0; i < N; i++) {
        const pts = [];
        for (let k = 0; k <= 8; k++) pts.push(rib(i, k / 8));
        for (let k = 8; k >= 0; k--) pts.push(rib(i + 1, k / 8));
        const a = tip(i + 1), b = tip(i);
        pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.9]);
        S.shape(g, pts.map(([x, y]) => [X(x), Y(y)]), { fill: colors[i % 4], stroke: w.theme.line, lw, seed: 200 + i, amp: Tp * 0.05, step: Tp * 1.5 });
      }
      // てっぺんの飾り
      S.ellipse(g, X(x0), Y(peak) - 0.25 * Tp, 0.32 * Tp, 0.32 * Tp, { fill: '#f4ead8', stroke: w.theme.line, lw, seed: 230, amp: Tp * 0.02 });
    }

    drawTerrain(g) {
      const w = this.world, Tp = this.T, ox = this.ox(), oy = this.oy();
      const v = this.viewRect();
      const x0 = Math.floor(v.x0) - 1, x1 = Math.floor(v.x1) + 1;
      const y0 = Math.floor(v.y0) - 1, y1 = Math.floor(v.y1) + 1;
      const TL = RS.TILES, A = RS.art;

      // 地下の奥の壁（地表より下の空洞）
      g.beginPath();
      for (let x = x0; x <= x1; x++) {
        const s = w.surface(x);
        for (let y = Math.max(y0, s + 1); y <= y1; y++) {
          if (w.get(x, y) === T.AIR) g.rect(ox + x * Tp, oy + y * Tp, Tp, Tp);
        }
      }
      g.fillStyle = COL.wall; g.fill();

      // ブロック（葉は最後に重ねる）
      const leaves = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = w.get(x, y);
          if (!t) continue;
          if (t === T.LEAVES) { leaves.push(x, y); continue; }
          this.drawTile(g, t, x, y, ox, oy, Tp, A);
        }
      }
      for (let i = 0; i < leaves.length; i += 2) this.drawTile(g, T.LEAVES, leaves[i], leaves[i + 1], ox, oy, Tp, A);

      // 地形の縁（空気と接している辺だけ、手書き風の線）
      const E = A.edges;
      g.beginPath();
      const edge = (ax, ay, bx, by, pts) => {
        const dx = bx - ax, dy = by - ay;
        g.moveTo(ax, ay);
        for (let k = 1; k < pts.length - 1; k++) {
          const [u, vv] = pts[k];
          g.lineTo(ax + dx * u - dy * vv, ay + dy * u + dx * vv);
        }
        g.lineTo(bx, by);
      };
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!TL[w.get(x, y)].terrain) continue;
          const px = ox + x * Tp, py = oy + y * Tp;
          if (!TL[w.get(x, y - 1)].terrain) edge(px, py, px + Tp, py, E[(RS.hash(x, y, 1) * 8) | 0]);
          if (!TL[w.get(x, y + 1)].terrain) edge(px, py + Tp, px + Tp, py + Tp, E[(RS.hash(x, y + 1, 1) * 8) | 0]);
          if (!TL[w.get(x - 1, y)].terrain) edge(px, py, px, py + Tp, E[(RS.hash(x, y, 2) * 8) | 0]);
          if (!TL[w.get(x + 1, y)].terrain) edge(px + Tp, py, px + Tp, py + Tp, E[(RS.hash(x + 1, y, 2) * 8) | 0]);
        }
      }
      g.strokeStyle = w.theme.line;
      g.lineWidth = Math.max(1.5, Tp * 0.075);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.stroke();
    }

    drawTile(g, t, x, y, ox, oy, Tp, A) {
      const tex = A.tiles[t][(RS.hash(x, y, 5) * 4) | 0];
      const pad = tex.pad * Tp;
      g.drawImage(tex.cv, ox + x * Tp - pad, oy + y * Tp - pad, Tp + pad * 2, Tp + pad * 2);
    }

    drawTarget(g) {
      const t = this.target;
      if (!t || this.state !== 'play') return;
      const Tp = this.T, x = this.ox() + t.x * Tp, y = this.oy() + t.y * Tp;
      // 掘っている途中のひび
      if (this.mine.key && this.mine.x === t.x && this.mine.y === t.y) {
        const k = Math.min(1, this.mine.t / this.mine.need);
        const n = 1 + Math.floor(k * 4);
        const r = RS.rng(t.x * 31 + t.y * 7);
        g.strokeStyle = 'rgba(60,40,25,0.75)';
        g.lineWidth = Math.max(1.5, Tp * 0.06);
        g.beginPath();
        for (let i = 0; i < n; i++) {
          let cx = x + Tp / 2, cy = y + Tp / 2;
          g.moveTo(cx, cy);
          const a = r() * Math.PI * 2;
          for (let j = 0; j < 3; j++) { cx += Math.cos(a + (r() - 0.5)) * Tp * 0.16; cy += Math.sin(a + (r() - 0.5)) * Tp * 0.16; g.lineTo(cx, cy); }
        }
        g.stroke();
      }
      // 置く場所のうすい見本
      if (t.kind === 'place' && t.valid) {
        const held = this.inv.held();
        if (held) { g.globalAlpha = 0.45; g.drawImage(RS.art.icons[held.id], x, y, Tp, Tp); g.globalAlpha = 1; }
      }
      g.setLineDash(t.valid ? [] : [Tp * 0.15, Tp * 0.12]);
      S.rect(g, x + 1, y + 1, Tp - 2, Tp - 2, {
        stroke: t.valid ? COL.line : 'rgba(107,74,47,0.5)', lw: Math.max(2, Tp * 0.08),
        r: Tp * 0.2, seed: 401, amp: Tp * 0.03, step: Tp * 0.4,
      });
      g.setLineDash([]);
    }

    // プレイヤーの今の状態からポーズを決める
    playerPose() {
      const p = this.player, t = this.time;
      const pose = RS.char.pose();
      if (!p.onGround) {
        pose.legF = { a: 0.7, k: 1.0 }; pose.legB = { a: -0.25, k: 0.5 };
        pose.armF = { a: 0.9, e: 0.6 }; pose.armB = { a: 0.7, e: 0.5 };
      } else if (Math.abs(p.vx) > 0.5) {
        const ph = p.walkT * 4.2, sn = Math.sin(ph);
        pose.legF = { a: sn * 0.55, k: Math.max(0, -Math.cos(ph)) * 0.7 };
        pose.legB = { a: -sn * 0.55, k: Math.max(0, Math.cos(ph)) * 0.7 };
        pose.armF = { a: 0.1 - sn * 0.5, e: 0.4 };
        pose.armB = { a: sn * 0.5, e: 0.4 };
        pose.bob = -Math.abs(Math.cos(ph)) * 0.03;
      } else {
        pose.bob = Math.sin(t * 2) * 0.008; // 呼吸
      }
      if (p.swinging) pose.armF = { a: 1.6 + 0.9 * Math.cos(t * 14), e: 0.2 };
      else if (p.swingT > 0) pose.armF = { a: 0.4 + (p.swingT / 0.25) * 1.2, e: 0.3 };
      if ((t % 3.7) < 0.13) pose.eyes = 'blink'; // まばたき
      if (p.hurtT > 0) { pose.eyes = 'squeeze'; pose.mouth = 'open'; }
      return pose;
    }

    drawPlayer(g) {
      if (this.state === 'dead') return;
      const p = this.player, Tp = this.T;
      const fx = this.ox() + p.cx() * Tp, fy = this.oy() + (p.y + p.h) * Tp;
      const held = this.inv.held();
      const drawHeld = held ? (hg) => {
        const it = RS.ITEMS[held.id];
        const big = !!(it.tool || held.id === 'stick');
        const sz = Tp * (big ? 0.7 : 0.42);
        hg.save();
        if (big) { hg.rotate(Math.PI / 4); hg.drawImage(RS.art.icons[held.id], -0.22 * sz, -0.78 * sz, sz, sz); }
        else hg.drawImage(RS.art.icons[held.id], -sz / 2, -sz * 0.15, sz, sz);
        hg.restore();
      } : null;
      g.save();
      g.translate(Math.round(fx), Math.round(fy));
      g.scale(p.face, 1);
      if (p.hurtT > 0 && Math.floor(p.hurtT * 20) % 2) g.globalAlpha = 0.5;
      RS.char.draw(g, Tp, this.look, this.playerPose(), drawHeld, this.time);
      g.restore();
    }

    drawFx(g) {
      const Tp = this.T, ox = this.ox(), oy = this.oy();
      for (const q of this.particles) {
        g.globalAlpha = Math.min(1, q.t * 2);
        g.fillStyle = q.color;
        g.fillRect(ox + q.x * Tp, oy + q.y * Tp, q.s * Tp, q.s * Tp);
      }
      g.globalAlpha = 1;
      for (const f of this.floaters) {
        g.globalAlpha = Math.min(1, f.t * 1.5);
        RS.ui.text(g, f.text, ox + f.x * Tp, oy + f.y * Tp, Tp * 0.5, { align: 'center', color: f.color, outline: COL.cream });
      }
      g.globalAlpha = 1;
    }
  }

  RS.Game = Game;

  // フォントを読み込んでから始める（読み込めなくても 2.5 秒で始める）
  window.addEventListener('load', () => {
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      const el = document.getElementById('loading');
      if (el) el.remove();
      window.game = new Game();
    };
    if (document.fonts && document.fonts.load) {
      Promise.race([document.fonts.load('20px Yomogi'), new Promise((r) => setTimeout(r, 2500))]).then(go, go);
    } else go();
  });
})();
