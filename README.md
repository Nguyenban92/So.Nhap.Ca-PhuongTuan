# Sổ Xuất Nhập Cá – Đỗ Phương Tuấn (v24 Online Sync)

Ứng dụng quản lý xuất nhập cá, hóa đơn, thanh toán nhiều lần và công nợ cơ sở Đỗ Phương Tuấn. Phiên bản nâng cấp hỗ trợ **Đồng bộ Online thời gian thực (Supabase)** cho nhiều điện thoại trong cùng cơ sở, giao dịch nguyên tử chống vượt công nợ, và tách biệt hoàn toàn giữa Nhập Hàng và Bán Hàng.

---

## 🌟 ĐIỂM NỔI BẬT BẢN NÂNG CẤP ONLINE
1. **Nhiều điện thoại cùng cơ sở**: Tất cả điện thoại của nhân viên và quản lý đăng nhập chung mã cơ sở `DOPHƯONGTUAN` sẽ thấy chung danh mục cá, khách hàng, hóa đơn và công nợ tức thời.
2. **Đồng bộ Realtime**: Khi máy A xuất hóa đơn hoặc ghi thanh toán, máy B sẽ cập nhật ngay lập tức mà không làm mất phiếu tạm đang gõ dở.
3. **Giao dịch nguyên tử (Atomic Transaction)**: Dùng khóa hàng `FOR UPDATE` trong PostgreSQL. Khi hai điện thoại cùng bấm thanh toán một hóa đơn tại cùng một thời điểm, hệ thống đảm bảo số tiền thanh toán **không bao giờ vượt quá số còn thiếu**.
4. **Tách biệt tuyệt đối Nhập Hàng & Bán Hàng**: Kể cả khi trùng tên khách hàng, dữ liệu hóa đơn, thanh toán và công nợ của hai tab hoàn toàn độc lập 100%.
5. **Chống ghi trùng (Idempotent)**: Xuất lại hóa đơn hoặc in lại phiếu thanh toán cũ không bao giờ tạo thêm bản ghi rác. Chỉ ghi dữ liệu sau khi tạo ảnh thành công và bắt đầu tải.
6. **Bảo tồn dữ liệu cũ**: Tích hợp tính năng "Đẩy dữ liệu cũ lên Online" có kiểm tra trùng, tuyệt đối không tự xóa dữ liệu gốc trong máy.
7. **Bảo mật RLS (Row Level Security)**: Không mở dữ liệu cho người chưa đăng nhập. Người ngoài không xem được dữ liệu cơ sở.

---

## 🛠️ HƯỚNG DẪN THIẾT LẬP SUPABASE (CHỈ LÀM 1 LẦN)

### Bước 1: Chạy Migration SQL
1. Mở trang quản trị Supabase: [https://supabase.com/dashboard/project/klhjykgjbgmmpqyiyrlq](https://supabase.com/dashboard/project/klhjykgjbgmmpqyiyrlq)
2. Chọn mục **SQL Editor** ở thanh menu bên trái.
3. Bấm **New query** và mở file `supabase_migration.sql` trong mã nguồn.
4. Copy toàn bộ nội dung file `supabase_migration.sql`, dán vào SQL Editor rồi bấm **Run** (chạy).
   *(Đoạn script này sẽ tự động tạo bảng `stores`, `profiles`, `products`, `invoices`, `payments`, `legacy_tx`, thiết lập khóa ngoại, RLS, cấp quyền GRANTS và khởi tạo cơ sở mặc định `DOPHƯONGTUAN`)*.

### Bước 2: Tắt xác thực email để đăng ký vào dùng ngay
1. Trong Supabase Dashboard, vào menu **Authentication** -> **Providers** -> bấm vào **Email**.
2. Tìm dòng **Confirm email** và chuyển sang **OFF** (Tắt).
3. Bấm **Save**.
   *(Điều này giúp các máy khi bấm Đăng ký tài khoản mới có thể vào dùng ngay mà không cần chờ mở email xác nhận)*.

---

## 📱 HƯỚNG DẪN SỬ DỤNG NHIỀU ĐIỆN THOẠI

### 1. Đăng ký tài khoản cho các điện thoại
- Trên bất kỳ điện thoại nào, bấm nút **Đăng nhập Online** ở góc trên màn hình.
- Chọn tab **Đăng Ký Thành Viên**:
  - Nhập **Họ và Tên** (ví dụ: *Đỗ Phương Tuấn* hoặc *Nhân viên A*).
  - Nhập **Email** và **Mật khẩu**.
  - Ô **Mã Cơ Sở** để mặc định là `DOPHƯONGTUAN`.
  - Bấm **TẠO TÀI KHOẢN VÀ VÀO CƠ SỞ**.
- Mọi điện thoại nhập chung mã cơ sở `DOPHƯONGTUAN` sẽ tự động liên kết vào cùng một cơ sở và thấy chung toàn bộ dữ liệu.

### 2. Chuyển dữ liệu cũ từ máy lên Online (nếu có)
- Sau khi đăng nhập, nếu trên máy này đã có sẵn dữ liệu v24 cũ (trong localStorage), bấm nút màu cam **Đẩy dữ liệu cũ lên Online**.
- Hệ thống sẽ tự động quét hóa đơn, thanh toán và danh mục cá cũ để chuyển lên máy chủ cho các điện thoại khác cùng thấy.
- Dữ liệu trên máy gốc được giữ nguyên vẹn 100%.

---

## 🍏 HƯỚNG DẪN CÀI ĐẶT TRÊN IPHONE / IOS (ESign / PWA)

### Cách 1: Cài dạng Ứng dụng Toàn màn hình PWA (Khuyên dùng - Không lo chứng chỉ hết hạn)
1. Mở trình duyệt Safari trên iPhone và truy cập vào link web GitHub Pages của bạn.
2. Bấm vào nút **Chia sẻ** (biểu tượng hình vuông có mũi tên trỏ lên ở thanh dưới Safari).
3. Cuộn xuống và chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
4. Bấm **Thêm**.
   👉 Ngay lập tức một biểu tượng app **Sổ Cá P.Tuấn** với logo chuẩn sẽ xuất hiện trên màn hình iPhone, bấm vào mở toàn màn hình độc lập như app native!

### Cách 2: Tải IPA và ký bằng ESign
1. Dự án đã cấu hình sẵn GitHub Actions tại `.github/workflows/build-ios.yml`.
2. Khi push code lên GitHub, vào tab **Actions** -> Chọn workflow **Build iOS IPA Package** -> Bấm **Run workflow**.
3. Sau khi máy ảo macOS build xong, tải file `SoCaPhuongTuan_Unsigned.ipa` về điện thoại.
4. Mở ứng dụng **ESign** trên iPhone -> Nhập chứng chỉ cá nhân của bạn -> Chọn file IPA vừa tải và ký rồi cài đặt.

---

## 🔒 AN TOÀN & BẢO TOÀN DỮ LIỆU
- Giữ nguyên giao diện, màu sắc, font chữ và ảnh hóa đơn tinh gọn của bản v24.
- Không có chức năng xóa lịch sử (append-only), mọi giao dịch chỉ được thêm mới.
- Dòng thời gian thanh toán được lưu vết chi tiết từng lần trả.
- Tự động bắt ngày hiện tại theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`).
