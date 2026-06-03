/*
 * Polytical service worker — v2.
 *
 * Online-only by design: Neon Postgres is the sole source of truth, so this SW
 * does NOT cache pages or intercept fetches. Having no fetch listener also
 * sidesteps WebKit bug #219650 (an active SW calling respondWith can drop
 * SameSite=Lax cookies during redirects — which would break Better Auth on iOS).
 *
 * Its job is: take control fast, and be ready to receive web-push notifications
 * (market closing, a resolved win, etc.) once VAPID is wired server-side.
 */
const SW_VERSION = "v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Claim open clients + drop any stale caches from older SW versions.
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))),
      ),
    ]),
  );
});

// --- Web push (no-op until the server sends pushes via VAPID) ---
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "פוליטיקל", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "פוליטיקל";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "he",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Endpoints rotate; re-subscribe and re-register so push rows don't go stale.
// event.oldSubscription.options carries the original applicationServerKey, so
// the SW needs no VAPID key of its own.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        }),
      )
      .catch(() => {}),
  );
});

// Focus an existing window if one is open, else open the target URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          // Await the navigation before focusing so the window lands on the
          // target URL and a navigate rejection can't go unhandled.
          return client.navigate(url).then(() => client.focus()).catch(() => client.focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
