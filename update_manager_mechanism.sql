-- ==============================================================================
-- CẬP NHẬT CƠ CHẾ: MỖI TÀI KHOẢN LÀ 1 CƠ SỞ / QUẢN LÝ RIÊNG BIỆT 100%
-- Chạy đoạn mã này trong Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- Đổi mã cơ sở DOPHƯONGTUAN sang DOPHUONGTUAN (không có dấu)
UPDATE public.stores SET code = 'DOPHUONGTUAN' WHERE code = 'DOPHƯONGTUAN';

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
      -- Nếu mã cơ sở chưa có, tạo cơ sở mới với mã này
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

-- Đảm bảo trigger đang kích hoạt trên bảng auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Cho phép xóa tài khoản mà không bị chặn bởi hóa đơn / thanh toán cũ (hóa đơn vẫn được bảo toàn)
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_created_by_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- TỰ ĐỘNG XÓA SẠCH 100% DỮ LIỆU CỦA TÀI KHOẢN (HÓA ĐƠN, THANH TOÁN, CÔNG NỢ) KHI TÀI KHOẢN BỊ XÓA
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

    -- Nếu là chủ cơ sở HOẶC là tài khoản độc lập duy nhất của cơ sở:
    -- XÓA TOÀN BỘ CƠ SỞ (Kéo theo ON DELETE CASCADE tự động xóa sạch toàn bộ hóa đơn, thanh toán, công nợ, mặt hàng)
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
