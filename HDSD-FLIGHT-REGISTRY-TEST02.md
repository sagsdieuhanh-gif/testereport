# E-REPORT SAGS · FLIGHT REGISTRY TEST02

Nền nghiệp vụ: V1.84.

## Mục tiêu TEST02

- LEG là đơn vị gốc; không bắt buộc mọi dòng roster phải có cả ARR + DEP.
- DEP-only từ CXR là LEG hợp lệ.
- ARR-only đến CXR là LEG hợp lệ.
- Quan hệ ARR → DEP chỉ được tạo khi có dữ liệu/xác nhận phù hợp.
- Không dùng Flight Workspace V1.91/V1.92.

## Sửa lỗi TEST01

Nếu roster có dòng như:

- VJ2872 · CXR-UFA · STD 08:00 · VNA815
- VJ730 · CXR-HPH · STD 10:35 · VNA633
- DWC009 · CXR-TPE · STD 13:00 · T7ARN

thì phải tạo **DEPARTURE LEG**, không được BỎ QUA chỉ vì không có chuyến đến.

Khi DEP-only có A/C Reg và không có ARR đi kèm trong record, TEST02 mặc định nguồn tàu là **TÀU ĐANG NẰM TẠI CXR**, dùng chính A/C Reg của roster. AD vẫn có thể đổi nguồn tàu khi cần.

ARR-only cũng được tạo thành ARRIVAL LEG và để trạng thái sau khi đến là CHƯA XÁC ĐỊNH cho tới khi AD chọn đi tiếp / nằm lại / night stop.

## Dọn code cũ V1.91/V1.92

TEST02 upload đè thêm:

- `service-worker.js` V1.84 gốc;
- `flight-workspace.js` dạng vô hiệu hóa legacy;
- `update-runtime.js` dạng vô hiệu hóa legacy;
- `version.json` V1.84;
- `firebase-config.js` có một lần kiểm tra worker cũ và yêu cầu browser chuyển về worker V1.84.

Lớp dọn này không polling và không setInterval. Sau khi worker đổi, trang reload đúng 1 lần.

## Cách test

1. Giải nén TEST02 và upload đè toàn bộ file vào root.
2. Mở lại E-Report. Nếu worker V1.91/V1.92 còn kiểm soát trang, TEST02 sẽ đổi worker và reload 1 lần.
3. AD mở DAILY ROSTER và tạo/phân công như V1.84.
4. Mở **FLIGHT LEG / ROTATION · TEST02**.
5. Kiểm tra DEP-only phải nằm trong DEPARTURE LEG.
6. Với VJ2872/VJ730/DWC009, nguồn tàu phải mặc định **TÀU ĐANG NẰM TẠI CXR** nếu A/C Reg có sẵn.

## Nguyên tắc hiệu năng

Flight Registry TEST02 có 0 MutationObserver, 0 setInterval, 0 polling, 0 RTDB listener nền và không override `persist()`, `draw()` hoặc `applyRoleUI()`.
