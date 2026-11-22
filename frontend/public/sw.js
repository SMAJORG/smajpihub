const SHELL_CACHE = "smaj-shell-v3";
const STATIC_CACHE = "smaj-static-v3";
const OFFLINE_SHELL = "/index.html";

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(cache => cache.add(OFFLINE_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => ![SHELL_CACHE, STATIC_CACHE].includes(key)).map(key => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(SHELL_CACHE).then(cache => cache.put(OFFLINE_SHELL, response.clone()));
          return response;
        })
        .catch(() => caches.match(OFFLINE_SHELL))
    );
    return;
  }

  // Always fetch current JavaScript and CSS first. Old cached chunks can be
  // removed by a new deployment and must never be served indefinitely.
  if (request.destination === "script" || request.destination === "style") {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          void caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(async () => (await caches.match(request)) || Response.error())
    );
    return;
  }

  if (["image", "font"].includes(request.destination)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })));
  }
});

self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "SMAJ PI HUB", {
      body: data.body || "You have a new notification.",
      icon: "/logo.png",
      badge: "/notification-badge.png",
      image: data.image || (data.icon && data.icon !== "/logo.png" ? data.icon : undefined),
      tag: data.tag,
      data: { url: data.url || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      const existing = windows.find(client => client.url.startsWith(self.location.origin));
      if (existing) return existing.navigate(target).then(() => existing.focus());
      return clients.openWindow(target);
    })
  );
});
