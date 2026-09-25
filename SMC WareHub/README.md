# WareHub — Hệ thống In Tem Thiết Bị (SMC)

Web quản lý thiết bị + in tem QR (khổ 24mm cho Laptop/Tablet/PDA/Màn hình, khổ 12mm cho Điện thoại), có đăng nhập phân quyền, lưu lịch sử in và lịch sử chỉnh sửa thiết bị.

## Yêu cầu môi trường (chạy thủ công, không Docker)

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/) (kèm npm)
- MySQL 8.0 (cài local, hoặc chạy qua Docker riêng: `docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=... -e MYSQL_DATABASE=WareHub mysql:8.0`)
- Git

Nếu chạy bằng Docker Compose (mục bên dưới) thì chỉ cần cài Docker, không cần .NET SDK/Node/MySQL riêng.

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
| **admin** | Toàn quyền: CRUD thiết bị, CRUD người dùng, xem lịch sử sửa thiết bị, in tem |
| **staff** | Xem danh sách thiết bị, in tem (không thêm/sửa/xoá thiết bị hoặc người dùng, không xem lịch sử sửa) |

## Chạy bằng Docker (khuyến nghị)

1. Tạo file `.env` cạnh `docker-compose.yml` với các giá trị **bắt buộc** (không có mặc định; thiếu thì compose báo lỗi ngay):
   - `DB_PASSWORD` — mật khẩu MySQL root
   - `JWT_SECRET` — chuỗi ngẫu nhiên tối thiểu 32 ký tự, không chứa chữ "change"/"example" (bản Production từ chối khởi động nếu là khoá mẫu). Tạo nhanh: `openssl rand -base64 48`
   - `DEFAULT_ADMIN_PASSWORD` — mật khẩu admin mặc định: tối thiểu 10 ký tự, có cả chữ và số, không phải mật khẩu phổ biến (không đạt thì bản Production không khởi động)

2. Chạy toàn bộ hệ thống:
   ```bash
   docker compose up --build -d
   ```

3. Truy cập:
   - Web: `http://<ip-máy-chủ>` (cổng 80)
   - API chỉ đi qua web (`/api`); cổng 4000 của backend và cổng 3306 của MySQL **không** mở ra ngoài (chỉ trong mạng nội bộ của Docker)

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

### Lần đầu clone về máy mới

1. Clone repo:
   ```bash
   git clone <url-repo-cua-ban> "SMC WareHub"
   cd "SMC WareHub"
   ```
2. Tạo file cấu hình local từ file mẫu (file thật chứa mật khẩu nên **không** nằm trong git — xem `.gitignore`):
   ```bash
   cp backend-dotnet/appsettings.Development.example.json backend-dotnet/appsettings.Development.json
   ```
   Rồi mở `backend-dotnet/appsettings.Development.json` sửa lại:
   - `ConnectionStrings:Default` → điền đúng mật khẩu MySQL root trên máy này (`Password=...`)
   - `DefaultAdmin:Password` → mật khẩu admin muốn tạo tự động cho lần chạy đầu tiên (chỉ áp dụng khi bảng `users` đang trống)
3. Đảm bảo MySQL 8.0 đang chạy trên máy (cổng 3306) và đã có database rỗng tên `WareHub` (server tự tạo bảng khi khởi động lần đầu, không cần chạy migration tay).
4. Chạy backend và frontend theo hướng dẫn bên dưới.

### Backend
```bash
dotnet run --project backend-dotnet/WareHub.Api.csproj
```
Nghe ở cổng 4000. Backend dùng `backend-dotnet/appsettings.Development.json` khi chạy local (không commit lên git) và đọc `ConnectionStrings__Default`, `Jwt__Secret` cùng `DefaultAdmin__*` từ biến môi trường khi chạy Docker.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Vite dev server (cổng 5173, hoặc cổng kế tiếp nếu 5173 đang bận) đã cấu hình proxy `/api` → `http://localhost:4000`.

Đăng nhập lần đầu bằng `admin` / mật khẩu bạn đặt ở `DefaultAdmin:Password` phía trên.

## In tem trên máy in Brother

Hệ thống dùng cơ chế in gốc của trình duyệt (`window.print()`). Trước khi in lần đầu trên mỗi máy:

1. Cài driver máy in Brother trên máy tính dùng để in.
2. Trong hộp thoại in của trình duyệt → **More settings** → chỉnh **Paper size** khớp đúng khổ tang tem đang nạp (24mm hoặc 12mm).
3. Trình duyệt sẽ nhớ cấu hình này cho các lần in sau trên cùng máy.

