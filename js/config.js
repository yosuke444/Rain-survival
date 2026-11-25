// =============================================================
// 数値の設定（すべて「仮置き」。遊びながらここを調整する）
// =============================================================
window.RS = window.RS || {};

RS.CONFIG = {
  // ---- 画面 ----
  TILE_MIN: 20,          // 1マスの最小サイズ(px)
  TILE_MAX: 40,          // 1マスの最大サイズ(px)
  VIEW_TILES_W: 26,      // 横に最低これくらいのマスが見えるように縮める
  VIEW_TILES_H: 15,      // 縦に最低これくらいのマスが見えるように縮める

  // ---- 移動 ----
  MOVE_SPEED: 6.0,       // 横移動の速さ（マス/秒）
  ACCEL_GROUND: 60,      // 地上での加速
  ACCEL_AIR: 30,         // 空中での加速
  JUMP_SPEED: 13.5,      // ジャンプの強さ（約2.4マスの高さ）
  GRAVITY: 38,           // 重力
  MAX_FALL: 24,          // 落下の最高速度（落下ダメージはなし）
  PLAYER_W: 0.7,         // キャラの当たり判定の幅（マス）
  PLAYER_H: 1.7,         // キャラの当たり判定の高さ（マス）

  // ---- 体力・食料 ----
  HP_MAX: 100,
  FOOD_MAX: 100,
  FOOD_DECAY_SEC: 12,    // 何秒ごとに食料ゲージが1減るか（100→0 で約20分）
  STARVING_DAMAGE_MULT: 1.5, // 食料ゲージ0のとき、受けるダメージの倍率
  HP_REGEN_SEC: 2,       // 食料ゲージが残っているとき、何秒ごとに体力が1回復するか
  RESPAWN_DELAY: 2.0,    // 倒れてから復活するまでの秒数

  // ---- 酸性雨・傘 ----
  ACID_DAMAGE: 30,       // 酸性雨のダメージ（1回あたり）
  ACID_INTERVAL: 0.5,    // 酸性雨のダメージ間隔（秒）
  UMBRELLA_RADIUS: 24,   // 傘の半径（マス）。中心から左右にこのマス数まで安全
  UMBRELLA_HEIGHT: 10,   // 地面から傘のふち（中央）までの高さ（マス）
  ACID_DENSITY: 0.9,     // 酸性雨の量（1マスあたりの雨粒の数）
  NORMAL_DENSITY: 0.12,  // 普通の雨の量
  ACID_SPEED: 30,        // 酸性雨の落ちる速さ
  NORMAL_SPEED: 13,      // 普通の雨の落ちる速さ
  ACID_LEN: 1.1,         // 酸性雨の粒の長さ（マス）
  NORMAL_LEN: 0.6,       // 普通の雨の粒の長さ（マス）
  RAIN_SLANT: 0.08,      // 雨の傾き

  // ---- 採掘・設置 ----
  AUTO_REACH: 3,         // オートモードで届く距離（マス）
  MOUSE_REACH: 5,        // マウスモードで届く距離（マス）
  PLACE_INTERVAL: 0.22,  // 押しっぱなしで連続設置するときの間隔（秒）
  TOOL_MULT: { 1: 2.5, 2: 4.0 }, // 道具の採掘速度の倍率（1=木, 2=石）
  TABLE_REACH: 4,        // クラフトテーブルが使える距離（マス）

  // ---- アイテム ----
  STACK_MAX: 99,         // 1スロットに重ねられる数
  APPLE_CHANCE: 0.2,     // 葉を取ったときにりんごが出る確率
  SAPLING_CHANCE: 0.15,  // 葉を取ったときに苗木が出る確率
  BERRY_CHANCE: 0.1,     // 草を掘ったときに野いちごが出る確率
  HERB_CHANCE: 0.12,     // 草を掘ったときに野草が出る確率
  SAPLING_GROW_MIN: 90,  // 苗木が木になるまでの最短秒数
  SAPLING_GROW_MAX: 180, // 苗木が木になるまでの最長秒数

  // ---- 操作 ----
  LONG_PRESS_MS: 400,    // スマホの長おしと判定する時間（ミリ秒）
};

// ---- 設定の保存（ブラウザ内。消えても初期値で動く） ----
RS.loadSettings = function () {
  const d = { mode: 'auto', recMax: 60 }; // recMax: 最大録画時間（分。0 = 無制限）。初期は1時間
  try { Object.assign(d, JSON.parse(localStorage.getItem('rs.settings') || '{}')); } catch (_) { /* 初期値のまま */ }
  return d;
};
RS.saveSettings = function (s) {
  try { localStorage.setItem('rs.settings', JSON.stringify(s)); } catch (_) { /* 保存できなくても続ける */ }
};

// ---- 録画 ----
// ---- 昼夜と敵（仮） ----
RS.CONFIG.DAY_SEC = 900;            // 1日の長さ（秒）。夜は 0.67〜0.95 のあいだ
RS.CONFIG.NIGHT_ENEMY_MAX = 4;      // 夜の敵（しずくん）の最大数
RS.CONFIG.CAVE_ENEMY_MAX = 3;       // 洞窟の敵（いしころん）の最大数
RS.CONFIG.ENEMY_SPAWN_SEC = 3;      // 敵が出るか調べる間隔（秒）
RS.CONFIG.ATTACK_REACH = 1.6;       // オートモードで攻撃が届く距離（マス）
RS.CONFIG.ATTACK_CD = 0.35;         // 攻撃の間隔（秒）
RS.CONFIG.AUTOSAVE_SEC = 30;        // 自動保存の間隔（秒）
RS.CONFIG.REC_FPS = 30;              // 録画のコマ数（1秒あたり）
RS.CONFIG.REC_BITRATE = 2500000;     // 録画の画質（ビットレート）。上げるときれいになるが、ファイルとメモリが増える
RS.CONFIG.REC_MAX_CHOICES = [30, 60, 120, 0]; // 最大録画時間の選択肢（分。0 = 無制限）
// mp4 変換の本体（約 32MB）の置き場所
RS.CONFIG.FFMPEG_CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/';
