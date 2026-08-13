// Ganti nilai ini dengan Web App URL hasil Deploy Google Apps Script Anda
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwN6BhR6SJcZCAaLn0rKnJdnskwgJTUu6avHMyoHZHEp_DiH56RJeK2VZb0MWNp6p7g/exec';

let deferredPrompt;

const App = {
  vaults: [],
  activeVault: null,
  folderStack: [],
  currentFolderId: null,
  currentRole: 'PUBLIC',
  currentItems: [],
  photoGallery: [],
  currentPhotoIndex: 0,
  currentZoom: 1,
  zoomTranslateX: 0,
  zoomTranslateY: 0,

  pinBuffer: '',
  modalPinInst: null,
  modalAdminInst: null,
  modalUploadInst: null,
  modalFolderInst: null,
  modalVaultInst: null,
  modalVaultSettingsInst: null,
  modalPreviewInst: null,

  init: function() {
    this.modalPinInst = new bootstrap.Modal(document.getElementById('modalPin'));
    this.modalAdminInst = new bootstrap.Modal(document.getElementById('modalAdmin'));
    this.modalUploadInst = new bootstrap.Modal(document.getElementById('modalUpload'));
    this.modalFolderInst = new bootstrap.Modal(document.getElementById('modalCreateFolder'));
    this.modalVaultInst = new bootstrap.Modal(document.getElementById('modalCreateVault'));
    this.modalVaultSettingsInst = new bootstrap.Modal(document.getElementById('modalVaultSettings'));
    
    const previewEl = document.getElementById('modalPreview');
    if (previewEl) {
      this.modalPreviewInst = new bootstrap.Modal(previewEl);
    }

    document.addEventListener('keydown', (e) => {
      const previewModal = document.getElementById('modalPreview');
      if (previewModal && previewModal.classList.contains('show') && this.photoGallery.length > 0) {
        if (e.key === 'ArrowRight') this.nextPhoto();
        if (e.key === 'ArrowLeft') this.prevPhoto();
      }
    });

    this.setupPWA();
    this.fetchInitialData();
  },

  handleManualRefresh: function() {
    console.log("Tombol refresh diklik!"); // Untuk tracking di console

    // Efek animasi putar pada icon tombol
    const btnIcon = document.querySelector('#btn-refresh-manual i');
    if (btnIcon) btnIcon.classList.add('fa-spin');

    // Menggunakan variabel eksplisit App untuk keamanan context 'this'
    const self = App;

    try {
      if (self.currentFolderId) {
        const targetEl = document.getElementById('file-list-target');
        if (targetEl) {
          targetEl.innerHTML = '<div class="text-center py-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i> Memuat ulang berkas...</div>';
        }
        self.loadFolderItems(self.currentFolderId);
      } else if (self.currentRole === 'ADMIN') {
        self.refreshAdminDashboard();
      } else {
        self.fetchInitialData();
      }
    } catch (err) {
      console.error("Error Refresh:", err);
      if (typeof Swal !== 'undefined') {
        Swal.fire('Error', 'Gagal memuat ulang: ' + err.message, 'error');
      }
    } finally {
      // Hentikan animasi putar icon setelah 1 detik
      setTimeout(() => {
        if (btnIcon) btnIcon.classList.remove('fa-spin');
      }, 1000);
    }
  },

  setupPWA: function() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .catch(err => console.log('SW Registration failed: ', err));
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const installBtn = document.getElementById('btn-install-pwa');
      if (installBtn) installBtn.classList.remove('d-none');
    });
  },

  installPWA: function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          const installBtn = document.getElementById('btn-install-pwa');
          if (installBtn) installBtn.classList.add('d-none');
        }
        deferredPrompt = null;
      });
    }
  },

  toggleSidebar: function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('show-sidebar');
    overlay.classList.toggle('active');
  },

  closeSidebarMobile: function() {
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      if (sidebar) sidebar.classList.remove('show-sidebar');
      if (overlay) overlay.classList.remove('active');
    }
  },

  serverCall: function(action, payload = {}) {
    return fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload })
    })
    .then(response => response.json())
    .catch(err => {
      console.error("Fetch API Error:", err);
      throw err;
    });
  },

  fetchInitialData: function() {
    Swal.fire({
      title: 'Menghubungkan Berangkas...',
      text: 'Memuat database dan mengamankan enkripsi',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.serverCall('GET_INITIAL_DATA')
      .then(res => {
        Swal.close();
        if (res.success) {
          this.vaults = res.vaults;
          this.renderSidebar();
          this.renderHome();
        } else {
          Swal.fire('Error Database', res.message || 'Gagal membaca database', 'error');
        }
      })
      .catch(err => {
        Swal.close();
        Swal.fire('Gagal Koneksi', err.toString(), 'error');
      });
  },

  renderSidebar: function() {
    let html = '';
    this.vaults.forEach(v => {
      const iconName = v.icon || 'fa-vault';
      html += '<button class="nav-item-btn" id="nav-btn-' + v.id + '" onclick="App.openPinModal(\'' + v.id + '\')">' +
              '<i class="fas ' + iconName + ' text-warning"></i>' +
              '<span class="text-truncate">' + v.nama + '</span>' +
              '</button>';
    });
    document.getElementById('sidebar-vault-links').innerHTML = html;
  },

  renderHome: function() {
    this.activeVault = null;
    this.currentFolderId = null;
    this.folderStack = [];

    document.getElementById('header-title').innerHTML = 
      '<div class="top-navbar-title-wrap">' +
        '<i class="fas fa-shield-halved text-warning fa-lg"></i>' +
        '<span class="fw-bold fs-5 text-dark text-truncate">DASBOR BERANGKAS PUBLIK</span>' +
      '</div>';
    
    let html = '<div class="row g-4 mb-4 p-3 p-md-4">';
    this.vaults.forEach(v => {
      const badgeHtml = !v.hasPin
        ? '<span class="badge bg-success text-light">Publik (Bebas Akses)</span>'
        : '<span class="badge bg-dark border border-secondary text-warning">Terkunci (PIN 6 Digit)</span>';
      const iconName = v.icon || 'fa-vault';

      html += '<div class="col-md-6 col-lg-3">' +
              '<div class="vault-card" onclick="App.openPinModal(\'' + v.id + '\')">' +
              '<div class="icon-box"><i class="fas ' + iconName + '"></i></div>' +
              '<h6 class="fw-bold text-dark mb-2">' + v.nama + '</h6>' +
              badgeHtml +
              '</div></div>';
    });

    html += '</div>' +
            '<div class="mx-3 mx-md-4 p-5 text-center dark-vault rounded-4 border border-secondary">' +
            '<i class="fas fa-lock-keyhole fa-4x text-warning mb-3"></i>' +
            '<h4 class="fw-bold text-dark">Sistem Keamanan Berangkas Terenkripsi</h4>' +
            '<p class="text-muted">Pilih berangkas dari sidebar atau kartu di atas untuk membuka dokumen aman Anda.</p>' +
            '</div>';

    document.getElementById('view-container').innerHTML = html;
  },

  openPinModal: function(vaultId) {
    this.closeSidebarMobile();
    this.activeVault = this.vaults.find(v => v.id === vaultId);
    if (!this.activeVault) return;
    
    if (!this.activeVault.hasPin) {
      this.folderStack = [{ id: this.activeVault.folderId, name: this.activeVault.nama }];
      this.currentFolderId = this.activeVault.folderId;
      this.renderVaultContent();
      return;
    }

    this.pinBuffer = '';
    const pinInput = document.getElementById('input-pin-vault');
    if (pinInput) pinInput.value = '';
    
    const pinTitle = document.getElementById('pin-modal-title');
    if (pinTitle) pinTitle.innerText = this.activeVault.nama;
    
    this.modalPinInst.show();
  },

  pressPin: function(num) {
    if (this.pinBuffer.length < 6) {
      this.pinBuffer += num;
      const pinInput = document.getElementById('input-pin-vault');
      if (pinInput) pinInput.value = this.pinBuffer;
    }
  },

  clearPin: function() {
    this.pinBuffer = '';
    const pinInput = document.getElementById('input-pin-vault');
    if (pinInput) pinInput.value = '';
  },

  submitPin: function() {
    const directInput = document.getElementById('input-pin-vault');
    if (directInput && directInput.value) {
      this.pinBuffer = directInput.value;
    }

    if (this.pinBuffer.length !== 6) {
      Swal.fire('Peringatan', 'Kode PIN harus 6 digit angka!', 'warning');
      return;
    }

    Swal.showLoading();
    this.serverCall('VERIFY_PIN', { vaultId: this.activeVault.id, pin: this.pinBuffer })
      .then(res => {
        if (res.success) {
          this.modalPinInst.hide();
          Swal.fire('Akses Diterima', 'Berangkas terbuka', 'success');
          this.activeVault = res.vault;
          this.folderStack = [{ id: res.vault.folderId, name: res.vault.nama }];
          this.currentFolderId = res.vault.folderId;
          this.renderVaultContent();
        } else {
          Swal.fire('Akses Ditolak', res.message, 'error');
          this.clearPin();
        }
      });
  },

  renderVaultContent: function() {
    const currentFolder = this.folderStack[this.folderStack.length - 1];

    let backBtnHtml = this.folderStack.length > 1
      ? '<button class="btn btn-outline-metal" onclick="App.navigateBack()"><i class="fas fa-arrow-left"></i> Kembali</button>'
      : '<button class="btn btn-outline-metal" onclick="App.renderHome()"><i class="fas fa-arrow-left"></i> Utama</button>';

    let settingsBtnHtml = this.folderStack.length === 1
      ? '<button class="btn btn-outline-metal" onclick="App.openVaultSettingsModal()"><i class="fas fa-gear"></i> Pengaturan</button>'
      : '';

    const actionToolbar = 
      '<div class="vault-header-actions">' +
         backBtnHtml + 
         settingsBtnHtml +
         '<button class="btn btn-outline-metal" onclick="App.openCreateFolderModal()"><i class="fas fa-folder-plus"></i> Tambah Folder</button>' +
         '<button class="btn btn-gold" onclick="App.modalUploadInst.show()"><i class="fas fa-cloud-arrow-up"></i> Unggah File/Folder</button>' +
      '</div>';

    document.getElementById('header-title').innerHTML = 
      '<div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center w-100 gap-2 overflow-hidden">' +
        '<div class="top-navbar-title-wrap text-truncate me-2">' +
          '<i class="fas fa-folder-open text-warning fa-lg flex-shrink-0"></i>' +
          '<span class="fw-bold fs-5 text-dark text-truncate">' + currentFolder.name + '</span>' +
        '</div>' +
        actionToolbar +
      '</div>';

    let html = '<div class="p-3 p-md-4">' +
                 '<div class="row mb-3">' +
                   '<div class="col-12 col-md-6">' +
                     '<div class="input-group">' +
                       '<span class="input-group-text bg-dark border-secondary text-warning"><i class="fas fa-search"></i></span>' +
                       '<input type="text" id="search-file-input" class="form-control bg-dark text-light border-secondary" placeholder="Cari file/folder..." onkeyup="App.filterFiles()">' +
                     '</div>' +
                   '</div>' +
                 '</div>' +
                 '<div class="dark-vault p-3 p-md-4 rounded-4">' +
                   '<h6 class="fw-bold text-warning mb-3"><i class="fas fa-list me-2"></i>Daftar Berkas & Folder</h6>' +
                   '<div id="file-list-target">' +
                     '<div class="text-center py-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i> Memuat isi folder...</div>' +
                   '</div>' +
                 '</div>' +
               '</div>';

    document.getElementById('view-container').innerHTML = html;
    this.loadFolderItems(currentFolder.id);
  },

  loadFolderItems: function(folderId) {
    this.serverCall('GET_FILES_AND_FOLDERS', { folderId: folderId })
      .then(res => {
        if (res.success) {
          this.currentItems = res.items || [];
          this.updatePhotoGallery();
          this.renderTableItems(this.currentItems);
        } else {
          document.getElementById('file-list-target').innerHTML = '<div class="text-center py-4 text-danger">Gagal memuat isi folder.</div>';
        }
      });
  },

  updatePhotoGallery: function() {
    const isPhoto = (name) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
    this.photoGallery = this.currentItems.filter(item => item.type === 'file' && isPhoto(item.name));
  },

  filterFiles: function() {
    const searchInput = document.getElementById('search-file-input');
    if (!searchInput) return;
    
    const keyword = searchInput.value.toLowerCase().trim();
    const filtered = this.currentItems.filter(item => item.name.toLowerCase().includes(keyword));
    this.renderTableItems(filtered);
  },

  escapeQuotes: function(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  },

  renderTableItems: function(items) {
    if (!items || items.length === 0) {
      document.getElementById('file-list-target').innerHTML = 
        '<div class="text-center py-5 text-muted"><i class="fas fa-folder-open fa-3x mb-3 text-secondary"></i><br>Tidak ada file atau folder yang ditemukan.</div>';
      return;
    }

    const isPhotoExt = (name) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
    const isPdfExt = (name) => /\.pdf$/i.test(name);
    const isDocExt = (name) => /\.(doc|docx)$/i.test(name);
    const isXlsExt = (name) => /\.(xls|xlsx|csv)$/i.test(name);

    let gridHtml = '<div class="file-grid-container">';

    items.forEach(item => {
      const isFolder = item.type === 'folder';
      const isPhoto = !isFolder && isPhotoExt(item.name);
      const safeName = this.escapeQuotes(item.name);
      const tooltipText = `Nama: ${item.name}&#10;Ukuran: ${item.size}&#10;Diperbarui: ${item.updated}`;

      let previewContent = '';
      if (isFolder) {
        previewContent = '<i class="fas fa-folder text-warning"></i>';
      } else if (isPhoto) {
        const thumbUrl = 'https://drive.google.com/thumbnail?id=' + item.id + '&sz=w200';
        previewContent = `<img src="${thumbUrl}" loading="lazy" alt="${safeName}" onerror="this.onerror=null; this.parentNode.innerHTML='<i class=\\'fas fa-file-image text-warning\\'></i>';"/>`;
      } else if (isPdfExt(item.name)) {
        previewContent = '<i class="fas fa-file-pdf text-danger"></i>';
      } else if (isDocExt(item.name)) {
        previewContent = '<i class="fas fa-file-word text-primary"></i>';
      } else if (isXlsExt(item.name)) {
        previewContent = '<i class="fas fa-file-excel text-success"></i>';
      } else {
        previewContent = '<i class="fas fa-file-lines text-secondary"></i>';
      }

      let clickAction = '';
      if (isFolder) {
        clickAction = `App.openSubFolder('${item.id}', '${safeName}')`;
      } else if (isPhoto) {
        clickAction = `App.openPhotoPreview('${item.id}')`;
      } else {
        clickAction = `App.previewFile('${item.id}', '${safeName}')`;
      }

      let downloadBtn = '';
      if (!isFolder && item.downloadUrl) {
        downloadBtn = `<a href="${item.downloadUrl}" target="_blank" class="btn btn-xs btn-outline-metal p-1" onclick="event.stopPropagation();" title="Download"><i class="fas fa-download fa-xs"></i></a>`;
      }

      let actionButtons = `
        <button class="btn btn-xs btn-outline-metal p-1" onclick="event.stopPropagation(); App.renameItem('${item.id}', '${safeName}', ${isFolder})" title="Edit"><i class="fas fa-pen fa-xs"></i></button>
        ${downloadBtn}
        <button class="btn btn-xs btn-outline-danger p-1" onclick="event.stopPropagation(); App.deleteItem('${item.id}', ${isFolder})" title="Hapus"><i class="fas fa-trash fa-xs"></i></button>
      `;

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
      `;
    });

    gridHtml += '</div>';
    document.getElementById('file-list-target').innerHTML = gridHtml;
  },

  openPhotoPreview: function(fileId) {
    const index = this.photoGallery.findIndex(p => p.id === fileId);
    if (index !== -1) {
      this.currentPhotoIndex = index;
      this.renderPhotoLightbox();
    } else {
      this.previewFile(fileId, 'Foto Preview');
    }
  },

  getModalBodyContainer: function(previewModalEl) {
    let modalBody = document.getElementById('preview-modal-body');
    if (!modalBody) {
      modalBody = previewModalEl.querySelector('.modal-body');
    }
    return modalBody;
  },

  initPhotoZoom: function() {
    const img = document.getElementById('lightbox-img-element');
    if (!img) return;

    this.currentZoom = 1;
    this.zoomTranslateX = 0;
    this.zoomTranslateY = 0;

    const minZoom = 0.5;
    const maxZoom = 4.0;

    const applyTransform = () => {
      img.style.transform = `translate(${this.zoomTranslateX}px, ${this.zoomTranslateY}px) scale(${this.currentZoom})`;
    };

    applyTransform();
    img.style.transition = 'transform 0.05s ease-out';
    img.style.transformOrigin = 'center center';

    const container = img.parentElement;
    if (!container) return;

    container.onwheel = (e) => {
      e.preventDefault();
      const zoomSpeed = 0.15;

      if (e.deltaY < 0) {
        this.currentZoom = Math.min(maxZoom, this.currentZoom + zoomSpeed);
      } else {
        this.currentZoom = Math.max(minZoom, this.currentZoom - zoomSpeed);
      }

      if (this.currentZoom <= 1) {
        this.zoomTranslateX = 0;
        this.zoomTranslateY = 0;
      }

      applyTransform();
    };

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    img.onmousedown = (e) => {
      if (this.currentZoom <= 1) return;
      e.preventDefault();
      isDragging = true;
      startX = e.clientX - this.zoomTranslateX;
      startY = e.clientY - this.zoomTranslateY;
      img.style.cursor = 'grabbing';
    };

    window.onmousemove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      this.zoomTranslateX = e.clientX - startX;
      this.zoomTranslateY = e.clientY - startY;
      applyTransform();
    };

    window.onmouseup = () => {
      if (isDragging) {
        isDragging = false;
        img.style.cursor = 'grab';
      }
    };

    let initialTouchDistance = 0;
    let initialZoom = 1;
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchPanning = false;

    const getDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialTouchDistance = getDistance(e.touches);
        initialZoom = this.currentZoom;
      } else if (e.touches.length === 1 && this.currentZoom > 1) {
        isTouchPanning = true;
        touchStartX = e.touches[0].clientX - this.zoomTranslateX;
        touchStartY = e.touches[0].clientY - this.zoomTranslateY;
      }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const currentDistance = getDistance(e.touches);
        if (initialTouchDistance > 0) {
          const scale = currentDistance / initialTouchDistance;
          this.currentZoom = Math.min(maxZoom, Math.max(minZoom, initialZoom * scale));
          
          if (this.currentZoom <= 1) {
            this.zoomTranslateX = 0;
            this.zoomTranslateY = 0;
          }
          applyTransform();
        }
      } else if (e.touches.length === 1 && isTouchPanning) {
        e.preventDefault();
        this.zoomTranslateX = e.touches[0].clientX - touchStartX;
        this.zoomTranslateY = e.touches[0].clientY - touchStartY;
        applyTransform();
      }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        initialTouchDistance = 0;
      }
      if (e.touches.length === 0) {
        isTouchPanning = false;
      }
    });
  },

  renderPhotoLightbox: function() {
    if (this.photoGallery.length === 0) return;

    const photo = this.photoGallery[this.currentPhotoIndex];
    const previewModalEl = document.getElementById('modalPreview');
    if (!previewModalEl) {
      window.open('https://drive.google.com/file/d/' + photo.id + '/view', '_blank');
      return;
    }

    const modalTitle = document.getElementById('preview-file-title');
    if (modalTitle) {
      modalTitle.innerText = photo.name + ' (' + (this.currentPhotoIndex + 1) + ' / ' + this.photoGallery.length + ')';
    }

    const modalBody = this.getModalBodyContainer(previewModalEl);
    const isGalleryDisabled = this.photoGallery.length <= 1 ? 'disabled' : '';
    const fastUrl = 'https://drive.google.com/thumbnail?id=' + photo.id + '&sz=w800';

    modalBody.innerHTML = '<div class="position-relative text-center d-flex align-items-center justify-content-center bg-black rounded-3 overflow-hidden" style="min-height: 300px; touch-action: none;">' +
                          '<button class="btn btn-dark position-absolute start-0 top-50 translate-middle-y opacity-75 ms-2 rounded-circle" style="z-index: 10; width: 42px; height: 42px;" onclick="App.prevPhoto()" ' + isGalleryDisabled + '>' +
                          '<i class="fas fa-chevron-left text-warning"></i></button>' +
                          '<div id="lightbox-loader" class="position-absolute top-0 start-50 translate-middle-x mt-2 badge bg-dark text-warning border border-warning opacity-75" style="z-index:5;">' +
                          '<i class="fas fa-spinner fa-spin me-1"></i>Memuat HD...</div>' +
                          '<img id="lightbox-img-element" src="' + fastUrl + '" class="img-fluid rounded" style="max-height: 75vh; object-fit: contain; cursor: grab;" alt="' + this.escapeQuotes(photo.name) + '" />' +
                          '<button class="btn btn-dark position-absolute end-0 top-50 translate-middle-y opacity-75 me-2 rounded-circle" style="z-index: 10; width: 42px; height: 42px;" onclick="App.nextPhoto()" ' + isGalleryDisabled + '>' +
                          '<i class="fas fa-chevron-right text-warning"></i></button>' +
                          '</div>';

    if (this.modalPreviewInst) {
      this.modalPreviewInst.show();
    }

    this.initPhotoZoom();

    this.serverCall('GET_IMAGE_BASE64', { fileId: photo.id })
      .then(res => {
        const loader = document.getElementById('lightbox-loader');
        const imgEl = document.getElementById('lightbox-img-element');

        if (res.success && imgEl) {
          imgEl.src = res.base64Data;
        }
        if (loader) loader.remove();
      })
      .catch(() => {
        const loader = document.getElementById('lightbox-loader');
        if (loader) loader.remove();
      });
  },

  nextPhoto: function() {
    if (this.photoGallery.length <= 1) return;
    this.currentPhotoIndex = (this.currentPhotoIndex + 1) % this.photoGallery.length;
    this.renderPhotoLightbox();
  },

  prevPhoto: function() {
    if (this.photoGallery.length <= 1) return;
    this.currentPhotoIndex = (this.currentPhotoIndex - 1 + this.photoGallery.length) % this.photoGallery.length;
    this.renderPhotoLightbox();
  },

  previewFile: function(fileId, fileName) {
    const previewModalEl = document.getElementById('modalPreview');
    if (!previewModalEl) {
      window.open('https://drive.google.com/file/d/' + fileId + '/view', '_blank');
      return;
    }

    const previewTitle = document.getElementById('preview-file-title');
    if (previewTitle) previewTitle.innerText = fileName;

    const modalBody = this.getModalBodyContainer(previewModalEl);
    const embedUrl = 'https://drive.google.com/file/d/' + fileId + '/preview';
    modalBody.innerHTML = '<iframe id="preview-frame" src="' + embedUrl + '" style="width: 100%; height: 500px; border: none;" class="rounded-3"></iframe>';

    if (this.modalPreviewInst) {
      this.modalPreviewInst.show();
    }
  },

  openSubFolder: function(folderId, folderName) {
    this.folderStack.push({ id: folderId, name: folderName });
    this.currentFolderId = folderId;
    this.renderVaultContent();
  },

  navigateBack: function() {
    if (this.folderStack.length > 1) {
      this.folderStack.pop();
      this.currentFolderId = this.folderStack[this.folderStack.length - 1].id;
      this.renderVaultContent();
    }
  },

  openCreateFolderModal: function() {
    document.getElementById('folder-name-input').value = '';
    this.modalFolderInst.show();
  },

  execCreateFolder: function() {
    const folderName = document.getElementById('folder-name-input').value.trim();
    if (!folderName) {
      Swal.fire('Peringatan', 'Masukkan nama folder!', 'warning');
      return;
    }

    Swal.fire({ title: 'Membuat folder...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    this.serverCall('CREATE_FOLDER', {
      parentFolderId: this.currentFolderId,
      folderName: folderName
    }).then(res => {
      this.modalFolderInst.hide();
      Swal.fire('Berhasil', 'Folder baru berhasil dibuat', 'success');
      this.renderVaultContent();
    });
  },

  renameItem: function(itemId, oldName, isFolder) {
    Swal.fire({
      title: 'Ubah Nama',
      input: 'text',
      inputValue: oldName,
      showCancelButton: true,
      confirmButtonText: 'Simpan',
      cancelButtonText: 'Batal'
    }).then((result) => {
      if (result.isConfirmed && result.value.trim() !== '') {
        Swal.showLoading();
        this.serverCall('RENAME_ITEM', { itemId: itemId, newName: result.value.trim(), isFolder: isFolder })
          .then(res => {
            Swal.fire('Sukses', res.message, 'success');
            this.renderVaultContent();
          });
      }
    });
  },

  deleteItem: function(itemId, isFolder) {
    Swal.fire({
      title: 'Konfirmasi Hapus',
      text: isFolder ? 'Apakah Anda yakin ingin menghapus folder ini beserta isinya?' : 'Apakah Anda yakin ingin menghapus berkas ini?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Ya, Hapus!',
      cancelButtonText: 'Batal'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.showLoading();
        this.serverCall('DELETE_ITEM', { itemId: itemId, isFolder: isFolder })
          .then(res => {
            Swal.fire('Terhapus', res.message, 'success');
            this.renderVaultContent();
          });
      }
    });
  },

  toggleUploadMode: function(mode) {
    const fileWrapper = document.getElementById('wrapper-file-input');
    const folderWrapper = document.getElementById('wrapper-folder-input');
    
    if (mode === 'folder') {
      fileWrapper.classList.add('d-none');
      folderWrapper.classList.remove('d-none');
    } else {
      fileWrapper.classList.remove('d-none');
      folderWrapper.classList.add('d-none');
    }
  },

  compressImage: function(file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) {
    return new Promise((resolve) => {
      if (!file.type.match(/image.*/)) {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          }, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  execUpload: async function() {
    const isFolderMode = document.getElementById('uploadTypeFolder').checked;
    const inputEl = isFolderMode ? document.getElementById('folder-input') : document.getElementById('file-input');
    const files = Array.from(inputEl.files);

    if (files.length === 0) {
      Swal.fire('Peringatan', isFolderMode ? 'Pilih folder yang ingin diunggah!' : 'Pilih file terlebih dahulu!', 'warning');
      return;
    }

    Swal.fire({
      title: 'Mengunggah ' + files.length + ' File...',
      html: '<div id="upload-progress-text">Mengompres gambar & mempersiapkan berkas...</div>',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      const filePromises = files.map(async (file) => {
        const compressed = file.type.match(/image.*/) ? await this.compressImage(file) : file;

        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              name: compressed.name,
              mimeType: compressed.type || 'application/octet-stream',
              relativePath: file.webkitRelativePath || compressed.name,
              base64: e.target.result.split(',')[1]
            });
          };
          reader.readAsDataURL(compressed);
        });
      });

      const preparedFiles = await Promise.all(filePromises);

      if (isFolderMode) {
        const res = await this.serverCall('UPLOAD_FOLDER_STRUCTURE', {
          parentFolderId: this.currentFolderId,
          files: preparedFiles
        });

        this.modalUploadInst.hide();
        inputEl.value = '';
        if (res.success) {
          Swal.fire('Selesai', 'Folder beserta seluruh isinya (' + res.uploadedCount + ' file) berhasil diunggah!', 'success');
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan saat mengunggah folder', 'error');
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
        Swal.fire('Selesai', successCount + ' dari ' + files.length + ' file berhasil diunggah!', 'success');
      }

      this.renderVaultContent();
    } catch (err) {
      Swal.fire('Error', err.toString(), 'error');
    }
  },

  openVaultSettingsModal: function() {
    document.getElementById('setting-vault-name').value = this.activeVault.nama;
    document.getElementById('setting-vault-pin').value = '';
    this.modalVaultSettingsInst.show();
  },

  execUpdateVaultSettings: function() {
    const newName = document.getElementById('setting-vault-name').value.trim();
    const newPin = document.getElementById('setting-vault-pin').value.trim();

    if (!newName) {
      Swal.fire('Peringatan', 'Nama Berangkas tidak boleh kosong!', 'warning');
      return;
    }

    if (newPin && newPin.length !== 6) {
      Swal.fire('Peringatan', 'PIN Harus 6 digit angka atau kosongkan jika tanpa PIN!', 'warning');
      return;
    }

    Swal.showLoading();
    this.serverCall('USER_UPDATE_VAULT', {
      vaultId: this.activeVault.id,
      newName: newName,
      newPin: newPin
    }).then(res => {
      if (res.success) {
        this.modalVaultSettingsInst.hide();
        Swal.fire('Berhasil', 'Pengaturan Berangkas berhasil diperbarui', 'success');
        
        this.activeVault.nama = newName;
        this.folderStack[0].name = newName;
        
        this.serverCall('GET_INITIAL_DATA').then(r => {
          this.vaults = r.vaults;
          this.renderSidebar();
          this.renderVaultContent();
        });
      } else {
        Swal.fire('Gagal', res.message, 'error');
      }
    });
  },

  openAdminModal: function() {
    this.closeSidebarMobile();
    document.getElementById('admin-user').value = '';
    document.getElementById('admin-pass').value = '';
    this.modalAdminInst.show();
  },

  submitAdminLogin: function() {
    const u = document.getElementById('admin-user').value;
    const p = document.getElementById('admin-pass').value;

    if (!u || !p) {
      Swal.fire('Peringatan', 'Username dan Password tidak boleh kosong!', 'warning');
      return;
    }

    this.serverCall('ADMIN_LOGIN', { username: u, password: p })
      .then(res => {
        if (res.success) {
          this.modalAdminInst.hide();
          this.currentRole = 'ADMIN';
          document.getElementById('btn-mode-admin').classList.add('d-none');
          document.getElementById('btn-mode-public').classList.remove('d-none');
          document.getElementById('status-badge').className = 'badge bg-warning text-dark px-3 py-2 fw-bold';
          document.getElementById('status-badge').innerText = 'Status: Mode Admin';
          Swal.fire('Login Admin Sukses', 'Panel Kontrol Dibuka', 'success');
          this.vaults = res.vaults || this.vaults;
          this.renderAdminDashboard(this.vaults);
        } else {
          Swal.fire('Gagal Login', res.message, 'error');
        }
      });
  },

  switchPublicMode: function() {
    this.currentRole = 'PUBLIC';
    document.getElementById('btn-mode-admin').classList.remove('d-none');
    document.getElementById('btn-mode-public').classList.add('d-none');
    document.getElementById('status-badge').className = 'badge bg-dark border border-secondary text-warning px-3 py-2';
    document.getElementById('status-badge').innerText = 'Status: Publik';
    this.fetchInitialData();
  },

  renderAdminDashboard: function(vaults) {
    this.activeVault = null;
    this.currentFolderId = null;

    document.getElementById('header-title').innerHTML = 
      '<div class="top-navbar-title-wrap">' +
        '<i class="fas fa-sliders text-warning fa-lg"></i>' +
        '<span class="fw-bold fs-5 text-dark text-truncate">PANEL MANAJEMEN ADMIN</span>' +
      '</div>';
    
    let html = '<div class="p-3 p-md-4">' +
               '<div class="d-flex justify-content-between align-items-center mb-4">' +
               '<h5 class="fw-bold text-dark m-0">Daftar Menu Berangkas</h5>' +
               '<button class="btn btn-gold" onclick="App.openCreateVaultModal()"><i class="fas fa-plus-circle me-2"></i> Tambah Menu Berangkas</button>' +
               '</div>' +
               '<div class="dark-vault p-4 rounded-4 mb-4"><div class="table-responsive"><table class="table table-dark-vault align-middle"><thead><tr>' +
               '<th>ID</th><th>Nama Menu Berangkas</th><th>PIN (Atur/Kosongkan)</th><th class="text-center">Aksi</th>' +
               '</tr></thead><tbody>';

    const totalItems = vaults.length;
    vaults.forEach((v, index) => {
      const isFirst = index === 0 ? 'disabled' : '';
      const isLast = index === totalItems - 1 ? 'disabled' : '';
      const safeVaultName = this.escapeQuotes(v.nama);

      html += '<tr>' +
              '<td class="fw-bold text-warning">' + v.id + '</td>' +
              '<td><input type="text" id="admin-name-' + v.id + '" class="form-control form-control-dark" value="' + safeVaultName + '"></td>' +
              '<td><input type="text" maxlength="6" id="admin-pin-' + v.id + '" class="form-control form-control-dark" value="' + (v.pin || '') + '" placeholder="Kosongkan jika Tanpa PIN"></td>' +
              '<td class="text-center"><div class="d-flex align-items-center justify-content-center gap-1">' +
              '<button class="btn btn-sm btn-outline-metal" onclick="App.moveVaultOrder(\'' + v.id + '\', \'up\')" ' + isFirst + ' title="Pindah Ke Atas"><i class="fas fa-arrow-up"></i></button>' +
              '<button class="btn btn-sm btn-outline-metal" onclick="App.moveVaultOrder(\'' + v.id + '\', \'down\')" ' + isLast + ' title="Pindah Ke Bawah"><i class="fas fa-arrow-down"></i></button>' +
              '<button class="btn btn-gold btn-sm ms-2" onclick="App.saveVaultConfig(\'' + v.id + '\')"><i class="fas fa-save me-1"></i> Simpan</button>' +
              '<button class="btn btn-outline-danger btn-sm" onclick="App.deleteVault(\'' + v.id + '\')"><i class="fas fa-trash me-1"></i> Hapus</button>' +
              '</div></td></tr>';
    });

    html += '</tbody></table></div></div></div>';
    document.getElementById('view-container').innerHTML = html;
  },

  moveVaultOrder: function(vaultId, direction) {
    const index = this.vaults.findIndex(v => String(v.id).toUpperCase() === String(vaultId).toUpperCase());
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.vaults.length) return;

    const newVaults = [...this.vaults];
    const temp = newVaults[index];
    newVaults[index] = newVaults[targetIndex];
    newVaults[targetIndex] = temp;
    this.vaults = newVaults;

    this.renderSidebar();
    this.renderAdminDashboard(this.vaults);

    const orderedIds = this.vaults.map(v => v.id);
    this.serverCall('UPDATE_VAULT_ORDER', { orderedIds: orderedIds })
      .catch(err => console.error('Error re-ordering vaults:', err));
  },

  openCreateVaultModal: function() {
    document.getElementById('new-vault-name').value = '';
    document.getElementById('new-vault-pin').value = '';
    this.modalVaultInst.show();
  },

  execCreateVault: function() {
    const name = document.getElementById('new-vault-name').value.trim();
    const pin = document.getElementById('new-vault-pin').value.trim();

    if (!name) {
      Swal.fire('Peringatan', 'Nama Berangkas wajib diisi!', 'warning');
      return;
    }

    if (pin && pin.length !== 6) {
      Swal.fire('Peringatan', 'PIN Harus 6 digit angka atau kosongkan!', 'warning');
      return;
    }

    Swal.showLoading();
    this.serverCall('CREATE_VAULT', { vaultName: name, pin: pin })
      .then(res => {
        this.modalVaultInst.hide();
        if (res.success) {
          Swal.fire('Berhasil', res.message, 'success');
          this.refreshAdminDashboard();
        } else {
          Swal.fire('Gagal', res.message, 'error');
        }
      })
      .catch(err => {
        Swal.fire('Error', err.toString(), 'error');
      });
  },

  saveVaultConfig: function(id) {
    const newName = document.getElementById('admin-name-' + id).value.trim();
    const newPin = document.getElementById('admin-pin-' + id).value.trim();

    if (!newName) {
      Swal.fire('Peringatan', 'Nama Berangkas tidak boleh kosong!', 'warning');
      return;
    }

    if (newPin && newPin.length !== 6) {
      Swal.fire('Peringatan', 'PIN Harus 6 digit angka atau kosongkan!', 'warning');
      return;
    }

    Swal.showLoading();
    this.serverCall('UPDATE_VAULT', { vaultId: id, newName: newName, newPin: newPin })
      .then(res => {
        if (res.success) {
          Swal.fire('Tersimpan', res.message, 'success');
          this.refreshAdminDashboard();
        } else {
          Swal.fire('Gagal', res.message, 'error');
        }
      });
  },

  deleteVault: function(id) {
    Swal.fire({
      title: 'Hapus Menu Berangkas?',
      text: 'Menu ini akan dihapus dari sistem dasbor.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Ya, Hapus Menu!',
      cancelButtonText: 'Batal'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.showLoading();
        this.serverCall('DELETE_VAULT', { vaultId: id })
          .then(res => {
            Swal.fire('Terhapus', res.message, 'success');
            this.refreshAdminDashboard();
          });
      }
    });
  },

  refreshAdminDashboard: function() {
    this.serverCall('GET_INITIAL_DATA').then(r => {
      if (r.success) {
        this.vaults = r.vaults;
        this.renderSidebar();
        this.renderAdminDashboard(r.vaults);
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', function() {
  App.init();
});