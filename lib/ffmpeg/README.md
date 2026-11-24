# ffmpeg.wasm（読み込み部分のみ）

- 出典：npm パッケージ `@ffmpeg/ffmpeg@0.12.10` の `dist/umd/ffmpeg.js` と `dist/umd/814.ffmpeg.js`（そのままコピー）
- ライセンス：MIT（https://github.com/ffmpegwasm/ffmpeg.wasm）
- 用途：録画を mp4 に変換するとき。変換本体（`@ffmpeg/core`、約 32MB）は CDN から読み込む（`js/config.js` の `FFMPEG_CORE_URL`）。
- このファイルは同じドメインから読み込む必要がある（ブラウザの決まりで、別ドメインのファイルから Worker を作れないため）。
