# Sổ Xuất Nhập Cá - Đỗ Phương Tuấn

Web dùng trên điện thoại, không cần cài thư viện hoặc chạy lệnh build.

## Đưa lên GitHub Pages

1. Giải nén file ZIP.
2. Tạo repository GitHub, ví dụ `so-ca-phuong-tuan` (chọn Public nếu dùng GitHub Free).
3. Chọn Add file → Upload files. Tải toàn bộ FILE ĐÃ GIẢI NÉN lên repository, không tải nguyên file ZIP. `index.html` phải nằm ngay ở thư mục gốc, cùng các file `.js`, `.css` và ảnh `.jpg`.
4. Commit changes để lưu.
5. Vào Settings → Pages. Trong Source, chọn Deploy from a branch; Branch chọn `main`, thư mục `/(root)`, rồi Save.
6. Chờ triển khai xong và mở Visit site ở trang Pages.

Tài liệu chính thức: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Sử dụng

- Chọn ngày nhận, điền tên người giao.
- Nhập số thùng (mặc định) hoặc kg. Quy cách 1 thùng = 17 kg.
- Nhập giá 1 thùng. Số 100000 tự hiển thị 100.000.
- Bấm Ghi nhận hàng trên từng loại cá. Mỗi lần nhận lưu riêng ngày, người giao, số lượng, đơn vị, giá và ghi chú.
- Bấm nút cam HÓA ĐƠN / XUẤT ẢNH để xem toàn bộ lần nhận trong ngày đang chọn. Hóa đơn tự tính thành tiền từng dòng và tổng cuối.
- Ảnh hóa đơn là PNG 900 × 1600 (9:16). Nhiều hơn 4 lần nhận sẽ chia thành nhiều trang. Trình duyệt có thể hỏi cho phép tải nhiều file; cho phép để nhận đủ trang, hoặc dùng In / Lưu PDF.
- Lịch sử mặc định là tháng hiện tại. Dùng Tra cứu tháng cũ để xem tháng trước.
- Dùng Sao lưu định kỳ; Khôi phục để nhập lại file JSON đã sao lưu.

## Dữ liệu

Gói ZIP không chứa lịch sử hoặc dữ liệu thử. Dữ liệu phát sinh được lưu trên trình duyệt/thiết bị đang dùng (localStorage), không tự đồng bộ giữa các điện thoại và không được đưa lên repository. Không có đăng nhập hoặc máy chủ dữ liệu trong bản GitHub Pages này. Nếu chuyển từ website cũ sang địa chỉ GitHub Pages, hãy Sao lưu ở website cũ rồi Khôi phục tại địa chỉ mới.

Xóa dữ liệu trình duyệt sẽ xóa lịch sử nếu chưa sao lưu. Nút Xóa dữ liệu để test sẽ đưa sổ về trạng thái trống.

## Thành phần

- index.html: giao diện.
- style.css: bố cục điện thoại, định dạng in.
- app.js: nhận hàng, lịch sử, tính tiền, Excel, sao lưu.
- invoice.js: vẽ và xuất hóa đơn PNG, in/PDF.
- xlsx.min.js: SheetJS Community Edition 0.20.3, giữ nguyên thông báo giấy phép trong mã.
- ca-nuc.jpg, ca-chi.jpg, ca-ngan.jpg: ảnh sản phẩm.

SheetJS: https://sheetjs.com/ — https://github.com/SheetJS/sheetjs
