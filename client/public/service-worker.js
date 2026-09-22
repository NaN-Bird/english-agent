/* ===== SERVICE WORKER для English Practice ===== */

const CACHE_NAME = 'english-practice-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/apple-touch-icon.png',
];

// Install
self.addEventListener('install', (event) => {
    console.log('SW: Встановлення...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.all(
                urlsToCache.map((url) =>
                    cache.add(url).catch((err) => console.warn('SW: не закешовано', url, err))
                )
            );
        })
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
    console.log('SW: Активація...');
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null))
            )
        )
    );
    self.clients.claim();
});

// Fetch
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Тільки GET
    if (request.method !== 'GET') return;

    // API — не кешуємо, тільки мережа
    if (request.url.includes('/api/')) {
        return;
    }

    // Навігація (SPA) — спочатку мережа, потім index.html з кешу
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // Решта — Network First, Cache Fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => caches.match(request).then((r) => r || Response.error()))
    );
});
