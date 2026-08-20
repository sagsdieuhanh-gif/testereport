# E-REPORT SAGS · HDSD V1.91

## 1. Cập nhật phiên bản
- Cách triển khai giữ nguyên: **giải nén ZIP → upload đè toàn bộ file trong ZIP vào thư mục gốc E-REPORT-SAGS**.
- Không cần copy, đổi tên hay sửa `index.html` thủ công.
- Ứng dụng không ép reload. Khi có bản mới, người dùng bấm **LƯU & CẬP NHẬT**.
- V1.91 kiểm tra `version.json`, `update-manifest.json`, Service Worker, Safe Update Runtime, `firebase-config.js` và Flight Workspace phải cùng build `V1.91-20260820-01` trước khi cho cập nhật.
- Sau khi V1.91 active, runtime tự xóa trạng thái đang cập nhật và chặn popup legacy bật lại cùng build, tránh vòng lặp “cập nhật xong vẫn báo cần cập nhật”.

## 2. AD tạo chuyến từ DAILY ROSTER
1. AD vào **✈️ CHUYẾN BAY HÔM NAY**.
2. Chọn **📋 NHẬP DAILY ROSTER**.
3. Chọn file `.xlsx`, `.xlsm` hoặc `.csv`.
4. Bấm **ĐỌC & ĐỐI CHIẾU**.
5. Hệ thống dùng đúng parser/quy tắc DAILY ROSTER hiện có để đọc Flight No, STA/STD, A/C Reg/Type, Route, Bay/Gate và Grnd_Cor / Grnd_Ld / Pax_Supr.
6. Màn hình xem trước phân loại:
   - **TẠO MỚI**: chưa có Flight Workspace trùng.
   - **CẬP NHẬT REV**: đúng cặp đã có nhưng thông tin khai thác thay đổi.
   - **ĐÃ CÓ**: cặp đã tồn tại và thông tin chính không đổi.
   - **CẦN AD KIỂM TRA**: chỉ trùng một leg hoặc có dấu hiệu cặp đã đổi; hệ thống không tự tạo trùng.
7. Chỉ sau khi AD bấm **XÁC NHẬN TẠO / CẬP NHẬT** hệ thống mới ghi dữ liệu.

## 3. Roster phân phần việc
- V1.91 giữ đúng quy tắc DAILY ROSTER hiện tại:
  - Không có `Grnd_Ld`: `Grnd_Cor` → F/SAGS 42.3.
  - Có `Grnd_Ld` khác người: `Grnd_Cor` → 42.1; `Grnd_Ld` → 55.1.
  - Cùng username ở `Grnd_Cor + Grnd_Ld` → 42.3.
  - `Pax_Supr` → F/SAGS-CXR/09.
- Khi AD xác nhận import, V1.91 đồng thời cập nhật `roster_manifests` và mailbox hiện hành để nhân viên vẫn tự nhận biểu mẫu như luồng cũ.
- Roster **không đổi role tài khoản**. Quyền mở chuyến cần đồng thời phù hợp username được phân công và quyền/role tài khoản.

## 4. Tạo chuyến thủ công
- AD chọn **＋ TẠO CHUYẾN THỦ CÔNG**.
- Nhập chuyến đến, origin, STA, chuyến đi, destination, STD, A/C Reg/Type và Bay/Gate khi có.
- Hệ thống tạo hai `legId` cố định và một `pairId`.

## 5. Phân công nhân sự thủ công
- AD chọn một Flight Workspace → **👥 PHÂN CÔNG NHÂN SỰ**.
- Nhập username và chọn vai trò tại chuyến: **ĐH / CBTT / PVHK / VHTTB / VIEWER**.
- Phân công này chỉ cho phép người đó nhìn thấy/vào đúng Flight Workspace; không tự đổi role tài khoản.
- Nếu role tài khoản của người đăng nhập không khớp vai trò được phân công, chuyến không được mở bằng phân công thủ công đó.
- AD có thể gỡ phân công thủ công bất kỳ lúc nào.

## 6. Đổi thông tin khai thác và đổi cặp
- Đổi Flight No, route, STA/STD, A/C Reg/Type: **CẬP NHẬT KHAI THÁC** → giữ `legId`, tăng revision, đánh dấu **CẦN KIỂM TRA LẠI**.
- Re-pair A-B + C-D → A-C + B-D: chọn đúng hai cặp → **ĐỔI CẶP**. Bốn `legId` được giữ nguyên.
- Nếu roster có dấu hiệu re-pair, import không tự quyết định; AD xử lý bằng **ĐỔI CẶP**.

## 7. Nhân viên làm việc
- Sau đăng nhập, nhân viên chỉ thấy các Flight Workspace được phân cho đúng username và phù hợp quyền tài khoản; hồ sơ local roster cũ vẫn được nhận diện để tương thích.
- Chọn chuyến → **PHẦN VIỆC CỦA BẠN** → **MỞ PHẦN VIỆC**.
- Các bước KẾT SỔ / FINAL / CROSSCHECK / MVT / FSAGS vẫn giữ nguyên theo bản đang sử dụng; V1.91 chỉ tổ chức việc truy cập và liên kết dữ liệu quanh hồ sơ chuyến chung.
