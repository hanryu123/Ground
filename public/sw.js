self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "KBO TODAY";
  const body = data.body || "새 알림이 도착했어요.";
  const url = data.url || "/today";
  const icon = typeof data.icon === "string" && data.icon.length > 0 ? data.icon : "/icons/icon-192x192.png";
  const badge =
    typeof data.badge === "string" && data.badge.length > 0
      ? data.badge
      : "/icons/badge-monochrome.png";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
      tag: "ground-notification",
      renotify: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || "/today";
  let targetUrl = self.location.origin + "/today";
  try {
    const parsed = rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? new URL(rawUrl)
      : new URL(rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl, self.location.origin);
    if (parsed.origin === self.location.origin && parsed.pathname === "/") {
      parsed.pathname = "/today";
    }
    targetUrl = parsed.toString();
  } catch {
    targetUrl = self.location.origin + "/today";
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const match = clients.find((c) => {
        try {
          return new URL(c.url).origin === new URL(targetUrl).origin;
        } catch {
          return false;
        }
      });
      if (match) {
        match.navigate(targetUrl);
        return match.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
