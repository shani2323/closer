// Lets a video play while it is still arriving: the player asks for bytes here, and this answers as soon as they are saved on this phone.
const PART = 1 << 19, MOST = 8, WAIT_MS = 120000;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
let testUntil = 0;   // her own test alert must show even while Loveline is open
self.addEventListener('message', e => { if (e.data && e.data.t === 'testAlert') testUntil = Date.now() + 30000; });
self.addEventListener('push', e => e.waitUntil((async () => {   // Thinking of you, with the app closed. The message is fixed here, so no words travel through the helper.
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (Date.now() > testUntil && open.some(c => c.visibilityState === 'visible') && !/iPhone|iPad/.test(navigator.userAgent)) { open.forEach(c => c.postMessage({ t: 'pushed' })); return; }   // the open page shows its own heart (and shows a test alert itself if this helper restarted and forgot the test); an iPhone must always be shown something
  await self.registration.showNotification('Loveline', { body: '💗 Thinking of you', tag: 'buzz', renotify: true, requireInteraction: true, vibrate: [200, 100, 200, 100, 400], icon: 'icon-192.png' });
})()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : self.clients.openWindow('./')));
});
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request))); return; }   // every open or refresh loads the newest app from the server; the saved copy only when offline
  const m = new URL(e.request.url).pathname.match(/\/stream\/([\w-]+)\/([\w-]{12})$/);
  if (m && e.request.mode !== 'navigate') e.respondWith(serve(e.request, m[1], m[2]));
});
const openDb = room => new Promise((res, rej) => {
  const r = indexedDB.open('closer-videos:' + room);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const get = (db, store, key) => new Promise((res, rej) => {
  const r = db.transaction(store).objectStore(store).get(key);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const reply = (blob, start, end, v) => new Response(blob, { status: 206, headers: {
  'Content-Type': v.type === 'video/quicktime' ? 'video/mp4' : v.type, 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${v.size}` } });
async function serve(req, room, id) {
  const db = await openDb(room);
  try {
    const v = await get(db, 'meta', id);
    if (!v) return new Response(null, { status: 404 });
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') || '');
    const start = m ? +m[1] : 0, last = Math.min(m && m[2] ? +m[2] : v.size - 1, v.size - 1);
    if (start >= v.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${v.size}` } });
    const first = Math.floor(start / PART), end = Date.now() + WAIT_MS;
    let told = 0;
    while (Date.now() < end && !req.signal.aborted) {
      const whole = await get(db, 'blobs', id);
      if (whole) return reply(whole.slice(start, last + 1), start, last, v);
      const have = [];
      for (let i = first; i < first + MOST; i++) { const p = await get(db, 'parts', [id, i]); if (!p) break; have.push(p); }
      if (have.length) {
        const blob = new Blob(have), at = first * PART, stop = Math.min(last, at + blob.size - 1);
        if (stop >= start) return reply(blob.slice(start - at, stop + 1 - at), start, stop, v);
      }
      if (Date.now() - told > 3000) {   // not here yet: ask the page to fetch this part next
        told = Date.now();
        for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ need: id, at: start });
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return new Response(null, { status: 503 });
  } finally { db.close(); }
}
