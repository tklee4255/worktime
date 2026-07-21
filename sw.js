const CACHE = 'sunwork-v13';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon-badge.png'
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
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});

// 알림의 버튼을 눌렀을 때 (앱이 꺼져 있어도 동작)
self.addEventListener('notificationclick', e => {
  const action = e.action;          // 'pause' | 'resume' | '' (알림 본체 탭)
  const ts = Date.now();            // 누른 그 시각을 기준으로 처리
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (list.length) {
      list[0].postMessage({ type: 'timer-action', action: action, ts: ts });
      if ('focus' in list[0]) await list[0].focus();
    } else {
      // 앱이 완전히 꺼져 있으면, 누른 시각을 주소에 담아 열면서 처리
      await self.clients.openWindow('./?act=' + (action || 'open') + '&t=' + ts);
    }
  })());
});
