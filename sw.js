// Service worker unregistration script to force cache clearing
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll())
      .then(clients => {
        clients.forEach(client => {
          if (client.url) {
            client.navigate(client.url);
          }
        });
      })
  );
});
