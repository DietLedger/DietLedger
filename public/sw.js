// Retirement update for installations which previously registered /sw.js.
// Never intercept requests or persist private responses.
let retirement = Promise.resolve();
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  retirement = (async () => {
    // Replace old controllers in every open tab before unregistering. Existing
    // tabs keep this inert worker, not the old private-response cache handler.
    await self.clients.claim();
    await caches.delete('dietledger-v1');
    await self.registration.unregister();
  })();
  event.waitUntil(retirement);
});
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'DIETLEDGER_RETIRE') return;
  event.waitUntil((async () => {
    await retirement;
    await caches.delete('dietledger-v1');
    event.ports[0]?.postMessage({ type: 'DIETLEDGER_RETIRED' });
  })());
});
