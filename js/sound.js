// =============================================================
// 音（ブラウザの中で作る。音のファイルは使わない）
// ・雨音（ずっと）・傘に当たる雨つぶ・自然音（昼は鳥、夜は虫）
// ・BGM：ゆったりしたピアノ（コードにそって、ぽろん…と鳴らす）
// 最初にキー・タッチがあったときに鳴り始める（ブラウザの決まり）
// =============================================================
(function () {
  'use strict';
  const RS = window.RS;
  const SD = RS.sound = { started: false };

  let ctx, master, amb, bgm, rev;

  function noiseBuffer(sec, color) {
    const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const wht = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + 0.02 * wht) / 1.02; d[i] = last * 3.5; }
        else { b0 = 0.99765 * b0 + wht * 0.099; b1 = 0.963 * b1 + wht * 0.2965; b2 = 0.57 * b2 + wht * 1.0526; d[i] = (b0 + b1 + b2 + wht * 0.1848) * 0.12; }
      }
    }
    return buf;
  }
  // 残響（ホールのひびき）を作る
  function reverb() {
    const len = ctx.sampleRate * 3.2, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const c = ctx.createConvolver(); c.buffer = buf; return c;
  }

  SD.start = function (game) {
    if (SD.started) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    SD.started = true;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    amb = ctx.createGain(); amb.connect(master);
    bgm = ctx.createGain(); bgm.connect(master);
    rev = reverb(); const revG = ctx.createGain(); revG.gain.value = 0.35; rev.connect(revG); revG.connect(bgm);
    SD.setVolume(game.settings);
    // 雨音（2 つのノイズを重ねる：ざーっ と さらさら）
    for (const [color, f, q, v] of [['pink', 900, 0.6, 0.5], ['brown', 400, 0.5, 0.35]]) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(4, color); src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gn = ctx.createGain(); gn.gain.value = v;
      src.connect(bp); bp.connect(gn); gn.connect(amb); src.start();
    }
    SD.next = { drop: 0, bird: 3, bug: 0, note: 1 };
    SD.chord = 0;
  };

  SD.setVolume = function (st) {
    if (!ctx) return;
    amb.gain.value = (st.volAmb == null ? 60 : st.volAmb) / 100 * 0.8;
    bgm.gain.value = (st.volBgm == null ? 50 : st.volBgm) / 100 * 0.6;
  };

  // 雨つぶ（傘や地面に当たる ぽつっ）
  function drop() {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1800 + Math.random() * 2200, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.05);
    g.gain.setValueAtTime(0.025 + Math.random() * 0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(amb); o.start(t); o.stop(t + 0.08);
  }
  // 鳥のさえずり
  function bird() {
    const t0 = ctx.currentTime, n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + 0.06);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g); g.connect(amb); o.start(t); o.stop(t + 0.1);
    }
  }
  // 夜の虫（りーりー）
  function bug() {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 4200 + Math.random() * 600;
    lfo.frequency.value = 22; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.012, t + 0.2); g.gain.linearRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g); g.connect(amb); o.start(t); lfo.start(t); o.stop(t + 1.5); lfo.stop(t + 1.5);
  }

  // ピアノの音（倍音を重ねて、すっと減っていく）
  function piano(freq, t, vel) {
    const out = ctx.createGain(); out.gain.value = vel;
    out.connect(bgm); out.connect(rev);
    for (const [k, a] of [[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq * k * (1 + (k - 1) * 0.0008);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a * 0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(a * 0.05, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5 / k);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 3.6);
    }
  }
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // コード進行（Fmaj7 → Em7 → Dm7 → Cmaj7 のくりかえし）
  const CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
  function bgmStep(game) {
    const t = ctx.currentTime + 0.05;
    const ch = CHORDS[SD.chord % CHORDS.length];
    if (SD.beat % 8 === 0) { piano(midi(ch[0] - 12), t, 0.5); SD.chord += SD.beat > 0 ? 1 : 0; }
    // 和音の音から、高いほうへ ぽろん
    if (Math.random() < 0.75) {
      const n = ch[Math.floor(Math.random() * ch.length)] + 12 * (Math.random() < 0.6 ? 1 : 0);
      piano(midi(n), t + Math.random() * 0.05, 0.35 + Math.random() * 0.2);
    }
    SD.beat = (SD.beat || 0) + 1;
  }

  // 毎フレーム：次の音を鳴らすか決める
  SD.update = function (game, dt) {
    if (!ctx || ctx.state !== 'running') return;
    const N = SD.next;
    for (const k in N) N[k] -= dt;
    const night = RS.enemy.isNight(game);
    if (N.drop <= 0) { drop(); N.drop = 0.05 + Math.random() * 0.25; }
    if (!night && N.bird <= 0) { if (game.started) bird(); N.bird = 4 + Math.random() * 8; }
    if (night && N.bug <= 0) { bug(); N.bug = 1.5 + Math.random() * 2.5; }
    if (N.note <= 0) { bgmStep(game); N.note = 0.9 + Math.random() * 0.4; }
  };

  // 最初の操作で鳴らし始める
  SD.hook = function (game) {
    const go = () => SD.start(game);
    addEventListener('keydown', go);
    addEventListener('pointerdown', go);
  };
})();
