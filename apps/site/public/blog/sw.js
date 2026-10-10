// The old Gatsby site registered a service worker (gatsby-plugin-offline) here, which would
// serve its cache forever. This one unregisters itself and reloads open tabs from the network.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", () => {
  self.registration
    .unregister()
    .then(() => self.clients.matchAll())
    .then(clients => clients.forEach(client => client.navigate(client.url)))
})
