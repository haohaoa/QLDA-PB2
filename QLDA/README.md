# Triển khai QLDA lên Google Apps Script

Thư mục này là gói triển khai gồm `code.gs`, `Index.html` và `appsscript.json`; tệp này hướng dẫn thao tác deploy.

## Cập nhật gói sau khi sửa giao diện

Tại thư mục gốc dự án, chạy:

```powershell
npm run build:gas
```

Lệnh này build giao diện và ghi bản HTML tự chứa mới vào `QLDA/Index.html`.

Trang tổng quan và trang báo cáo chỉ hiển thị dự án đang thực hiện. Dự án tạm ngưng hoặc hoàn tất không xuất hiện trong biểu đồ, chỉ số tiến độ, danh sách lựa chọn, tra cứu và báo cáo; thẻ danh mục trên trang tổng quan vẫn hiển thị số lượng dự án theo trạng thái.

## Thiết lập lần đầu

1. Tạo một Google Apps Script project, bật hiển thị `appsscript.json`, rồi đưa các tệp trong thư mục `QLDA` vào project với đúng tên.
2. Trong **Project Settings → Script Properties**, thêm `EDIT_PASSWORD` với mật khẩu quản trị mong muốn.
3. Nếu Apps Script được mở từ một Google Sheets (container-bound), `setupAll()` sẽ tạo các tab dữ liệu ngay trong spreadsheet đó. Nếu là project độc lập, hàm sẽ mở spreadsheet có `SPREADSHEET_ID` hoặc tạo mới `QLDA - Quản lý dự án`.
4. Chạy hàm `setupAll()` trong editor và cấp quyền truy cập Google Sheets, Drive; xem `spreadsheetUrl` trong kết quả để xác nhận nơi lưu dữ liệu.
5. Kiểm tra thư mục Drive `QLDA - Ảnh sai phạm` trong kết quả chạy.
6. Trong Apps Script, chạy hàm `authorizePlaceSearch()` một lần và cấp quyền gửi yêu cầu ra dịch vụ bên ngoài (`UrlFetchApp`) nếu Google yêu cầu.
7. Tạo deployment kiểu **Web app**, chạy với tư cách chủ sở hữu (owner), rồi chọn phạm vi truy cập phù hợp với tổ chức.

Ảnh báo cáo thi công và ảnh sai phạm được lưu chung trong thư mục Drive `QLDA - Ảnh sai phạm`; Google Sheets chỉ nhận URL ảnh. Để hiển thị trong ứng dụng/API, ảnh tải lên được chia sẻ ở chế độ **Anyone with the link – Viewer**. Người có liên kết ảnh có thể xem ảnh, vì vậy không tải lên hình ảnh cần giữ riêng tư.

## API dữ liệu

`GET /exec?action=getDatabase` trả về các bảng `Projects`, `DailyLogs`, `Bulletins` và `PlanTypes`, cùng trạng thái phiên Admin và khởi tạo. Có thể lấy riêng một bảng bằng `GET /exec?action=getAll&table=Projects`, hoặc một dòng bằng `GET /exec?action=getById&table=Projects&id=<id>`. Bảng tính lưu một bản ghi trên mỗi dòng; cột đầu tiên là `id`, các trường khác là cột riêng. Các giá trị lồng nhau (như danh sách nhà thầu, tọa độ hoặc ảnh) được JSON-encode trong cột tương ứng.

Ghi dữ liệu yêu cầu phiên Admin hợp lệ. Frontend gửi `POST /exec` với `Content-Type: text/plain;charset=utf-8`, body JSON và `sessionToken`; các action gồm `upsert`, `insert`, `update`, `delete`, `batchUpsert` và `syncDatabase`. Mỗi thao tác ghi thay đổi các dòng được chỉ định; `syncDatabase` chỉ chấp nhận khi toàn bộ bảng đang trống. Dữ liệu cũ theo định dạng mỗi dòng là JSON được nâng cấp sang các cột riêng khi truy cập lần đầu.

API đọc công khai cũ vẫn được hỗ trợ: `GET /exec?action=getData` trả về dữ liệu dự án, nhật ký, thông báo và loại kế hoạch cùng liên kết ảnh; `GET /exec?action=getProjects` chỉ trả danh sách dự án. URL `/exec` không có action hiển thị giao diện. Ngoài Google Apps Script, cấu hình `VITE_GOOGLE_APPS_SCRIPT_URL` trong `.env` để chỉ định URL Web App.

Ví dụ PowerShell:

```powershell
Invoke-RestMethod -Method Get -Uri "YOUR_APPS_SCRIPT_WEB_APP_URL/exec?action=getData"
```

Vì endpoint công khai, bất kỳ ai có URL đều có thể đọc toàn bộ số liệu và các thông tin trong nhật ký/thông báo. Chỉ triển khai nếu dữ liệu được phép công khai. Link ảnh vẫn tuân theo quyền chia sẻ của Google Drive; ảnh hiện đặt “Anyone with the link – Viewer” có thể được xem bởi bất kỳ ai có link.

Ngay trên trang **Báo cáo**, mục **Tra cứu và tải dữ liệu báo cáo theo khoảng ngày** cho phép chọn tuyến/dự án, nhà thầu và ngày bắt đầu – kết thúc. Bấm **Lấy dữ liệu** để xem các nhật ký phù hợp ngay trên trang; nút **Tải xuống Excel** nằm cạnh kết quả. Tệp Excel có các sheet tổng hợp theo ngày, nhật ký chi tiết và danh sách ảnh với liên kết Google Drive có thể bấm mở. Ảnh không được nhúng trực tiếp vào tệp Excel.

Phần báo cáo thi công thông thường và biên bản sai phạm đều cho phép chọn/chụp nhiều ảnh trong một lần; mỗi ảnh tối đa 8 MB, hỗ trợ JPEG, PNG, WebP và GIF. Ảnh báo cáo được xem trong bảng báo cáo; bấm ảnh để mở lớn toàn màn hình. Khi gỡ ảnh hoặc xóa nhật ký, Apps Script tự chuyển ảnh không còn được sử dụng thuộc thư mục quản lý vào thùng rác Drive sau khi cập nhật Sheets thành công. Ảnh mới tải lên nhưng bị gỡ hoặc biểu mẫu bị hủy cũng được dọn khỏi Drive. Bấm ảnh trong chi tiết biên bản sẽ mở ảnh lớn trên nền tối, có thể đóng bằng nút X, nhấp nền hoặc phím Esc.

Tìm kiếm địa chỉ trên bản đồ được gửi qua `UrlFetchApp` từ Apps Script thay vì trình duyệt để tránh lỗi CORS/`Failed to fetch`; kết quả được giới hạn tại Việt Nam và lưu cache trong 6 giờ.

Trước khi lưu báo cáo ngày, ứng dụng tải trạng thái mới nhất để kiểm tra trùng ngày/dự án/nhà thầu. Các thao tác UI áp dụng optimistic update rồi ghi đúng dòng qua `upsert`; xóa gọi `delete`, nhập Excel dùng `batchUpsert`. Backend khóa thao tác bảng và kiểm tra token Admin; ảnh không còn được tham chiếu sẽ được dọn khỏi Drive sau khi cập nhật nhật ký.

Khi triển khai bản cập nhật, chạy lại `npm run build:gas`, cập nhật `Index.html` và `code.gs` trong Apps Script, sau đó tạo phiên bản deployment mới.
