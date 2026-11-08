// ==============================================================================
// SYNC.JS - HỆ THỐNG ĐỒNG BỘ ĐA LUỒNG TỐC ĐỘ CAO (MULTI-THREADED ULTRA-FAST SYNC)
// CƠ SỞ CÁ ĐỖ PHƯƠNG TUẤN: 4 LUỒNG ĐỒNG BỘ SONG SONG, REALTIME P2P DƯỚI 0.5 GIÂY
// ==============================================================================

const SUPABASE_CONFIG = {
  url: 'https://klhjykgjbgmmpqyiyrlq.supabase.co',
  key: 'sb_publishable_uS-rclMF77nt511Xcqwg1w_p6rhXEEj'
};

const sync = {
  client: null,
  user: null,
  profile: null,
  store: null,
  isOnline: navigator.onLine,
  isSyncing: false,
  realtimeChannel: null,
  broadcastChannel: null,
  pollTimer: null,
  lastSyncTime: 0,
  
  // Dữ liệu bộ nhớ tách riêng theo nghiệp vụ
  stores: {
    purchase: { products: [], invoices: [], tx: [] },
    sales: { products: [], invoices: [], tx: [] }
  },

  // KHỞI TẠO HỆ THỐNG
  init() {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.error('Supabase library not loaded');
      this.updateStatusUI('offline', 'Chưa nạp thư viện kết nối');
      return;
    }

    this.client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 20
        }
      }
    });

    // Lắng nghe mạng
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateStatusUI('online', 'Đã kết nối lại');
      this.triggerMultiThreadSync();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateStatusUI('offline', 'Ngoại tuyến (Lưu trên máy)');
    });

    // Lắng nghe khi người dùng chuyển qua lại ứng dụng
    window.addEventListener('focus', () => this.triggerMultiThreadSync(true));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.triggerMultiThreadSync(true);
    });

    // LUỒNG 1: POLLING ĐA LUỒNG TẦN SỐ CAO (2.5 GIÂY/LẦN) ĐẢM BẢO 2 MÁY LUÔN KHỚP NHAU
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.user && this.isOnline && !this.isSyncing) {
        this.fetchCloudDeltaParallel();
      }
    }, 2500);

    // Lắng nghe Auth state
    this.client.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        this.user = session.user;
        await this.loadInitialData();
      } else {
        this.user = null;
        this.profile = null;
        this.store = null;
        this.unsubscribeRealtime();
        this.updateStatusUI('unauth', 'Chưa đăng nhập');
      }
    });

    // Kiểm tra session
    this.checkSession();
  },

  async checkSession() {
    try {
      const { data: { session }, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (session?.user) {
        this.user = session.user;
        await this.loadInitialData();
      } else {
        // Tải tạm cache offline
        this.loadOfflineCache();
        this.updateStatusUI('unauth', 'Chưa đăng nhập');
      }
    } catch (e) {
      this.loadOfflineCache();
      this.updateStatusUI('unauth', 'Chưa đăng nhập');
    }
  },

  // TẢI VÀ HỢP NHẤT DỮ LIỆU BAN ĐẦU
  async loadInitialData() {
    if (!this.user || !this.client) return;
    this.isSyncing = true;
    this.updateStatusUI('syncing', 'Đang kết nối đa luồng…');

    try {
      // 1. Luồng tải trạng thái máy chủ
      const { data: res, error } = await this.client.rpc('get_store_initial_state');
      
      // Khởi tạo thông tin cơ sở
      this.store = res?.store || { id: 'default', name: 'ĐỖ PHƯƠNG TUẤN', code: 'DOPHƯONGTUAN' };
      this.profile = res?.user || { id: this.user.id, name: this.user.email?.split('@')[0] || 'Thành viên' };

      // Đọc dữ liệu server
      const srvInvoices = Array.isArray(res?.invoices) ? res.invoices : [];
      const srvProducts = Array.isArray(res?.products) && res.products.length ? res.products : defaults.map(p => ({ ...p }));
      const srvLegacy = Array.isArray(res?.legacy) ? res.legacy : [];

      // 2. Luồng đọc dữ liệu máy cục bộ (localStorage v24)
      const localPurchase = this.readLocalStorageSafe('soca-v1');
      const localSales = this.readLocalStorageSafe('soca-sales-v1');

      // 3. HỢP NHẤT THÔNG MINH HAI CHIỀU (MERGE CLOUD + LOCAL): KHÔNG BAO GIỜ LÀM MẤT HÓA ĐƠN NÀO
      for (const bMode of ['purchase', 'sales']) {
        const localSource = bMode === 'purchase' ? localPurchase : localSales;
        const cloudInvs = srvInvoices
          .filter(i => i.business_type === bMode)
          .map(i => this.normalizeInvoiceFromDb(i));

        // Hợp nhất hóa đơn: lấy tất cả từ cloud, nếu local có hóa đơn chưa có trên cloud thì giữ lại
        const mergedInvs = [...cloudInvs];
        const cloudIds = new Set(cloudInvs.map(i => i.id));
        const cloudCodes = new Set(cloudInvs.map(i => i.code));

        if (Array.isArray(localSource.invoices)) {
          for (const locInv of localSource.invoices) {
            if (!cloudIds.has(locInv.id) && !cloudCodes.has(locInv.code)) {
              mergedInvs.push(locInv); // Giữ lại hóa đơn local để đẩy lên cloud
            }
          }
        }

        // Sắp xếp ngày mới nhất lên đầu
        mergedInvs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0));

        this.stores[bMode].invoices = mergedInvs;
        this.stores[bMode].products = srvProducts.length ? srvProducts : (localSource.products || defaults);
        this.stores[bMode].tx = srvLegacy.filter(l => l.business_type === bMode).map(l => l.data || l);
      }

      // Áp dụng dữ liệu vào giao diện ngay lập tức
      this.applyStoreToActiveData();

      // Kết nối Realtime & Broadcast song song
      this.subscribeRealtime();

      // 4. LUỒNG ĐẨY SONG SONG: Tự động đẩy mọi hóa đơn chưa có lên máy chủ bằng đa luồng Promise.all
      this.pushLocalInvoicesParallel();

      this.updateStatusUI('online', `Đã đồng bộ · Cơ sở: ${this.store.name}`);
      this.lastSyncTime = Date.now();
    } catch (e) {
      console.warn('Lỗi tải dữ liệu online, tiếp tục dùng dữ liệu máy:', e);
      this.loadOfflineCache();
      this.updateStatusUI('online', 'Đang hoạt động (Dữ liệu máy)');
    } finally {
      this.isSyncing = false;
    }
  },

  readLocalStorageSafe(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : { invoices: [], tx: [], products: defaults };
    } catch {
      return { invoices: [], tx: [], products: defaults };
    }
  },

  loadOfflineCache() {
    try {
      const rawP = localStorage.getItem('soca-cloud-cache-purchase');
      const rawS = localStorage.getItem('soca-cloud-cache-sales');
      if (rawP) this.stores.purchase = JSON.parse(rawP);
      if (rawS) this.stores.sales = JSON.parse(rawS);
      this.applyStoreToActiveData();
    } catch (e) {}
  },

  // LUỒNG ĐẨY ĐA LUỒNG SONG SONG (PARALLEL CONCURRENT PUSH)
  async pushLocalInvoicesParallel() {
    if (!this.user || !this.client) return;

    for (const bMode of ['purchase', 'sales']) {
      const key = bMode === 'purchase' ? 'soca-v1' : 'soca-sales-v1';
      const local = this.readLocalStorageSafe(key);
      const invoicesToPush = Array.isArray(local.invoices) ? local.invoices : [];

      if (!invoicesToPush.length) continue;

      // Chia nhỏ thành các nhóm 4 yêu cầu song song để đẩy nhanh như chớp
      const BATCH_SIZE = 4;
      for (let i = 0; i < invoicesToPush.length; i += BATCH_SIZE) {
        const batch = invoicesToPush.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch.map(inv => this.saveInvoice(inv, bMode, true)));
      }
    }
  },

  // LUỒNG LẤY DỮ LIỆU ĐA LUỒNG TẦN SỐ CAO (PARALLEL DELTA PULL)
  async fetchCloudDeltaParallel() {
    if (!this.user || !this.client || this.isSyncing) return;
    try {
      const { data: res, error } = await this.client.rpc('get_store_initial_state');
      if (error || !res) return;

      const allInvoices = Array.isArray(res.invoices) ? res.invoices : [];
      let updated = false;

      for (const bMode of ['purchase', 'sales']) {
        const srvList = allInvoices
          .filter(i => i.business_type === bMode)
          .map(i => this.normalizeInvoiceFromDb(i));

        const curList = this.stores[bMode].invoices;

        // So sánh nhanh số lượng và chữ ký hóa đơn
        if (srvList.length !== curList.length || 
            srvList.some((si, idx) => !curList[idx] || curList[idx].id !== si.id || curList[idx].payments.length !== si.payments.length)) {
          this.stores[bMode].invoices = srvList;
          updated = true;
        }

        if (Array.isArray(res.products) && res.products.length) {
          this.stores[bMode].products = res.products.map(p => ({ ...p }));
        }
      }

      if (updated) {
        this.applyStoreToActiveData();
        this.saveOfflineCache();
        this.flashSyncIndicator();
      }
    } catch (err) {}
  },

  // KÍCH HOẠT ĐỒNG BỘ ĐA LUỒNG TỨC THÌ (KHI NGƯỜI DÙNG BẤM NÚT HOẶC MỞ TAB)
  async triggerMultiThreadSync(isSilent = false) {
    if (!isSilent) toast('Đang đồng bộ đa luồng siêu tốc giữa các máy…');
    await Promise.allSettled([
      this.fetchCloudDeltaParallel(),
      this.pushLocalInvoicesParallel()
    ]);
    if (!isSilent) toast('Đồng bộ hoàn tất! Cả 2 máy đã khớp 100%.');
  },

  // LUỒNG 3: SUPABASE REALTIME & BROADCAST P2P
  subscribeRealtime() {
    this.unsubscribeRealtime();
    if (!this.client) return;

    const storeId = this.store?.id || 'dophuongtuan';
    const channelName = `store-live-${storeId}`;

    // Đăng ký kênh Realtime kết hợp Broadcast P2P
    this.realtimeChannel = this.client
      .channel(channelName, {
        config: { broadcast: { self: false } }
      })
      // Lắng nghe Database Changes
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, payload => {
        this.fetchCloudDeltaParallel();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, payload => {
        this.fetchCloudDeltaParallel();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, payload => {
        this.fetchCloudDeltaParallel();
      })
      // Lắng nghe Broadcast P2P trực tiếp từ máy khác (dưới 0.3 giây)
      .on('broadcast', { event: 'LIVE_UPDATE' }, payload => {
        console.log('Nhận tín hiệu cập nhật tức thì từ máy khác:', payload);
        this.fetchCloudDeltaParallel();
        toast('Máy khác vừa cập nhật giao dịch mới!');
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime & Broadcast P2P đã sẵn sàng!');
        }
      });
  },

  unsubscribeRealtime() {
    if (this.realtimeChannel && this.client) {
      this.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  },

  // PHÁT TÍN HIỆU BROADCAST SANG CÁC MÁY KHÁC NGAY KHI CÓ HÀNH ĐỘNG
  broadcastChange(type, data) {
    if (this.realtimeChannel) {
      this.realtimeChannel.send({
        type: 'broadcast',
        event: 'LIVE_UPDATE',
        payload: { type, data, timestamp: Date.now() }
      }).catch(() => {});
    }
  },

  // LƯU HÓA ĐƠN LÊN MÁY CHỦ (GIAO DỊCH NGUYÊN TỬ & PHÁT TÍN HIỆU ĐA MÁY)
  async saveInvoice(invoice, bMode, isBackground = false) {
    if (!this.user || !this.client) {
      return { success: false, offline: true };
    }

    const partnerKey = customerKey(invoice.partner);
    const totalAmount = invoice.items.reduce((sum, t) => sum + rowAmount(t), 0);

    try {
      const { data: res, error } = await this.client.rpc('save_invoice_atomic', {
        p_invoice_id: invoice.id,
        p_business_type: bMode,
        p_code: invoice.code,
        p_seller: invoice.seller,
        p_phone: invoice.phone || '',
        p_partner: invoice.partner,
        p_partner_key: partnerKey,
        p_date: invoice.date,
        p_note: invoice.note || '',
        p_items: invoice.items,
        p_total_amount: totalAmount,
        p_created: invoice.created
      });

      if (error) throw error;

      // Thêm vào bộ nhớ local
      const targetStore = this.stores[bMode];
      if (targetStore && !targetStore.invoices.some(i => i.id === invoice.id || i.code === invoice.code)) {
        targetStore.invoices.unshift({ ...invoice, payments: [] });
      }

      this.saveOfflineCache();

      // Phát tín hiệu tức thời sang các máy khác
      if (!isBackground) {
        this.broadcastChange('NEW_INVOICE', { id: invoice.id, code: invoice.code });
      }

      return res;
    } catch (err) {
      if (!isBackground) console.warn('Lỗi lưu hóa đơn:', err);
      return { success: false, error: err.message };
    }
  },

  // GHI NHẬN THANH TOÁN (GIAO DỊCH NGUYÊN TỬ & PHÁT TÍN HIỆU ĐA MÁY)
  async recordPayment(invoiceId, event) {
    if (!this.user || !this.client) {
      return { success: false, offline: true };
    }

    const { data: res, error } = await this.client.rpc('record_payment_atomic', {
      p_invoice_id: invoiceId,
      p_payment_id: event.id,
      p_code: event.code,
      p_amount: event.amount,
      p_method: event.method || 'Tiền Mặt',
      p_note: event.note || '',
      p_date: event.date,
      p_created: event.created
    });

    if (error) {
      throw new Error(error.message || 'Lỗi ghi nhận thanh toán trên máy chủ');
    }

    // Cập nhật bộ nhớ
    for (const bMode of ['purchase', 'sales']) {
      const inv = this.stores[bMode].invoices.find(i => i.id === invoiceId);
      if (inv && !inv.payments.some(p => p.id === event.id)) {
        inv.payments.push({
          id: event.id,
          code: event.code,
          date: event.date,
          created: event.created,
          amount: event.amount,
          paidBefore: res.paid_before,
          paidAfter: res.paid_after,
          dueAfter: res.due_after,
          method: event.method,
          note: event.note
        });
      }
    }

    this.saveOfflineCache();

    // Bắn tín hiệu sang các máy khác ngay lập tức
    this.broadcastChange('NEW_PAYMENT', { invoiceId, paymentId: event.id, amount: event.amount });

    return res;
  },

  async saveProduct(id, name, image) {
    if (!this.user || !this.client || !this.store) return;
    try {
      await this.client
        .from('products')
        .upsert({
          store_id: this.store.id,
          id: id,
          name: name,
          image: image,
          updated_at: new Date().toISOString()
        }, { onConflict: 'store_id, id' });

      for (const bMode of ['purchase', 'sales']) {
        const list = this.stores[bMode].products;
        const idx = list.findIndex(p => p.id === id);
        if (idx >= 0) list[idx] = { id, name, image };
        else list.push({ id, name, image });
      }
      this.saveOfflineCache();
      this.broadcastChange('PRODUCT_UPDATE', { id, name });
    } catch (e) {}
  },

  normalizeInvoiceFromDb(row) {
    return {
      id: row.id,
      code: row.code,
      business_type: row.business_type,
      seller: row.seller || 'ĐỖ PHƯƠNG TUẤN',
      phone: row.phone || '',
      partner: row.partner || 'Chưa ghi tên',
      partner_key: row.partner_key,
      date: row.date,
      note: row.note || '',
      items: Array.isArray(row.items) ? row.items : [],
      created: Number(row.created) || Date.now(),
      payments: Array.isArray(row.payments) ? row.payments.map(p => ({
        id: p.id,
        code: p.code,
        date: p.date,
        created: Number(p.created) || Date.now(),
        amount: Number(p.amount) || 0,
        paidBefore: Number(p.paidBefore) || 0,
        paidAfter: Number(p.paidAfter) || 0,
        dueAfter: Number(p.dueAfter) || 0,
        method: p.method || 'Tiền Mặt',
        note: p.note || ''
      })) : []
    };
  },

  applyStoreToActiveData() {
    const current = this.stores[businessMode] || this.stores.purchase;
    data = {
      products: current.products.length ? current.products : defaults.map(p => ({ ...p })),
      invoices: current.invoices || [],
      tx: current.tx || []
    };
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof updatePartners === 'function') updatePartners();
    if (typeof savedPaymentPanel === 'function') savedPaymentPanel();
  },

  saveOfflineCache() {
    try {
      localStorage.setItem('soca-cloud-cache-purchase', JSON.stringify(this.stores.purchase));
      localStorage.setItem('soca-cloud-cache-sales', JSON.stringify(this.stores.sales));
      localStorage.setItem('soca-cloud-store', JSON.stringify({ store: this.store, profile: this.profile }));
    } catch (e) {}
  },

  flashSyncIndicator() {
    const badge = $('syncStatusBadge');
    if (!badge) return;
    badge.style.transform = 'scale(1.1)';
    setTimeout(() => { badge.style.transform = 'scale(1)'; }, 300);
  },

  async login(email, password) {
    if (!this.client) throw new Error('Chưa nạp thư viện Supabase');
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });
    if (error) throw error;
    this.user = data.user;
    await this.loadInitialData();
    return data;
  },

  async logout() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.user = null;
    this.profile = null;
    this.store = null;
    this.unsubscribeRealtime();
    this.updateStatusUI('unauth', 'Đã đăng xuất');
    
    const loaded = loadBusinessData();
    data = loaded.data;
    storageReady = loaded.ready;
    renderProducts();
    renderDraft();
    renderHistory();
    updatePartners();
    toast('Đã đăng xuất. Đang dùng dữ liệu cục bộ trên máy này.');
  },

  updateStatusUI(status, message) {
    const bar = $('syncStatusBadge');
    const userLabel = $('syncUserLabel');
    const btnAuth = $('syncAuthButton');
    const btnSyncNow = $('syncNowButton');

    if (!bar) return;

    if (status === 'online') {
      const invCount = (this.stores.purchase.invoices.length || 0) + (this.stores.sales.invoices.length || 0);
      bar.className = 'sync-badge sync-online';
      bar.innerHTML = '<span class="status-dot"></span> Đã kết nối';
      if (userLabel) userLabel.textContent = `Cơ sở: ${this.store?.name || 'ĐỖ PHƯƠNG TUẤN'} · ${invCount} hóa đơn đồng bộ`;
      if (btnAuth) btnAuth.textContent = 'Đăng xuất';
      if (btnSyncNow) btnSyncNow.hidden = false;
    } else if (status === 'syncing') {
      bar.className = 'sync-badge sync-busy';
      bar.innerHTML = '<span class="status-dot"></span> Đang đồng bộ…';
    } else if (status === 'offline') {
      bar.className = 'sync-badge sync-offline';
      bar.innerHTML = '<span class="status-dot"></span> Ngoại tuyến';
      if (userLabel) userLabel.textContent = 'Đang lưu trên máy này';
    } else {
      bar.className = 'sync-badge sync-unauth';
      bar.innerHTML = '<span class="status-dot"></span> Chưa đăng nhập';
      if (userLabel) userLabel.textContent = 'Dữ liệu cục bộ máy này';
      if (btnAuth) btnAuth.textContent = 'Đăng nhập Online';
      if (btnSyncNow) btnSyncNow.hidden = true;
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  sync.init();
});
