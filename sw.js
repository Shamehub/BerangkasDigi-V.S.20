self.addEventListener('install', (e) => { 
  self.skipWaiting(); 
});

self.addEventListener('activate', (e) => { 
  return self.clients.claim(); 
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Tangkap request kiriman file dari menu Share Android
  if (e.request.method === 'POST' && url.pathname.endsWith('index.html')) {
    e.respondWith((async () => {
      const formData = await e.request.formData();
      const files = formData.getAll('shared_files');
      
      // Kirim data file ke jendela aplikasi yang sedang terbuka
      const client = await self.clients.get(e.resultingClientId || e.clientId);
      if (client) {
        client.postMessage({
          action: 'LOAD_SHARED_FILES',
          files: files
        });
      }

      return Response.redirect('./index.html', 303);
    })());
    return;
  }

  // Jalankan fetch biasa untuk request lainnya
  e.respondWith(fetch(e.request));
});