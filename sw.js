self.addEventListener('install', (e) => { 
  self.skipWaiting(); 
});

self.addEventListener('activate', (e) => { 
  return self.clients.claim(); 
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Jika menerima kiriman file dari tombol Share
  if (e.request.method === 'POST' && url.searchParams.has('action')) {
    e.respondWith((async () => {
      try {
        const formData = await e.request.formData();
        const files = formData.getAll('shared_files');

        if (files && files.length > 0) {
          const cache = await caches.open('shared-files-cache');
          // Clear cache lama
          const keys = await cache.keys();
          for (const key of keys) {
            await cache.delete(key);
          }
          
          // Simpan file baru ke cache
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const response = new Response(file, {
              headers: {
                'content-type': file.type,
                'x-file-name': encodeURIComponent(file.name)
              }
            });
            await cache.put(`/shared-file-${i}`, response);
          }
        }
      } catch (err) {
        console.error('Gagal menyimpan file dari Share Target:', err);
      }

      // Redirect ke index.html dengan parameter share=true
      return Response.redirect('./index.html?share=true', 303);
    })());
    return;
  }

  e.respondWith(fetch(e.request));
});