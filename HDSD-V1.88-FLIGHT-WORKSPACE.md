# E-REPORT SAGS — HDSD V1.88 · FLIGHT WORKSPACE

## Nguyên tắc
- **AD là người tạo chuyến bay ban đầu.**
- Mỗi chuyến đơn có một `legId` cố định. `Flight No`, chặng, A/C Reg, A/C Type, STA/STD có thể thay đổi nhưng không làm đổi `legId`.
- Một cặp khai thác là quan hệ giữa các `legId`; quan hệ này có thể **RE-PAIR / ĐỔI CẶP** và có revision.
- DAILY ROSTER **không tự tạo chuyến** trong Flight Workspace. Roster chỉ hỗ trợ gắn/phân phần việc vào chuyến AD đã tạo.
- Các bước KẾT SỔ, FINAL, CROSSCHECK, MVT, FSAGS… **giữ nguyên theo bản đang dùng**.

## 1. AD tạo chuyến
1. Đăng nhập tài khoản AD.
2. Mở **✈️ CHUYẾN BAY**.
3. Bấm **＋ TẠO CHUYẾN**.
4. Nhập chuyến đến, chặng đến CXR, STA; chuyến đi, chặng đi từ CXR, STD; A/C Reg/Type và Bay/Gate nếu có.
5. Bấm **TẠO FLIGHT WORKSPACE**.

Hệ thống sinh 2 `legId` và 1 `pairId`. Các ID này không phụ thuộc số hiệu chuyến hoặc đăng bạ.

## 2. Đổi tàu bay, số hiệu, chặng hoặc giờ khai thác
1. AD chọn đúng Flight Workspace.
2. Bấm **CẬP NHẬT KHAI THÁC**.
3. Sửa thông tin cần thay đổi và bấm **LƯU REVISION**.

Hệ thống giữ `legId`, lưu số hiệu cũ trong alias, tăng revision và đánh dấu **CẦN KIỂM TRA LẠI**. Dữ liệu nghiệp vụ cũ không bị xóa hoặc âm thầm ghi đè.

## 3. Đổi cặp chuyến
Ví dụ: ban đầu `A-B` và `C-D`, sau đó đổi thành `A-C` và `B-D`.

1. AD đánh dấu **2 cặp** cần đổi.
2. Bấm **🔀 ĐỔI CẶP**.
3. Chọn 2 chuyến đơn để tạo cặp mới thứ nhất.
4. Hệ thống tự ghép 2 chuyến còn lại thành cặp thứ hai và kiểm tra mỗi cặp có 1 chuyến đến + 1 chuyến đi. Ký hiệu A/B/C/D chỉ là ví dụ; cặp khai thác thực tế vẫn phải hợp lệ về chiều đến/đi.
5. Bấm **XÁC NHẬN ĐỔI CẶP**.

Bốn `legId` vẫn giữ nguyên. Chỉ quan hệ pairing thay đổi. Cả hai workspace được đánh dấu **CẦN KIỂM TRA LẠI** và người đang đăng nhập nhận popup thay đổi.

## 4. Nhân viên lấy phần việc
1. Mở **CHUYẾN BAY HÔM NAY**.
2. Chọn đúng chuyến.
3. Xem **PHẦN VIỆC CỦA BẠN**.
4. Bấm **MỞ PHẦN VIỆC**.

Sau khi mở, hệ thống quay về đúng biểu mẫu/luồng hiện có. V1.88 không tự rút gọn hoặc thay thứ tự nghiệp vụ.

## 5. Cơ chế cập nhật V1.88
- `version.json` = **V1.88**.
- Service Worker cache = `sags-v1-88-flight-workspace-20260820-01`.
- Service Worker mới **không ép reload**.
- Khi app hiện có bản mới, người dùng bấm **CẬP NHẬT**; sau reload do người dùng chủ động, Service Worker V1.88 chèn `flight-workspace.js` và đồng bộ `APP_BUILD_VERSION`/`APP_DISPLAY_VERSION` của HTML runtime sang V1.88.
- Điều này tránh lỗi V1.87: module tồn tại trong ZIP nhưng không được runtime nạp đúng.

## Kiểm tra sau cập nhật
Sau khi bấm CẬP NHẬT, phải thấy:
- tiêu đề **CHUYẾN BAY HÔM NAY · V1.88**;
- dòng debug `Flight Workspace build V1.88-20260820-01`;
- tài khoản AD có nút **＋ TẠO CHUYẾN** và **🔀 ĐỔI CẶP**;
- tài khoản không phải AD không có quyền tạo/sửa chuyến.
