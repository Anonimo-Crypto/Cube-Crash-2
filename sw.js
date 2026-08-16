/* Cube Crash SW — offline completo + Range audio */
const CACHE_NAME = 'cube-crash-offline-v1.13.4';

const PRECACHE = [
  './',
  './index.html',
  './main.js',
  './style.css',
  './manifest.json',
  './version.js',
  './192.png',
  './512.png',
  './data/images/coin.png',
  './data/images/ai-crash.png',
  './data/sounds/achievement.mp3',
  './data/sounds/break.mp3',
  './data/sounds/cash.mp3',
  './data/sounds/click.mp3',
  './data/sounds/levelup.mp3',
  './data/sounds/music.mp3',
  './data/sounds/reward.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of PRECACHE) {
      try {
        await cache.add(url);
      } catch (e) {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res && res.ok) await cache.put(url, res.clone());
        } catch (_) {}
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function matchCache(request) {
  const cache = await caches.open(CACHE_NAME);
  let res = await cache.match(request);
  if (res) return res;
  res = await cache.match(request, { ignoreSearch: true, ignoreMethod: true });
  if (res) return res;
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+/g, '/');
    const file = path.split('/').pop();
    const candidates = [
      path,
      '.' + path,
      './' + path.replace(/^\//, ''),
      file,
      './' + file,
      './data/sounds/' + file,
      './data/images/' + file
    ];
    for (const c of candidates) {
      res = await cache.match(c);
      if (res) return res;
    }
  } catch (_) {}
  return null;
}

async function responseFromCacheWithRange(request, cached) {
  const range = request.headers.get('range');
  if (!range) return cached;
  const blob = await cached.blob();
  const size = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return cached;
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? parseInt(m[2], 10) : size - 1;
  const chunk = blob.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(chunk.size),
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000'
    }
  });
}

function isVersionRequest(url) {
  return /version\.js(\?|$)/.test(url.pathname + (url.search || ''));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // version.js: network-first (para botón Actualizar), fallback cache
  if (isVersionRequest(url)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res && res.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('./version.js', res.clone()).catch(() => {});
          return res;
        }
      } catch (_) {}
      return (await matchCache(req)) || (await matchCache('./version.js')) || Response.error();
    })());
    return;
  }

  // Resto: cache-first (offline total)
  event.respondWith((async () => {
    const cached = await matchCache(req);
    if (cached) {
      if (req.headers.get('range')) {
        try {
          return await responseFromCacheWithRange(req, cached);
        } catch (e) {
          return cached;
        }
      }
      return cached;
    }

    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
      }
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        return (await matchCache('./index.html')) || (await matchCache('/index.html')) || Response.error();
      }
      return Response.error();
    }
  })());
});

// Mensaje opcional desde la página: parar/limpiar
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});
