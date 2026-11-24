// =============================================================
// 画面の切り替え（タイトル・ゲーム中メニュー・設定）
// 画面は「重ねる」方式：game.screens の一番上が表示中の画面
// =============================================================
(function () {
  'use strict';
  const RS = window.RS, S = RS.sketch, COL = RS.COL;
  const ui = RS.ui;

  const recLabel = (m) => (m === 0 ? '無制限' : m >= 60 ? (m / 60) + '時間' : m + '分');

  // 各画面のボタン。act はボタンを押したときの動き
  RS.SCREENS = {
    title: {
      title: 'Rain Survival',
      big: true,
      items: (g) => [
        { label: g.started ? 'つづける' : 'はじめる', act: () => g.startGame() },
        { label: 'キャラメイク', act: () => g.openScreen('charmake') },
        { label: 'アルバム', act: () => RS.openAlbum(g) },
        { label: 'せってい', act: () => g.openScreen('settings') },
      ],
    },
    pause: {
      title: 'メニュー',
      items: (g) => [
        { label: 'ゲームにもどる', act: () => g.backScreen() },
        { label: 'キャラメイク', act: () => g.openScreen('charmake') },
        { label: 'アルバム', act: () => RS.openAlbum(g) },
        { label: 'せってい', act: () => g.openScreen('settings') },
        { label: 'タイトルへ', act: () => g.toTitle() },
      ],
    },
    settings: {
      title: 'せってい',
      items: (g) => [
        { label: '採掘・設置のモード：' + (g.mode === 'auto' ? 'オート' : 'マウス'), act: () => g.toggleMode() },
        { label: '最大録画時間：' + recLabel(g.settings.recMax), act: () => {
          const ch = RS.CONFIG.REC_MAX_CHOICES;
          g.settings.recMax = ch[(ch.indexOf(g.settings.recMax) + 1) % ch.length];
          RS.saveSettings(g.settings);
        } },
        { label: 'もどる', act: () => g.backScreen() },
      ],
    },
  };

  ui.screenLayout = function (game, name) {
    const def = RS.SCREENS[name];
    const items = def.items(game);
    const W = game.W, H = game.H;
    const s = Math.round(RS.clamp(Math.min(W / 9, H / 9), 34, 60)); // ボタンの高さ
    const bw = Math.min(W - 40, s * 7.5);
    const titleH = def.big ? s * 2.4 : s * 1.3;
    const ph = titleH + items.length * s * 1.25 + s * 1.2;
    const pw = bw + s;
    const px = Math.round((W - pw) / 2), py = Math.round((H - ph) / 2);
    const L = { s, def, panel: { x: px, y: py, w: pw, h: ph }, titleY: py + titleH * 0.55, buttons: [] };
    items.forEach((it, i) => {
      L.buttons.push(Object.assign({ x: px + s / 2, y: py + titleH + i * s * 1.25, w: bw, h: s }, it));
    });
    L.hintY = py + ph - s * 0.45;
    return L;
  };

  ui.drawScreen = function (g, game, name) {
    const L = ui.screenLayout(game, name), s = L.s, P = L.panel;
    g.fillStyle = L.def.big ? 'rgba(255,246,230,0.25)' : 'rgba(80,58,38,0.3)';
    g.fillRect(0, 0, game.W, game.H);
    S.rect(g, P.x, P.y, P.w, P.h, { fill: 'rgba(255,246,230,0.95)', stroke: COL.line, lw: 3, r: s * 0.5, seed: 501, amp: 2, step: 30 });
    ui.text(g, L.def.title, game.W / 2, L.titleY, L.def.big ? s * 1.1 : s * 0.6, { align: 'center', maxW: P.w - s });
    const kbd = game.mode === 'auto';
    L.buttons.forEach((b, i) => {
      const hl = kbd && i === game.screenCursor;
      S.rect(g, b.x, b.y, b.w, b.h, {
        fill: hl ? '#ffe9b8' : COL.slot, stroke: hl ? COL.accent : COL.line, lw: hl ? 3.5 : 2,
        r: s * 0.3, seed: 510 + i, amp: 1.5, step: 20,
      });
      ui.text(g, b.label, b.x + b.w / 2, b.y + b.h / 2, s * 0.42, { align: 'center', maxW: b.w - s * 0.5 });
    });
    let hint;
    if (game.touch) hint = 'タップで えらぶ';
    else if (kbd) hint = '↑↓：えらぶ　Z：けってい' + (name === 'title' ? '' : '　X / Esc：もどる');
    else hint = 'クリックで えらぶ' + (name === 'title' ? '' : '　X / Esc：もどる');
    ui.text(g, hint, game.W / 2, L.hintY, s * 0.3, { align: 'center', maxW: P.w - s, color: 'rgba(107,74,47,0.8)' });
  };
})();
