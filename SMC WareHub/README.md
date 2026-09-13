# Hệ thống In Tem Thiết Bị

Web quản lý thiết bị + in tem QR (khổ 24mm cho Laptop/Tablet/PDA/Màn hình, khổ 12mm cho Điện thoại), có đăng nhập phân quyền, lưu lịch sử in.

## Kiến trúc

```
tem-thiet-bi/
├── backend-dotnet/   ASP.NET Core 8 + EF Core/MySQL (REST API, JWT auth)
├── frontend/         React (Vite) + nginx (build tĩnh, proxy /api)
├── docker-compose.yml
```

- **MySQL**: lưu bảng `users`, `devices`, `print_history`
- **Backend**: ASP.NET Core 8, cổng 4000, endpoint gốc `/api`
- **Frontend**: build ra static files, phục vụ qua nginx ở cổng 80, nginx proxy `/api/*` sang backend nên frontend/backend cùng origin (không lỗi CORS khi deploy)

## Phân quyền

| Vai trò | Quyền |
|---|---|
| **admin** | Toàn quyền: CRUD thiết bị, CRUD người dùng, xem lịch sử in, in tem |
| **staff** | Xem danh sách thiết bị, in tem, xem lịch sử in (không thêm/sửa/xoá thiết bị hoặc người dùng) |

## Chạy bằng Docker (khuyến nghị)

1. Đặt các biến môi trường trước khi chạy, tối thiểu:
   - `DB_PASSWORD` — mật khẩu MySQL root
   - `JWT_SECRET` — chuỗi bí mật ngẫu nhiên tối thiểu 32 ký tự
   - `DEFAULT_ADMIN_PASSWORD` — mật khẩu admin mặc định

2. Chạy toàn bộ hệ thống:
   ```bash
   docker compose up --build -d
   ```

3. Truy cập:
   - Web: `http://<ip-máy-chủ>` (cổng 80)
   - API (nếu cần gọi trực tiếp): `http://<ip-máy-chủ>:4000/api`

4. Đăng nhập lần đầu bằng tài khoản admin mặc định từ `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASSWORD`. Tài khoản này chỉ được tạo tự động **nếu bảng `users` đang trống**.

5. Xem log nếu cần debug:
   ```bash
   docker compose logs -f backend
   docker compose logs -f mysql
   ```

6. Dừng hệ thống:
   ```bash
   docker compose down          # giữ lại dữ liệu MySQL (volume)
   docker compose down -v       # xoá luôn dữ liệu MySQL — cẩn thận
   ```

## Chạy thủ công khi phát triển (không Docker)

**Backend:**
```bash
dotnet run --project backend-dotnet/WareHub.Api.csproj
```

Backend ASP.NET Core dùng `backend-dotnet/appsettings.Development.json` khi chạy local và đọc `ConnectionStrings__Default`, `Jwt__Secret` cùng `DefaultAdmin__*` từ environment khi chạy Docker.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Vite dev server (cổng 5173) đã cấu hình proxy `/api` → `http://localhost:4000`.

## In tem trên máy in Brother

Hệ thống dùng cơ chế in gốc của trình duyệt (`window.print()`). Trước khi in lần đầu trên mỗi máy:

1. Cài driver máy in Brother trên máy tính dùng để in.
2. Trong hộp thoại in của trình duyệt → **More settings** → chỉnh **Paper size** khớp đúng khổ tang tem đang nạp (24mm hoặc 12mm).
3. Trình duyệt sẽ nhớ cấu hình này cho các lần in sau trên cùng máy.

Vì laptop/tablet/PDA/màn hình dùng khổ 24mm còn điện thoại dùng khổ 12mm, hệ thống gom tem theo từng khổ riêng trong hàng đợi in — nên in từng nhóm khổ tem cùng loại tang đang nạp trong máy in, tránh in lẫn hai khổ trong 1 lượt.

## Cấu trúc dữ liệu chính

- `devices`: `ma` (mã, duy nhất), `ten`, `loai` (laptop/tablet/pda/monitor/phone), `kho` (24/12 — backend tự suy ra từ `loai`, không tin giá trị gửi từ client), `phong_ban`, `ghi_chu`
- `print_history`: ghi lại mỗi lần in — thiết bị nào, ai in, lúc nào
- `users`: `username`, `password_hash` (bcrypt), `full_name`, `role` (admin/staff), `is_active`

## Việc cần làm tiếp (gợi ý, chưa triển khai)

- Tích hợp lấy danh sách thiết bị trực tiếp từ database SMC Inventory thay vì nhập tay riêng ở hệ thống này
- Xuất báo cáo lịch sử in ra Excel
- HTTPS — hiện docker-compose chạy HTTP thuần ở cổng 80; khi lên production nội bộ nên đặt sau IIS/nginx reverse proxy có SSL giống mô hình SMC Inventory đang dùng
