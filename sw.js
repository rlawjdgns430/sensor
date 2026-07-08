const CACHE_NAME = 'sensor-monitor-v1';
const ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 일부 파일이 누락되더라도 서비스 워커 설치에 실패하지 않도록 try-catch 처리하거나 개별 캐싱
      return cache.addAll(ASSETS).catch(err => {
        console.warn('캐시 추가 중 에러 발생 (아이콘 등이 생성되기 전일 수 있습니다):', err);
      });
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
});
