# E-REPORT SAGS · V1.90 AI · 20/08/2026

Build: `V1.90-20260820-01`

## Sửa lỗi cập nhật lặp
- Khóa một nguồn build duy nhất cho toàn bộ release bằng `update-manifest.json`.
- Chỉ báo/cài bản mới khi `version.json`, manifest, Service Worker, Safe Update Runtime và Flight Workspace đều cùng build.
- Service Worker trả cùng build cho cả navigation và request kiểm tra `index.html`, tránh tình trạng trang đã cập nhật nhưng bộ kiểm tra vẫn đọc build cũ.
- Sau khi V1.90 thực sự active: tự xóa `pdh-update-applying`, xóa trạng thái dismiss/update cũ, dọn query update trên URL và đóng popup.
- Không downgrade khi cache/CDN trả bản thấp hơn.
- Vẫn giữ nguyên nguyên tắc: không ép reload; chỉ chuyển bản sau khi người dùng bấm **LƯU & CẬP NHẬT**.

## Flight Workspace
- Chỉ AD tạo chuyến ban đầu.
- Mỗi chuyến đơn giữ `legId` cố định.
- Cặp chuyến có revision và hỗ trợ RE-PAIR, ví dụ A-B + C-D → A-C + B-D.
- Đổi Flight No/chặng/A/C Reg/A/C Type/STA/STD không làm mất legId; dữ liệu phụ thuộc được đánh dấu **CẦN KIỂM TRA LẠI**.
- DAILY ROSTER chỉ phân phần việc vào chuyến đã có, không tự tạo Flight Workspace.
- Giữ nguyên trình tự nghiệp vụ KẾT SỔ / FINAL / CROSSCHECK / MVT / FSAGS hiện hành.