Kích thước tem: laptop/tablet/PDA/màn hình in trên băng 24mm, tem dài 60mm; điện thoại in trên băng 12mm, tem dài 30mm (QR bên trái, logo SMC và Service Tag chữ đậm bên phải). Trong driver Brother, đặt **Length** đúng độ dài tem (60mm hoặc 30mm) và trong hộp thoại in của Chrome để **Scale = Default (100)**, **Margins = None**.

Vì laptop/tablet/PDA/màn hình dùng khổ 24mm còn điện thoại dùng khổ 12mm, hệ thống gom tem theo từng khổ riêng trong hàng đợi in — nên in từng nhóm khổ tem cùng loại tang đang nạp trong máy in, tránh in lẫn hai khổ trong 1 lượt.

## Triển khai không gián đoạn (blue-green)

Dùng cho máy chủ chạy Docker. Hai bộ hệ thống (**blue** và **green**) cùng dùng 1 cơ sở dữ liệu; chỉ 1 bộ nhận lưu lượng qua `gateway` (nginx). Khi cập nhật, bản mới được dựng lên bộ đang rảnh và kiểm tra xong mới chuyển lưu lượng sang; bản cũ vẫn chạy nên có thể quay lại ngay. Toàn bộ nằm trong thư mục `deploy/` (tách biệt với `docker-compose.yml` ở gốc, vốn chỉ chạy 1 bộ).

```
người dùng ──► gateway (nginx) ──► web-blue  ──► backend-blue  ──┐
                    │ (đọc state/upstream.conf)                    ├──► mysql (dùng chung)
                    └──────────► web-green ──► backend-green ─────┘
```

**Lần đầu**
```bash
cd deploy
cp .env.example .env        # điền DB_PASSWORD, JWT_SECRET, DEFAULT_ADMIN_PASSWORD, CORS_ORIGIN
./bluegreen.sh deploy       # dựng mysql + blue + gateway
```
(Windows dùng Git Bash hoặc WSL. Nếu trước đó đang chạy `docker-compose.yml` ở gốc thì sao lưu dữ liệu bằng `mysqldump` và nạp lại vào MySQL mới của thư mục `deploy/` — hai bên dùng volume khác nhau.)

**Mỗi lần cập nhật** — sau khi `git pull`:
```bash
./bluegreen.sh deploy
```
Script làm lần lượt: build bản mới lên bộ đang rảnh (người dùng vẫn dùng bộ hiện tại bình thường) → chờ bản mới **sẵn sàng thật** (`/api/ready` nối được cơ sở dữ liệu và web trả trang chủ) → so phiên bản để chắc là bản mới → kiểm tra cấu hình nginx rồi **nạp lại êm** để chuyển lưu lượng → gọi thử qua gateway, **nếu phiên bản/độ sẵn sàng không đúng thì tự quay lại**. Bản mới không lên được thì **không chuyển gì cả**, hệ thống hiện tại vẫn phục vụ.

| Lệnh | Việc làm |
|---|---|
| `./bluegreen.sh rollback` | Chuyển lưu lượng về bản trước ngay lập tức (tự bật lại bản trước nếu đã bị tắt). |
| `./bluegreen.sh status` | Xem bộ nào đang phục vụ và phiên bản của từng bộ. |
| `./bluegreen.sh cleanup` | Tắt bộ không còn phục vụ khi đã yên tâm về bản mới (giải phóng tài nguyên). |

**Quy tắc để bản cũ và bản mới dùng chung cơ sở dữ liệu**: trong lúc chuyển, hai phiên bản cùng chạy trên 1 CSDL, nên thay đổi CSDL phải **tương thích ngược** — thêm bảng/cột/chỉ mục thì được (code tự thêm khi khởi động, bản cũ vẫn chạy bình thường); **không** đổi tên/xoá cột hay đổi ý nghĩa dữ liệu trong cùng một lần cập nhật (làm 2 lần: lần 1 thêm cái mới và dùng song song, lần 2 bỏ cái cũ). Thay đổi không tương thích ngược thì dùng **chế độ bảo trì** (mục bên dưới) rồi cập nhật kiểu dừng-và-chạy lại.

