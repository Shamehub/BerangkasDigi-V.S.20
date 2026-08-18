// Ganti nilai ini dengan Web App URL hasil Deploy
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwN6BhR6SJcZCAaLn0rKnJdnskwgJTUu6avHMyoHZHEp_DiH56RJeK2VZb0MWNp6p7g/exec';[cite: 5]

let deferredPrompt;[cite: 5]

const App = {
  vaults: [],[cite: 5]
  activeVault: null,[cite: 5]
  folderStack: [],[cite: 5]
  currentFolderId: null,[cite: 5]
  currentRole: 'PUBLIC',[cite: 5]
  currentItems: [],[cite: 5]
  photoGallery: [],[cite: 5]
  currentPhotoIndex: 0,[cite: 5]
  currentZoom: 1,[cite: 5]
  zoomTranslateX: 0,[cite: 5]
  zoomTranslateY: 0,[cite: 5]

  pinBuffer: '',[cite: 5]
  modalPinInst: null,[cite: 5]
  modalAdminInst: null,[cite: 5]
  modalUploadInst: null,[cite: 5]
  modalFolderInst: null,[cite: 5]
  modalVaultInst: null,[cite: 5]
  modalVaultSettingsInst: null,[cite: 5]
  modalPreviewInst: null,[cite: 5]

  init: function() {
    this.modalPinInst = new bootstrap.Modal(document.getElementById('modalPin'));[cite: 5]
    this.modalAdminInst = new bootstrap.Modal(document.getElementById('modalAdmin'));[cite: 5]
    this.modalUploadInst = new bootstrap.Modal(document.getElementById('modalUpload'));[cite: 5]
    this.modalFolderInst = new bootstrap.Modal(document.getElementById('modalCreateFolder'));[cite: 5]
    this.modalVaultInst = new bootstrap.Modal(document.getElementById('modalCreateVault'));[cite: 5]
    this.modalVaultSettingsInst = new bootstrap.Modal(document.getElementById('modalVaultSettings'));[cite: 5]
    
    const previewEl = document.getElementById('modalPreview');[cite: 5]
    if (previewEl) {
      this.modalPreviewInst = new bootstrap.Modal(previewEl);[cite: 5]
    }

    document.addEventListener('keydown', (e) => {
      const previewModal = document.getElementById('modalPreview');[cite: 5]
      if (previewModal && previewModal.classList.contains('show') && this.photoGallery.length > 0) {[cite: 5]
        if (e.key === 'ArrowRight') this.nextPhoto();[cite: 5]
        if (e.key === 'ArrowLeft') this.prevPhoto();[cite: 5]
      }
    });

    this.setupPWA();[cite: 5]
    this.fetchInitialData();[cite: 5]
  },

  handleIncomingShare: async function() {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('share')) return;

    // Bersihkan parameter URL agar tidak memicu ulang saat refresh
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      if (!('caches' in window)) return;
      
      const cache = await caches.open('shared-files-cache');
      const keys = await cache.keys();
      
      if (keys.length === 0) return;

      const sharedFiles = [];
      for (const key of keys) {
        const res = await cache.get(key);
        const blob = await res.blob();
        const fileName = decodeURIComponent(res.headers.get('x-file-name') || 'file_shared');
        const file = new File([blob], fileName, { type: blob.type });
        sharedFiles.push(file);
      }

      // Bersihkan cache setelah dibaca
      for (const key of keys) {
        await cache.delete(key);
      }

      // Tampilkan dialog pilihan berangkas/folder tujuan
      this.promptSelectVaultForShare(sharedFiles);

    } catch (err) {
      console.error('Error membaca berkas kiriman share:', err);
    }
  },

  promptSelectVaultForShare: function(files) {
    if (!this.vaults || this.vaults.length === 0) {
      Swal.fire('Perhatian', 'Gagal memuat daftar berangkas.', 'warning');
      return;
    }

    let optionsHtml = '';
    this.vaults.forEach(vault => {
      optionsHtml += `<option value="${vault.id}">${vault.nama}</option>`;
    });

    Swal.fire({
      title: 'Simpan File ke Berangkas',
      html: `
        <p class="text-muted small mb-3">Menerima <b>${files.length} file</b> dari aplikasi lain.</p>
        <div class="text-start mb-3">
          <label class="form-label font-bold small text-light">Pilih Berangkas Tujuan:</label>
          <select id="swal-share-vault-select" class="form-select bg-dark text-white border-secondary">
            ${optionsHtml}
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Lanjutkan Upload',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#d4af37',
      preConfirm: () => {
        const selectedVaultId = document.getElementById('swal-share-vault-select').value;
        return selectedVaultId;
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const vaultId = result.value;
        const targetVault = this.vaults.find(v => v.id === vaultId);
        
        if (targetVault) {
          this.activeVault = targetVault;
          this.folderStack = [{ id: targetVault.folderId, name: targetVault.nama }];
          this.currentFolderId = targetVault.folderId;
          this.renderVaultContent();
          this.openUploadModalWithFiles(files);
        }
      }
    });
  },

  openUploadModalWithFiles: function(files) {
    const fileInput = document.getElementById('file-input');
    const typeFileRadio = document.getElementById('uploadTypeFile');
    
    if (typeFileRadio) {
      typeFileRadio.checked = true;
      this.toggleUploadMode('file');
    }

    if (fileInput) {
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (this.modalUploadInst) {
      this.modalUploadInst.show();
    }
  },

  handleManualRefresh: function() {
    console.log("Tombol refresh diklik!");[cite: 5]

    const btnIcon = document.querySelector('#btn-refresh-manual i');[cite: 5]
    if (btnIcon) btnIcon.classList.add('fa-spin');[cite: 5]

    const self = App;[cite: 5]

    try {
      if (self.currentFolderId) {[cite: 5]
        const targetEl = document.getElementById('file-list-target');[cite: 5]
        if (targetEl) {
          targetEl.innerHTML = '<div class="text-center py-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i> Memuat ulang berkas...</div>';[cite: 5]
        }
        self.loadFolderItems(self.currentFolderId);[cite: 5]
      } else if (self.currentRole === 'ADMIN') {[cite: 5]
        self.refreshAdminDashboard();[cite: 5]
      } else {
        self.fetchInitialData();[cite: 5]
      }
    } catch (err) {
      console.error("Error Refresh:", err);[cite: 5]
      if (typeof Swal !== 'undefined') {[cite: 5]
        Swal.fire('Error', 'Gagal memuat ulang: ' + err.message, 'error');[cite: 5]
      }
    } finally {
      setTimeout(() => {
        if (btnIcon) btnIcon.classList.remove('fa-spin');[cite: 5]
      }, 1000);
    }
  },

  setupPWA: function() {
    if ('serviceWorker' in navigator) {[cite: 5]
      navigator.serviceWorker.register('sw.js')[cite: 5]
        .catch(err => console.log('SW Registration failed: ', err));[cite: 5]
    }

    window.addEventListener('beforeinstallprompt', (e) => {[cite: 5]
      e.preventDefault();[cite: 5]
      deferredPrompt = e;[cite: 5]
      const installBtn = document.getElementById('btn-install-pwa');[cite: 5]
      if (installBtn) installBtn.classList.remove('d-none');[cite: 5]
    });
  },

  installPWA: function() {
    if (deferredPrompt) {[cite: 5]
      deferredPrompt.prompt();[cite: 5]
      deferredPrompt.userChoice.then((choiceResult) => {[cite: 5]
        if (choiceResult.outcome === 'accepted') {[cite: 5]
          const installBtn = document.getElementById('btn-install-pwa');[cite: 5]
          if (installBtn) installBtn.classList.add('d-none');[cite: 5]
        }
        deferredPrompt = null;[cite: 5]
      });
    }
  },

  toggleSidebar: function() {
    const sidebar = document.getElementById('sidebar');[cite: 5]
    const overlay = document.getElementById('sidebar-overlay');[cite: 5]
    sidebar.classList.toggle('show-sidebar');[cite: 5]
    overlay.classList.toggle('active');[cite: 5]
  },

  closeSidebarMobile: function() {
    if (window.innerWidth <= 768) {[cite: 5]
      const sidebar = document.getElementById('sidebar');[cite: 5]
      const overlay = document.getElementById('sidebar-overlay');[cite: 5]
      if (sidebar) sidebar.classList.remove('show-sidebar');[cite: 5]
      if (overlay) overlay.classList.remove('active');[cite: 5]
    }
  },

  serverCall: function(action, payload = {}) {
    return fetch(APPS_SCRIPT_URL, {[cite: 5]
      method: 'POST',[cite: 5]
      mode: 'cors',[cite: 5]
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },[cite: 5]
      body: JSON.stringify({ action: action, payload: payload })[cite: 5]
    })
    .then(response => response.json())[cite: 5]
    .catch(err => {
      console.error("Fetch API Error:", err);[cite: 5]
      throw err;[cite: 5]
    });
  },

  fetchInitialData: function() {
    Swal.fire({[cite: 5]
      title: 'Menghubungkan Berangkas...',[cite: 5]
      text: 'Memuat database dan mengamankan enkripsi',[cite: 5]
      allowOutsideClick: false,[cite: 5]
      didOpen: () => Swal.showLoading()[cite: 5]
    });

    this.serverCall('GET_INITIAL_DATA')[cite: 5]
      .then(res => {
        Swal.close();[cite: 5]
        if (res.success) {[cite: 5]
          this.vaults = res.vaults;[cite: 5]
          this.renderSidebar();[cite: 5]
          this.renderHome();[cite: 5]

          // Cek kiriman berkas dari menu Share Android setelah data awal dimuat
          this.handleIncomingShare();
        } else {
          Swal.fire('Error Database', res.message || 'Gagal membaca database', 'error');[cite: 5]
        }
      })
      .catch(err => {
        Swal.close();[cite: 5]
        Swal.fire('Gagal Koneksi', err.toString(), 'error');[cite: 5]
      });
  },

  renderSidebar: function() {
    let html = '';[cite: 5]
    this.vaults.forEach(v => {[cite: 5]
      const iconName = v.icon || 'fa-vault';[cite: 5]
      html += '<button class="nav-item-btn" id="nav-btn-' + v.id + '" onclick="App.openPinModal(\'' + v.id + '\')">' +[cite: 5]
              '<i class="fas ' + iconName + ' text-warning"></i>' +[cite: 5]
              '<span class="text-truncate">' + v.nama + '</span>' +[cite: 5]
              '</button>';[cite: 5]
    });
    document.getElementById('sidebar-vault-links').innerHTML = html;[cite: 5]
  },

  renderHome: function() {
    this.activeVault = null;[cite: 5]
    this.currentFolderId = null;[cite: 5]
    this.folderStack = [];[cite: 5]

    document.getElementById('header-title').innerHTML = 
      '<div class="top-navbar-title-wrap">' +[cite: 5]
        '<i class="fas fa-shield-halved text-warning fa-lg"></i>' +[cite: 5]
        '<span class="fw-bold fs-5 text-dark text-truncate">DASBOR BERANGKAS PUBLIK</span>' +[cite: 5]
      '</div>';[cite: 5]
    
    let html = '<div class="row g-4 mb-4 p-3 p-md-4">';[cite: 5]
    this.vaults.forEach(v => {[cite: 5]
      const badgeHtml = !v.hasPin[cite: 5]
        ? '<span class="badge bg-success text-light">Publik (Bebas Akses)</span>'[cite: 5]
        : '<span class="badge bg-dark border border-secondary text-warning">Terkunci (PIN 6 Digit)</span>';[cite: 5]
      const iconName = v.icon || 'fa-vault';[cite: 5]

      html += '<div class="col-md-6 col-lg-3">' +[cite: 5]
              '<div class="vault-card" onclick="App.openPinModal(\'' + v.id + '\')">' +[cite: 5]
              '<div class="icon-box"><i class="fas ' + iconName + '"></i></div>' +[cite: 5]
              '<h6 class="fw-bold text-dark mb-2">' + v.nama + '</h6>' +[cite: 5]
              badgeHtml +[cite: 5]
              '</div></div>';[cite: 5]
    });

    html += '</div>' +[cite: 5]
            '<div class="mx-3 mx-md-8 p-9 text-center dark-vault rounded-4 border border-secondary">' +[cite: 5]
            '<i class="fas fa-lock-keyhole fa-4x text-warning mb-3"></i>' +[cite: 5]
            '<h4 class="fw-bold text-dark">Sistem Keamanan Berangkas Terenkripsi</h4>' +[cite: 5]
            '<p class="text-muted">Pilih berangkas dari sidebar atau kartu di atas untuk membuka dokumen aman Anda.</p>' +[cite: 5]
            '</div>';[cite: 5]

    document.getElementById('view-container').innerHTML = html;[cite: 5]
  },

  openPinModal: function(vaultId) {
    this.closeSidebarMobile();[cite: 5]
    this.activeVault = this.vaults.find(v => v.id === vaultId);[cite: 5]
    if (!this.activeVault) return;[cite: 5]
    
    if (!this.activeVault.hasPin) {[cite: 5]
      this.folderStack = [{ id: this.activeVault.folderId, name: this.activeVault.nama }];[cite: 5]
      this.currentFolderId = this.activeVault.folderId;[cite: 5]
      this.renderVaultContent();[cite: 5]
      return;[cite: 5]
    }

    this.pinBuffer = '';[cite: 5]
    const pinInput = document.getElementById('input-pin-vault');[cite: 5]
    if (pinInput) pinInput.value = '';[cite: 5]
    
    const pinTitle = document.getElementById('pin-modal-title');[cite: 5]
    if (pinTitle) pinTitle.innerText = this.activeVault.nama;[cite: 5]
    
    this.modalPinInst.show();[cite: 5]
  },

  pressPin: function(num) {
    if (this.pinBuffer.length < 6) {[cite: 5]
      this.pinBuffer += num;[cite: 5]
      const pinInput = document.getElementById('input-pin-vault');[cite: 5]
      if (pinInput) pinInput.value = this.pinBuffer;[cite: 5]
    }
  },

  clearPin: function() {
    this.pinBuffer = '';[cite: 5]
    const pinInput = document.getElementById('input-pin-vault');[cite: 5]
    if (pinInput) pinInput.value = '';[cite: 5]
  },

  submitPin: function() {
    const directInput = document.getElementById('input-pin-vault');[cite: 5]
    if (directInput && directInput.value) {[cite: 5]
      this.pinBuffer = directInput.value;[cite: 5]
    }

    if (this.pinBuffer.length !== 6) {[cite: 5]
      Swal.fire('Peringatan', 'Kode PIN harus 6 digit angka!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    Swal.showLoading();[cite: 5]
    this.serverCall('VERIFY_PIN', { vaultId: this.activeVault.id, pin: this.pinBuffer })[cite: 5]
      .then(res => {
        if (res.success) {[cite: 5]
          this.modalPinInst.hide();[cite: 5]
          Swal.fire('Akses Diterima', 'Berangkas terbuka', 'success');[cite: 5]
          this.activeVault = res.vault;[cite: 5]
          this.folderStack = [{ id: res.vault.folderId, name: res.vault.nama }];[cite: 5]
          this.currentFolderId = res.vault.folderId;[cite: 5]
          this.renderVaultContent();[cite: 5]
        } else {
          Swal.fire('Akses Ditolak', res.message, 'error');[cite: 5]
          this.clearPin();[cite: 5]
        }
      });
  },

  renderVaultContent: function() {
    const currentFolder = this.folderStack[this.folderStack.length - 1];[cite: 5]

    let backBtnHtml = this.folderStack.length > 1[cite: 5]
      ? '<button class="btn btn-outline-metal" onclick="App.navigateBack()"><i class="fas fa-arrow-left"></i> Kembali</button>'[cite: 5]
      : '<button class="btn btn-outline-metal" onclick="App.renderHome()"><i class="fas fa-arrow-left"></i> Utama</button>';[cite: 5]

    let settingsBtnHtml = this.folderStack.length === 1[cite: 5]
      ? '<button class="btn btn-outline-metal" onclick="App.openVaultSettingsModal()"><i class="fas fa-gear"></i> Pengaturan</button>'[cite: 5]
      : '';[cite: 5]

    const actionToolbar = 
      '<div class="vault-header-actions">' +[cite: 5]
         backBtnHtml + 
         settingsBtnHtml +
         '<button class="btn btn-outline-metal" onclick="App.openCreateFolderModal()"><i class="fas fa-folder-plus"></i> Tambah Folder</button>' +[cite: 5]
         '<button class="btn btn-gold" onclick="App.modalUploadInst.show()"><i class="fas fa-cloud-arrow-up"></i> Unggah File/Folder</button>' +[cite: 5]
      '</div>';[cite: 5]

    document.getElementById('header-title').innerHTML = 
      '<div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center w-100 gap-2 overflow-hidden">' +[cite: 5]
        '<div class="top-navbar-title-wrap text-truncate me-2">' +[cite: 5]
          '<i class="fas fa-folder-open text-warning fa-lg flex-shrink-0"></i>' +[cite: 5]
          '<span class="fw-bold fs-5 text-dark text-truncate">' + currentFolder.name + '</span>' +[cite: 5]
        '</div>' +[cite: 5]
        actionToolbar +
      '</div>';[cite: 5]

    let html = '<div class="p-3 p-md-4">' +[cite: 5]
                 '<div class="row mb-3">' +[cite: 5]
                   '<div class="col-12 col-md-6">' +[cite: 5]
                     '<div class="input-group">' +[cite: 5]
                       '<span class="input-group-text bg-dark border-secondary text-warning"><i class="fas fa-search"></i></span>' +[cite: 5]
                       '<input type="text" id="search-file-input" class="form-control bg-dark text-light border-secondary" placeholder="Cari file/folder..." onkeyup="App.filterFiles()">' +[cite: 5]
                     '</div>' +[cite: 5]
                   '</div>' +[cite: 5]
                 '</div>' +[cite: 5]
                 '<div class="dark-vault p-3 p-md-4 rounded-4">' +[cite: 5]
                   '<h6 class="fw-bold text-warning mb-3"><i class="fas fa-list me-2"></i>Daftar Berkas & Folder</h6>' +[cite: 5]
                   '<div id="file-list-target">' +[cite: 5]
                     '<div class="text-center py-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i> Memuat isi folder...</div>' +[cite: 5]
                   '</div>' +[cite: 5]
                 '</div>' +[cite: 5]
               '</div>';[cite: 5]

    document.getElementById('view-container').innerHTML = html;[cite: 5]
    this.loadFolderItems(currentFolder.id);[cite: 5]
  },

  loadFolderItems: function(folderId) {
    this.serverCall('GET_FILES_AND_FOLDERS', { folderId: folderId })[cite: 5]
      .then(res => {
        if (res.success) {[cite: 5]
          this.currentItems = res.items || [];[cite: 5]
          this.updatePhotoGallery();[cite: 5]
          this.renderTableItems(this.currentItems);[cite: 5]
        } else {
          document.getElementById('file-list-target').innerHTML = '<div class="text-center py-4 text-danger">Gagal memuat isi folder.</div>';[cite: 5]
        }
      });
  },

  updatePhotoGallery: function() {
    const isPhoto = (name) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name);[cite: 5]
    this.photoGallery = this.currentItems.filter(item => item.type === 'file' && isPhoto(item.name));[cite: 5]
  },

  filterFiles: function() {
    const searchInput = document.getElementById('search-file-input');[cite: 5]
    if (!searchInput) return;[cite: 5]
    
    const keyword = searchInput.value.toLowerCase().trim();[cite: 5]
    const filtered = this.currentItems.filter(item => item.name.toLowerCase().includes(keyword));[cite: 5]
    this.renderTableItems(filtered);[cite: 5]
  },

  escapeQuotes: function(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');[cite: 5]
  },

  renderTableItems: function(items) {
    if (!items || items.length === 0) {[cite: 5]
      document.getElementById('file-list-target').innerHTML = 
        '<div class="text-center py-5 text-muted"><i class="fas fa-folder-open fa-3x mb-3 text-secondary"></i><br>Tidak ada file atau folder yang ditemukan.</div>';[cite: 5]
      return;[cite: 5]
    }

    const isPhotoExt = (name) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name);[cite: 5]
    const isPdfExt = (name) => /\.pdf$/i.test(name);[cite: 5]
    const isDocExt = (name) => /\.(doc|docx)$/i.test(name);[cite: 5]
    const isXlsExt = (name) => /\.(xls|xlsx|csv)$/i.test(name);[cite: 5]

    let gridHtml = '<div class="file-grid-container">';[cite: 5]

    items.forEach(item => {[cite: 5]
      const isFolder = item.type === 'folder';[cite: 5]
      const isPhoto = !isFolder && isPhotoExt(item.name);[cite: 5]
      const safeName = this.escapeQuotes(item.name);[cite: 5]
      const tooltipText = `Nama: ${item.name}\nUkuran: ${item.size}\nDiperbarui: ${item.updated}`;[cite: 5]

      let previewContent = '';[cite: 5]
      if (isFolder) {[cite: 5]
        previewContent = '<i class="fas fa-folder text-warning"></i>';[cite: 5]
      } else if (isPhoto) {[cite: 5]
        const thumbUrl = 'https://drive.google.com/thumbnail?id=' + item.id + '&sz=w200';[cite: 5]
        previewContent = `<img src="${thumbUrl}" loading="lazy" alt="${safeName}" onerror="this.onerror=null; this.parentNode.innerHTML='<i class=\\'fas fa-file-image text-warning\\'></i>';"/>`;[cite: 5]
      } else if (isPdfExt(item.name)) {[cite: 5]
        previewContent = '<i class="fas fa-file-pdf text-danger"></i>';[cite: 5]
      } else if (isDocExt(item.name)) {[cite: 5]
        previewContent = '<i class="fas fa-file-word text-primary"></i>';[cite: 5]
      } else if (isXlsExt(item.name)) {[cite: 5]
        previewContent = '<i class="fas fa-file-excel text-success"></i>';[cite: 5]
      } else {
        previewContent = '<i class="fas fa-file-lines text-secondary"></i>';[cite: 5]
      }

      let clickAction = '';[cite: 5]
      if (isFolder) {[cite: 5]
        clickAction = `App.openSubFolder('${item.id}', '${safeName}')`;[cite: 5]
      } else if (isPhoto) {[cite: 5]
        clickAction = `App.openPhotoPreview('${item.id}')`;[cite: 5]
      } else {
        clickAction = `App.previewFile('${item.id}', '${safeName}')`;[cite: 5]
      }

      let downloadBtn = '';[cite: 5]
      if (!isFolder && item.downloadUrl) {[cite: 5]
        downloadBtn = `<a href="${item.downloadUrl}" target="_blank" class="btn btn-xs btn-outline-metal p-1" onclick="event.stopPropagation();" title="Download"><i class="fas fa-download fa-xs"></i></a>`;[cite: 5]
      }

      let actionButtons = `
        <button class="btn btn-xs btn-outline-metal p-1" onclick="event.stopPropagation(); App.renameItem('${item.id}', '${safeName}', ${isFolder})" title="Edit"><i class="fas fa-pen fa-xs"></i></button>
        ${downloadBtn}
        <button class="btn btn-xs btn-outline-danger p-1" onclick="event.stopPropagation(); App.deleteItem('${item.id}', ${isFolder})" title="Hapus"><i class="fas fa-trash fa-xs"></i></button>
      `;[cite: 5]

      gridHtml += `
        <div class="file-grid-item" onclick="${clickAction}" title="${tooltipText}">
          <div class="file-grid-actions">
            ${actionButtons}
          </div>
          <div class="file-grid-preview">
            ${previewContent}
          </div>
          <div class="file-grid-title" title="${item.name}">${item.name}</div>
        </div>
      `;[cite: 5]
    });

    gridHtml += '</div>';[cite: 5]
    document.getElementById('file-list-target').innerHTML = gridHtml;[cite: 5]
  },

  openPhotoPreview: function(fileId) {
    const index = this.photoGallery.findIndex(p => p.id === fileId);[cite: 5]
    if (index !== -1) {[cite: 5]
      this.currentPhotoIndex = index;[cite: 5]
      this.renderPhotoLightbox();[cite: 5]
    } else {
      this.previewFile(fileId, 'Foto Preview');[cite: 5]
    }
  },

  getModalBodyContainer: function(previewModalEl) {
    let modalBody = document.getElementById('preview-modal-body');[cite: 5]
    if (!modalBody) {[cite: 5]
      modalBody = previewModalEl.querySelector('.modal-body');[cite: 5]
    }
    return modalBody;[cite: 5]
  },

  initPhotoZoom: function() {
    const img = document.getElementById('lightbox-img-element');[cite: 5]
    if (!img) return;[cite: 5]

    this.currentZoom = 1;[cite: 5]
    this.zoomTranslateX = 0;[cite: 5]
    this.zoomTranslateY = 0;[cite: 5]

    const minZoom = 0.5;[cite: 5]
    const maxZoom = 4.0;[cite: 5]

    const applyTransform = () => {
      img.style.transform = `translate(${this.zoomTranslateX}px, ${this.zoomTranslateY}px) scale(${this.currentZoom})`;[cite: 5]
    };

    applyTransform();[cite: 5]
    img.style.transition = 'transform 0.05s ease-out';[cite: 5]
    img.style.transformOrigin = 'center center';[cite: 5]

    const container = img.parentElement;[cite: 5]
    if (!container) return;[cite: 5]

    container.onwheel = (e) => {[cite: 5]
      e.preventDefault();[cite: 5]
      const zoomSpeed = 0.15;[cite: 5]

      if (e.deltaY < 0) {[cite: 5]
        this.currentZoom = Math.min(maxZoom, this.currentZoom + zoomSpeed);[cite: 5]
      } else {
        this.currentZoom = Math.max(minZoom, this.currentZoom - zoomSpeed);[cite: 5]
      }

      if (this.currentZoom <= 1) {[cite: 5]
        this.zoomTranslateX = 0;[cite: 5]
        this.zoomTranslateY = 0;[cite: 5]
      }

      applyTransform();[cite: 5]
    };

    let isDragging = false;[cite: 5]
    let startX = 0;[cite: 5]
    let startY = 0;[cite: 5]

    img.onmousedown = (e) => {[cite: 5]
      if (this.currentZoom <= 1) return;[cite: 5]
      e.preventDefault();[cite: 5]
      isDragging = true;[cite: 5]
      startX = e.clientX - this.zoomTranslateX;[cite: 5]
      startY = e.clientY - this.zoomTranslateY;[cite: 5]
      img.style.cursor = 'grabbing';[cite: 5]
    };

    window.onmousemove = (e) => {[cite: 5]
      if (!isDragging) return;[cite: 5]
      e.preventDefault();[cite: 5]
      this.zoomTranslateX = e.clientX - startX;[cite: 5]
      this.zoomTranslateY = e.clientY - startY;[cite: 5]
      applyTransform();[cite: 5]
    };

    window.onmouseup = () => {[cite: 5]
      if (isDragging) {[cite: 5]
        isDragging = false;[cite: 5]
        img.style.cursor = 'grab';[cite: 5]
      }
    };

    let initialTouchDistance = 0;[cite: 5]
    let initialZoom = 1;[cite: 5]
    let touchStartX = 0;[cite: 5]
    let touchStartY = 0;[cite: 5]
    let isTouchPanning = false;[cite: 5]

    const getDistance = (touches) => {[cite: 5]
      const dx = touches[0].clientX - touches[1].clientX;[cite: 5]
      const dy = touches[0].clientY - touches[1].clientY;[cite: 5]
      return Math.sqrt(dx * dx + dy * dy);[cite: 5]
    };

    container.addEventListener('touchstart', (e) => {[cite: 5]
      if (e.touches.length === 2) {[cite: 5]
        e.preventDefault();[cite: 5]
        initialTouchDistance = getDistance(e.touches);[cite: 5]
        initialZoom = this.currentZoom;[cite: 5]
      } else if (e.touches.length === 1 && this.currentZoom > 1) {[cite: 5]
        isTouchPanning = true;[cite: 5]
        touchStartX = e.touches[0].clientX - this.zoomTranslateX;[cite: 5]
        touchStartY = e.touches[0].clientY - this.zoomTranslateY;[cite: 5]
      }
    }, { passive: false });[cite: 5]

    container.addEventListener('touchmove', (e) => {[cite: 5]
      if (e.touches.length === 2) {[cite: 5]
        e.preventDefault();[cite: 5]
        const currentDistance = getDistance(e.touches);[cite: 5]
        if (initialTouchDistance > 0) {[cite: 5]
          const scale = currentDistance / initialTouchDistance;[cite: 5]
          this.currentZoom = Math.min(maxZoom, Math.max(minZoom, initialZoom * scale));[cite: 5]
          
          if (this.currentZoom <= 1) {[cite: 5]
            this.zoomTranslateX = 0;[cite: 5]
            this.zoomTranslateY = 0;[cite: 5]
          }
          applyTransform();[cite: 5]
        }
      } else if (e.touches.length === 1 && isTouchPanning) {[cite: 5]
        e.preventDefault();[cite: 5]
        this.zoomTranslateX = e.touches[0].clientX - touchStartX;[cite: 5]
        this.zoomTranslateY = e.touches[0].clientY - touchStartY;[cite: 5]
        applyTransform();[cite: 5]
      }
    }, { passive: false });[cite: 5]

    container.addEventListener('touchend', (e) => {[cite: 5]
      if (e.touches.length < 2) {[cite: 5]
        initialTouchDistance = 0;[cite: 5]
      }
      if (e.touches.length === 0) {[cite: 5]
        isTouchPanning = false;[cite: 5]
      }
    });[cite: 5]
  },

  renderPhotoLightbox: function() {
    if (this.photoGallery.length === 0) return;[cite: 5]

    const photo = this.photoGallery[this.currentPhotoIndex];[cite: 5]
    const previewModalEl = document.getElementById('modalPreview');[cite: 5]
    if (!previewModalEl) {[cite: 5]
      window.open('https://drive.google.com/file/d/' + photo.id + '/view', '_blank');[cite: 5]
      return;[cite: 5]
    }

    const modalTitle = document.getElementById('preview-file-title');[cite: 5]
    if (modalTitle) {[cite: 5]
      modalTitle.innerText = photo.name + ' (' + (this.currentPhotoIndex + 1) + ' / ' + this.photoGallery.length + ')';[cite: 5]
    }

    const modalBody = this.getModalBodyContainer(previewModalEl);[cite: 5]
    const isGalleryDisabled = this.photoGallery.length <= 1 ? 'disabled' : '';[cite: 5]
    const fastUrl = 'https://drive.google.com/thumbnail?id=' + photo.id + '&sz=w800';[cite: 5]

    modalBody.innerHTML = '<div class="position-relative text-center d-flex align-items-center justify-content-center bg-black rounded-3 overflow-hidden" style="min-height: 300px; touch-action: none;">' +[cite: 5]
                          '<button class="btn btn-dark position-absolute start-0 top-50 translate-middle-y opacity-75 ms-2 rounded-circle" style="z-index: 10; width: 42px; height: 42px;" onclick="App.prevPhoto()" ' + isGalleryDisabled + '>' +[cite: 5]
                          '<i class="fas fa-chevron-left text-warning"></i></button>' +[cite: 5]
                          '<div id="lightbox-loader" class="position-absolute top-0 start-50 translate-middle-x mt-2 badge bg-dark text-warning border border-warning opacity-75" style="z-index:5;">' +[cite: 5]
                          '<i class="fas fa-spinner fa-spin me-1"></i>Memuat HD...</div>' +[cite: 5]
                          '<img id="lightbox-img-element" src="' + fastUrl + '" class="img-fluid rounded" style="max-height: 75vh; object-fit: contain; cursor: grab;" alt="' + this.escapeQuotes(photo.name) + '" />' +[cite: 5]
                          '<button class="btn btn-dark position-absolute end-0 top-50 translate-middle-y opacity-75 me-2 rounded-circle" style="z-index: 10; width: 42px; height: 42px;" onclick="App.nextPhoto()" ' + isGalleryDisabled + '>' +[cite: 5]
                          '<i class="fas fa-chevron-right text-warning"></i></button>' +[cite: 5]
                          '</div>';[cite: 5]

    if (this.modalPreviewInst) {[cite: 5]
      this.modalPreviewInst.show();[cite: 5]
    }

    this.initPhotoZoom();[cite: 5]

    this.serverCall('GET_IMAGE_BASE64', { fileId: photo.id })[cite: 5]
      .then(res => {
        const loader = document.getElementById('lightbox-loader');[cite: 5]
        const imgEl = document.getElementById('lightbox-img-element');[cite: 5]

        if (res.success && imgEl) {[cite: 5]
          imgEl.src = res.base64Data;[cite: 5]
        }
        if (loader) loader.remove();[cite: 5]
      })
      .catch(() => {
        const loader = document.getElementById('lightbox-loader');[cite: 5]
        if (loader) loader.remove();[cite: 5]
      });
  },

  nextPhoto: function() {
    if (this.photoGallery.length <= 1) return;[cite: 5]
    this.currentPhotoIndex = (this.currentPhotoIndex + 1) % this.photoGallery.length;[cite: 5]
    this.renderPhotoLightbox();[cite: 5]
  },

  prevPhoto: function() {
    if (this.photoGallery.length <= 1) return;[cite: 5]
    this.currentPhotoIndex = (this.currentPhotoIndex - 1 + this.photoGallery.length) % this.photoGallery.length;[cite: 5]
    this.renderPhotoLightbox();[cite: 5]
  },

  previewFile: function(fileId, fileName) {
    const previewModalEl = document.getElementById('modalPreview');[cite: 5]
    if (!previewModalEl) {[cite: 5]
      window.open('https://drive.google.com/file/d/' + fileId + '/view', '_blank');[cite: 5]
      return;[cite: 5]
    }

    const previewTitle = document.getElementById('preview-file-title');[cite: 5]
    if (previewTitle) previewTitle.innerText = fileName;[cite: 5]

    const modalBody = this.getModalBodyContainer(previewModalEl);[cite: 5]
    const embedUrl = 'https://drive.google.com/file/d/' + fileId + '/preview';[cite: 5]
    modalBody.innerHTML = '<iframe id="preview-frame" src="' + embedUrl + '" style="width: 100%; height: 500px; border: none;" class="rounded-3"></iframe>';[cite: 5]

    if (this.modalPreviewInst) {[cite: 5]
      this.modalPreviewInst.show();[cite: 5]
    }
  },

  openSubFolder: function(folderId, folderName) {
    this.folderStack.push({ id: folderId, name: folderName });[cite: 5]
    this.currentFolderId = folderId;[cite: 5]
    this.renderVaultContent();[cite: 5]
  },

  navigateBack: function() {
    if (this.folderStack.length > 1) {[cite: 5]
      this.folderStack.pop();[cite: 5]
      this.currentFolderId = this.folderStack[this.folderStack.length - 1].id;[cite: 5]
      this.renderVaultContent();[cite: 5]
    }
  },

  openCreateFolderModal: function() {
    document.getElementById('folder-name-input').value = '';[cite: 5]
    this.modalFolderInst.show();[cite: 5]
  },

  execCreateFolder: function() {
    const folderName = document.getElementById('folder-name-input').value.trim();[cite: 5]
    if (!folderName) {[cite: 5]
      Swal.fire('Peringatan', 'Masukkan nama folder!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    Swal.fire({ title: 'Membuat folder...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });[cite: 5]
    
    this.serverCall('CREATE_FOLDER', {[cite: 5]
      parentFolderId: this.currentFolderId,[cite: 5]
      folderName: folderName[cite: 5]
    }).then(res => {
      this.modalFolderInst.hide();[cite: 5]
      Swal.fire('Berhasil', 'Folder baru berhasil dibuat', 'success');[cite: 5]
      this.renderVaultContent();[cite: 5]
    });
  },

  renameItem: function(itemId, oldName, isFolder) {
    Swal.fire({[cite: 5]
      title: 'Ubah Nama',[cite: 5]
      input: 'text',[cite: 5]
      inputValue: oldName,[cite: 5]
      showCancelButton: true,[cite: 5]
      confirmButtonText: 'Simpan',[cite: 5]
      cancelButtonText: 'Batal'[cite: 5]
    }).then((result) => {
      if (result.isConfirmed && result.value.trim() !== '') {[cite: 5]
        Swal.showLoading();[cite: 5]
        this.serverCall('RENAME_ITEM', { itemId: itemId, newName: result.value.trim(), isFolder: isFolder })[cite: 5]
          .then(res => {
            Swal.fire('Sukses', res.message, 'success');[cite: 5]
            this.renderVaultContent();[cite: 5]
          });
      }
    });
  },

  deleteItem: function(itemId, isFolder) {
    Swal.fire({[cite: 5]
      title: 'Konfirmasi Hapus',[cite: 5]
      text: isFolder ? 'Apakah Anda yakin ingin menghapus folder ini beserta isinya?' : 'Apakah Anda yakin ingin menghapus berkas ini?',[cite: 5]
      icon: 'warning',[cite: 5]
      showCancelButton: true,[cite: 5]
      confirmButtonColor: '#d33',[cite: 5]
      confirmButtonText: 'Ya, Hapus!',[cite: 5]
      cancelButtonText: 'Batal'[cite: 5]
    }).then((result) => {
      if (result.isConfirmed) {[cite: 5]
        Swal.showLoading();[cite: 5]
        this.serverCall('DELETE_ITEM', { itemId: itemId, isFolder: isFolder })[cite: 5]
          .then(res => {
            Swal.fire('Terhapus', res.message, 'success');[cite: 5]
            this.renderVaultContent();[cite: 5]
          });
      }
    });
  },

  toggleUploadMode: function(mode) {
    const fileWrapper = document.getElementById('wrapper-file-input');[cite: 5]
    const folderWrapper = document.getElementById('wrapper-folder-input');[cite: 5]
    
    if (mode === 'folder') {[cite: 5]
      fileWrapper.classList.add('d-none');[cite: 5]
      folderWrapper.classList.remove('d-none');[cite: 5]
    } else {
      fileWrapper.classList.remove('d-none');[cite: 5]
      folderWrapper.classList.add('d-none');[cite: 5]
    }
  },

  compressImage: function(file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) {
    return new Promise((resolve) => {[cite: 5]
      if (!file.type.match(/image.*/)) {[cite: 5]
        resolve(file);[cite: 5]
        return;[cite: 5]
      }

      const reader = new FileReader();[cite: 5]
      reader.onload = (e) => {[cite: 5]
        const img = new Image();[cite: 5]
        img.onload = () => {[cite: 5]
          let width = img.width;[cite: 5]
          let height = img.height;[cite: 5]

          if (width > height) {[cite: 5]
            if (width > maxWidth) {[cite: 5]
              height = Math.round((height * maxWidth) / width);[cite: 5]
              width = maxWidth;[cite: 5]
            }
          } else {
            if (height > maxHeight) {[cite: 5]
              width = Math.round((width * maxHeight) / height);[cite: 5]
              height = maxHeight;[cite: 5]
            }
          }

          const canvas = document.createElement('canvas');[cite: 5]
          canvas.width = width;[cite: 5]
          canvas.height = height;[cite: 5]

          const ctx = canvas.getContext('2d');[cite: 5]
          ctx.drawImage(img, 0, 0, width, height);[cite: 5]

          canvas.toBlob((blob) => {[cite: 5]
            if (!blob) {[cite: 5]
              resolve(file);[cite: 5]
              return;[cite: 5]
            }
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {[cite: 5]
              type: 'image/jpeg',[cite: 5]
              lastModified: Date.now()[cite: 5]
            });
            resolve(compressedFile);[cite: 5]
          }, 'image/jpeg', quality);[cite: 5]
        };
        img.src = e.target.result;[cite: 5]
      };
      reader.readAsDataURL(file);[cite: 5]
    });
  },

  execUpload: async function() {
    const isFolderMode = document.getElementById('uploadTypeFolder').checked;
    const inputEl = isFolderMode ? document.getElementById('folder-input') : document.getElementById('file-input');
    const rawFiles = Array.from(inputEl.files);

    if (rawFiles.length === 0) {
      Swal.fire('Peringatan', isFolderMode ? 'Pilih folder yang ingin diunggah!' : 'Pilih file terlebih dahulu!', 'warning');
      return;
    }

    Swal.fire({
      title: 'Mempersiapkan Berkas...',
      html: '<div id="upload-progress-text">Mengekstrak arsip & mengompres gambar...</div>',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      let finalFilesToUpload = [];

      for (const file of rawFiles) {
        const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
        
        if (isZip) {
          if (typeof JSZip === 'undefined') {
            throw new Error("Pustaka JSZip belum dimuat. Pastikan CDN JSZip sudah ditambahkan di HTML.");
          }

          const zip = new JSZip();
          const zipContent = await zip.loadAsync(file);

          for (const relativePath of Object.keys(zipContent.files)) {
            const zipEntry = zipContent.files[relativePath];
            if (zipEntry.dir) continue;

            const blob = await zipEntry.async('blob');
            const fileName = relativePath.split('/').pop();
            const extractedFile = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
            
            extractedFile._customRelativePath = relativePath;
            finalFilesToUpload.push(extractedFile);
          }
        } else {
          finalFilesToUpload.push(file);
        }
      }

      if (finalFilesToUpload.length === 0) {
        Swal.fire('Informasi', 'Tidak ada berkas valid yang dapat diunggah dari arsip.', 'info');
        return;
      }

      const filePromises = finalFilesToUpload.map(async (file) => {
        const isImage = file.type.match(/image.*/) || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
        const compressed = isImage ? await this.compressImage(file) : file;

        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              name: compressed.name,
              mimeType: compressed.type || 'application/octet-stream',
              relativePath: file._customRelativePath || file.webkitRelativePath || compressed.name,
              base64: e.target.result.split(',')[1]
            });
          };
          reader.readAsDataURL(compressed);
        });
      });

      const preparedFiles = await Promise.all(filePromises);

      const hasFolderStructure = isFolderMode || preparedFiles.some(f => f.relativePath.includes('/'));

      if (hasFolderStructure) {
        const res = await this.serverCall('UPLOAD_FOLDER_STRUCTURE', {
          parentFolderId: this.currentFolderId,
          files: preparedFiles
        });

        this.modalUploadInst.hide();
        inputEl.value = '';
        if (res.success) {
          Swal.fire('Selesai', 'Seluruh berkas (' + res.uploadedCount + ' file) berhasil diunggah!', 'success');
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan saat mengunggah folder/ekstraksi zip', 'error');
        }
      } else {
        const uploadPromises = preparedFiles.map(fileData => {
          return this.serverCall('UPLOAD_SINGLE_FILE', {
            fileData: fileData,
            folderId: this.currentFolderId
          });
        });

        const results = await Promise.all(uploadPromises);
        const successCount = results.filter(r => r.success).length;

        this.modalUploadInst.hide();
        inputEl.value = '';
        Swal.fire('Selesai', successCount + ' dari ' + preparedFiles.length + ' file berhasil diunggah!', 'success');
      }

      this.renderVaultContent();
    } catch (err) {
      Swal.fire('Error', err.toString(), 'error');
    }
  },

  openVaultSettingsModal: function() {
    document.getElementById('setting-vault-name').value = this.activeVault.nama;[cite: 5]
    document.getElementById('setting-vault-pin').value = '';[cite: 5]
    this.modalVaultSettingsInst.show();[cite: 5]
  },

  execUpdateVaultSettings: function() {
    const newName = document.getElementById('setting-vault-name').value.trim();[cite: 5]
    const newPin = document.getElementById('setting-vault-pin').value.trim();[cite: 5]

    if (!newName) {[cite: 5]
      Swal.fire('Peringatan', 'Nama Berangkas tidak boleh kosong!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    if (newPin && newPin.length !== 6) {[cite: 5]
      Swal.fire('Peringatan', 'PIN Harus 6 digit angka atau kosongkan jika tanpa PIN!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    Swal.showLoading();[cite: 5]
    this.serverCall('USER_UPDATE_VAULT', {[cite: 5]
      vaultId: this.activeVault.id,[cite: 5]
      newName: newName,[cite: 5]
      newPin: newPin[cite: 5]
    }).then(res => {
      if (res.success) {[cite: 5]
        this.modalVaultSettingsInst.hide();[cite: 5]
        Swal.fire('Berhasil', 'Pengaturan Berangkas berhasil diperbarui', 'success');[cite: 5]
        
        this.activeVault.nama = newName;[cite: 5]
        this.folderStack[0].name = newName;[cite: 5]
        
        this.serverCall('GET_INITIAL_DATA').then(r => {[cite: 5]
          this.vaults = r.vaults;[cite: 5]
          this.renderSidebar();[cite: 5]
          this.renderVaultContent();[cite: 5]
        });
      } else {
        Swal.fire('Gagal', res.message, 'error');[cite: 5]
      }
    });
  },

  openAdminModal: function() {
    this.closeSidebarMobile();[cite: 5]
    document.getElementById('admin-user').value = '';[cite: 5]
    document.getElementById('admin-pass').value = '';[cite: 5]
    this.modalAdminInst.show();[cite: 5]
  },

  submitAdminLogin: function() {
    const u = document.getElementById('admin-user').value;[cite: 5]
    const p = document.getElementById('admin-pass').value;[cite: 5]

    if (!u || !p) {[cite: 5]
      Swal.fire('Peringatan', 'Username dan Password tidak boleh kosong!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    this.serverCall('ADMIN_LOGIN', { username: u, password: p })[cite: 5]
      .then(res => {
        if (res.success) {[cite: 5]
          this.modalAdminInst.hide();[cite: 5]
          this.currentRole = 'ADMIN';[cite: 5]
          document.getElementById('btn-mode-admin').classList.add('d-none');[cite: 5]
          document.getElementById('btn-mode-public').classList.remove('d-none');[cite: 5]
          document.getElementById('status-badge').className = 'badge bg-warning text-dark px-3 py-2 fw-bold';[cite: 5]
          document.getElementById('status-badge').innerText = 'Status: Mode Admin';[cite: 5]
          Swal.fire('Login Admin Sukses', 'Panel Kontrol Dibuka', 'success');[cite: 5]
          this.vaults = res.vaults || this.vaults;[cite: 5]
          this.renderAdminDashboard(this.vaults);[cite: 5]
        } else {
          Swal.fire('Gagal Login', res.message, 'error');[cite: 5]
        }
      });
  },

  switchPublicMode: function() {
    this.currentRole = 'PUBLIC';[cite: 5]
    document.getElementById('btn-mode-admin').classList.remove('d-none');[cite: 5]
    document.getElementById('btn-mode-public').classList.add('d-none');[cite: 5]
    document.getElementById('status-badge').className = 'badge bg-dark border border-secondary text-warning px-3 py-2';[cite: 5]
    document.getElementById('status-badge').innerText = 'Status: Publik';[cite: 5]
    this.fetchInitialData();[cite: 5]
  },

  renderAdminDashboard: function(vaults) {
    this.activeVault = null;[cite: 5]
    this.currentFolderId = null;[cite: 5]

    document.getElementById('header-title').innerHTML = 
      '<div class="top-navbar-title-wrap">' +[cite: 5]
        '<i class="fas fa-sliders text-warning fa-lg"></i>' +[cite: 5]
        '<span class="fw-bold fs-5 text-dark text-truncate">PANEL MANAJEMEN ADMIN</span>' +[cite: 5]
      '</div>';[cite: 5]
    
    let html = '<div class="p-3 p-md-4">' +[cite: 5]
               '<div class="d-flex justify-content-between align-items-center mb-4">' +[cite: 5]
               '<h5 class="fw-bold text-dark m-0">Daftar Menu Berangkas</h5>' +[cite: 5]
               '<button class="btn btn-gold" onclick="App.openCreateVaultModal()"><i class="fas fa-plus-circle me-2"></i> Tambah Menu Berangkas</button>' +[cite: 5]
               '</div>' +[cite: 5]
               '<div class="dark-vault p-4 rounded-4 mb-4"><div class="table-responsive"><table class="table table-dark-vault align-middle"><thead><tr>' +[cite: 5]
               '<th>ID</th><th>Nama Menu Berangkas</th><th>PIN (Atur/Kosongkan)</th><th class="text-center">Aksi</th>' +[cite: 5]
               '</tr></thead><tbody>';[cite: 5]

    const totalItems = vaults.length;[cite: 5]
    vaults.forEach((v, index) => {[cite: 5]
      const isFirst = index === 0 ? 'disabled' : '';[cite: 5]
      const isLast = index === totalItems - 1 ? 'disabled' : '';[cite: 5]
      const safeVaultName = this.escapeQuotes(v.nama);[cite: 5]

      html += '<tr>' +[cite: 5]
              '<td class="fw-bold text-warning">' + v.id + '</td>' +[cite: 5]
              '<td><input type="text" id="admin-name-' + v.id + '" class="form-control form-control-dark" value="' + safeVaultName + '"></td>' +[cite: 5]
              '<td><input type="text" maxlength="6" id="admin-pin-' + v.id + '" class="form-control form-control-dark" value="' + (v.pin || '') + '" placeholder="Kosongkan jika Tanpa PIN"></td>' +[cite: 5]
              '<td class="text-center"><div class="d-flex align-items-center justify-content-center gap-1">' +[cite: 5]
              '<button class="btn btn-sm btn-outline-metal" onclick="App.moveVaultOrder(\'' + v.id + '\', \'up\')" ' + isFirst + ' title="Pindah Ke Atas"><i class="fas fa-arrow-up"></i></button>' +[cite: 5]
              '<button class="btn btn-sm btn-outline-metal" onclick="App.moveVaultOrder(\'' + v.id + '\', \'down\')" ' + isLast + ' title="Pindah Ke Bawah"><i class="fas fa-arrow-down"></i></button>' +[cite: 5]
              '<button class="btn btn-gold btn-sm ms-2" onclick="App.saveVaultConfig(\'' + v.id + '\')"><i class="fas fa-save me-1"></i> Simpan</button>' +[cite: 5]
              '<button class="btn btn-outline-danger btn-sm" onclick="App.deleteVault(\'' + v.id + '\')"><i class="fas fa-trash me-1"></i> Hapus</button>' +[cite: 5]
              '</div></td></tr>';[cite: 5]
    });

    html += '</tbody></table></div></div></div>';[cite: 5]
    document.getElementById('view-container').innerHTML = html;[cite: 5]
  },

  moveVaultOrder: function(vaultId, direction) {
    const index = this.vaults.findIndex(v => String(v.id).toUpperCase() === String(vaultId).toUpperCase());[cite: 5]
    if (index === -1) return;[cite: 5]

    const targetIndex = direction === 'up' ? index - 1 : index + 1;[cite: 5]
    if (targetIndex < 0 || targetIndex >= this.vaults.length) return;[cite: 5]

    const newVaults = [...this.vaults];[cite: 5]
    const temp = newVaults[index];[cite: 5]
    newVaults[index] = newVaults[targetIndex];[cite: 5]
    newVaults[targetIndex] = temp;[cite: 5]
    this.vaults = newVaults;[cite: 5]

    this.renderSidebar();[cite: 5]
    this.renderAdminDashboard(this.vaults);[cite: 5]

    const orderedIds = this.vaults.map(v => v.id);[cite: 5]
    this.serverCall('UPDATE_VAULT_ORDER', { orderedIds: orderedIds })[cite: 5]
      .catch(err => console.error('Error re-ordering vaults:', err));[cite: 5]
  },

  openCreateVaultModal: function() {
    document.getElementById('new-vault-name').value = '';[cite: 5]
    document.getElementById('new-vault-pin').value = '';[cite: 5]
    this.modalVaultInst.show();[cite: 5]
  },

  execCreateVault: function() {
    const name = document.getElementById('new-vault-name').value.trim();[cite: 5]
    const pin = document.getElementById('new-vault-pin').value.trim();[cite: 5]

    if (!name) {[cite: 5]
      Swal.fire('Peringatan', 'Nama Berangkas wajib diisi!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    if (pin && pin.length !== 6) {[cite: 5]
      Swal.fire('Peringatan', 'PIN Harus 6 digit angka atau kosongkan!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    Swal.showLoading();[cite: 5]
    this.serverCall('CREATE_VAULT', { vaultName: name, pin: pin })[cite: 5]
      .then(res => {
        this.modalVaultInst.hide();[cite: 5]
        if (res.success) {[cite: 5]
          Swal.fire('Berhasil', res.message, 'success');[cite: 5]
          this.refreshAdminDashboard();[cite: 5]
        } else {
          Swal.fire('Gagal', res.message, 'error');[cite: 5]
        }
      })
      .catch(err => {
        Swal.fire('Error', err.toString(), 'error');[cite: 5]
      });
  },

  saveVaultConfig: function(id) {
    const newName = document.getElementById('admin-name-' + id).value.trim();[cite: 5]
    const newPin = document.getElementById('admin-pin-' + id).value.trim();[cite: 5]

    if (!newName) {[cite: 5]
      Swal.fire('Peringatan', 'Nama Berangkas tidak boleh kosong!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    if (newPin && newPin.length !== 6) {[cite: 5]
      Swal.fire('Peringatan', 'PIN Harus 6 digit angka atau kosongkan!', 'warning');[cite: 5]
      return;[cite: 5]
    }

    Swal.showLoading();[cite: 5]
    this.serverCall('UPDATE_VAULT', { vaultId: id, newName: newName, newPin: newPin })[cite: 5]
      .then(res => {
        if (res.success) {[cite: 5]
          Swal.fire('Tersimpan', res.message, 'success');[cite: 5]
          this.refreshAdminDashboard();[cite: 5]
        } else {
          Swal.fire('Gagal', res.message, 'error');[cite: 5]
        }
      });
  },

  deleteVault: function(id) {
    Swal.fire({[cite: 5]
      title: 'Hapus Menu Berangkas?',[cite: 5]
      text: 'Menu ini akan dihapus dari sistem dasbor.',[cite: 5]
      icon: 'warning',[cite: 5]
      showCancelButton: true,[cite: 5]
      confirmButtonColor: '#d33',[cite: 5]
      confirmButtonText: 'Ya, Hapus Menu!',[cite: 5]
      cancelButtonText: 'Batal'[cite: 5]
    }).then((result) => {
      if (result.isConfirmed) {[cite: 5]
        Swal.showLoading();[cite: 5]
        this.serverCall('DELETE_VAULT', { vaultId: id })[cite: 5]
          .then(res => {
            Swal.fire('Terhapus', res.message, 'success');[cite: 5]
            this.refreshAdminDashboard();[cite: 5]
          });
      }
    });
  },

  refreshAdminDashboard: function() {
    this.serverCall('GET_INITIAL_DATA').then(r => {[cite: 5]
      if (r.success) {[cite: 5]
        this.vaults = r.vaults;[cite: 5]
        this.renderSidebar();[cite: 5]
        this.renderAdminDashboard(r.vaults);[cite: 5]
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', function() {[cite: 5]
  App.init();[cite: 5]
});