// =============================================================
// 写真：撮影・ブラウザ内保存（IndexedDB）・ダウンロード
// ブラウザのデータを消すと、保存した写真も消える
// =============================================================
(function () {
  'use strict';
  const RS = window.RS;
  const PH = RS.photo = {};

  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        // 版 2：ワールドの保存先（worlds）を追加
        const r = indexedDB.open('rain-survival', 2);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains('photos')) r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
          if (!r.result.objectStoreNames.contains('worlds')) r.result.createObjectStore('worlds', { keyPath: 'id', autoIncrement: true });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  function tx(mode, fn, store) {
    store = store || 'photos';
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    }));
  }

  RS.dbTx = tx; // ほかの保存（ワールド）でも使う
  PH.add = (blob) => tx('readwrite', (s) => s.add({ blob, time: Date.now(), fav: false }));
  PH.list = () => tx('readonly', (s) => s.getAll()).then((a) => (a || []).sort((x, y) => y.time - x.time));
  PH.put = (rec) => tx('readwrite', (s) => s.put(rec));
  PH.remove = (id) => tx('readwrite', (s) => s.delete(id));

  // いまの画面（UI を描く前）を写真にする
  PH.capture = function (canvas) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
      .then((blob) => PH.add(blob));
  };

  const pad = (n) => String(n).padStart(2, '0');
  PH.fileName = function (time, ext) {
    const d = new Date(time);
    return `rain-survival-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
  };
  PH.download = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
})();
