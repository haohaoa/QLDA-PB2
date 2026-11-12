# Triển khai QLDA lên Google Apps Script

Thư mục này là gói triển khai gồm `code.gs`, `Index.html` và `appsscript.json`; tệp này hướng dẫn thao tác deploy.

## Cập nhật gói sau khi sửa giao diện

Tại thư mục gốc dự án, chạy:

```powershell
npm run build:gas
```

Lệnh này build giao diện và ghi bản HTML tự chứa mới vào `QLDA/Index.html`.

Trang tổng quan chỉ hiển thị và tính tiến độ các dự án đang thực hiện. Dự án tạm ngưng hoặc hoàn tất không xuất hiện trong biểu đồ, chỉ số tổng hợp và danh sách chi tiết; thẻ danh mục vẫn hiển thị số lượng dự án theo trạng thái.

## Thiết lập lần đầu

1. Tạo một Google Apps Script project, bật hiển thị `appsscript.json`, rồi đưa các tệp trong thư mục `QLDA` vào project với đúng tên.
2. Trong **Project Settings → Script Properties**, thêm `EDIT_PASSWORD` với mật khẩu quản trị mong muốn.
3. Chạy hàm `setupAll()` trong editor và cấp quyền truy cập Google Sheets, Drive.
4. Kiểm tra kết quả chạy để lấy liên kết Google Sheets và thư mục Drive `QLDA - Ảnh sai phạm`.
5. Trong Apps Script, chạy hàm `authorizePlaceSearch()` một lần và cấp quyền gửi yêu cầu ra dịch vụ bên ngoài (`UrlFetchApp`) nếu Google yêu cầu.
6. Tạo deployment kiểu **Web app**, chạy với tư cách chủ sở hữu (owner), rồi chọn phạm vi truy cập phù hợp với tổ chức.

Ảnh báo cáo thi công và ảnh sai phạm được lưu chung trong thư mục Drive `QLDA - Ảnh sai phạm`; Google Sheets chỉ nhận URL ảnh. Để hiển thị trong ứng dụng/API, ảnh tải lên được chia sẻ ở chế độ **Anyone with the link – Viewer**. Người có liên kết ảnh có thể xem ảnh, vì vậy không tải lên hình ảnh cần giữ riêng tư.

## API công khai

API đọc dữ liệu công khai, không yêu cầu API key. `GET` tới URL deployment `/exec?action=getData` trả về toàn bộ dự án, nhật ký, thông báo và loại kế hoạch. Mỗi dự án có thêm `imageLinks` tổng hợp ảnh dự án, ảnh nhật ký và ảnh sai phạm; mỗi nhật ký cũng có `imageLinks` chứa link ảnh nhật ký và tất cả ảnh trong biên bản sai phạm. Các bộ dữ liệu dự án/nhật ký vẫn giữ nguyên đầy đủ thông tin đã lưu; ảnh được trả dưới dạng URL công khai để hệ thống gọi API hiển thị, không nhúng binary/base64. `GET` `/exec?action=getProjects` chỉ trả danh sách dự án kèm link ảnh. URL `/exec` không có action API sẽ hiển thị giao diện. Có thể dùng `POST` JSON với `{"action":"getData"}` hoặc `{"action":"getProjects"}` để lấy cùng dữ liệu.

Ví dụ PowerShell:

```powershell
Invoke-RestMethod -Method Get -Uri "YOUR_APPS_SCRIPT_WEB_APP_URL/exec?action=getData"
```

Vì endpoint công khai, bất kỳ ai có URL đều có thể đọc toàn bộ số liệu và các thông tin trong nhật ký/thông báo. Chỉ triển khai nếu dữ liệu được phép công khai. Link ảnh vẫn tuân theo quyền chia sẻ của Google Drive; ảnh hiện đặt “Anyone with the link – Viewer” có thể được xem bởi bất kỳ ai có link.

Ngay trên trang **Báo cáo**, mục **Tra cứu và tải dữ liệu báo cáo theo khoảng ngày** cho phép chọn tuyến/dự án, nhà thầu và ngày bắt đầu – kết thúc. Bấm **Lấy dữ liệu** để xem các nhật ký phù hợp ngay trên trang; nút **Tải xuống Excel** nằm cạnh kết quả. Tệp Excel có các sheet tổng hợp theo ngày, nhật ký chi tiết và danh sách ảnh với liên kết Google Drive có thể bấm mở. Ảnh không được nhúng trực tiếp vào tệp Excel.

Phần báo cáo thi công thông thường và biên bản sai phạm đều cho phép chọn/chụp nhiều ảnh trong một lần; mỗi ảnh tối đa 8 MB, hỗ trợ JPEG, PNG, WebP và GIF. Ảnh báo cáo được xem trong bảng báo cáo; bấm ảnh để mở lớn toàn màn hình. Khi gỡ ảnh hoặc xóa nhật ký, Apps Script tự chuyển ảnh không còn được sử dụng thuộc thư mục quản lý vào thùng rác Drive sau khi cập nhật Sheets thành công. Ảnh mới tải lên nhưng bị gỡ hoặc biểu mẫu bị hủy cũng được dọn khỏi Drive. Bấm ảnh trong chi tiết biên bản sẽ mở ảnh lớn trên nền tối, có thể đóng bằng nút X, nhấp nền hoặc phím Esc.

Tìm kiếm địa chỉ trên bản đồ được gửi qua `UrlFetchApp` từ Apps Script thay vì trình duyệt để tránh lỗi CORS/`Failed to fetch`; kết quả được giới hạn tại Việt Nam và lưu cache trong 6 giờ.

Trước khi lưu báo cáo ngày, ứng dụng tải trạng thái mới nhất từ Google Sheets và kiểm tra trùng ngày/dự án/nhà thầu. Nếu báo cáo đã có hoặc bản đang sửa vừa được người khác cập nhật, hệ thống chặn lưu, giữ biểu mẫu mở và báo lý do. Máy chủ dùng khóa và số phiên bản dữ liệu để từ chối ghi nếu có cập nhật xảy ra đồng thời trong lúc lưu; giao diện thử đồng bộ và hòa trộn các thay đổi không xung đột. Các thao tác lưu dữ liệu khác cũng tải trạng thái mới nhất trước khi ghi.

Khi triển khai bản cập nhật, chạy lại `npm run build:gas`, cập nhật `Index.html` và `code.gs` trong Apps Script, sau đó tạo phiên bản deployment mới.
