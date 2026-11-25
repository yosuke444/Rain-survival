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
      // ワールドの保存（タイトルの背景のワールドは保存しない）
      this.worldId = null; this.worldName = ''; this.worldCreated = 0;
      this.effects = []; this.eating = null; // 特殊効果・食事中
      this.clock = C.DAY_SEC * 0.1; this.atkCd = 0; RS.enemy.reset(this); // 時刻・敵
      RS.prog.reset(this); // 傘の成長
      RS.boss.reset(this); // ダンジョンの状態
      RS.farm.reset(this); // 畑・動物・掲示板
      this.saveT = 0; this.savedT = 0;
      const saveNow = () => RS.save.saveCurrent(this, true);
      document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
      addEventListener('pagehide', saveNow);
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
      const hide = !this.touch || this.state === 'menu' || this.screens.length > 0 || !!this.pm;
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

    // 新しいワールドに入れかえる（保存データはそのあとで RS.save.apply が入れる）
    resetWorld(seed) {
      this.world = new RS.World(seed);
      this.player = new RS.Player();
      this.inv = new RS.Inventory();
      this.rain = new RS.Rain();
      this.particles = []; this.floaters = [];
      this.mine = { key: null, t: 0, need: 1, x: 0, y: 0 };
      this.target = null; this.state = 'play'; this.exposed = false;
      this.time = 0; this.saveT = 0;
      this.effects = []; this.eating = null;
      this.clock = C.DAY_SEC * 0.1; this.atkCd = 0; RS.enemy.reset(this);
      RS.prog.reset(this);
      RS.boss.reset(this);
      RS.farm.reset(this);
      this.spawn();
      this.cam.x = this.player.cx(); this.cam.y = this.player.cy() - 2;
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
      let hw = this.W / 2 / this.T, hh = this.H / 2 / this.T, cx = this.cam.x, cy = this.cam.y;
      const pm = this.pm;
      if (pm) { // 撮影モード：回したときにすみまで描けるよう広めにとる
        if (pm.rot) { const d = Math.hypot(hw, hh); hw = d; hh = d; }
        hw /= pm.zoom; hh /= pm.zoom;
        cx -= pm.px / this.T; cy -= pm.py / this.T;
      }
      return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
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
      const inp = this.input, p = this.player;

      this.flashT = Math.max(0, (this.flashT || 0) - dt);
      RS.rec.check(this);
      // 撮影モード・録画のセットアップ中は時間が止まる（まばたきなども止まる）
      if (this.pm) { RS.pm.update(this, dt); return; }
      this.time += dt;
      if (!this.screens.length) {
        if (inp.pressed('photo')) { RS.pm.enter(this, false); return; }
        if (inp.pressed('rec')) { this.recButton(); if (this.pm) return; }
      }
      // タイトル・ゲーム中メニュー・設定を開いている間は、ゲームは止める（雨だけ動かす）
      this.savedT = Math.max(0, this.savedT - dt);
      if (this.screens.length) {
        this.updateScreen();
        this.rain.update(dt, this.viewRect(), this.world);
        return;
      }
      // 自動保存
      if (this.worldId) {
        this.saveT += dt;
        if (this.saveT >= C.AUTOSAVE_SEC) { this.saveT = 0; RS.save.saveCurrent(this); }
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
      // いすに座る（↓）・立つ（←→↑）
      if (playing) this.updateSit(useHeld);
      if (playing) RS.meal.update(this, dt);
      if (p.sitting) { move = 0; jump = false; p.vx = 0; p.vy = 0; }
      if (this.eating) { move = 0; jump = false; }
      p.spdMul = RS.meal.mult(this, 'speed'); p.jmpMul = RS.meal.mult(this, 'jump');
      if (this.state !== 'dead' && !p.sitting) {
        let rem = dt;
        while (rem > 0) { const h = Math.min(rem, 1 / 60); p.physics(h, this.world, move, jump); rem -= h; }
      }
      p.walkT += Math.abs(p.vx) * dt;
      this.clock += dt;
      this.atkCd = Math.max(0, this.atkCd - dt);
      RS.enemy.update(this, dt);
      RS.prog.update(this, dt);
      RS.boss.natural(this);
      RS.farm.update(this, dt);
      const um = this.world.umb; um.dispR += (um.R - um.dispR) * Math.min(1, dt * 1.2); // 傘が広がるようす
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
      RS.save.saveCurrent(this);
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
          if (mouse && this.mode !== 'mouse' && !(e.type === 'down' && RS.ui.inRect(L.close, e.x, e.y))) continue; // オートモードではキーボードで操作
          const i = RS.ui.slotAt(L, e.x, e.y);
          const isSlot = i >= 0 && ['inv', 'craft'].includes(L.slots[i].ref.k);
          if (e.type === 'down') {
            if (RS.ui.inRect(L.close, e.x, e.y)) { this.closeMenu(); continue; }
            if (!mouse) this.menu.lastPtr = { x: e.x, y: e.y };
            if (i < 0) continue;
            this.menu.cursor = i;
            // つかんでいる物があれば、なぞって置く（動かさずに離したら、ふつうに置く）
            if (this.inv.cursor && isSlot && (!mouse || e.button === 0)) { this.menu.drag = { id: e.id, start: i, seen: new Set([i]), moved: false }; continue; }
            if (mouse) this.menuClick(L, i, e.button === 2);
          } else if (e.type === 'long') {
            const d = this.menu.drag;
            if (d && d.id === e.id && !d.moved) { this.menuClick(L, d.start, true); d.moved = true; }
            else if (!d && i >= 0) { this.menu.cursor = i; this.menuClick(L, i, true); }
          } else if (e.type === 'up') {
            const d = this.menu.drag;
            this.menu.drag = null;
            if (!mouse) this.menu.lastPtr = { x: e.x, y: e.y };
            if (d && d.id === e.id) { if (!d.moved) this.menuClick(L, d.start, false); continue; }
            if (!mouse && !e.long && i >= 0) { this.menu.cursor = i; this.menuClick(L, i, false); }
          }
          continue;
        }

        if (e.type === 'down') {
          const h = RS.ui.hudHit(this, e.x, e.y);
          if (h === 'mode') { this.toggleMode(); inp.markUI(e.id); continue; }
          if (h === 'pause') { if (this.state === 'play') this.openScreen('pause'); inp.markUI(e.id); continue; }
          if (h === 'photo') { inp.markUI(e.id); RS.pm.enter(this, false); return; }
          if (h === 'rec') { inp.markUI(e.id); this.recButton(); if (this.pm) return; continue; }
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
    aimWorld() {
      const a = this.aimPoint();
      return a ? { x: (a.x - this.ox()) / this.T, y: (a.y - this.oy()) / this.T } : null;
    }
    aimPoint() {
      for (const p of this.input.ptrs.values()) if (!p.ui && p.ptype !== 'mouse') return p;
      return this.input.mouse.has ? this.input.mouse : null;
    }

    // ---------------- メニュー ----------------
    // 近くのクラフトテーブル・調理器具のうち、いちばん近いもの（メニューの種類を返す）
    nearStation() {
      const p = this.player, cx = p.cx(), cy = p.cy(), R = C.TABLE_REACH;
      let best = 2, bd = Infinity;
      for (let y = Math.floor(cy - R); y <= Math.floor(cy + R); y++) {
        for (let x = Math.floor(cx - R); x <= Math.floor(cx + R); x++) {
          const t = this.world.get(x, y);
          if (t !== T.TABLE && !RS.TILES[t].utensil) continue;
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d <= R + 0.5 && d < bd) { bd = d; best = t === T.TABLE ? 3 : 'u:' + t; }
        }
      }
      return best;
    }
    openMenu() {
      if (this.eating) RS.meal.cancel(this);
      this.menu.preview = null; this.menu.recipeSel = null; this.menu.rpage = 0; this.menu.drag = null;
      this.menu.size = this.nearStation();
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
    // メニューのマスを押したとき（レシピ一覧・ページ送り・持ち物）
    menuClick(L, i, secondary) {
      const ref = L.slots[i].ref;
      if (ref.k === 'recipe') { this.menu.recipeSel = ref.i; RS.recipes.select(this, L.recipes[ref.i]); return; }
      if (ref.k === 'rpage') { this.menu.rpage = Math.max(0, (this.menu.rpage || 0) + ref.d); return; }
      this.menu.preview = null;
      this.inv.click(ref, secondary, this.menu.size);
    }
    // なぞって置く：押したまま別のマスに入ったら、そのマスに 1 こ置く
    updateMenuDrag() {
      const d = this.menu.drag;
      if (!d) return;
      const p = this.input.ptrs.get(d.id);
      if (!p) { this.menu.drag = null; return; }
      const L = RS.ui.menuLayout(this);
      const i = RS.ui.slotAt(L, p.x, p.y);
      this.menu.lastPtr = { x: p.x, y: p.y };
      if (i < 0 || d.seen.has(i) || !['inv', 'craft'].includes(L.slots[i].ref.k)) return;
      if (!this.inv.cursor) return;
      if (!d.moved) { this.menuClick(L, d.start, true); d.moved = true; }
      d.seen.add(i);
      if (this.inv.cursor) this.menuClick(L, i, true);
      this.menu.cursor = i;
    }

    updateMenuKeys() {
      const inp = this.input;
      this.updateMenuDrag();
      if (inp.pressed('menu')) { this.closeMenu(); return; }
      if (this.mode !== 'auto') return;
      const L = RS.ui.menuLayout(this);
      const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
      for (const k in dirs) if (inp.pressed(k)) this.menu.cursor = RS.ui.navigate(L, this.menu.cursor, dirs[k]);
      const sl = L.slots[this.menu.cursor];
      if (!sl) return;
      if (inp.pressed('use')) this.menuClick(L, this.menu.cursor, false);
      if (inp.pressed('one')) this.menuClick(L, this.menu.cursor, true);
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
      const decay = C.FOOD_DECAY_SEC / RS.meal.mult(this, 'full');
      if (p.foodT >= decay) { p.foodT -= decay; p.food = Math.max(0, p.food - 1); }
      if (p.food > 0 && p.hp < C.HP_MAX) {
        p.regenT += dt;
        if (p.regenT >= C.HP_REGEN_SEC / RS.meal.mult(this, 'regen')) { p.regenT = 0; p.hp = Math.min(C.HP_MAX, p.hp + 1); }
      }
      p.hurtT = Math.max(0, p.hurtT - dt);
      RS.meal.updateEffects(this, dt);

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
      const mult = (p.food <= 0 ? C.STARVING_DAMAGE_MULT : 1) * RS.meal.mult(this, 'guard');
      if (this.eating) RS.meal.cancel(this, 'ダメージを受けたため。食べ物はそのまま');
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

      if (this.eating) { this.mine.key = null; return; }
      // 敵が近くにいれば、採掘より攻撃をさきに（設置・食べ物・コップを持っているときはしない）
      const foe = (def && (def.food || def.place != null || def.fillWater)) ? null : RS.enemy.target(this, this.mode === 'mouse' ? this.aimWorld() : null);
      this.foe = foe;
      // 動物：なでる・卵・ミルク（素手・道具・コップのとき）
      const pet = foe || (def && !def.tool && !def.fillWater) ? null : RS.farm.target(this, this.mode === 'mouse' ? this.aimWorld() : null);
      if (pet) { this.mine.key = null; if (usePressed) RS.farm.interact(this, pet, def); return; }
      if (foe) {
        this.mine.key = null;
        if (useHeld && this.atkCd <= 0) { RS.enemy.hit(this, foe, RS.enemy.weaponDmg(def)); this.atkCd = C.ATTACK_CD; p.swingT = 0.25; }
        return;
      }
      if (def && def.food) { this.mine.key = null; if (usePressed) { RS.meal.start(this); this.mineLock = true; } return; }
      if (def && def.fillWater) { this.mine.key = null; if (usePressed) this.fillWater(); return; }
      if (def && def.summon) { this.mine.key = null; if (usePressed) RS.boss.useSummon(this, def); return; }

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
      // みのった作物は収穫、掲示板は写真をはる（アックスを持っているときは こわす）
      if (RS.TILES[tile].crop && RS.farm.cropOfTile(tile) && tile === RS.farm.CROPS[RS.farm.cropOfTile(tile)].tiles[2]) {
        this.mine.key = null; if (usePressed) RS.farm.harvest(this, t.x, t.y, tile); return;
      }
      if (tile === T.PHOTOBOARD && !(def && def.tool === 'axe')) {
        this.mine.key = null; if (usePressed) RS.farm.boardInteract(this, t.x, t.y); return;
      }
      // 遺跡の扉・ボスの祭壇・宝箱は「しらべる」
      if (tile === T.DDOOR || tile === T.BOSS_ALTAR || tile === T.CHEST) {
        this.mine.key = null;
        if (usePressed) RS.boss.interact(this, t.x, t.y, tile);
        return;
      }
      // 傘の台座・ドアは「しらべる」
      if (tile === T.ALTAR || tile === T.DOOR) {
        this.mine.key = null;
        if (usePressed) {
          if (tile === T.ALTAR) RS.openUmbrella(this);
          else this.toast('ドアの先の世界は、つぎの開発でつながります（プロトタイプ）');
        }
        return;
      }
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

    // からのコップで、傘の下の普通の雨をためる
    fillWater() {
      const p = this.player, w = this.world;
      const x = Math.floor(p.cx());
      const open = p.y < w.surface(x) && w.isProtected(p.cx(), p.y); // 地上で、傘の下
      let roof = false;
      for (let y = Math.floor(p.y) - 1; y > Math.floor(p.y) - 40; y--) if (RS.TILES[w.get(x, y)].solid) { roof = true; break; }
      if (!open || roof) { this.toast('雨水は、傘の下の 空が見える所で ためられます'); return; }
      this.inv.consumeHeld(1);
      const left = this.inv.add('water', 1);
      if (left) this.inv.add('cup', 1);
      else this.floater(p.cx(), p.y - 0.2, '+1 雨水');
      p.swingT = 0.25;
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
      if (td.unbreakable) return { ok: false, msg: td.name + 'は こわせません' };
      if (td.dungeon && !this.dungeons[td.dungeon].cleared) return { ok: false, msg: 'ボスをたおすまで、' + td.name + 'は こわせません' };
      if (td.needTool && !right) return { ok: false, msg: td.name + 'を ほるには ツルハシが ひつよう' };
      if (td.needTier && def.tier < td.needTier) return { ok: false, msg: td.name + 'を ほるには ' + ['', '木', '石', '銅', '鉄'][td.needTier] + 'のツルハシ以上が ひつよう' };
      const mult = (right ? C.TOOL_MULT[def.tier] : 1) * RS.meal.mult(this, 'mine');
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
      if (td.ore) RS.prog.addCP(this, td.ore, td.name);
      if (tile === T.SKYGRASS && Math.random() < C.SKYFRUIT_CHANCE) gained.push('skyfruit');
      if (tile === T.GRASS) { // 草からは、ときどき食材が見つかる
        if (Math.random() < C.BERRY_CHANCE) gained.push('berry');
        if (Math.random() < C.HERB_CHANCE) gained.push('herb');
        if (Math.random() < C.SEED_CHANCE) gained.push('rice_seed');
        if (Math.random() < C.SEED_CHANCE) gained.push('carrot_seed');
      }
      let off = 0;
      for (const id of gained) {
        if (!this.inv.add(id, 1)) { this.floater(x + 0.5, y - off, '+1 ' + RS.ITEMS[id].name); off += 0.5; }
      }
      this.burst(x + 0.5, y + 0.5, td.color, 8);
    }

    canPlace(x, y, def) {
      const w = this.world;
      if (w.get(x, y) !== T.AIR) return false;
      if (y < w.umb.peak) return false; // 傘より高い所には置けない
      const td = RS.TILES[def.place];
      const p = this.player;
      if (td.solid && p.x < x + 1 && p.x + p.w > x && p.y < y + 1 && p.y + p.h > y) return false;
      const below = w.get(x, y + 1);
      if (def.needsSoil && below !== T.GRASS && below !== T.DIRT) return false;
      if ((def.place === T.TABLE || def.chair || RS.TILES[def.place].utensil) && !RS.TILES[below].solid) return false;
      return w.get(x - 1, y) !== T.AIR || w.get(x + 1, y) !== T.AIR || w.get(x, y - 1) !== T.AIR || below !== T.AIR;
    }

    placeAt(x, y, id) {
      const def = RS.ITEMS[id];
      this.world.set(x, y, def.chair ? (this.player.face > 0 ? T.CHAIR_R : T.CHAIR_L) : def.place);
      this.inv.consumeHeld(1);
      if (def.crop) RS.farm.planted(this, x, y, def.crop);
      if (def.place === T.SAPLING) {
        this.world.saplings.push({ x, y, t: C.SAPLING_GROW_MIN + Math.random() * (C.SAPLING_GROW_MAX - C.SAPLING_GROW_MIN) });
      }
      this.burst(x + 0.5, y + 0.5, RS.TILES[def.place].color, 4);
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
      const pm = this.pm;
      if (pm) { g.save(); RS.pm.transform(g, this.W, this.H, pm); }
      this.rain.drawNormal(g, this);
      this.drawUmbrella(g);
      this.drawTerrain(g);
      this.drawFloorClouds(g);
      RS.farm.drawBoards(g, this);
      RS.farm.drawAnimals(g, this);
      RS.enemy.draw(g, this);
      this.drawPlayer(g);
      this.rain.drawAcid(g, this);
      this.drawFx(g);
      RS.enemy.drawNight(g, this);
      if (pm) { g.restore(); RS.pm.filter(g, this.W, this.H, pm.filter, this.canvas); }
      // ここまでがゲーム画面。写真・録画には UI と狙いの枠を写さない
      if (this.photoReq) this.takePhoto();
      RS.rec.frame(this.canvas, this);
      if (this.pm) {
        RS.pm.drawUI(g, this);
      } else {
        this.drawTarget(g);
        if (RS.rec.active) RS.pm.drawRecFrame(g, this, RS.rec.setup);
      }
      if (this.pm) { this.drawFlash(g); return; }
      if (!this.screens.includes('title')) {
        this.drawAltarHint(g);
        RS.ui.drawHUD(g, this);
        RS.boss.drawBar(g, this);
        if (this.state === 'menu') RS.ui.drawMenu(g, this);
      }
      if (this.screens.length) {
        const name = this.screens[this.screens.length - 1];
        if (RS.SCREENS[name].custom) RS.SCREENS[name].draw(g, this);
        else RS.ui.drawScreen(g, this, name);
      }
      this.drawFlash(g);
    }

    // 傘の下限にわいている、酸性雨の雨雲
    drawFloorClouds(g) {
      const w = this.world, v = this.viewRect(), Tp = this.T;
      const fy = w.umb.floor;
      if (fy < v.y0 - 2 || fy > v.y1 + 3) return;
      const ox = this.ox(), oy = this.oy();
      const x0 = Math.max(Math.floor(v.x0) - 2, Math.floor(w.umb.x - w.umb.R) - 2), x1 = Math.min(Math.ceil(v.x1) + 2, Math.ceil(w.umb.x + w.umb.R) + 2);
      for (let x = x0; x <= x1; x += 2) {
        const bob = Math.sin(this.time * 0.8 + x * 0.7) * 0.12;
        const r = (0.9 + RS.hash(x, 3, 17) * 0.6) * Tp;
        S.ellipse(g, ox + (x + 0.5) * Tp, oy + (fy + 0.6 + bob) * Tp, r * 1.2, r * 0.75,
          { fill: '#3e3a48', stroke: '#24202c', lw: Math.max(1.5, Tp * 0.05), seed: 1400 + x, amp: Tp * 0.04, step: Tp * 0.4 });
      }
      if (Math.abs(this.player.y + this.player.h - fy) < 6) RS.ui.text(g, 'ここから下は 酸性雨の雨雲', this.ox() + this.player.cx() * Tp, oy + (fy - 0.4) * Tp, Tp * 0.36, { align: 'center', color: '#f6e7cc', outline: '#3e3a48' });
    }

    // 傘の台座のそばで「Z：しらべる」を出す
    drawAltarHint(g) {
      const p = this.player, Tp = this.T, w = this.world;
      for (const [x, label] of [[1, '傘の台座（Z でしらべる）'], [-1, '世界のドア']]) {
        const y = w.surface(x) - 1;
        const t = w.get(x, y);
        if ((t !== T.ALTAR && t !== T.DOOR) || Math.hypot(x + 0.5 - p.cx(), y + 0.5 - p.cy()) > 3) continue;
        RS.ui.text(g, label, this.ox() + (x + 0.5) * Tp, this.oy() + (y - 0.4) * Tp, Tp * 0.38, { align: 'center', outline: COL.cream });
      }
    }

    drawFlash(g) {
      if (this.flashT > 0) { // 撮影したときの白い光
        g.fillStyle = `rgba(255,255,255,${(this.flashT / 0.3) * 0.7})`;
        g.fillRect(0, 0, this.W, this.H);
      }
    }

    drawUmbrella(g) {
      const w = this.world, Tp = this.T, ox = this.ox(), oy = this.oy();
      const R = w.umb.dispR, x0 = w.umb.x, rim = w.umb.rim, peak = w.umb.peak;
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
          if (!TL[w.get(x, y)].terrain) g.rect(ox + x * Tp, oy + y * Tp, Tp, Tp); // 地形以外（空気・きのこ・家具など）の後ろに壁
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
      const pad = tex.padPx;
      g.drawImage(tex.cv, ox + x * Tp - pad, oy + y * Tp - pad, Tp + pad * 2, Tp + pad * 2);
    }

    drawTarget(g) {
      if (this.foe && this.state === 'play' && !this.foe.gone) { // ねらっている敵
        const e = this.foe, Tp = this.T;
        S.ellipse(g, this.ox() + e.cx() * Tp, this.oy() + e.cy() * Tp, (e.w * 0.75) * Tp, (e.h * 0.75) * Tp,
          { stroke: '#d9564f', lw: Math.max(2, Tp * 0.06), seed: 1201, amp: Tp * 0.02, step: Tp * 0.3 });
        return;
      }
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

    // 録画ボタン：録画中なら止める。そうでなければ録画のセットアップを開く
    recButton() {
      if (RS.rec.active) RS.rec.stop(this);
      else RS.pm.enter(this, true);
    }

    takePhoto() {
      this.photoReq = false;
      if (this.photoExit) { this.photoExit = false; RS.pm.exit(this); }
      this.flashT = 0.3;
      RS.photo.capture(this.canvas)
        .then(() => this.toast('写真をとりました（アルバムに保存）'))
        .catch((e) => { console.error(e); this.toast('写真を保存できませんでした'); });
    }

    // ---------------- いす ----------------
    updateSit(useHeld) {
      const inp = this.input, p = this.player, w = this.world;
      if (p.sitting) {
        const t = w.get(p.sitting.x, p.sitting.y);
        if (!RS.TILES[t].seat || inp.pressed('left') || inp.pressed('right') || inp.pressed('up')) p.sitting = null;
        return;
      }
      if (!inp.pressed('down') || useHeld) return;
      const x = Math.floor(p.cx()), y = Math.floor(p.y + p.h - 0.01);
      const seat = RS.TILES[w.get(x, y)].seat;
      if (!seat) return;
      p.sitting = { x, y };
      p.face = seat;
      p.x = x + 0.5 - p.w / 2;
      p.y = y + 1 - p.h - 0.001;
      this.toast('すわりました（' + (this.touch ? '◀ ▶ ▲' : '← → ↑') + ' で 立つ）');
    }

    // プレイヤーの今の状態からポーズを決める
    playerPose() {
      const p = this.player, t = this.time;
      const pose = RS.char.pose();
      if (p.sitting) {
        // 座っている：太ももを前に、すねを下に。足は少しぶらぶら
        const sw = Math.sin(t * 1.6) * 0.12;
        pose.legF = { a: Math.PI / 2, k: Math.PI / 2 - 0.15 + sw };
        pose.legB = { a: Math.PI / 2 - 0.1, k: Math.PI / 2 - 0.05 - sw };
        pose.dy = -0.17;
        pose.armF = { a: 0.5, e: 0.6 }; pose.armB = { a: 0.4, e: 0.6 };
        pose.bob = Math.sin(t * 2) * 0.008;
      } else if (!p.onGround) {
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
      RS.meal.pose(this, pose); // 食事中のモーション
      if (p.hurtT > 0) { pose.eyes = 'squeeze'; pose.mouth = 'open'; }
      return pose;
    }

    drawPlayer(g) {
      if (this.state === 'dead') return;
      const p = this.player, Tp = this.T;
      const fx = this.ox() + p.cx() * Tp, fy = this.oy() + (p.y + p.h) * Tp;
      const held = this.inv.held();
      const pose = this.playerPose();
      const invHeld = held ? (hg) => {
        const it = RS.ITEMS[held.id];
        const big = !!(it.tool || held.id === 'stick');
        const sz = Tp * (big ? 0.7 : 0.42);
        hg.save();
        if (big) { hg.rotate(Math.PI / 4); hg.drawImage(RS.iconOf(held), -0.22 * sz, -0.78 * sz, sz, sz); }
        else hg.drawImage(RS.iconOf(held), -sz / 2, -sz * 0.15, sz, sz);
        hg.restore();
      } : null;
      const drawHeld = this.eating ? pose.heldF || null : invHeld;
      g.save();
      g.translate(Math.round(fx), Math.round(fy));
      g.scale(p.face, 1);
      if (p.hurtT > 0 && Math.floor(p.hurtT * 20) % 2) g.globalAlpha = 0.5;
      RS.char.draw(g, Tp, this.look, pose, drawHeld, this.time);
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
