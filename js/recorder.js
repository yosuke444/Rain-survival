// =============================================================
// 録画（E キーで開始・終了）
// mp4 を直接作れるブラウザはそのまま mp4、作れないブラウザは WebM で録って、
// 終わったあとに ffmpeg.wasm で mp4 に変換する
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, C = RS.CONFIG, PH = RS.photo;
  const R = RS.rec = { active: false, progress: null };

  function pickType() {
    if (!window.MediaRecorder) return null;
    const list = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const t of list) if (MediaRecorder.isTypeSupported(t)) return t;
    return null;
  }

  // setup = 撮影モードで決めた ズーム・角度・位置・フィルター
  R.start = function (game, setup) {
    const type = pickType();
    if (!type || !HTMLCanvasElement.prototype.captureStream) { game.toast('このブラウザでは 録画できません'); return; }
    if (R.progress != null) { game.toast('前の動画を 変換中です'); return; }
    // UI を写さないように、ゲーム画面だけを別のキャンバスに写して録る
    const cv = document.createElement('canvas');
    cv.width = game.canvas.width; cv.height = game.canvas.height;
    R.cv = cv; R.ctx = cv.getContext('2d');
    R.ctx.drawImage(game.canvas, 0, 0);
    const stream = cv.captureStream(C.REC_FPS);
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: C.REC_BITRATE }); }
    catch (e) { console.error(e); game.toast('録画を はじめられませんでした'); return; }
    R.chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) R.chunks.push(e.data); };
    rec.onstop = () => finish(game, type);
    rec.start(1000);
    R.rec = rec; R.stream = stream; R.type = type;
    R.setup = setup || RS.pm.blank();
    R.active = true; R.t0 = performance.now();
    game.toast('録画を はじめました（もう一度 ' + (game.touch ? 'ボタン' : 'E') + ' で おわる）');
  };

  // 毎フレーム、UI を描く前の画面を、セットアップどおりに変形して写す
  R.frame = function (canvas, game) {
    if (!R.active) return;
    const c = R.ctx, w = R.cv.width, h = R.cv.height, s = R.setup, k = w / game.W;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = game.world.theme.sky; c.fillRect(0, 0, w, h);
    c.save();
    RS.pm.transform(c, w, h, { zoom: s.zoom, rot: s.rot, px: s.px * k, py: s.py * k });
    c.drawImage(canvas, 0, 0, w, h);
    c.restore();
    RS.pm.filter(c, w, h, s.filter, R.cv);
  };

  R.elapsed = () => (R.active ? (performance.now() - R.t0) / 1000 : 0);

  R.stop = function (game, msg) {
    if (!R.active) return;
    R.active = false;
    R.rec.stop();
    R.stream.getTracks().forEach((t) => t.stop());
    game.toast(msg || '録画を おわりました');
  };



  // 最大録画時間（設定。0 = 無制限）
  R.check = function (game) {
    const max = game.settings.recMax;
    if (R.active && max > 0 && R.elapsed() >= max * 60) R.stop(game, '最大録画時間になったので 録画を おわりました');
  };

  async function finish(game, type) {
    const blob = new Blob(R.chunks, { type: type.split(';')[0] });
    R.chunks = [];
    const t = Date.now();
    if (type.startsWith('video/mp4')) {
      PH.download(blob, PH.fileName(t, 'mp4'));
      game.toast('動画を ダウンロードしました');
      return;
    }
    R.progress = 0;
    try {
      const mp4 = await convert(blob, (p) => { R.progress = Math.max(0, Math.min(1, p)); });
      PH.download(mp4, PH.fileName(t, 'mp4'));
      game.toast('動画を mp4 で ダウンロードしました');
    } catch (e) {
      // 変換できなくても録画は失わない
      console.error(e);
      PH.download(blob, PH.fileName(t, 'webm'));
      game.toast('mp4 に変換できなかったので WebM で 保存しました');
    } finally {
      R.progress = null;
    }
  }

  // ---- ffmpeg.wasm ----
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed: ' + src));
      document.head.appendChild(s);
    });
  }
  async function toBlobURL(url, mime) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed: ' + url);
    return URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: mime }));
  }
  let ffp = null;
  function loadFF() {
    if (ffp) return ffp;
    ffp = (async () => {
      if (!window.FFmpegWASM) await loadScript('lib/ffmpeg/ffmpeg.js');
      const ff = new window.FFmpegWASM.FFmpeg();
      const base = C.FFMPEG_CORE_URL;
      await ff.load({
        coreURL: await toBlobURL(base + 'ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(base + 'ffmpeg-core.wasm', 'application/wasm'),
      });
      return ff;
    })();
    ffp.catch(() => { ffp = null; });
    return ffp;
  }
  async function convert(blob, onProgress) {
    const ff = await loadFF();
    const prog = ({ progress }) => onProgress(progress);
    ff.on('progress', prog);
    try {
      await ff.writeFile('in.webm', new Uint8Array(await blob.arrayBuffer()));
      const code = await ff.exec(['-i', 'in.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'out.mp4']);
      if (code !== 0) throw new Error('ffmpeg exit ' + code);
      const data = await ff.readFile('out.mp4');
      return new Blob([data.buffer], { type: 'video/mp4' });
    } finally {
      ff.off('progress', prog);
      try { await ff.deleteFile('in.webm'); } catch (_) { /* なし */ }
      try { await ff.deleteFile('out.mp4'); } catch (_) { /* なし */ }
    }
  }
})();
