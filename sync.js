// ==============================================================================
// SYNC.JS - SUPABASE ONLINE SYNC & REALTIME QUẢN LÝ CƠ SỞ CÁ ĐỖ PHƯƠNG TUẤN
// Tách biệt tuyệt đối Nhập Hàng & Bán Hàng, Giao dịch nguyên tử, Chống trùng lặp
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
  
  // Cache dữ liệu server theo nghiệp vụ
  stores: {
    purchase: { products: [], invoices: [], tx: [] },
    sales: { products: [], invoices: [], tx: [] }
  },

  // Khởi tạo Supabase client
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
      }
    });

    // Lắng nghe trạng thái mạng
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateStatusUI('online', 'Đã kết nối mạng');
      this.fetchLatest();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateStatusUI('offline', 'Mất kết nối mạng (Ngoại tuyến)');
    });

    // Lắng nghe khi tab active trở lại
    window.addEventListener('focus', () => {
      if (this.user && this.isOnline) this.fetchLatest();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.user && this.isOnline) this.fetchLatest();
    });

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

    // Kiểm tra session ban đầu
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
        this.updateStatusUI('unauth', 'Chưa đăng nhập');
      }
    } catch (e) {
      console.warn('Session check failed:', e);
      this.updateStatusUI('unauth', 'Chưa đăng nhập');
    }
  },

  // Tải dữ liệu ban đầu từ Supabase thông qua RPC get_store_initial_state
  async loadInitialData() {
    if (!this.user || !this.client) return;
    this.isSyncing = true;
    this.updateStatusUI('syncing', 'Đang tải dữ liệu…');

    try {
      const { data: res, error } = await this.client.rpc('get_store_initial_state');
      if (error) throw error;

      if (!res || !res.authenticated) {
        this.updateStatusUI('unauth', 'Tài khoản chưa thuộc cơ sở nào');
        return;
      }

      this.store = res.store;
      this.profile = res.user;

      // Phân bổ danh mục cá (dùng chung cho cả 2 tab)
      const products = Array.isArray(res.products) && res.products.length > 0 
        ? res.products 
        : defaults.map(p => ({ ...p }));

      // Phân bổ hóa đơn và legacy tx theo business_type
      const allInvoices = Array.isArray(res.invoices) ? res.invoices : [];
      const allLegacy = Array.isArray(res.legacy) ? res.legacy : [];

      this.stores.purchase.products = products.map(p => ({ ...p }));
      this.stores.purchase.invoices = allInvoices
        .filter(i => i.business_type === 'purchase')
        .map(i => this.normalizeInvoiceFromDb(i));
      this.stores.purchase.tx = allLegacy
        .filter(l => l.business_type === 'purchase')
        .map(l => l.data);

      this.stores.sales.products = products.map(p => ({ ...p }));
      this.stores.sales.invoices = allInvoices
        .filter(i => i.business_type === 'sales')
        .map(i => this.normalizeInvoiceFromDb(i));
      this.stores.sales.tx = allLegacy
        .filter(l => l.business_type === 'sales')
        .map(l => l.data);

      // Cập nhật bộ nhớ data hiện tại theo businessMode đang chọn
      this.applyStoreToActiveData();

      // Lưu bản sao cache vào localStorage để khi mất mạng vẫn có dữ liệu xem
      this.saveOfflineCache();

      // Kết nối Realtime
      this.subscribeRealtime();

      this.updateStatusUI('online', `Đã đồng bộ · Cơ sở: ${this.store.name}`);
      toast(`Đã kết nối online: ${this.store.name} (${this.profile.name || this.user.email})`);
    } catch (e) {
      console.error('Load initial data error:', e);
      this.updateStatusUI('error', 'Lỗi đồng bộ: ' + (e.message || ''));
      toast('Không thể tải dữ liệu online, đang dùng dữ liệu lưu tạm trên máy.');
    } finally {
      this.isSyncing = false;
    }
  },

  // Đồng bộ lại khi quay lại ứng dụng
  async fetchLatest() {
    if (!this.user || !this.client || this.isSyncing) return;
    await this.loadInitialData();
  },

  // Chuẩn hóa cấu trúc hóa đơn đọc từ CSDL về cấu trúc v24
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

  // Đẩy dữ liệu của tab hiện tại vào biến data của app.js
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

  // Lưu cache offline vào localStorage (không ảnh hưởng dữ liệu gốc)
  saveOfflineCache() {
    try {
      localStorage.setItem('soca-cloud-cache-purchase', JSON.stringify(this.stores.purchase));
      localStorage.setItem('soca-cloud-cache-sales', JSON.stringify(this.stores.sales));
      localStorage.setItem('soca-cloud-store', JSON.stringify({ store: this.store, profile: this.profile }));
    } catch (e) {
      console.warn('Lỗi lưu cache offline:', e);
    }
  },

  // Đăng ký Supabase Realtime để nhận thay đổi tức thời từ các máy khác
  subscribeRealtime() {
    this.unsubscribeRealtime();
    if (!this.client || !this.store) return;

    const channelName = `store-sync-${this.store.id}`;
    this.realtimeChannel = this.client
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoices',
        filter: `store_id=eq.${this.store.id}`
      }, payload => this.handleRealtimeInvoice(payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
        filter: `store_id=eq.${this.store.id}`
      }, payload => this.handleRealtimePayment(payload))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `store_id=eq.${this.store.id}`
      }, payload => this.handleRealtimeProduct(payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscribed successfully for store:', this.store.id);
        }
      });
  },

  unsubscribeRealtime() {
    if (this.realtimeChannel && this.client) {
      this.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  },

  // Xử lý sự kiện Realtime khi máy khác thêm hóa đơn
  handleRealtimeInvoice(payload) {
    if (payload.eventType === 'INSERT') {
      const row = payload.new;
      const bType = row.business_type || 'purchase';
      const targetStore = this.stores[bType];
      if (!targetStore) return;

      // Kiểm tra trùng
      if (!targetStore.invoices.some(i => i.id === row.id || i.code === row.code)) {
        const inv = this.normalizeInvoiceFromDb({ ...row, payments: [] });
        targetStore.invoices.unshift(inv);
        if (businessMode === bType) {
          this.applyStoreToActiveData();
          toast(`Máy khác vừa xuất hóa đơn ${inv.code} (${inv.partner})`);
        }
      }
    }
  },

  // Xử lý sự kiện Realtime khi máy khác thêm thanh toán
  handleRealtimePayment(payload) {
    if (payload.eventType === 'INSERT') {
      const p = payload.new;
      // Tìm hóa đơn ở cả 2 tab
      for (const bType of ['purchase', 'sales']) {
        const inv = this.stores[bType].invoices.find(i => i.id === p.invoice_id);
        if (inv) {
          if (!inv.payments.some(existing => existing.id === p.id || existing.code === p.code)) {
            inv.payments.push({
              id: p.id,
              code: p.code,
              date: p.date,
              created: Number(p.created) || Date.now(),
              amount: Number(p.amount) || 0,
              paidBefore: Number(p.paid_before) || 0,
              paidAfter: Number(p.paid_after) || 0,
              dueAfter: Number(p.due_after) || 0,
              method: p.method || 'Tiền Mặt',
              note: p.note || ''
            });
            if (businessMode === bType) {
              this.applyStoreToActiveData();
              toast(`Máy khác vừa thanh toán ${money(p.amount)} cho hóa đơn ${inv.code}`);
            }
          }
          break;
        }
      }
    }
  },

  // Xử lý sự kiện Realtime khi máy khác thêm/đổi hình mặt hàng
  handleRealtimeProduct(payload) {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const prod = payload.new;
      for (const bType of ['purchase', 'sales']) {
        const list = this.stores[bType].products;
        const idx = list.findIndex(p => p.id === prod.id);
        if (idx >= 0) {
          list[idx] = { id: prod.id, name: prod.name, image: prod.image };
        } else {
          list.push({ id: prod.id, name: prod.name, image: prod.image });
        }
      }
      this.applyStoreToActiveData();
      toast(`Mặt hàng ${prod.name} vừa được cập nhật từ thiết bị khác.`);
    }
  },

  // LƯU HÓA ĐƠN LÊN MÁY CHỦ (GIAO DỊCH NGUYÊN TỬ & CHỐNG TRÙNG)
  async saveInvoice(invoice, bMode) {
    if (!this.user || !this.client) {
      return { success: false, offline: true };
    }

    const partnerKey = customerKey(invoice.partner);
    const totalAmount = invoice.items.reduce((sum, t) => sum + rowAmount(t), 0);

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

    // Cập nhật bộ nhớ client
    const targetStore = this.stores[bMode];
    if (targetStore && !targetStore.invoices.some(i => i.id === invoice.id)) {
      targetStore.invoices.unshift({ ...invoice, payments: [] });
    }
    this.saveOfflineCache();

    return res;
  },

  // GHI NHẬN THANH TOÁN LÊN MÁY CHỦ (ATOMIC TRANSACTION - FOR UPDATE CHỐNG RACE CONDITION)
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
      // Bắt lỗi race condition từ PostgreSQL: Số tiền thanh toán vượt quá số còn thiếu
      throw new Error(error.message || 'Lỗi ghi nhận thanh toán trên máy chủ');
    }

    // Cập nhật vào store bộ nhớ
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

    return res;
  },

  // LƯU DANH MỤC CÁ LÊN MÁY CHỦ
  async saveProduct(id, name, image) {
    if (!this.user || !this.client || !this.store) return;
    try {
      const { error } = await this.client
        .from('products')
        .upsert({
          store_id: this.store.id,
          id: id,
          name: name,
          image: image,
          updated_at: new Date().toISOString()
        }, { onConflict: 'store_id, id' });

      if (error) throw error;

      for (const bMode of ['purchase', 'sales']) {
        const list = this.stores[bMode].products;
        const idx = list.findIndex(p => p.id === id);
        if (idx >= 0) list[idx] = { id, name, image };
        else list.push({ id, name, image });
      }
      this.saveOfflineCache();
    } catch (e) {
      console.warn('Lỗi lưu mặt hàng lên máy chủ:', e);
    }
  },

  // ĐỒNG BỘ DỮ LIỆU CŨ TỪ LOCALSTORAGE LÊN MÁY CHỦ (KIỂM TRA TRÙNG, KHÔNG XÓA DỮ LIỆU GỐC)
  async uploadLocalDataToServer() {
    if (!this.user || !this.client || !this.store) {
      throw new Error('Bạn cần đăng nhập vào cơ sở trước khi chuyển dữ liệu.');
    }

    let stats = { invoices: 0, payments: 0, legacy: 0, products: 0, skipped: 0 };

    // 1. Đồng bộ tab NHẬP HÀNG (soca-v1)
    const rawPurchase = localStorage.getItem('soca-v1');
    if (rawPurchase) {
      try {
        const parsed = JSON.parse(rawPurchase);
        await this.migrateLocalStoreData('purchase', parsed, stats);
      } catch (e) {
        console.warn('Lỗi đọc soca-v1:', e);
      }
    }

    // 2. Đồng bộ tab BÁN HÀNG (soca-sales-v1)
    const rawSales = localStorage.getItem('soca-sales-v1');
    if (rawSales) {
      try {
        const parsed = JSON.parse(rawSales);
        await this.migrateLocalStoreData('sales', parsed, stats);
      } catch (e) {
        console.warn('Lỗi đọc soca-sales-v1:', e);
      }
    }

    // Tải lại state mới nhất sau khi migrate
    await this.loadInitialData();

    return stats;
  },

  async migrateLocalStoreData(bMode, localData, stats) {
    if (!localData) return;

    // 1. Đẩy danh mục cá
    if (Array.isArray(localData.products)) {
      for (const p of localData.products) {
        try {
          await this.saveProduct(p.id, fishName(p.name), p.image || null);
          stats.products++;
        } catch (e) {}
      }
    }

    // 2. Đẩy hóa đơn
    if (Array.isArray(localData.invoices)) {
      for (const inv of localData.invoices) {
        try {
          const res = await this.saveInvoice(inv, bMode);
          if (res && !res.idempotent) {
            stats.invoices++;
          } else {
            stats.skipped++;
          }

          // Đẩy các khoản thanh toán của hóa đơn này nếu có
          if (Array.isArray(inv.payments)) {
            for (const pm of inv.payments) {
              try {
                const pmRes = await this.recordPayment(inv.id, pm);
                if (pmRes && !pmRes.idempotent) stats.payments++;
              } catch (err) {}
            }
          }
        } catch (err) {
          console.warn('Lỗi đẩy hóa đơn lên máy chủ:', err);
        }
      }
    }

    // 3. Đẩy legacy tx (dữ liệu cũ chưa đối soát)
    if (Array.isArray(localData.tx)) {
      const covered = new Set((localData.invoices || []).flatMap(i => (i.items || []).map(t => t.id)));
      const legacyTx = localData.tx.filter(t => !covered.has(t.id));
      for (const t of legacyTx) {
        try {
          const { error } = await this.client
            .from('legacy_tx')
            .upsert({
              store_id: this.store.id,
              id: t.id || uid(),
              business_type: bMode,
              data: t
            }, { onConflict: 'store_id, business_type, id' });
          if (!error) stats.legacy++;
        } catch (err) {}
      }
    }
  },

  // AUTH: ĐĂNG NHẬP
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

  // AUTH: ĐĂNG KÝ THÀNH VIÊN VÀO CƠ SỞ
  async register(displayName, email, password, storeCode) {
    if (!this.client) throw new Error('Chưa nạp thư viện Supabase');
    const cleanCode = (storeCode || 'DOPHƯONGTUAN').trim().toUpperCase();
    const { data, error } = await this.client.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          display_name: displayName.trim(),
          store_code: cleanCode
        }
      }
    });
    if (error) throw error;

    // Nếu Supabase tự động đăng nhập sau khi sign up
    if (data.session) {
      this.user = data.user;
      await this.loadInitialData();
    }
    return data;
  },

  // AUTH: ĐĂNG XUẤT
  async logout() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.user = null;
    this.profile = null;
    this.store = null;
    this.unsubscribeRealtime();
    this.updateStatusUI('unauth', 'Đã đăng xuất');
    
    // Tải lại dữ liệu local của v24
    const loaded = loadBusinessData();
    data = loaded.data;
    storageReady = loaded.ready;
    renderProducts();
    renderDraft();
    renderHistory();
    updatePartners();
    toast('Đã đăng xuất khỏi máy chủ. Đang xem dữ liệu lưu trên máy.');
  },

  // CẬP NHẬT GIAO DIỆN THANH TRẠNG THÁI ONLINE/OFFLINE/AUTH
  updateStatusUI(status, message) {
    const bar = $('syncStatusBadge');
    const userLabel = $('syncUserLabel');
    const btnAuth = $('syncAuthButton');
    const syncUploadBtn = $('syncUploadLocalButton');

    if (!bar) return;

    if (status === 'online') {
      bar.className = 'sync-badge sync-online';
      bar.innerHTML = '<span class="status-dot"></span> Online';
      if (userLabel) userLabel.textContent = `${this.store?.name || 'Cơ sở'} · ${this.profile?.name || this.user?.email || 'Thành viên'}`;
      if (btnAuth) btnAuth.textContent = 'Đăng xuất';
      if (syncUploadBtn) syncUploadBtn.hidden = false;
    } else if (status === 'syncing') {
      bar.className = 'sync-badge sync-busy';
      bar.innerHTML = '<span class="status-dot"></span> Đang đồng bộ…';
    } else if (status === 'offline') {
      bar.className = 'sync-badge sync-offline';
      bar.innerHTML = '<span class="status-dot"></span> Ngoại tuyến';
      if (userLabel) userLabel.textContent = 'Đang lưu tạm trên máy này';
    } else { // unauth
      bar.className = 'sync-badge sync-unauth';
      bar.innerHTML = '<span class="status-dot"></span> Chưa đăng nhập';
      if (userLabel) userLabel.textContent = 'Dữ liệu cục bộ máy này';
      if (btnAuth) btnAuth.textContent = 'Đăng nhập Online';
      if (syncUploadBtn) syncUploadBtn.hidden = true;
    }
  }
};

// Khởi tạo ngay khi trang tải xong
window.addEventListener('DOMContentLoaded', () => {
  sync.init();
});
