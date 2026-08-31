// Self-destroying service worker. The old Gatsby site registered a service
// worker (gatsby-plugin-offline) at this path; returning visitors would keep
// getting the cached Gatsby site forever without this. It unregisters itself
// and reloads any open tabs so they fetch the new site from the network.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", () => {
  self.registration
    .unregister()
    .then(() => self.clients.matchAll())
    .then(clients => clients.forEach(client => client.navigate(client.url)))
})
