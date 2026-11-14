// Lets a video play while it is still arriving: the player asks for bytes here, and this answers as soon as they are saved on this phone.
const PART = 1 << 19, MOST = 8, WAIT_MS = 120000;
// The app opens from a copy kept on this phone (13 Nov: every open used to download the whole app again, twice).
// The only question asked on each open is a 20-byte "which version is newest?"; a newer one is fetched once, checked, kept, and the open app told.
const SHELL = 'loveline-shell-1', LIBS = new Set(['mqtt.min.js', 'hls.light.min.js', 'rapier2d.mjs', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']);
const here = p => new URL(p, self.registration.scope).href;
const keptV = async () => { const c = await caches.open(SHELL), r = await c.match(here('__v')); return r ? r.text() : ''; };
// Xed 14 Nov: the app's big block of code is kept as its own file on this phone. The browser then keeps its ready-to-run form, so opening skips that work.
const APP_JS = /^app-v-[\d-]+\.js$/;
function split(t, v) {
  const all = [...t.matchAll(/<script>([\s\S]*?)<\/script>/g)], m = all[all.length - 1];
  return m ? { html: t.slice(0, m.index) + `<script src="app-${v}.js"></script>` + t.slice(m.index + m[0].length), js: m[1] } : null;
}
let pulling = null;
function shellPull(want) {   // fetch the newest app page; keep it only if it is complete (and is version `want`, when one is named)
  return pulling = pulling || (async () => {
    try {
      const r = await fetch(here('index.html') + '?nc=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return '';
      const t = await r.text(), v = (t.match(/const APP_V = '(v-[\d-]+)'/) || [])[1];
      if (!v || !t.includes('</html>') || (want && v !== want)) return '';
      const c = await caches.open(SHELL), s = split(t, v);
      if (s) await c.put(here(`app-${v}.js`), new Response(s.js, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } }));   // the code first, then the page that asks for it
      await c.put(here('__app'), new Response(s ? s.html : t, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })); await c.put(here('__v'), new Response(v));
      for (const req of await c.keys()) { const n = new URL(req.url).pathname.split('/').pop(); if (APP_JS.test(n) && n !== `app-${v}.js`) c.delete(req); }
      for (const req of await c.keys()) { const n = new URL(req.url).pathname.split('/').pop(); if (LIBS.has(n)) fetch(req.url, { cache: 'no-cache' }).then(x => x.ok && c.put(req.url, x)).catch(() => {}); }   // the helper files are re-checked with each new version
      return v;
    } catch { return ''; } finally { pulling = null; }
  })();
}
async function shellCheck() {
  const r = await fetch(here('v.txt') + '?nc=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
  const v = (await r.text()).trim(), have = await keptV(), c = await caches.open(SHELL), at = await c.match(here('__at')), last = at ? +(await at.text()) : 0;
  let got = '';
  if (/^v-[\d-]+$/.test(v) && v !== have) got = await shellPull(v);
  else if (Date.now() - last > 6 * 3600e3) {   // safety net: every 6 hours the whole page is compared too, in case the small version note was ever published wrong
    await c.put(here('__at'), new Response(String(Date.now()))); const n = await shellPull(); if (n && n !== have) got = n;
  }
  if (!got) return;
  for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ t: 'newer', v: got });
}
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(shellPull().catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
let testUntil = 0;   // her own test alert must show even while Loveline is open
self.addEventListener('message', e => {
  if (e.data && e.data.t === 'testAlert') testUntil = Date.now() + 30000;
  if (e.data && e.data.t === 'shell' && e.ports[0]) e.waitUntil((async () => { const want = String(e.data.v || ''); e.ports[0].postMessage({ ok: (await keptV()) === want || (await shellPull(want)) === want }); })());   // the open app asks for a version before it reloads into it
});
self.addEventListener('push', e => e.waitUntil((async () => {   // Thinking of you, with the app closed. The message is fixed here, so no words travel through the helper.
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  let kind = ''; try { kind = e.data ? e.data.text() : ''; } catch {}   // q: an unread message, o: the other one is online, u: several unread messages; nothing: Thinking of you
  if (kind === 'q' || kind === 'o' || kind === 'u') {   // Xed 14 Nov. The words are fixed here; only the one letter travelled, sealed for this phone.
    if (open.some(c => c.visibilityState === 'visible') && !/iPhone|iPad/.test(navigator.userAgent)) return;   // the app is on screen and shows it itself
    await self.registration.showNotification('1+1=1', kind === 'u' ? { body: '💬 New messages', tag: 'msg', renotify: true, requireInteraction: true, vibrate: [200, 100, 200, 100, 400], icon: 'icon-192.png' }
      : { body: kind === 'q' ? '💬 New message' : '🟢 Online now', tag: kind === 'q' ? 'msg' : 'on', silent: true, icon: 'icon-192.png' });   // quiet: no sound
    return;
  }
  if (Date.now() > testUntil && open.some(c => c.visibilityState === 'visible') && !/iPhone|iPad/.test(navigator.userAgent)) { open.forEach(c => c.postMessage({ t: 'pushed' })); return; }   // the open page shows its own heart (and shows a test alert itself if this helper restarted and forgot the test); an iPhone must always be shown something
  await self.registration.showNotification('1+1=1', { body: '💗 Thinking of you', tag: 'buzz', renotify: true, requireInteraction: true, vibrate: [200, 100, 200, 100, 400], icon: 'icon-192.png' });
})()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : self.clients.openWindow('./')));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url), name = u.pathname.split('/').pop();
  if (e.request.mode === 'navigate') {   // open or refresh: the copy kept on this phone, at once; the server is only asked which version is newest
    if (u.origin !== location.origin || (name && name !== 'index.html')) return;
    e.respondWith((async () => {
      const hit = await (await caches.open(SHELL)).match(here('__app'));
      if (hit) { e.waitUntil(shellCheck().catch(() => {})); return hit; }
      e.waitUntil(shellPull().catch(() => {}));
      return fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request));
    })());
    return;
  }
  if (e.request.method === 'GET' && u.origin === location.origin && APP_JS.test(name)) {   // the app's code: from this phone; if it ever went missing, cut again from the server's page of the same version
    e.respondWith((async () => {
      const hit = await (await caches.open(SHELL)).match(u.href); if (hit) return hit;
      const t = await (await fetch(here('index.html') + '?nc=' + Date.now(), { cache: 'no-store' })).text(), v = (t.match(/const APP_V = '(v-[\d-]+)'/) || [])[1], s = name === `app-${v}.js` && split(t, v);
      return s ? new Response(s.js, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } }) : new Response('location.reload()', { headers: { 'Content-Type': 'text/javascript' } });
    })());
    return;
  }
  if (e.request.method === 'GET' && u.origin === location.origin && LIBS.has(name) && !u.search) {   // the helper files: from this phone once they are here
    e.respondWith((async () => { const c = await caches.open(SHELL), hit = await c.match(u.href); if (hit) return hit; const r = await fetch(e.request); if (r.ok) e.waitUntil(c.put(u.href, r.clone())); return r; })());
    return;
  }
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
