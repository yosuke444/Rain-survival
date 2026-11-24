// =============================================================
// 雨（酸性雨：黒・不透明・大量・ブロックを貫通 / 普通の雨：半透明の小雨）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG;

  class Rain {
    constructor() { this.acid = []; this.norm = []; this.splash = []; }

    spawn(d, v, anywhere, speed, len) {
      d.x = v.x0 - 3 + Math.random() * (v.x1 - v.x0 + 6);
      d.y = anywhere ? v.y0 - 2 + Math.random() * (v.y1 - v.y0 + 4) : v.y0 - 1 - Math.random() * 3;
      d.v = speed * (0.85 + Math.random() * 0.3);
      d.len = len * (0.7 + Math.random() * 0.6);
      return d;
    }

    step(list, n, dt, v, speed, len, world) {
      while (list.length < n) list.push(this.spawn({}, v, true, speed, len));
      if (list.length > n) list.length = n;
      for (const d of list) {
        d.y += d.v * dt;
        d.x += d.v * C.RAIN_SLANT * dt;
        const lost = d.y < v.y0 - 12 || d.x < v.x0 - 3 || d.x > v.x1 + 3;
        let fresh = false;
        if (lost || d.y - d.len > v.y1 + 1) { this.spawn(d, v, lost, speed, len); fresh = true; }
        if (world && world.isProtected(d.x, d.y)) {
          // 傘に当たった（生まれたばかりの粒・見えていなかった粒はしぶきを出さない）
          if (!fresh && !d.off && this.splash.length < 60 && d.y > v.y0) this.splash.push({ x: d.x, y: world.canopyY(d.x), t: 0.3 });
          this.spawn(d, v, false, speed, len);
          d.off = world.isProtected(d.x, d.y); // 生まれ直した場所も傘の下なら描かない
        } else d.off = false;
      }
    }

    update(dt, v, world) {
      const area = (v.x1 - v.x0 + 6) * (v.y1 - v.y0 + 4);
      this.step(this.acid, Math.min(1600, Math.round(area * C.ACID_DENSITY)), dt, v, C.ACID_SPEED, C.ACID_LEN, world);
      this.step(this.norm, Math.min(500, Math.round(area * C.NORMAL_DENSITY)), dt, v, C.NORMAL_SPEED, C.NORMAL_LEN, null);
      for (const s of this.splash) s.t -= dt;
      this.splash = this.splash.filter((s) => s.t > 0);
    }

    drawLines(g, list, game) {
      const Tp = game.T, ox = game.ox(), oy = game.oy();
      g.beginPath();
      for (const d of list) {
        if (d.off) continue;
        const x = ox + d.x * Tp, y = oy + d.y * Tp;
        g.moveTo(x, y);
        g.lineTo(x - d.len * C.RAIN_SLANT * Tp, y - d.len * Tp);
      }
      g.stroke();
    }

    // 普通の雨（地形の後ろに描く）
    drawNormal(g, game) {
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = Math.max(1, game.T * 0.035);
      g.lineCap = 'round';
      this.drawLines(g, this.norm, game);
    }

    // 酸性雨（いちばん手前に描く。地面も貫通して見える）
    drawAcid(g, game) {
      g.strokeStyle = '#17120e';
      g.lineWidth = Math.max(1.6, game.T * 0.07);
      g.lineCap = 'round';
      this.drawLines(g, this.acid, game);
      // 傘に当たったしぶき
      const Tp = game.T, ox = game.ox(), oy = game.oy();
      g.lineWidth = Math.max(1.2, Tp * 0.05);
      g.beginPath();
      for (const s of this.splash) {
        const k = 1 - s.t / 0.3;
        const x = ox + s.x * Tp, y = oy + s.y * Tp;
        const r = Tp * (0.15 + k * 0.25);
        g.moveTo(x - r * 0.3, y - r * 0.2); g.lineTo(x - r, y - r * 0.8);
        g.moveTo(x + r * 0.3, y - r * 0.2); g.lineTo(x + r, y - r * 0.8);
      }
      g.stroke();
    }
  }

  RS.Rain = Rain;
})();
