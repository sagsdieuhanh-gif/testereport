# E-REPORT SAGS · V1.91 AI · 20/08/2026

Build: `V1.91-20260820-01`

## Flight Workspace + DAILY ROSTER
- Thêm **NHẬP DAILY ROSTER** ngay trong Flight Workspace dành cho AD.
- Roster được đọc/xem trước trước; chỉ tạo/cập nhật chuyến sau khi AD xác nhận.
- Dùng đúng parser và quy tắc phân form của `daily-roster.js` hiện tại, tránh hai bộ logic khác nhau.
- Cặp chưa có → tạo mới với `legId` cố định.
- Cặp đã có → dùng lại workspace; nếu thông tin khai thác thay đổi thì tăng revision và đánh dấu **CẦN KIỂM TRA LẠI**.
- Chỉ trùng một leg/có khả năng re-pair → không tự tạo trùng, hiển thị **CẦN AD KIỂM TRA**.
- Sau xác nhận, đồng thời cập nhật manifest/mailbox roster để nhân viên tiếp tục tự nhận biểu mẫu theo luồng hiện hành.

## Phân công nhân sự
- Thêm **PHÂN CÔNG NHÂN SỰ** cho từng Flight Workspace.
- AD có thể cấp quyền vào chuyến theo username + vai trò tại chuyến.
- Roster/phân công không thay đổi role tài khoản.
- Nhân viên chỉ thấy chuyến phù hợp username + role/quyền; giữ fallback hồ sơ roster local cũ để tương thích.

## Cập nhật an toàn
- Build đồng bộ duy nhất `V1.91-20260820-01`.
- Bổ sung kiểm tra `firebase-config.js` cùng build trước khi áp dụng update.
- Manifest kiểm tra đồng bộ Service Worker / Update Runtime / Flight Workspace / Firebase loader.
- Sau khi V1.91 active, chặn popup updater legacy bật lại cùng build để tránh vòng lặp cập nhật.
- Không ép reload; vẫn chỉ cập nhật sau khi người dùng bấm **LƯU & CẬP NHẬT**.
