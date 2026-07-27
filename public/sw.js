// Minimal service worker: enables installability and handles incoming
// web-push events. Wakes the browser and shows a notification even if the
// tab is closed — see plan §6. iOS Safari needs 16.4+ and home-screen install.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title ?? "Crade";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body,
      icon: data.icon,
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});
