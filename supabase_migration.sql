-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ CƠ SỞ CÁ ĐỖ PHƯƠNG TUẤN - SUPABASE DATABASE MIGRATION
-- Chạy toàn bộ mã SQL này trong Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. KÍCH HOẠT EXTENSION UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. BẢNG CƠ SỞ KINH DOANH (STORES / BRANCHES)
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'ĐỖ PHƯƠNG TUẤN',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. BẢNG HỒ SƠ NGƯỜI DÙNG & PHÂN QUYỀN CƠ SỞ (PROFILES)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. BẢNG MẶT HÀNG CÁ (PRODUCTS) - DÙNG CHUNG CẢ NHẬP & BÁN TRONG CÙNG CƠ SỞ
CREATE TABLE IF NOT EXISTS public.products (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (store_id, id)
);

-- 5. BẢNG HÓA ĐƠN (INVOICES) - TÁCH BIỆT TUYỆT ĐỐI NHẬP HÀNG & BÁN HÀNG
CREATE TABLE IF NOT EXISTS public.invoices (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('purchase', 'sales')),
  code TEXT NOT NULL,
  seller TEXT NOT NULL DEFAULT 'ĐỖ PHƯƠNG TUẤN',
  phone TEXT DEFAULT '',
  partner TEXT NOT NULL,
  partner_key TEXT NOT NULL,
  date DATE NOT NULL,
  note TEXT DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  synced_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (store_id, id),
  CONSTRAINT uq_store_business_code UNIQUE (store_id, business_type, code)
);

-- 6. BẢNG THANH TOÁN (PAYMENTS) - APPEND-ONLY, BẢO TOÀN DÒNG THỜI GIAN
CREATE TABLE IF NOT EXISTS public.payments (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  code TEXT NOT NULL,
  date DATE NOT NULL,
  created BIGINT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  paid_before BIGINT NOT NULL DEFAULT 0,
  paid_after BIGINT NOT NULL DEFAULT 0,
  due_after BIGINT NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'Tiền Mặt',
  note TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  synced_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (store_id, id),
  CONSTRAINT uq_store_payment_code UNIQUE (store_id, code),
  FOREIGN KEY (store_id, invoice_id) REFERENCES public.invoices(store_id, id) ON DELETE CASCADE
);

-- 7. BẢNG DỮ LIỆU CŨ CHƯA ĐỐI SOÁT (LEGACY_TX) - ĐỒNG BỘ NGUYÊN VẸN TỪ LOCAL V24
CREATE TABLE IF NOT EXISTS public.legacy_tx (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('purchase', 'sales')),
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (store_id, business_type, id)
);