**Lưu ý**
- Chạy đồng thời hai bộ tốn gấp đôi RAM trong lúc chuyển; `cleanup` để trả lại.
- `JWT_SECRET` phải giữ nguyên qua các lần cập nhật để người dùng không phải đăng nhập lại.
- Trình duyệt người dùng đang mở tự nhận ra phiên bản mới và hiện thanh "Có phiên bản mới — Tải lại trang" (không ép tải lại).
- Lúc nginx nạp lại, một vài kết nối keep-alive đang rảnh có thể bị đóng đúng khoảnh khắc trình duyệt dùng lại; trình duyệt tự gửi lại các yêu cầu đọc (GET). Đo thử: khoảng 3 trong ~7.000 yêu cầu bị reset như vậy, còn yêu cầu đang xử lý dở (kể cả loại chậm 4 giây) đều hoàn tất bình thường.
- Đã kiểm thử bằng cách chạy nguyên `bluegreen.sh` với nginx thật và 2 bản backend thật dưới tải, nhưng **chưa chạy trên Docker thật** (máy phát triển không cài Docker): lần đầu chạy trên máy chủ nên theo dõi log.

## Cập nhật code & chế độ bảo trì

(Nếu đã dùng blue-green ở trên thì cập nhật thường không cần bảo trì; mục này dành cho thay đổi không tương thích ngược hoặc khi không dùng blue-green.)

Khi cập nhật, báo cho người dùng biết thay vì để họ gặp lỗi khó hiểu:

1. **Bật bảo trì** (chọn 1 trong 2 cách):
   - Trên web (tài khoản admin): bấm nút 🛠 ở đầu trang → nhập thông báo và giờ dự kiến xong (không bắt buộc) → **Bật bảo trì**.
   - Hoặc bằng script (chạy được cả khi backend đang tắt): `.\scripts\maintenance.ps1 on "Đang cập nhật phiên bản mới" -Until "2026-09-25 09:30"`
2. Dừng backend → copy code mới → build frontend (`npm run build`) và backend → chạy lại backend.
3. Kiểm tra nhanh bằng tài khoản admin (admin vẫn dùng được khi đang bảo trì).
4. **Tắt bảo trì**: nút 🛠 hoặc thanh vàng ở đầu trang → **Tắt bảo trì**, hoặc `.\scripts\maintenance.ps1 off`.

Người dùng khác thấy màn hình "Hệ thống đang bảo trì" kèm thông báo và giờ dự kiến; trang tự tiếp tục khi bảo trì tắt. Chế độ bảo trì là file `backend-dotnet/maintenance.json` (đổi vị trí bằng cấu hình `Maintenance:FlagFile`) nên còn nguyên qua các lần khởi động lại backend; nhớ **tắt** sau khi cập nhật xong.

Nếu chỉ tắt/khởi động lại backend mà quên bật bảo trì, trình duyệt người dùng vẫn tự hiện "Không kết nối được máy chủ", tự tiếp tục khi backend chạy lại, và **tự tải lại trang khi phát hiện phiên bản mới** để lấy giao diện mới (dữ liệu chưa lưu trong ô nhập sẽ mất, riêng phiếu bàn giao đang soạn được lưu nháp tự động).

**Khi mất mạng / mất kết nối máy chủ**: trình duyệt mất mạng thì hiện thanh đỏ cảnh báo (vẫn xem được dữ liệu đã tải, nhưng lưu và in chưa làm được vì việc in ghi lịch sử lên máy chủ); có mạng trở lại thì tự tải lại dữ liệu. Font chữ tải không chặn hiển thị nên mạng nội bộ chặn Google Fonts thì trang vẫn mở ngay bằng font hệ thống (tem in có thể khác font).

## Bảo mật

Đã áp dụng (mỗi mục đều có test tấn công tương ứng, chạy trên bản thử):

