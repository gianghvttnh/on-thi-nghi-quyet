# Ôn thi Nghị Quyết

Website tĩnh ôn tập / luyện tập / thi thử trắc nghiệm. Thư mục `docs/` được đăng bằng GitHub Pages.

## Thêm bộ đề mới
1. Chép file Excel (cùng mẫu cột: E = STT, F = Nội dung, G = Đáp án 1–4, H–K = Phương án 1–4) vào một thư mục nhóm trong `Tổng hợp Bộ đề thi/` (vd `Tổng hợp Bộ đề thi/Miền Trung/`). Tên thư mục = tên nhóm, tên file = tên bộ đề.
2. Chạy `python3 tools/build_data.py` để tạo lại `docs/data/questions.js`.
3. Commit & push — website tự cập nhật sau khoảng 1 phút.