-- 8. INDEX TỐI ƯU TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_invoices_lookup ON public.invoices (store_id, business_type, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_partner ON public.invoices (store_id, business_type, partner_key);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments (store_id, invoice_id, created ASC);
CREATE INDEX IF NOT EXISTS idx_profiles_user ON public.profiles (id, store_id);

-- ==============================================================================
-- HÀM TIỆN ÍCH XÁC THỰC CƠ SỞ (SECURITY DEFINER / CACHE THÂN THIỆN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.current_user_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ==============================================================================
-- CẤU HÌNH ROW LEVEL SECURITY (RLS) - BẢO MẬT TUYỆT ĐỐI THEO CƠ SỞ
-- ==============================================================================
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_tx ENABLE ROW LEVEL SECURITY;

-- 1. Policy cho STORES
DROP POLICY IF EXISTS "Users can view their own store" ON public.stores;
CREATE POLICY "Users can view their own store"
  ON public.stores FOR SELECT
  TO authenticated
  USING (id = public.current_user_store_id());

-- 2. Policy cho PROFILES
DROP POLICY IF EXISTS "Users can view profiles in same store" ON public.profiles;
CREATE POLICY "Users can view profiles in same store"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (store_id = public.current_user_store_id() OR id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- 3. Policy cho PRODUCTS
DROP POLICY IF EXISTS "Store members can view products" ON public.products;
CREATE POLICY "Store members can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (store_id = public.current_user_store_id());

DROP POLICY IF EXISTS "Store members can insert products" ON public.products;
CREATE POLICY "Store members can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (store_id = public.current_user_store_id());

DROP POLICY IF EXISTS "Store members can update products" ON public.products;
CREATE POLICY "Store members can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (store_id = public.current_user_store_id())
  WITH CHECK (store_id = public.current_user_store_id());

-- 4. Policy cho INVOICES: CHỈ THÊM & ĐỌC, KHÔNG CHO XÓA LỊCH SỬ
DROP POLICY IF EXISTS "Store members can view invoices" ON public.invoices;
CREATE POLICY "Store members can view invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (store_id = public.current_user_store_id());

DROP POLICY IF EXISTS "Store members can insert invoices" ON public.invoices;
CREATE POLICY "Store members can insert invoices"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (store_id = public.current_user_store_id());

-- 5. Policy cho PAYMENTS: CHỈ THÊM & ĐỌC, BẢO TOÀN DÒNG THỜI GIAN, BẤT KHẢ XÂM PHẠM
DROP POLICY IF EXISTS "Store members can view payments" ON public.payments;
CREATE POLICY "Store members can view payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (store_id = public.current_user_store_id());

DROP POLICY IF EXISTS "Store members can insert payments" ON public.payments;
CREATE POLICY "Store members can insert payments"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (store_id = public.current_user_store_id());

-- 6. Policy cho LEGACY_TX
DROP POLICY IF EXISTS "Store members can view legacy tx" ON public.legacy_tx;
CREATE POLICY "Store members can view legacy tx"
  ON public.legacy_tx FOR SELECT
  TO authenticated
  USING (store_id = public.current_user_store_id());

DROP POLICY IF EXISTS "Store members can insert legacy tx" ON public.legacy_tx;
CREATE POLICY "Store members can insert legacy tx"
  ON public.legacy_tx FOR INSERT
  TO authenticated
  WITH CHECK (store_id = public.current_user_store_id());

-- ==============================================================================
-- CẤP QUYỀN TRUY CẬP (GRANTS) CHO SCHEMA PUBLIC VÀ CÁC ROLE
-- (Đặc biệt cần thiết khi dự án tắt 'Automatically expose new tables')
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
-- Thu hồi hoàn toàn quyền xóa và sửa đối với bảng giao dịch tài chính
REVOKE DELETE ON public.invoices FROM authenticated, anon;
REVOKE DELETE, UPDATE ON public.payments FROM authenticated, anon;
REVOKE DELETE ON public.legacy_tx FROM authenticated, anon;

-- ==============================================================================
-- GIAO DỊCH NGUYÊN TỬ (ATOMIC TRANSACTIONS) & CHỐNG RACE CONDITION
-- ==============================================================================

-- 1. GIAO DỊCH THANH TOÁN NGUYÊN TỬ: KHÓA DÒNG HÓA ĐƠN, CHỐNG TRẢ VƯỢT NỢ KHI NHIỀU THIẾT BỊ BẤM CÙNG LÚC
CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_invoice_id TEXT,
  p_payment_id TEXT,
  p_code TEXT,
  p_amount BIGINT,
  p_method TEXT,
  p_note TEXT,
  p_date DATE,
  p_created BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_total BIGINT;
  v_current_paid BIGINT;
  v_current_due BIGINT;
  v_paid_after BIGINT;
  v_due_after BIGINT;
  v_existing RECORD;
BEGIN
  -- Xác thực store của người dùng
  v_store_id := public.current_user_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập hoặc tài khoản chưa liên kết cơ sở.';
  END IF;

  -- Kiểm tra idempotent: Nếu mã thanh toán hoặc ID đã tồn tại thì trả về ngay (tránh gửi trùng khi mạng lag)
  SELECT * INTO v_existing FROM public.payments 
  WHERE store_id = v_store_id AND (id = p_payment_id OR code = p_code);
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'payment', row_to_json(v_existing)
    );
  END IF;

  -- KHÓA DÒNG HÓA ĐƠN (FOR UPDATE) - Đảm bảo tính nguyên tử tuyệt đối giữa các thiết bị
  SELECT total_amount INTO v_total
  FROM public.invoices
  WHERE store_id = v_store_id AND id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hóa đơn gốc trong cơ sở.';
  END IF;

  -- Tính tổng tiền đã trả chính xác từ tất cả các lần thanh toán trước
  SELECT COALESCE(SUM(amount), 0) INTO v_current_paid
  FROM public.payments
  WHERE store_id = v_store_id AND invoice_id = p_invoice_id;

  v_current_due := v_total - v_current_paid;

  -- Kiểm tra hợp lệ số tiền
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền thanh toán phải lớn hơn 0.';
  END IF;

  IF p_amount > v_current_due THEN
    RAISE EXCEPTION 'Số tiền trả % đ vượt quá số còn thiếu hiện tại % đ (do thiết bị khác vừa thanh toán). Vui lòng kiểm tra lại!',
      p_amount, v_current_due;
  END IF;

  v_paid_after := v_current_paid + p_amount;
  v_due_after := v_current_due - p_amount;

  -- Chèn giao dịch thanh toán
  INSERT INTO public.payments (
    id, store_id, invoice_id, code, date, created,
    amount, paid_before, paid_after, due_after,
    method, note, created_by
  ) VALUES (
    p_payment_id, v_store_id, p_invoice_id, p_code, p_date, p_created,
    p_amount, v_current_paid, v_paid_after, v_due_after,
    COALESCE(p_method, 'Tiền Mặt'), COALESCE(p_note, ''), auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'payment_id', p_payment_id,
    'invoice_id', p_invoice_id,
    'code', p_code,
    'amount', p_amount,
    'paid_before', v_current_paid,
    'paid_after', v_paid_after,
    'due_after', v_due_after
  );
END;
$$;

-- 2. GIAO DỊCH LƯU HÓA ĐƠN NGUYÊN TỬ VÀ CHỐNG TRÙNG
CREATE OR REPLACE FUNCTION public.save_invoice_atomic(
  p_invoice_id TEXT,
  p_business_type TEXT,
  p_code TEXT,
  p_seller TEXT,
  p_phone TEXT,
  p_partner TEXT,
  p_partner_key TEXT,
  p_date DATE,
  p_note TEXT,
  p_items JSONB,
  p_total_amount BIGINT,
  p_created BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_existing RECORD;
BEGIN
  v_store_id := public.current_user_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập hoặc tài khoản chưa liên kết cơ sở.';
  END IF;

  -- Chống ghi trùng: nếu hóa đơn đã có cùng id hoặc code trong business_type này
  SELECT * INTO v_existing
  FROM public.invoices
  WHERE store_id = v_store_id AND (id = p_invoice_id OR (business_type = p_business_type AND code = p_code));

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'invoice', row_to_json(v_existing)
    );
  END IF;

  INSERT INTO public.invoices (
    id, store_id, business_type, code, seller, phone,
    partner, partner_key, date, note, items, total_amount, created_at, created_by
  ) VALUES (
    p_invoice_id, v_store_id, p_business_type, p_code, p_seller, p_phone,
    p_partner, p_partner_key, p_date, p_note, p_items, p_total_amount, p_created, auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'id', p_invoice_id,
    'code', p_code
  );
END;
$$;

-- 3. HÀM TẢI TOÀN BỘ DỮ LIỆU BAN ĐẦU CỦA CƠ SỞ (TỐI ƯU SIÊU TỐC TRONG 1 LẦN GỌI)
CREATE OR REPLACE FUNCTION public.get_store_initial_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_store RECORD;
  v_profile RECORD;
  v_products JSONB;
  v_invoices JSONB;
  v_legacy JSONB;
BEGIN
  v_store_id := public.current_user_store_id();
  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = v_store_id;
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();

  -- Danh mục cá
  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_products
  FROM (SELECT id, name, image FROM public.products WHERE store_id = v_store_id ORDER BY created_at ASC) p;

  -- Hóa đơn kèm mảng thanh toán đã lồng nhau
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'business_type', i.business_type,
      'code', i.code,
      'seller', i.seller,
      'phone', i.phone,
      'partner', i.partner,
      'partner_key', i.partner_key,
      'date', i.date,
      'note', i.note,
      'items', i.items,
      'total_amount', i.total_amount,
      'created', i.created_at,
      'payments', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pm.id,
            'code', pm.code,
            'date', pm.date,
            'created', pm.created,
            'amount', pm.amount,
            'paidBefore', pm.paid_before,
            'paidAfter', pm.paid_after,
            'dueAfter', pm.due_after,
            'method', pm.method,
            'note', pm.note
          ) ORDER BY pm.created ASC
        )
        FROM public.payments pm
        WHERE pm.store_id = v_store_id AND pm.invoice_id = i.id
      ), '[]'::jsonb)
    ) ORDER BY i.date DESC, i.created_at DESC
  ), '[]'::jsonb) INTO v_invoices
  FROM public.invoices i
  WHERE i.store_id = v_store_id;

  -- Legacy TX
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'business_type', l.business_type,
      'data', l.data
    )
  ), '[]'::jsonb) INTO v_legacy
  FROM public.legacy_tx l
  WHERE l.store_id = v_store_id;

  RETURN jsonb_build_object(
    'authenticated', true,
    'store', jsonb_build_object(
      'id', v_store.id,
      'code', v_store.code,
      'name', v_store.name,
      'phone', v_store.phone
    ),
    'user', jsonb_build_object(
      'id', v_profile.id,
      'name', v_profile.display_name,
      'role', v_profile.role
    ),
    'products', v_products,
    'invoices', v_invoices,
    'legacy', v_legacy
  );