- **Đăng nhập:** khoá tạm khi sai nhiều lần (5 lần sai cùng 1 IP + tài khoản → khoá 5 phút, tăng gấp đôi mỗi lần tái phạm; 30 lần sai từ 1 IP → khoá IP, chặn dò nhiều tài khoản); nginx giới hạn thêm 20 lượt/phút/IP ở lớp cổng; phản hồi và thời gian như nhau dù tài khoản có tồn tại hay không.
- **Mật khẩu:** tối thiểu 10 ký tự, có chữ và số, không chứa tên đăng nhập, không phải mật khẩu phổ biến.
- **Phiên (JWT):** chỉ nhận HS256, đúng nơi phát hành/đối tượng, có hạn dùng. Đổi mật khẩu, đổi vai trò hoặc khoá tài khoản làm mọi token cũ mất hiệu lực **ngay** (kể cả quyền admin đã bị thu hồi). Admin không tự hạ quyền/khoá/xoá chính mình.
- **Phân quyền:** mọi API yêu cầu đăng nhập (trừ health/ready/trạng thái bảo trì/đăng nhập); thao tác quản trị chỉ admin. API không trả `password_hash`.
- **Tấn công đầu vào:** truy vấn có tham số (chống SQL injection), giới hạn kích thước body 1MB, độ dài chuỗi tìm kiếm, kích thước phiếu; yêu cầu sai định dạng trả 4xx (không phải 500).
- **Trình duyệt:** CSP chỉ cho script của chính máy chủ (XSS không chạy được mã), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, API `Cache-Control: no-store`. Font, thư viện đều đóng gói sẵn — web không gọi ra internet.
- **Triển khai:** backend chạy bằng tài khoản không phải root; MySQL/backend không mở cổng ra ngoài; không có mật khẩu mặc định yếu; `appsettings.Development.json` không vào image Docker; nginx ẩn phiên bản.
- **Thư viện:** `npm audit` và `dotnet list package --vulnerable` đều sạch tại thời điểm cập nhật — nên chạy lại định kỳ.

**Việc nên làm thêm khi đưa vào chạy thật (cấu hình hạ tầng, không nằm trong code):**

1. **HTTPS.** Web nội bộ vẫn nên chạy HTTPS (chứng chỉ của CA nội bộ, hoặc đặt sau tường lửa/proxy của công ty có TLS): nếu không, mật khẩu và token đi trong mạng dưới dạng chữ rõ. Khi đã có HTTPS, backend tự bật HSTS. Nếu đặt thêm 1 proxy phía trước gateway, chỉnh `X-Forwarded-For` trong `deploy/gateway/nginx.conf` cho đúng.
2. **Tài khoản MySQL riêng cho ứng dụng** thay vì `root`. Ví dụ (chạy 1 lần bằng root, rồi đổi `User=`/`Password=` trong chuỗi kết nối):
   ```sql
   CREATE USER 'warehub'@'%' IDENTIFIED BY '<mật-khẩu-mạnh>';
   GRANT ALL PRIVILEGES ON WareHub.* TO 'warehub'@'%';
   ```
3. **Sao lưu MySQL định kỳ** và giữ bản sao ngoài máy chủ.
4. **Đổi mật khẩu admin mặc định** ngay sau lần đăng nhập đầu và tạo tài khoản riêng cho từng người.
5. Giữ `appsettings.Development.json` và `deploy/.env` ngoài git (đã có trong `.gitignore`); nếu từng lộ, đổi ngay khoá GLPI và mật khẩu DB.

Rủi ro còn lại đã biết: token đăng nhập lưu trong `localStorage` của trình duyệt (nếu có lỗ XSS thì đọc được; CSP đã chặn cách khai thác thông thường) và chưa có nút "Đăng xuất khỏi mọi thiết bị" (token tự hết hạn sau 8 giờ, hoặc mất hiệu lực khi đổi mật khẩu).

## Cấu trúc dữ liệu chính

- `devices`: `ma` (mã, duy nhất), `ten`, `loai` (laptop/tablet/pda/monitor/phone), `kho` (24/12 — backend tự suy ra từ `loai`, không tin giá trị gửi từ client), `phong_ban`, `ghi_chu`
- `print_history`: ghi lại mỗi lần in — thiết bị nào, ai in, lúc nào (ghi ngầm, hiện chưa có trang xem trên giao diện)
- `device_history`: ghi lại mỗi lần sửa thiết bị — trường nào đổi, giá trị cũ/mới, ai sửa, lúc nào (xem ở trang **Lịch sử sửa**, chỉ admin)
- `users`: `username`, `password_hash` (bcrypt), `full_name`, `role` (admin/staff), `is_active`

## Việc cần làm tiếp (gợi ý, chưa triển khai)

- Tích hợp lấy danh sách thiết bị trực tiếp từ database SMC Inventory thay vì nhập tay riêng ở hệ thống này
- Xuất báo cáo lịch sử in ra Excel
- HTTPS — hiện docker-compose chạy HTTP thuần ở cổng 80; khi lên production nội bộ nên đặt sau IIS/nginx reverse proxy có SSL giống mô hình SMC Inventory đang dùng
