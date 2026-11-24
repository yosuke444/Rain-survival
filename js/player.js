// =============================================================
// プレイヤー（動きとぶつかり判定）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG;

  class Player {
    constructor() {
      this.w = C.PLAYER_W; this.h = C.PLAYER_H;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.face = 1; this.onGround = false;
      this.hp = C.HP_MAX; this.food = C.FOOD_MAX;
      this.respawnT = 0; this.hurtT = 0; this.acidT = 0;
      this.walkT = 0; this.swingT = 0; this.swinging = false;
      this.foodT = 0; this.regenT = 0;
    }
    cx() { return this.x + this.w / 2; }
    cy() { return this.y + this.h / 2; }

    collides(w, x, y) {
      const x0 = Math.floor(x), x1 = Math.floor(x + this.w - 1e-6);
      const y0 = Math.floor(y), y1 = Math.floor(y + this.h - 1e-6);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (w.isSolid(tx, ty)) return true;
      return false;
    }

    physics(dt, w, move, jump) {
      const target = move * C.MOVE_SPEED;
      const acc = (this.onGround ? C.ACCEL_GROUND : C.ACCEL_AIR) * dt;
      this.vx += RS.clamp(target - this.vx, -acc, acc);
      if (move) this.face = move > 0 ? 1 : -1;

      if (jump && this.onGround) { this.vy = -C.JUMP_SPEED; this.onGround = false; }
      let g = C.GRAVITY;
      if (!jump && this.vy < 0) g *= 2.2; // ボタンを早く離すと低いジャンプ
      this.vy = Math.min(this.vy + g * dt, C.MAX_FALL);

      // 横
      let nx = this.x + this.vx * dt;
      if (this.collides(w, nx, this.y)) {
        if (this.vx > 0) nx = Math.floor(nx + this.w) - this.w - 0.0005;
        else if (this.vx < 0) nx = Math.floor(nx) + 1 + 0.0005;
        if (this.collides(w, nx, this.y)) nx = this.x;
        this.vx = 0;
      }
      this.x = nx;

      // 縦
      let ny = this.y + this.vy * dt;
      this.onGround = false;
      if (this.collides(w, this.x, ny)) {
        if (this.vy > 0) { ny = Math.floor(ny + this.h) - this.h - 0.0005; this.onGround = true; }
        else if (this.vy < 0) ny = Math.floor(ny) + 1 + 0.0005;
        if (this.collides(w, this.x, ny)) ny = this.y;
        this.vy = 0;
      }
      this.y = ny;
    }
  }

  RS.Player = Player;
})();
