# Web kho — Kiến trúc & kế hoạch triển khai

## 1. Lựa chọn công nghệ

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| Backend | ASP.NET Core (C#) | Đã thành thạo cả Node.js và ASP.NET Core; hệ thống dự kiến quy mô lớn, cần scale mạnh (nhiều chi nhánh/kho, nhiều user đồng thời) — ASP.NET Core có lợi thế đa luồng thật, throughput cao hơn, type-safety giảm bug khi codebase lớn dần |
| Frontend | React + Vite | Build/dev nhanh hơn CRA, phù hợp SPA quản lý kho |
| Database | MySQL | Dữ liệu tồn kho, giao dịch, nhiều chi nhánh |
| Cache | Redis | Cache tồn kho realtime, session, giảm tải MySQL |
| Triển khai | Docker (container hoá từng thành phần) | Dễ scale từng phần độc lập, dễ deploy |
| In tem thiết bị | QR tự viết thư viện (không phụ thuộc npm package ngoài) | Tái sử dụng được cho các dự án sau này |

## 2. Kiến trúc backend — Clean Architecture

```
Client (web, mobile, thiết bị quét mã)
        ↓
API layer            — Controllers, xác thực, phân quyền
        ↓
Application layer    — Use case: nhập kho, xuất kho, kiểm kê, in tem
        ↓
Domain layer         — Entity, quy tắc nghiệp vụ (tồn kho, lô hàng...)
        ↓
Infrastructure layer — EF Core, Redis cache, hàng đợi, log, kết nối máy in
        ↓
MySQL database        — Tồn kho, giao dịch, nhiều chi nhánh
```

Nguyên tắc: Domain layer không phụ thuộc layer nào khác → dễ unit test logic nghiệp vụ, dễ thay đổi hạ tầng (DB, cache, máy in) mà không ảnh hưởng nghiệp vụ cốt lõi.

## 3. Mô hình triển khai (Docker)

- **Client** → **Nginx (reverse proxy)** → định tuyến:
  - Request tĩnh → **Frontend container** (React/Vite build)
  - Request `/api/*` → **Backend container** (ASP.NET Core)
- **Backend container** kết nối:
  - **MySQL container** (dữ liệu chính, có Docker volume để dữ liệu bền vững)
  - **Redis container** (cache)
  - **Máy in Brother** qua mạng LAN nội bộ (không qua internet)
- Mỗi container scale độc lập — backend chịu tải cao có thể chạy nhiều instance phía sau Nginx mà không đụng đến frontend/DB.

## 4. Chức năng đầu tiên: In tem thiết bị

Luồng xử lý:

1. **Đăng nhập** — xác thực, kiểm tra quyền in tem theo phòng ban/nhân viên
2. **Chọn thiết bị + loại tem** — 24mm (laptop/tablet/PDA/monitor) hoặc 12mm (phone)
3. **Backend tạo dữ liệu QR** — mã hoá thông tin thiết bị (mã tài sản, tên, phòng ban)
4. **Dựng mẫu tem** — ghép QR + text vào template đúng kích thước
5. **Gửi lệnh in** — tới máy in Brother qua driver/mạng LAN
6. **Ghi lịch sử in** — lưu MySQL để tra cứu sau

Phân lớp theo Clean Architecture:
- Chọn thiết bị/loại tem → API + Application layer (use case `PrintLabel`)
- Tạo QR + dựng template → Application layer hoặc Domain Service riêng
- Gửi lệnh in tới máy in vật lý → Infrastructure layer (chi tiết kỹ thuật, không phải nghiệp vụ)

## 5. Việc đang làm

- [ ] Viết thư viện tạo mã QR riêng (thuần JS, không phụ thuộc npm package ngoài) để dùng cho tem thiết bị và tái sử dụng cho các dự án khác sau này
- [ ] Setup frontend bằng Vite
- [ ] Viết use case `PrintLabel` theo cấu trúc ASP.NET Core Clean Architecture
- [ ] Viết `docker-compose.yml` khớp với mô hình triển khai ở mục 3
