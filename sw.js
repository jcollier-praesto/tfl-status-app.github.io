const CACHE_NAME = 'tfl-commuter-v3';
const APP_SHELL = ['./', './index.html', './app.css', './app.js', './app-utils.mjs', './app-data.mjs', './manifest.webmanifest', './icon.svg'];
const EXTERNAL_ASSETS = [
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

function exposeTfLCacheHeaders(headers) {
    const exposedHeaders = headers.get('Access-Control-Expose-Headers') || '';
    headers.set('Access-Control-Expose-Headers', [
        exposedHeaders,
        'X-Tfl-Offline',
        'X-Tfl-Cached-At'
    ].filter(Boolean).join(', '));
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(async () => {
                await Promise.all(EXTERNAL_ASSETS.map(async url => {
                    const request = new Request(url, { mode: 'no-cors' });
                    try {
                        const response = await fetch(request);
                        if (response.ok || response.type === 'opaque') {
                            await caches.open(CACHE_NAME).then(cache => cache.put(request, response));
                        }
                    } catch (error) {
                        console.warn('Unable to pre-cache optional UI asset:', url, error);
                    }
                }));
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key !== CACHE_NAME && (key.startsWith('tfl-commuter-') || key === 'tfl-pwa-v2'))
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    if (event.request.method !== 'GET') return;

    if (requestUrl.origin === self.location.origin) {
        event.respondWith(
            fetch(event.request)
                .then(async response => {
                    if (response.ok) {
                        try {
                            await caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                        } catch (error) {
                            console.error('Unable to cache app asset:', event.request.url, error);
                        }
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached) return cached;
                    return event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error();
                })
        );
        return;
    }

    if (requestUrl.hostname === 'api.tfl.gov.uk') {
        event.respondWith(
            fetch(event.request)
                .then(async response => {
                    if (response.ok) {
                        const body = await response.clone().arrayBuffer();
                        const headers = new Headers(response.headers);
                        headers.set('X-Tfl-Cached-At', String(Date.now()));
                        exposeTfLCacheHeaders(headers);
                        try {
                            await caches.open(CACHE_NAME).then(cache => cache.put(event.request, new Response(body, {
                                status: response.status,
                                statusText: response.statusText,
                                headers
                            })));
                        } catch (error) {
                            console.error('Unable to cache TfL response:', event.request.url, error);
                        }
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached && !requestUrl.pathname.endsWith('/Arrivals')) {
                        const headers = new Headers(cached.headers);
                        headers.set('X-Tfl-Offline', 'true');
                        exposeTfLCacheHeaders(headers);
                        return new Response(cached.body, {
                            status: cached.status,
                            statusText: cached.statusText,
                            headers
                        });
                    }
                    return new Response(
                        JSON.stringify({ error: 'TfL is unavailable and no cached response exists.' }),
                        { status: 503, headers: { 'Content-Type': 'application/json' } }
                    );
                })
        );
    }

    if ([
        'cdn.tailwindcss.com',
        'cdnjs.cloudflare.com',
        'fonts.googleapis.com',
        'fonts.gstatic.com'
    ].includes(requestUrl.hostname)) {
        event.respondWith(
            fetch(event.request)
            .then(async response => {
                    if (response.ok || response.type === 'opaque') {
                    try {
                        await caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                    } catch (error) {
                        console.error('Unable to cache external UI asset:', event.request.url, error);
                    }
                }
                    return response;
                })
                .catch(async () => (await caches.match(event.request)) || Response.error())
        );
    }
});
