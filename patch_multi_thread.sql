-- KÍCH HOẠT ĐA LUỒNG & TỰ ĐỘNG GẮN MỌI TÀI KHOẢN VÀO CƠ SỞ ĐỖ PHƯƠNG TUẤN
INSERT INTO public.profiles (id, store_id, display_name, role)
SELECT u.id, s.id, 'Đỗ Phương Tuấn', 'owner'
FROM auth.users u
CROSS JOIN (SELECT id FROM public.stores WHERE code = 'DOPHUONGTUAN' OR code = 'DOPHƯONGTUAN' LIMIT 1) s
ON CONFLICT (id) DO UPDATE SET store_id = EXCLUDED.store_id;

-- NÂNG CẤP HÀM BẢO MẬT: LUÔN TRẢ VỀ STORE_ID CHO TẤT CẢ TÀI KHOẢN CÙNG CƠ SỞ
CREATE OR REPLACE FUNCTION public.current_user_store_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT store_id INTO v_store_id FROM public.profiles WHERE id = v_uid LIMIT 1;
  IF v_store_id IS NULL THEN
    SELECT id INTO v_store_id FROM public.stores WHERE code = 'DOPHUONGTUAN' OR code = 'DOPHƯONGTUAN' LIMIT 1;
    INSERT INTO public.profiles (id, store_id, display_name, role)
    VALUES (v_uid, v_store_id, 'Đỗ Phương Tuấn', 'member')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN v_store_id;
END;
$$;

-- BẬT REPLICA IDENTITY FULL ĐỂ REALTIME CẬP NHẬT TỨC THÌ DƯỚI 0.3 GIÂY
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
