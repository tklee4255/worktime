const CACHE = 'sunwork-v22';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon-badge.png',
  './icon-pause-192.png',
  './icon-badge-pause.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});

// ---- 앱과 공유하는 작은 저장소 (앱이 꺼져 있어도 서비스워커가 읽고 쓸 수 있음) ----
function openDB(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('sunwork', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function dbGet(key){
  return openDB().then(db => new Promise((res, rej) => {
    const q = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  }));
}
function dbSet(key, val){
  return openDB().then(db => new Promise((res, rej) => {
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').put(val, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  }));
}

const NOTI_TAG = 'sunwork-timer';

function showTimerNotification(view){
  if (!view || !view.active) return self.registration.getNotifications({ tag: NOTI_TAG })
    .then(list => list.forEach(n => n.close()));
  const run = !!view.running;
  return self.registration.showNotification(run ? '진행 중' : '일시정지', {
    tag: NOTI_TAG,
    body: view.name + ' - ' + (run ? '진행 중' : '일시정지'),
    icon: run ? 'icon-192.png' : 'icon-pause-192.png',
    badge: run ? 'icon-badge.png' : 'icon-badge-pause.png',
    silent: true,
    renotify: false,
    requireInteraction: true,
    actions: run
      ? [{ action: 'pause', title: '일시정지' }]
      : [{ action: 'resume', title: '시작' }]
  });
}

// 알림의 버튼을 눌렀을 때: 앱을 열지 않고 여기서 처리
self.addEventListener('notificationclick', e => {
  const action = e.action;      // 'pause' | 'resume' | '' (알림 본체를 탭)
  const ts = Date.now();        // 누른 그 시각을 기록
  e.notification.close();

  // 버튼이 아니라 알림 본체를 탭한 경우에만 앱을 염
  if (!action) {
    e.waitUntil((async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (list.length && 'focus' in list[0]) await list[0].focus();
      else await self.clients.openWindow('./');
    })());
    return;
  }

  e.waitUntil((async () => {
    // 1) "몇 시에 무엇을 눌렀다"를 쪽지로 남김 (앱이 나중에 그 시각 그대로 반영)
    let pending = [];
    try { pending = (await dbGet('pending')) || []; } catch(err) {}
    if (!Array.isArray(pending)) pending = [];
    pending.push({ action: action, ts: ts });
    try { await dbSet('pending', pending); } catch(err) {}

    // 2) 알림 표시를 즉시 바꿔서 눌린 티가 나게 함
    let view = null;
    try { view = await dbGet('view'); } catch(err) {}
    if (view && view.active) {
      view.running = (action === 'resume');
      try { await dbSet('view', view); } catch(err) {}
      await showTimerNotification(view);
    }

    // 3) 앱이 떠 있다면 곧바로 반영하도록 알려줌 (화면을 앞으로 끌어오지는 않음)
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    list.forEach(c => c.postMessage({ type: 'pending' }));
  })());
});