END;
$$;

-- 4. HÀM TỰ ĐỘNG GÁN PROFILE KHI NGƯỜI DÙNG ĐĂNG KÝ (MỖI TÀI KHOẢN = 1 CƠ SỞ ĐỘC LẬP)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_code TEXT;
  v_store_name TEXT;
  v_store_id UUID;
  v_display_name TEXT;
  v_role TEXT := 'owner';
BEGIN
  -- Lấy tên hiển thị từ metadata hoặc từ phần đầu email
  v_display_name := TRIM(COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  v_store_name := TRIM(COALESCE(new.raw_user_meta_data->>'store_name', v_display_name));
  v_store_code := UPPER(TRIM(COALESCE(new.raw_user_meta_data->>'store_code', 'AUTO')));

  IF v_store_name = '' THEN
    v_store_name := v_display_name;
  END IF;

  -- Nếu người dùng chỉ định mã cơ sở cụ thể (khác AUTO)
  IF v_store_code <> 'AUTO' AND v_store_code <> '' THEN
    SELECT id INTO v_store_id FROM public.stores WHERE code = v_store_code;
    IF v_store_id IS NOT NULL THEN
      v_role := 'member';
    ELSE
      INSERT INTO public.stores (code, name)
      VALUES (v_store_code, v_store_name)
      RETURNING id INTO v_store_id;
    END IF;
  ELSE
    -- MẶC ĐỊNH: Tự động sinh mã cơ sở riêng biệt duy nhất cho mỗi tài khoản
    v_store_code := 'CS-' || UPPER(SUBSTRING(MD5(new.id::text || clock_timestamp()::text) FROM 1 FOR 8));
    INSERT INTO public.stores (code, name)
    VALUES (v_store_code, v_store_name)
    RETURNING id INTO v_store_id;
  END IF;

  -- Khởi tạo sẵn 3 loại cá mặc định cho cơ sở mới này
  INSERT INTO public.products (store_id, id, name, image)
  VALUES
    (v_store_id, 'ca-nuc', 'Cá nục khô', 'ca-nuc.jpg'),
    (v_store_id, 'ca-chi', 'Cá chỉ vàng khô', 'ca-chi.jpg'),
    (v_store_id, 'ca-ngan', 'Cá ngân khô', 'ca-ngan.jpg')
  ON CONFLICT (store_id, id) DO NOTHING;

  -- Tạo profile gắn liền tài khoản với cơ sở độc lập đó
  INSERT INTO public.profiles (id, store_id, display_name, role)
  VALUES (new.id, v_store_id, v_display_name, v_role)
  ON CONFLICT (id) DO UPDATE 
    SET store_id = EXCLUDED.store_id, 
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- TỰ ĐỘNG XÓA SẠCH DỮ LIỆU KHI TÀI KHOẢN BỊ XÓA (CASCADE TOÀN DIỆN)
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_role TEXT;
  v_other_members_count INT;
BEGIN
  SELECT store_id, role INTO v_store_id, v_role 
  FROM public.profiles 
  WHERE id = OLD.id;

  IF v_store_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_other_members_count 
    FROM public.profiles 
    WHERE store_id = v_store_id AND id <> OLD.id;

    IF v_role = 'owner' OR v_other_members_count = 0 THEN
      DELETE FROM public.stores WHERE id = v_store_id;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();

-- 5. CẤP QUYỀN EXECUTE CHO CÁC HÀM RPC
GRANT EXECUTE ON FUNCTION public.current_user_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, DATE, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_invoice_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, JSONB, BIGINT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_initial_state() TO authenticated;

-- ==============================================================================
-- KHỞI TẠO CƠ SỞ MẪU & MẶT HÀNG MẶC ĐỊNH
-- ==============================================================================
DO $$
DECLARE
  v_default_store_id UUID;
BEGIN
  -- Tạo cơ sở mặc định 'DOPHƯONGTUAN' nếu chưa có
  INSERT INTO public.stores (code, name, phone)
  VALUES ('DOPHƯONGTUAN', 'ĐỖ PHƯƠNG TUẤN', '0988888888')
  ON CONFLICT (code) DO NOTHING;

  SELECT id INTO v_default_store_id FROM public.stores WHERE code = 'DOPHƯONGTUAN';

  -- Khởi tạo 3 loại cá mặc định v24 vào cơ sở này
  INSERT INTO public.products (store_id, id, name, image)
  VALUES
    (v_default_store_id, 'ca-nuc', 'Cá nục khô', 'ca-nuc.jpg'),
    (v_default_store_id, 'ca-chi', 'Cá chỉ vàng khô', 'ca-chi.jpg'),
    (v_default_store_id, 'ca-ngan', 'Cá ngân khô', 'ca-ngan.jpg')
  ON CONFLICT (store_id, id) DO NOTHING;
END $$;

-- BẬT SUPABASE REALTIME CHO CÁC BẢNG ĐỒNG BỘ
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;

-- ==============================================================================
-- HOÀN TẤT THIẾT LẬP CƠ SỞ DỮ LIỆU
-- ==============================================================================
