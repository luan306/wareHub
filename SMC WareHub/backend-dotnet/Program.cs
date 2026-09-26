using System.IdentityModel.Tokens.Jwt;
using System.Linq.Expressions;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using QRCoder;
using WareHub.Api.Contracts;
using WareHub.Api.Data;
using WareHub.Api.Services;

var builder = WebApplication.CreateBuilder(args);
// Ghi thêm log ra file (logs/app-YYYY-MM-DD.log) song song với console: xem lại lịch sử lỗi được ngay cả sau khi
// cửa sổ console đã đóng hoặc đã cuộn mất, không phải copy tay từ màn hình mỗi lần cần gửi log đi.
builder.Logging.AddProvider(new FileLoggerProvider(Path.Combine(builder.Environment.ContentRootPath, "logs")));
var configuration = builder.Configuration;
var connectionString = configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Thiếu ConnectionStrings:Default");
var jwtSecret = configuration["Jwt:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
    throw new InvalidOperationException("Jwt:Secret phải có tối thiểu 32 ký tự");
// appsettings.json trong kho mã chứa 1 khoá mẫu ai cũng đọc được; chạy thật mà quên đặt khoá riêng thì kẻ tấn công tự ký được token admin.
if (builder.Environment.IsProduction()
    && (new[] { "change", "dev_only", "example", "placeholder" }.Any(w => jwtSecret.Contains(w, StringComparison.OrdinalIgnoreCase)) || jwtSecret.Distinct().Count() < 12))
    throw new InvalidOperationException("Jwt:Secret đang là giá trị mẫu/yếu. Đặt chuỗi ngẫu nhiên dài (tối thiểu 32 ký tự) bằng biến môi trường Jwt__Secret.");

const string JwtIssuer = "warehub";
const string JwtAudience = "warehub-web";

builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;                              // không khoe "Kestrel" cho người ngoài
    options.Limits.MaxRequestBodySize = 1_048_576;                // 1MB: mọi yêu cầu của ứng dụng đều nhỏ hơn nhiều
    options.Limits.MaxRequestHeadersTotalSize = 32 * 1024;
    options.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(15);
});
// Địa chỉ IP thật của người dùng (để khoá đăng nhập theo IP): đọc từ X-Forwarded-For do nginx ghi đè bằng $remote_addr, chỉ tin 1 tầng.
// Cổng của backend KHÔNG được mở ra ngoài (chỉ nginx gọi vào) — nếu mở, kẻ ngoài có thể tự đặt header này để lẩn tránh khoá.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
});
builder.Services.AddResponseCompression(options => options.EnableForHttps = true);
// Dò phiên bản MySQL đúng 1 lần: lambda cấu hình bên dưới chạy lại cho MỖI DbContext (tức mỗi yêu cầu), nếu để
// AutoDetect ngay trong đó thì mỗi yêu cầu sẽ mở thêm 1 kết nối MySQL chỉ để hỏi số phiên bản (làm chậm cả chục lần).
// PublicationOnly: nếu MySQL chưa sẵn sàng thì lần dò này lỗi nhưng KHÔNG bị nhớ lỗi, lần sau dò lại.
var mysqlVersion = new Lazy<ServerVersion>(() => ServerVersion.AutoDetect(connectionString), LazyThreadSafetyMode.PublicationOnly);
builder.Services.AddDbContext<WareHubDbContext>(options =>
    options.UseMySql(connectionString, mysqlVersion.Value, mysql =>
        mysql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorNumbersToAdd: null)
             .CommandTimeout(30)));
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.Configure<GlpiOptions>(configuration.GetSection(GlpiOptions.SectionName));
builder.Services.AddHttpClient<GlpiClient>();
builder.Services.AddSingleton<MaintenanceState>();
builder.Services.AddSingleton<UserCache>();
builder.Services.AddSingleton<LoginGuard>();
builder.Services.AddSingleton<GlpiSyncJob>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ValidateIssuer = true,
        ValidIssuer = JwtIssuer,
        ValidateAudience = true,
        ValidAudience = JwtAudience,
        ValidateLifetime = true,
        RequireExpirationTime = true,
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256], // chặn kiểu tấn công đổi thuật toán (alg confusion / alg=none)
        ClockSkew = TimeSpan.FromSeconds(30)
    };
});
builder.Services.AddAuthorization(options => options.AddPolicy("admin", policy => policy.RequireRole("admin")));
var origins = configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Resource-Policy"] = "same-origin";
    if (context.Request.IsHttps) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        headers["Cache-Control"] = "no-store"; // dữ liệu API không được lưu trong bộ nhớ đệm của trình duyệt/proxy
        headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
    }
    await next();
});
app.UseResponseCompression();
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception exception) when (exception is BadHttpRequestException or JsonException)
    {
        // JSON hỏng, thiếu tham số bắt buộc, quá cỡ...: lỗi của người gọi. Không ghi log lỗi (tránh bị dùng để làm đầy log) và không lộ chi tiết nội bộ.
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = exception is BadHttpRequestException bad ? bad.StatusCode : StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new { error = context.Response.StatusCode == StatusCodes.Status413PayloadTooLarge ? "Dữ liệu gửi lên quá lớn" : "Yêu cầu không hợp lệ" });
        }
    }
    catch (Exception exception)
    {
        app.Logger.LogError(exception, "Unhandled API error for {Method} {Path}", context.Request.Method, context.Request.Path);
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { error = app.Environment.IsDevelopment() ? exception.Message : "Lỗi máy chủ, vui lòng thử lại sau" });
        }
    }
});
app.UseCors();
app.UseAuthentication();
// Chế độ bảo trì: chặn mọi API với 503 (giao diện web đọc mã này để hiện màn hình "đang bảo trì"), trừ admin và các
// đường cần thiết để bật/tắt/kiểm tra (health, trạng thái bảo trì, đăng nhập). Đặt TRƯỚC bước tra cứu người dùng
// trong DB nên vẫn hoạt động khi đang thao tác trên cơ sở dữ liệu.
var maintenance = app.Services.GetRequiredService<MaintenanceState>();
var userCache = app.Services.GetRequiredService<UserCache>();
// Băm 1 mật khẩu giả cho tài khoản không tồn tại, để thời gian phản hồi đăng nhập không lộ tên nào có thật.
var dummyUser = new User { PasswordHash = new PasswordHasher<User>().HashPassword(new User(), "dummy-password-used-only-for-timing") };
app.Use(async (context, next) =>
{
    var info = maintenance.Current;
    if (info.Enabled && context.Request.Path.StartsWithSegments("/api") && !IsMaintenanceExempt(context.Request) && !context.User.IsInRole("admin"))
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        context.Response.Headers.RetryAfter = "60";
        await context.Response.WriteAsJsonAsync(new { error = info.Message, maintenance = true, until = info.Until });
        return;
    }
    await next();
});
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var id = context.User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = int.TryParse(id, out var userId) ? await userCache.GetAsync(userId, context.RequestAborted) : null;
        if (user is null || !user.IsActive)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Tài khoản không tồn tại hoặc đã bị khóa" });
            return;
        }
        // Đổi mật khẩu hoặc đổi vai trò làm mọi token đã cấp trước đó mất hiệu lực (kể cả quyền admin đã bị thu hồi).
        if (!string.Equals(context.User.FindFirstValue("stamp"), SessionStamp(user), StringComparison.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại" });
            return;
        }
        context.Items["CurrentUser"] = user;
    }
    await next();
});
app.UseAuthorization();

await InitializeDatabaseAsync(app.Services, configuration);

// version đổi sau mỗi lần build lại: trình duyệt so sánh để biết máy chủ vừa được cập nhật và tự tải lại trang.
var buildId = File.GetLastWriteTimeUtc(Assembly.GetEntryAssembly()!.Location).ToString("yyyyMMddHHmmss");
app.MapGet("/api/health", () => Results.Ok(new { ok = true, version = buildId, maintenance = maintenance.Current.Enabled }));
// Sẵn sàng phục vụ: khác /api/health (chỉ cho biết tiến trình đang chạy), điểm này còn thử kết nối cơ sở dữ liệu.
// Script triển khai blue-green chỉ chuyển lưu lượng sang bản mới sau khi điểm này trả 200.
app.MapGet("/api/ready", async (WareHubDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok(new { ready = true, version = buildId })
        : Results.Json(new { ready = false, version = buildId }, statusCode: StatusCodes.Status503ServiceUnavailable));
app.MapGet("/api/maintenance", () => Results.Ok(maintenance.Current));
app.MapPut("/api/maintenance", (MaintenanceRequest request) =>
{
    if (request.Message is { Length: > 300 }) return Results.BadRequest(new { error = "Nội dung thông báo bảo trì không được vượt quá 300 ký tự" });
    maintenance.Set(request.Enabled, request.Message, request.Until);
    return Results.Ok(maintenance.Current);
}).RequireAuthorization("admin");

var auth = app.MapGroup("/api/auth");
auth.MapPost("/login", async (LoginRequest request, HttpContext context, WareHubDbContext db, IPasswordHasher<User> hasher, IConfiguration config, LoginGuard guard) =>
{
    var username = request.Username?.Trim();
    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(request.Password))
        return Results.BadRequest(new { error = "Vui lòng nhập tên đăng nhập và mật khẩu" });
    var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (username.Length > 100 || request.Password.Length > PasswordPolicy.MaxLength)
    {
        guard.RecordFailure(ip, username[..Math.Min(username.Length, 100)]);
        return Results.Json(new { error = "Sai tên đăng nhập hoặc mật khẩu" }, statusCode: StatusCodes.Status401Unauthorized);
    }
    if (guard.RemainingLock(ip, username) is { } wait)
    {
        var minutes = Math.Max((int)Math.Ceiling(wait.TotalMinutes), 1);
        app.Logger.LogWarning("SECURITY login blocked (locked) ip={Ip} user={User}", ip, LogSafe(username));
        context.Response.Headers.RetryAfter = ((int)Math.Ceiling(wait.TotalSeconds)).ToString();
        return Results.Json(new { error = $"Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau {minutes} phút." }, statusCode: StatusCodes.Status429TooManyRequests);
    }
    var user = await db.Users.SingleOrDefaultAsync(x => x.Username == username);
    // Tài khoản không tồn tại vẫn phải băm 1 lần mật khẩu: nếu không, thời gian phản hồi ngắn hơn hẳn sẽ lộ tên đăng nhập nào có thật.
    var passwordOk = VerifyPassword(user ?? dummyUser, request.Password, hasher) && user is not null;
    if (user is null || !user.IsActive || !passwordOk)
    {
        guard.RecordFailure(ip, username);
        app.Logger.LogWarning("SECURITY login failed ip={Ip} user={User}", ip, LogSafe(username));
        return Results.Json(new { error = "Sai tên đăng nhập hoặc mật khẩu" }, statusCode: StatusCodes.Status401Unauthorized);
    }
    guard.RecordSuccess(ip, username);
    // Đang bảo trì: chỉ admin được vào (để tắt bảo trì); người khác nhận 503 để giao diện hiện màn hình bảo trì.
    if (maintenance.Current is { Enabled: true } info && user.Role != "admin")
        return Results.Json(new { error = info.Message, maintenance = true, until = info.Until }, statusCode: StatusCodes.Status503ServiceUnavailable);
    return Results.Ok(new { token = CreateToken(user, config), user = UserDto(user) });
});
auth.MapGet("/me", (HttpContext context) => Results.Ok(new { user = UserDto((User)context.Items["CurrentUser"]!) })).RequireAuthorization();

var devices = app.MapGroup("/api/devices").RequireAuthorization();
devices.MapGet("/", async (string? search, string? loai, string? lifecycle_status, string? sortBy, string? sortDir, int? page, int? pageSize, WareHubDbContext db) =>
{
    search = ClampText(search, 100);
    var query = db.Devices.AsNoTracking().AsQueryable();
    if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => x.Ma.Contains(search) || x.Ten.Contains(search) || (x.PhongBan ?? "").Contains(search) || (x.UserName ?? "").Contains(search) || (x.IpAddress ?? "").Contains(search));
    if (!string.IsNullOrWhiteSpace(loai)) query = query.Where(x => x.Loai == loai);
    if (!string.IsNullOrWhiteSpace(lifecycle_status)) query = query.Where(x => x.LifecycleStatus == lifecycle_status);
    var descending = sortDir == "desc";
    // Chỉ nhận cột nằm trong danh sách cho phép sẵn — tránh nhận trực tiếp tên cột từ client vào OrderBy.
    Expression<Func<Device, object>> keySelector = sortBy switch
    {
        "ma" => x => x.Ma,
        "model" => x => x.Model ?? "",
        "producer" => x => x.Producer ?? "",
        "loai" => x => x.Loai,
        "ten" => x => x.Ten,
        "user_name" => x => x.UserName ?? "",
        "phong_ban" => x => x.PhongBan ?? "",
        "ip_address" => x => x.IpAddress ?? "",
        "ghi_chu" => x => x.GhiChu ?? "",
        "registered_at" => x => x.RegisteredAt ?? DateOnly.MinValue,
        _ => x => x.CreatedAt,
    };
    query = descending ? query.OrderByDescending(keySelector) : query.OrderBy(keySelector);
    if (sortBy is not null) query = ((IOrderedQueryable<Device>)query).ThenByDescending(x => x.CreatedAt); // phá thế bằng nhau (vd nhiều thiết bị cùng trống 1 cột) theo thứ tự ổn định
    var (currentPage, limit) = ParsePaging(page, pageSize, defaultSize: 24);
    var total = await query.CountAsync();
    var rows = await query.Skip((currentPage - 1) * limit).Take(limit).ToListAsync();
    return Results.Ok(new { devices = rows, total, page = currentPage, pageSize = limit, totalPages = TotalPages(total, limit) });
});
devices.MapGet("/{id:int}", async (int id, WareHubDbContext db) =>
{
    var device = await db.Devices.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
    return device is null ? Results.NotFound(new { error = "Không tìm thấy thiết bị" }) : Results.Ok(new { device });
});
devices.MapPost("/", async (DeviceRequest request, WareHubDbContext db) =>
{
    var validation = ValidateDevice(request); if (validation is not null) return Results.BadRequest(new { error = validation });
    var device = ToDevice(request); db.Devices.Add(device);
    try { await db.SaveChangesAsync(); return Results.Created($"/api/devices/{device.Id}", new { id = device.Id }); }
    catch (DbUpdateException) { return Results.Conflict(new { error = $"Mã thiết bị \"{request.Ma}\" đã tồn tại" }); }
}).RequireAuthorization("admin");
devices.MapPut("/{id:int}", async (int id, DeviceRequest request, HttpContext context, WareHubDbContext db) =>
{
    var validation = ValidateDevice(request); if (validation is not null) return Results.BadRequest(new { error = validation });
    var existing = await db.Devices.SingleOrDefaultAsync(x => x.Id == id);
    if (existing is null) return Results.NotFound(new { error = "Không tìm thấy thiết bị" });
    if (existing.Ma != request.Ma!.Trim() && await db.Devices.AnyAsync(x => x.Ma == request.Ma!.Trim())) return Results.Conflict(new { error = $"Mã thiết bị \"{request.Ma}\" đã tồn tại" });
    var before = SnapshotDevice(existing);
    CopyDevice(existing, request);
    var after = SnapshotDevice(existing);
    var currentUser = (User)context.Items["CurrentUser"]!;
    RecordDeviceChanges(db, id, currentUser.Id, DiffDevice(before, after));
    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
}).RequireAuthorization("admin");
devices.MapGet("/history", async (string? search, string? from, string? to, int? page, int? pageSize, WareHubDbContext db) =>
{
    var (currentPage, limit) = ParsePaging(page, pageSize, defaultSize: 30);
    search = ClampText(search, 100);
    var query = db.DeviceHistory.AsNoTracking().AsQueryable();
    if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => x.Device.Ma.Contains(search) || x.Device.Ten.Contains(search) || x.User.FullName.Contains(search));
    if (DateTime.TryParse(from, out var fromDate)) query = query.Where(x => x.ChangedAt >= fromDate.Date);
    if (DateTime.TryParse(to, out var toDate)) query = query.Where(x => x.ChangedAt < toDate.Date.AddDays(1));
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.ChangedAt).Skip((currentPage - 1) * limit).Take(limit)
        .Select(x => new { x.Id, changed_at = x.ChangedAt, x.Device.Ma, x.Device.Ten, field_name = x.FieldName, old_value = x.OldValue, new_value = x.NewValue, changed_by = x.User.FullName })
        .ToListAsync();
    return Results.Ok(new { history = rows, total, page = currentPage, pageSize = limit });
}).RequireAuthorization("admin");
// Kiểm tra kết nối chi tiết GLPI cho 1 máy: /api/devices/glpi-probe?id=<mã máy trong GLPI, thấy trên URL: computer.form.php?id=227>.
// Trả về đường dẫn đang dùng, phản hồi thô của từng nguồn và giá trị đã đọc được — dùng để chỉnh cấu hình Glpi khi khác bản GLPI.
devices.MapGet("/glpi-probe", (int id, HttpContext context, GlpiClient glpi) => GlpiProbeAsync(glpi, () => glpi.ProbeComputerAsync(id, context.RequestAborted))).RequireAuthorization("admin");
// Xem thô vài dòng đầu của danh sách SIM trong GLPI — dùng để đối chiếu tên trường thật (vd MSISDN) khi khớp SIM theo người dùng.
devices.MapGet("/glpi-probe-simcards", (GlpiClient glpi, CancellationToken ct) => GlpiProbeAsync(glpi, () => glpi.ProbeSimcardsAsync(ct))).RequireAuthorization("admin");
// Liệt kê đường dẫn thật trong tài liệu API của GLPI chứa từ khoá (vd ?q=software) — dùng khi các đường dẫn tự đoán đều sai.
devices.MapGet("/glpi-probe-paths", (string? q, GlpiClient glpi, CancellationToken ct) => GlpiProbeAsync(glpi, () => glpi.ProbeSpecPathsAsync(q, ct))).RequireAuthorization("admin");
// Thử lấy IP bằng cách đăng nhập giao diện web GLPI rồi đọc tab Network ports (API REST không có) — xem GlpiWebScrape.cs.
// Trả về IP đọc được + đoạn HTML thô đầu tiên để đối chiếu bằng mắt xem tách đúng chưa.
devices.MapGet("/glpi-probe-ip", (int id, GlpiClient glpi, CancellationToken ct) => GlpiProbeAsync(glpi, async () =>
{
    var (html, ip) = await glpi.FetchNetworkPortTabAsync(id, ct);
    return new { ip, html_length = html.Length, html_preview = html.Length > 3000 ? html[..3000] + "…" : html };
})).RequireAuthorization("admin");
// Thử lấy "Delivery form" bằng cách đọc tab Infocom (thông tin quản lý/tài chính) — cũng không có trong REST API.
devices.MapGet("/glpi-probe-delivery", (int id, GlpiClient glpi, CancellationToken ct) => GlpiProbeAsync(glpi, async () =>
{
    var (html, deliveryForm) = await glpi.FetchInfocomTabAsync(id, ct);
    return new { delivery_form = deliveryForm, html_length = html.Length, html_preview = html.Length > 3000 ? html[..3000] + "…" : html };
})).RequireAuthorization("admin");
// Đồng bộ chạy nền (xem GlpiSyncJob): POST chỉ bắt đầu và trả lời ngay; GET /glpi-sync/status cho tiến độ và kết quả.
devices.MapPost("/glpi-sync", (HttpContext context, GlpiClient glpi, GlpiSyncJob job, IServiceScopeFactory scopes, IHostApplicationLifetime lifetime) =>
{
    if (!glpi.IsConfigured) return GlpiNotConfigured();
    var userId = ((User)context.Items["CurrentUser"]!).Id;
    // Dùng ApplicationStopping (không phải RequestAborted): trình duyệt đóng tab/ngắt kết nối không được làm đứt việc đồng bộ.
    var started = job.TryStart(j => RunGlpiSyncAsync(scopes, userId, j, lifetime.ApplicationStopping), app.Logger);
    return started
        ? Results.Accepted("/api/devices/glpi-sync/status", job.Snapshot())
        : Results.Conflict(new { error = "Đang có một lần đồng bộ GLPI chạy, vui lòng chờ nó xong." });
}).RequireAuthorization("admin");
devices.MapGet("/glpi-sync/status", (GlpiSyncJob job) => Results.Ok(job.Snapshot())).RequireAuthorization("admin");
devices.MapPost("/{id:int}/clone", async (int id, CloneRequest request, WareHubDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Ma)) return Results.BadRequest(new { error = "Vui lòng nhập mã thiết bị mới" });
    var source = await db.Devices.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
    if (source is null) return Results.NotFound(new { error = "Không tìm thấy thiết bị gốc" });
    var clone = new Device { Ma = request.Ma.Trim(), Ten = source.Ten, Loai = source.Loai, Kho = source.Kho, Model = source.Model, Cpu = source.Cpu, Ram = source.Ram, Storage = source.Storage, IsActive = true, LifecycleStatus = "old", UserName = source.UserName, RegisteredAt = source.RegisteredAt, PhongBan = source.PhongBan, GhiChu = source.GhiChu, Producer = source.Producer, IpAddress = source.IpAddress, OsName = source.OsName, OfficeName = source.OfficeName };
    db.Devices.Add(clone); try { await db.SaveChangesAsync(); return Results.Created($"/api/devices/{clone.Id}", new { id = clone.Id }); } catch (DbUpdateException) { return Results.Conflict(new { error = $"Mã thiết bị \"{request.Ma}\" đã tồn tại" }); }
}).RequireAuthorization("admin");
devices.MapDelete("/{id:int}", async (int id, WareHubDbContext db) =>
{
    var device = await db.Devices.FindAsync(id); if (device is null) return Results.NotFound(new { error = "Không tìm thấy thiết bị" });
    db.Devices.Remove(device); await db.SaveChangesAsync(); return Results.Ok(new { ok = true });
}).RequireAuthorization("admin");

var users = app.MapGroup("/api/users").RequireAuthorization("admin");
users.MapGet("/", async (WareHubDbContext db) => Results.Ok(new
{
    users = await db.Users.AsNoTracking().OrderByDescending(x => x.CreatedAt)
        .Select(x => new { x.Id, x.Username, x.FullName, x.Role, is_active = x.IsActive, created_at = x.CreatedAt }).ToListAsync(),
}));
users.MapPost("/", async (UserCreateRequest request, HttpContext context, WareHubDbContext db, IPasswordHasher<User> hasher) =>
{
    var username = request.Username?.Trim(); var fullName = request.FullName?.Trim();
    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(fullName) || string.IsNullOrWhiteSpace(request.Password)) return Results.BadRequest(new { error = "Vui lòng nhập đầy đủ tên đăng nhập, mật khẩu, họ tên" });
    if (username.Length > 50) return Results.BadRequest(new { error = "Tên đăng nhập không được vượt quá 50 ký tự" });
    if (fullName.Length > 100) return Results.BadRequest(new { error = "Họ tên không được vượt quá 100 ký tự" });
    if (PasswordPolicy.Validate(request.Password, username) is { } weakPassword) return Results.BadRequest(new { error = weakPassword });
    if (request.Role is not ("admin" or "staff")) return Results.BadRequest(new { error = "Vai trò không hợp lệ" });
    if (await db.Users.AnyAsync(x => x.Username == username)) return Results.Conflict(new { error = $"Tên đăng nhập \"{username}\" đã tồn tại" });
    var user = new User { Username = username, FullName = fullName, Role = request.Role }; user.PasswordHash = hasher.HashPassword(user, request.Password); db.Users.Add(user); await db.SaveChangesAsync(); AuditUserAction(app.Logger, context, "tạo", user.Username, $"vai trò {user.Role}"); return Results.Created($"/api/users/{user.Id}", new { id = user.Id });
});
users.MapPut("/{id:int}", async (int id, UserUpdateRequest request, HttpContext context, WareHubDbContext db, IPasswordHasher<User> hasher) =>
{
    var user = await db.Users.FindAsync(id); if (user is null) return Results.NotFound(new { error = "Không tìm thấy người dùng" });
    // Admin tự hạ quyền/khoá chính mình sẽ làm hệ thống không còn ai quản trị; việc này phải do admin khác làm.
    if (((User)context.Items["CurrentUser"]!).Id == id && ((request.Role is not null && request.Role != user.Role) || request.IsActive == false))
        return Results.BadRequest(new { error = "Không thể tự đổi vai trò hoặc tự khoá chính mình" });
    if (request.FullName is not null) { if (string.IsNullOrWhiteSpace(request.FullName)) return Results.BadRequest(new { error = "Họ tên không được để trống" }); user.FullName = request.FullName.Trim(); }
    if (request.Role is not null) { if (request.Role is not ("admin" or "staff")) return Results.BadRequest(new { error = "Vai trò không hợp lệ" }); user.Role = request.Role; }
    if (request.IsActive.HasValue) user.IsActive = request.IsActive.Value;
    if (!string.IsNullOrWhiteSpace(request.Password)) { if (PasswordPolicy.Validate(request.Password, user.Username) is { } weakPassword) return Results.BadRequest(new { error = weakPassword }); user.PasswordHash = hasher.HashPassword(user, request.Password); }
    await db.SaveChangesAsync(); userCache.Invalidate(id);
    AuditUserAction(app.Logger, context, "sửa", user.Username, $"vai trò {user.Role}, hoạt động {user.IsActive}, đặt lại mật khẩu {!string.IsNullOrWhiteSpace(request.Password)}");
    return Results.Ok(new { ok = true });
});
users.MapDelete("/{id:int}", async (int id, HttpContext context, WareHubDbContext db) =>
{
    var current = (User)context.Items["CurrentUser"]!; if (current.Id == id) return Results.BadRequest(new { error = "Không thể tự xoá chính mình" });
    var user = await db.Users.FindAsync(id); if (user is null) return Results.NotFound(new { error = "Không tìm thấy người dùng" }); db.Users.Remove(user); await db.SaveChangesAsync(); userCache.Invalidate(id); AuditUserAction(app.Logger, context, "xoá", user.Username, ""); return Results.Ok(new { ok = true });
});

var print = app.MapGroup("/api/print").RequireAuthorization();
print.MapPost("/", async (PrintRequest request, HttpContext context, WareHubDbContext db) =>
{
    if (request.DeviceIds is null || request.DeviceIds.Length == 0 || request.DeviceIds.Length > 500 || request.DeviceIds.Any(x => x < 1)) return Results.BadRequest(new { error = "Danh sách thiết bị không hợp lệ" });
    var ids = request.DeviceIds.Distinct().ToArray(); var devicesFound = await db.Devices.Where(x => ids.Contains(x.Id)).ToListAsync();
    if (devicesFound.Count != ids.Length) return Results.Conflict(new { error = "Danh sách có thiết bị không tồn tại. Không có thiết bị nào được ghi lịch sử." });
    var user = (User)context.Items["CurrentUser"]!; db.PrintHistory.AddRange(devicesFound.Select(x => new PrintHistory { DeviceId = x.Id, UserId = user.Id })); await db.SaveChangesAsync();
    var deviceRows = devicesFound.Select(x => new { x.Id, x.Ma, x.Ten, x.Loai, x.Kho, x.Model, x.Cpu, x.Ram, x.Storage, x.IsActive, x.LifecycleStatus, x.UserName, x.RegisteredAt, x.PhongBan, x.GhiChu, x.Producer, x.IpAddress }).ToList();
    return Results.Ok(new { devices = deviceRows });
});
print.MapGet("/history", async (string? from, string? to, string? search, int page = 1, int pageSize = 30, WareHubDbContext db = null!) =>
{
    page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100); search = ClampText(search, 100); var query = db.PrintHistory.AsNoTracking().AsQueryable();
    if (DateTime.TryParse(from, out var fromDate)) query = query.Where(x => x.PrintedAt >= fromDate.Date);
    if (DateTime.TryParse(to, out var toDate)) query = query.Where(x => x.PrintedAt < toDate.Date.AddDays(1));
    if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => x.Device.Ma.Contains(search) || x.Device.Ten.Contains(search) || x.User.FullName.Contains(search));
    var total = await query.CountAsync(); var rows = await query.OrderByDescending(x => x.PrintedAt).Skip((page - 1) * pageSize).Take(pageSize).Select(x => new { x.Id, printed_at = x.PrintedAt, x.Device.Ma, x.Device.Ten, x.Device.Loai, x.Device.Kho, printed_by = x.User.FullName }).ToListAsync(); return Results.Ok(new { history = rows, total, page, pageSize });
});

var handovers = app.MapGroup("/api/handovers").RequireAuthorization();
handovers.MapGet("/next-no", async (DateOnly? date, WareHubDbContext db) =>
{
    var day = date ?? DateOnly.FromDateTime(DateTime.Today);
    if (day.Year is < 2000 or > 2099) return Results.BadRequest(new { error = "Ngày lập biên bản không hợp lệ" });
    return Results.Ok(new { no = await NextHandoverNoAsync(db, day) });
});
handovers.MapPost("/", async (HandoverRequest request, HttpContext context, WareHubDbContext db) =>
{
    var day = request.RegisterDate ?? DateOnly.FromDateTime(DateTime.Today);
    if (day.Year is < 2000 or > 2099) return Results.BadRequest(new { error = "Ngày lập biên bản không hợp lệ" });
    var device = request.DeviceId is int deviceId ? await db.Devices.AsNoTracking().SingleOrDefaultAsync(x => x.Id == deviceId) : null;
    var user = (User)context.Items["CurrentUser"]!;
    // Hai người in cùng lúc có thể tính ra cùng một số; unique index trên `no` chặn trùng, ta thử lại với số kế tiếp.
    for (var attempt = 0; attempt < 5; attempt++)
    {
        var no = await NextHandoverNoAsync(db, day);
        db.Handovers.Add(new Handover { No = no, DeviceId = device?.Id, DeviceMa = device?.Ma, FullName = Truncate(request.FullName, 100), Payload = HandoverPayload(request.Data), UserId = user.Id });
        try { await db.SaveChangesAsync(); return Results.Ok(new { no }); }
        catch (DbUpdateException) { db.ChangeTracker.Clear(); }
    }
    return Results.Conflict(new { error = "Không cấp được số phiếu, vui lòng thử lại" });
});
handovers.MapPut("/{no}", async (string no, HandoverUpdateRequest request, WareHubDbContext db) =>
{
    var handover = await db.Handovers.SingleOrDefaultAsync(x => x.No == no);
    if (handover is null) return Results.NotFound(new { error = "Không tìm thấy phiếu" });
    handover.FullName = Truncate(request.FullName, 100);
    handover.Payload = HandoverPayload(request.Data);
    await db.SaveChangesAsync();
    return Results.Ok(new { no = handover.No });
});
// Phiếu gần nhất của chính thiết bị; nếu chưa có thì lấy phiếu gần nhất của thiết bị cùng model để tái dùng thông số.
handovers.MapGet("/latest", async (int device_id, string? model, WareHubDbContext db) =>
{
    var latest = await db.Handovers.AsNoTracking().Where(x => x.DeviceId == device_id && x.Payload != null)
        .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).FirstOrDefaultAsync();
    if (latest is not null)
        return Results.Ok(new { found = true, source = "device", no = latest.No, created_at = latest.CreatedAt, data = JsonSerializer.Deserialize<JsonElement>(latest.Payload!) });

    model = ClampText(model, 200);
    if (!string.IsNullOrWhiteSpace(model))
    {
        var candidates = await db.Handovers.AsNoTracking().Where(x => x.Payload != null && x.Payload.Contains(model))
            .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(30).ToListAsync();
        foreach (var candidate in candidates)
        {
            var data = JsonSerializer.Deserialize<JsonElement>(candidate.Payload!);
            if (data.TryGetProperty("model", out var modelValue) && string.Equals(modelValue.GetString()?.Trim(), model.Trim(), StringComparison.OrdinalIgnoreCase))
                return Results.Ok(new { found = true, source = "model", no = candidate.No, created_at = candidate.CreatedAt, data });
        }
    }
    return Results.Ok(new { found = false });
});
handovers.MapGet("/", async (string? search, int? page, int? pageSize, WareHubDbContext db) =>
{
    search = ClampText(search, 100);
    var query = db.Handovers.AsNoTracking().AsQueryable();
    if (!string.IsNullOrWhiteSpace(search))
    {
        var term = search.Trim();
        query = query.Where(x => x.No.Contains(term) || (x.FullName ?? "").Contains(term) || (x.DeviceMa ?? "").Contains(term) || (x.Payload ?? "").Contains(term));
    }
    var (currentPage, limit) = ParsePaging(page, pageSize, defaultSize: 30);
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Skip((currentPage - 1) * limit).Take(limit).ToListAsync();
    var userIds = rows.Select(x => x.UserId).Distinct().ToList();
    var userNames = await db.Users.AsNoTracking().Where(x => userIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.FullName);
    var items = rows.Select(x => new
    {
        x.Id, x.No, x.DeviceId, x.DeviceMa, x.FullName, x.CreatedAt,
        PrintedBy = userNames.GetValueOrDefault(x.UserId),
        Data = x.Payload is null ? (JsonElement?)null : JsonSerializer.Deserialize<JsonElement>(x.Payload),
    });
    return Results.Ok(new { handovers = items, total, page = currentPage, pageSize = limit, totalPages = TotalPages(total, limit) });
});
handovers.MapDelete("/{no}", async (string no, WareHubDbContext db) =>
{
    var handover = await db.Handovers.SingleOrDefaultAsync(x => x.No == no);
    if (handover is null) return Results.NotFound(new { error = "Không tìm thấy phiếu" });
    db.Handovers.Remove(handover);
    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
}).RequireAuthorization("admin");

var qr = app.MapGroup("/api/qr").RequireAuthorization();
qr.MapGet("/devices/{deviceId:int}", async (int deviceId, int? size, WareHubDbContext db) =>
{
    var device = await db.Devices.AsNoTracking().SingleOrDefaultAsync(x => x.Id == deviceId); if (device is null) return Results.NotFound(new { error = "Không tìm thấy thiết bị" });
    var pixels = Math.Clamp(size ?? 256, 64, 1024); var payload = device.Ma.Trim();
    using var generator = new QRCodeGenerator(); using var data = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.M); var png = new PngByteQRCode(data).GetGraphic(Math.Max(pixels / 25, 4)); return Results.File(png, "image/png");
});

app.Run();

static bool IsMaintenanceExempt(HttpRequest request) =>
    request.Path.Equals("/api/health", StringComparison.OrdinalIgnoreCase)
    || request.Path.Equals("/api/ready", StringComparison.OrdinalIgnoreCase)
    || (HttpMethods.IsGet(request.Method) && request.Path.Equals("/api/maintenance", StringComparison.OrdinalIgnoreCase))
    || (HttpMethods.IsPost(request.Method) && request.Path.Equals("/api/auth/login", StringComparison.OrdinalIgnoreCase));

static string? ValidateDevice(DeviceRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Ma) || string.IsNullOrWhiteSpace(request.Ten) || string.IsNullOrWhiteSpace(request.Loai))
        return "Vui lòng nhập Mã, Tên và Loại thiết bị";
    if (request.Loai is not ("laptop" or "tablet" or "pda" or "monitor" or "phone"))
        return "Loại thiết bị không hợp lệ";
    var tooLong = new (string Label, string? Value, int Max)[]
    {
        ("Mã thiết bị", request.Ma, 50),
        ("Tên thiết bị", request.Ten, 150),
        ("Model", request.Model, 150),
        ("CPU", request.Cpu, 100),
        ("RAM", request.Ram, 100),
        ("Storage", request.Storage, 100),
        ("User Name", request.UserName, 100),
        ("Phòng ban", request.PhongBan, 100),
        ("Ghi chú", request.GhiChu, 500),
        ("Nhà sản xuất", request.Producer, 100),
        ("IP Address", request.IpAddress, 45),
        ("Windows", request.OsName, 100),
        ("Office", request.OfficeName, 100),
        ("Số điện thoại", request.PhoneNumber, 30),
        ("Serial SIM", request.SimSerial, 50),
    }.FirstOrDefault(field => (field.Value?.Length ?? 0) > field.Max);
    return tooLong.Label is not null ? $"{tooLong.Label} không được vượt quá {tooLong.Max} ký tự" : null;
}
static Device ToDevice(DeviceRequest request) { var device = new Device { IsActive = true, LifecycleStatus = "old" }; CopyDevice(device, request); return device; }
static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
static void CopyDevice(Device target, DeviceRequest request)
{
    target.Ma = request.Ma!.Trim();
    target.Ten = request.Ten!.Trim();
    target.Loai = request.Loai!;
    target.Kho = request.Loai == "phone" ? "12" : "24";
    target.Model = request.Model;
    target.Cpu = request.Cpu;
    target.Ram = request.Ram;
    target.Storage = request.Storage;
    target.UserName = request.UserName;
    target.RegisteredAt = request.RegisteredAt;
    target.PhongBan = request.PhongBan;
    target.GhiChu = request.GhiChu;
    target.Producer = request.Producer;
    target.IpAddress = request.IpAddress;
    target.OsName = NullIfBlank(request.OsName);
    target.OfficeName = NullIfBlank(request.OfficeName);
    target.PhoneNumber = NullIfBlank(request.PhoneNumber);
    target.SimSerial = NullIfBlank(request.SimSerial);
}
static string? Truncate(string? value, int max) => string.IsNullOrWhiteSpace(value) ? null : (value.Length > max ? value[..max] : value);
static Dictionary<string, string?> SnapshotDevice(Device device) => new()
{
    ["ma"] = device.Ma,
    ["ten"] = device.Ten,
    ["loai"] = device.Loai,
    ["model"] = device.Model,
    ["producer"] = device.Producer,
    ["ip_address"] = device.IpAddress,
    ["user_name"] = device.UserName,
    ["phong_ban"] = device.PhongBan,
    ["ghi_chu"] = device.GhiChu,
    ["registered_at"] = device.RegisteredAt?.ToString("yyyy-MM-dd"),
    ["cpu"] = device.Cpu,
    ["ram"] = device.Ram,
    ["storage"] = device.Storage,
    ["os_name"] = device.OsName,
    ["office_name"] = device.OfficeName,
    ["phone_number"] = device.PhoneNumber,
    ["sim_serial"] = device.SimSerial,
};

static async Task RunGlpiSyncAsync(IServiceScopeFactory scopes, int userId, GlpiSyncJob job, CancellationToken ct)
{
    await using var scope = scopes.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<WareHubDbContext>();
    var glpi = scope.ServiceProvider.GetRequiredService<GlpiClient>();
    job.Report("lists");

    // 4 danh sách hỏi song song. Máy tính là bắt buộc; điện thoại/tablet/màn hình lỗi (vd. sai đường dẫn) chỉ báo riêng loại đó,
    // không làm hỏng phần đã lấy được.
    var computersTask = TryFetchAsync(() => glpi.GetComputersAsync(ct), ct);
    var phonesTask = TryFetchAsync(() => glpi.GetPhonesAsync(ct), ct);
    var tabletsTask = TryFetchAsync(() => glpi.GetTabletsAsync(ct), ct);
    var monitorsTask = TryFetchAsync(() => glpi.GetMonitorsAsync(ct), ct);
    var (computers, computerError) = await computersTask;
    if (computerError is not null) { job.Fail(computerError); return; }
    var (phones, phoneError) = await phonesTask;
    var (tablets, tabletError) = await tabletsTask;
    var (monitors, monitorError) = await monitorsTask;

    var assets = computers.Select(c => (Asset: c, Loai: "laptop", Kho: "24"))
        .Concat(phones.Select(p => (Asset: p, Loai: "phone", Kho: "12")))
        .Concat(tablets.Select(t => (Asset: t, Loai: "tablet", Kho: "24")))
        .Concat(monitors.Select(m => (Asset: m, Loai: "monitor", Kho: "24")))
        .ToList();

    // Chi tiết từng máy tính (CPU/RAM/ổ cứng/IP/Windows/Office) và SIM điện thoại: mỗi máy phải hỏi riêng nên chạy song song có giới hạn.
    // Lỗi ở phần này không làm hỏng việc đồng bộ danh sách; chỉ báo cảnh báo và giữ nguyên giá trị đang có.
    var detailReport = new GlpiDetailReport();
    var details = new Dictionary<int, GlpiComputerDetails>();
    var phoneDetails = new Dictionary<int, GlpiPhoneDetails>();
    if (glpi.DetailsEnabled && computers.Count > 0)
    {
        try { details = await glpi.GetDetailsForComputersAsync(computers.Where(c => !string.IsNullOrWhiteSpace(c.Serial)).Select(c => c.Id), detailReport, (done, total) => job.Report("computers", done, total), ct); }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException) { detailReport.Warn("all", $"Không lấy được chi tiết máy tính: {ex.Message}"); }
    }
    if (glpi.DetailsEnabled && phones.Count > 0)
    {
        job.Report("phones");
        // SIM không lấy theo từng máy nữa (nhiều bản GLPI không có đường dẫn liên kết trực tiếp đáng tin cậy) — lấy 1 lần
        // toàn bộ danh sách SIM rồi khớp với điện thoại theo người đang dùng (GlpiParsers.MatchPhonesByUser).
        try
        {
            var simcards = await glpi.GetSimcardsAsync(ct);
            phoneDetails = GlpiParsers.MatchPhonesByUser(phones, simcards);
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException) { detailReport.Warn("sim-all", $"Không lấy được danh sách SIM: {ex.Message}"); }
    }
    var detailed = 0;
    // Điền phần chi tiết riêng của từng loại (máy tính: cấu hình; điện thoại: SIM); true nếu GLPI có trả gì đó.
    bool ApplyExtras(Device device, string loai, int glpiId)
    {
        if (loai == "laptop" && details.TryGetValue(glpiId, out var computer) && computer.HasAny) { ApplyDetails(device, computer); return true; }
        if (loai == "phone" && phoneDetails.TryGetValue(glpiId, out var sim) && sim.HasAny) { ApplyPhoneDetails(device, sim); return true; }
        return false;
    }

    // Không phân biệt hoa/thường như MySQL: nếu không, "abc" và "ABC" bị coi là 2 thiết bị, thêm mới rồi vỡ ràng buộc duy nhất.
    var existingBySerial = await db.Devices.ToDictionaryAsync(x => x.Ma, StringComparer.OrdinalIgnoreCase);
    var seenSerials = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    int created = 0, updated = 0, unchanged = 0, skipped = 0, duplicates = 0;
    var skippedNames = new List<string>(); // tối đa 20 tên tài sản GLPI thiếu serial, để người dùng biết cần bổ sung ở đâu
    // Trường "Delivery form" của máy tính trong GLPI: công ty dùng số này làm số phiếu bàn giao trước khi có WareHub (dạng
    // giống Handover.No, vd "2601048"). Gom lại, tạo phiếu liên kết sau khi đã lưu thiết bị (để có Id thật cho máy mới).
    var pendingLegacyHandovers = new List<(Device Device, string No)>();

    foreach (var (c, loai, kho) in assets)
    {
        var serial = Truncate(c.Serial, 50);
        if (string.IsNullOrWhiteSpace(serial))
        {
            skipped++;
            if (skippedNames.Count < 20) skippedNames.Add(Truncate(c.Name, 60) ?? $"GLPI #{c.Id}");
            continue;
        }
        if (!seenSerials.Add(serial)) { duplicates++; continue; }

        Device device;
        if (existingBySerial.TryGetValue(serial, out var existing))
        {
            var before = SnapshotDevice(existing);
            ApplyGlpiAsset(existing, c);
            if (ApplyExtras(existing, loai, c.Id)) detailed++;
            var changes = DiffDevice(before, SnapshotDevice(existing));
            RecordDeviceChanges(db, existing.Id, userId, changes);
            if (changes.Count > 0) updated++; else unchanged++;
            device = existing;
        }
        else
        {
            var newDevice = new Device { Ma = serial, Ten = serial, Loai = loai, Kho = kho, IsActive = true, LifecycleStatus = "old" };
            ApplyGlpiAsset(newDevice, c);
            if (ApplyExtras(newDevice, loai, c.Id)) detailed++;
            db.Devices.Add(newDevice);
            created++;
            device = newDevice;
        }
        if (loai == "laptop" && Truncate(c.Deliveryform, 12) is { Length: > 0 } deliveryNo) pendingLegacyHandovers.Add((device, deliveryNo));
    }

    job.Report("saving");
    await db.SaveChangesAsync(CancellationToken.None);

    // Chỉ tạo phiếu khi số đó CHƯA tồn tại — không bao giờ ghi đè phiếu đã có (kể cả phiếu người dùng tự tạo trùng số).
    int legacyHandoversCreated = 0, legacyHandoversSkipped = 0;
    if (pendingLegacyHandovers.Count > 0)
    {
        var existingNos = (await db.Handovers.Select(h => h.No).ToListAsync(CancellationToken.None)).ToHashSet();
        foreach (var (device, no) in pendingLegacyHandovers)
        {
            if (!existingNos.Add(no)) { legacyHandoversSkipped++; continue; }
            db.Handovers.Add(new Handover { No = no, DeviceId = device.Id, DeviceMa = device.Ma, FullName = Truncate(device.UserName, 100), UserId = userId });
            legacyHandoversCreated++;
        }
        if (legacyHandoversCreated > 0) await db.SaveChangesAsync(CancellationToken.None);
    }

    job.Complete(new { ok = true, total = assets.Count, computers = computers.Count, phones = phones.Count, phone_error = phoneError, tablets = tablets.Count, tablet_error = tabletError, monitors = monitors.Count, monitor_error = monitorError, created, updated, unchanged, skipped, skipped_names = skippedNames, duplicates, detailed, detail_warnings = detailReport.Warnings, legacy_handovers_created = legacyHandoversCreated, legacy_handovers_skipped = legacyHandoversSkipped });
}
static IResult GlpiNotConfigured() => Results.BadRequest(new { error = "Chưa cấu hình kết nối GLPI. Thêm mục \"Glpi\" (BaseUrl, ClientId, ClientSecret, Username, Password) vào appsettings.Development.json." });
// Chạy 1 lần kiểm tra GLPI cho admin: báo chưa cấu hình / lỗi kết nối bằng thông báo rõ ràng thay vì lỗi 500.
static async Task<IResult> GlpiProbeAsync<T>(GlpiClient glpi, Func<Task<T>> probe)
{
    if (!glpi.IsConfigured) return GlpiNotConfigured();
    try { return Results.Ok(await probe()); }
    catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException) { return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway); }
}
// Lấy 1 danh sách từ GLPI; lỗi cấu hình/mạng/quá thời gian trả về dạng (danh sách rỗng, thông báo) thay vì ném ra ngoài.
static async Task<(List<GlpiAsset> Items, string? Error)> TryFetchAsync(Func<Task<List<GlpiAsset>>> fetch, CancellationToken ct)
{
    try { return (await fetch(), null); }
    catch (InvalidOperationException ex) { return ([], ex.Message); }
    catch (HttpRequestException ex) { return ([], $"Không kết nối được tới GLPI: {ex.Message}"); }
    catch (TaskCanceledException) when (!ct.IsCancellationRequested) { return ([], "Không kết nối được tới GLPI: hết thời gian chờ"); }
}
// Thông tin chung của 1 tài sản GLPI (tên, model, hãng, người dùng, vị trí, ghi chú) chép vào thiết bị — dùng cho cả thêm mới lẫn cập nhật.
static void ApplyGlpiAsset(Device device, GlpiAsset asset)
{
    if (Truncate(asset.Name, 150) is { } name) device.Ten = name;
    device.Model = Truncate(asset.Model?.Name, 150);
    device.Producer = Truncate(asset.Manufacturer?.Name, 100);
    device.UserName = Truncate(asset.User?.Name, 100);
    device.PhongBan = Truncate(asset.Location?.Name, 100);
    device.GhiChu = Truncate(asset.Comment, 500);
}
// Chép chi tiết đọc từ GLPI vào thiết bị. GLPI không trả gì cho 1 mục thì giữ nguyên giá trị đang có (không xoá dữ liệu đã nhập tay).
static void ApplyPhoneDetails(Device device, GlpiPhoneDetails details)
{
    device.PhoneNumber = Truncate(details.PhoneNumber, 30) ?? device.PhoneNumber;
    device.SimSerial = Truncate(details.SimSerial, 50) ?? device.SimSerial;
}
static void ApplyDetails(Device device, GlpiComputerDetails details)
{
    device.Cpu = Truncate(details.Cpu, 100) ?? device.Cpu;
    device.Ram = Truncate(details.Ram, 100) ?? device.Ram;
    device.Storage = Truncate(details.Storage, 100) ?? device.Storage;
    device.IpAddress = Truncate(details.Ip, 45) ?? device.IpAddress;
    device.OsName = Truncate(details.Windows, 100) ?? device.OsName;
    device.OfficeName = Truncate(details.Office, 100) ?? device.OfficeName;
}
static List<(string Field, string? OldValue, string? NewValue)> DiffDevice(Dictionary<string, string?> before, Dictionary<string, string?> after) =>
    before.Where(entry => entry.Value != after[entry.Key]).Select(entry => (entry.Key, entry.Value, after[entry.Key])).ToList();
// Ghi lại từng trường thiết bị đã đổi (không làm gì nếu không có thay đổi); người gọi tự SaveChanges.
static void RecordDeviceChanges(WareHubDbContext db, int deviceId, int userId, List<(string Field, string? OldValue, string? NewValue)> changes) =>
    db.DeviceHistory.AddRange(changes.Select(c => new DeviceHistory { DeviceId = deviceId, UserId = userId, FieldName = c.Field, OldValue = ClipHistory(c.OldValue), NewValue = ClipHistory(c.NewValue) }));
// Cột lịch sử chỉ chứa 255 ký tự trong khi ghi chú dài tới 500: cắt bớt để lưu lịch sử không làm hỏng cả lần lưu/đồng bộ.
static string? ClipHistory(string? value) => value is { Length: > 255 } ? value[..255] : value;
// Phân trang dùng chung: trang tối thiểu 1, số dòng mỗi trang trong khoảng 1..100.
static (int Page, int Limit) ParsePaging(int? page, int? pageSize, int defaultSize) => (Math.Max(page ?? 1, 1), Math.Clamp(pageSize ?? defaultSize, 1, 100));
static int TotalPages(int total, int limit) => Math.Max((int)Math.Ceiling(total / (double)limit), 1);
// Nội dung phiếu là JSON do trang web gửi lên; chỉ nhận object và giới hạn dung lượng để không nhét rác vào DB.
static string? HandoverPayload(JsonElement? data) =>
    data is { ValueKind: JsonValueKind.Object } value && value.GetRawText().Length <= 16_000 ? value.GetRawText() : null;
// Số phiếu bàn giao dạng YYMMxxx: 2609001 = năm 26, tháng 09, phiếu thứ 001 của tháng đó.
static async Task<string> NextHandoverNoAsync(WareHubDbContext db, DateOnly day)
{
    var prefix = $"{day.Year % 100:D2}{day.Month:D2}";
    var last = await db.Handovers.AsNoTracking().Where(x => x.No.StartsWith(prefix))
        .OrderByDescending(x => x.No.Length).ThenByDescending(x => x.No).Select(x => x.No).FirstOrDefaultAsync();
    var sequence = last is null ? 1 : int.Parse(last[prefix.Length..]) + 1;
    return $"{prefix}{sequence:D3}";
}
// Chuỗi từ người ngoài đưa vào nhật ký: bỏ ký tự điều khiển (xuống dòng...) và giới hạn độ dài để không giả được dòng log.
static string LogSafe(string? value) => value is null ? "" : new string(value.Where(c => !char.IsControl(c)).Take(100).ToArray());
// Cắt chuỗi người dùng gửi lên (tìm kiếm...) về độ dài tối đa để không ai bắt máy chủ quét LIKE với chuỗi khổng lồ.
static string? ClampText(string? value, int max) => value is not null && value.Length > max ? value[..max] : value;
// Dấu vân tay trạng thái đăng nhập của tài khoản (mật khẩu + vai trò), ghi vào token; đổi 1 trong 2 thì token cũ mất hiệu lực.
static string SessionStamp(User user) => Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes($"{user.PasswordHash}|{user.Role}")))[..22];
static void AuditUserAction(ILogger logger, HttpContext context, string action, string target, string detail) =>
    logger.LogWarning("AUDIT {Actor} đã {Action} người dùng {Target} {Detail} (ip {Ip})", ((User)context.Items["CurrentUser"]!).Username, action, target, detail, context.Connection.RemoteIpAddress);
static object UserDto(User user) => new { user.Id, user.Username, user.FullName, user.Role, is_active = user.IsActive };
static bool VerifyPassword(User user, string password, IPasswordHasher<User> hasher)
{
    if (user.PasswordHash.StartsWith("$2", StringComparison.Ordinal))
        return BCrypt.Net.BCrypt.Verify(password, user.PasswordHash);
    return hasher.VerifyHashedPassword(user, user.PasswordHash, password) != PasswordVerificationResult.Failed;
}
static string CreateToken(User user, IConfiguration config)
{
    var claims = new[]
    {
        new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
        new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
        new Claim(ClaimTypes.Role, user.Role),
        new Claim("full_name", user.FullName),
        new Claim("stamp", SessionStamp(user)),
    };
    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Secret"]!));
    var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var expires = DateTime.UtcNow.AddHours(config.GetValue("Jwt:ExpiresInHours", 8));
    return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(JwtIssuer, JwtAudience, claims, expires: expires, signingCredentials: credentials));
}
// Chờ MySQL sẵn sàng (tối đa 20 lần, cách nhau 2 giây) rồi tạo/bổ sung schema và tài khoản admin mặc định.
static async Task InitializeDatabaseAsync(IServiceProvider services, IConfiguration configuration)
{
    await using var scope = services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<WareHubDbContext>();
    for (var attempt = 1; attempt <= 20; attempt++)
    {
        try
        {
            await EnsureSchemaAsync(db);
            await SeedDefaultAdminAsync(db, scope.ServiceProvider, configuration);
            return;
        }
        catch when (attempt < 20)
        {
            await Task.Delay(2000);
        }
    }
}
static async Task EnsureSchemaAsync(WareHubDbContext db)
{
    await db.Database.EnsureCreatedAsync();
    await EnsureDeviceColumnAsync(db, "producer");
    await EnsureDeviceColumnAsync(db, "ip_address");
    await EnsureDeviceColumnAsync(db, "os_name");
    await EnsureDeviceColumnAsync(db, "office_name");
    await EnsureDeviceColumnAsync(db, "phone_number");
    await EnsureDeviceColumnAsync(db, "sim_serial");
    await EnsureIndexAsync(db, "devices", "IX_devices_Loai", "`Loai`");
    await EnsureIndexAsync(db, "devices", "IX_devices_LifecycleStatus", "`lifecycle_status`");
    await EnsureIndexAsync(db, "devices", "IX_devices_PhongBan", "`phong_ban`");
    await EnsureIndexAsync(db, "print_history", "IX_print_history_PrintedAt", "`printed_at`");
    await EnsureDeviceHistoryTableAsync(db);
    await EnsureHandoverTableAsync(db);
    await EnsureIndexAsync(db, "handovers", "IX_handovers_CreatedAt", "`created_at`");
    // Chỉ mục thừa/không còn dùng — idx_devices_loai và idx_devices_phong_ban trùng cột với IX_devices_Loai/IX_devices_PhongBan ở trên (tạo ra ngoài code trước đây);
    // IX_devices_IsActive vô dụng từ khi mọi thiết bị luôn is_active = true (không còn giá trị nào khác để lọc). Giữ lại chỉ khiến mỗi lần ghi thiết bị chậm hơn, không giúp gì cho truy vấn.
    await EnsureIndexDroppedAsync(db, "devices", "idx_devices_loai");
    await EnsureIndexDroppedAsync(db, "devices", "idx_devices_phong_ban");
    await EnsureIndexDroppedAsync(db, "devices", "IX_devices_IsActive");
}
static async Task SeedDefaultAdminAsync(WareHubDbContext db, IServiceProvider services, IConfiguration configuration)
{
    if (await db.Users.AnyAsync()) return;
    var user = new User { Username = configuration["DefaultAdmin:User"] ?? "admin", FullName = configuration["DefaultAdmin:FullName"] ?? "Quản trị viên", Role = "admin" };
    var password = configuration["DefaultAdmin:Password"] ?? throw new InvalidOperationException("Thiếu DefaultAdmin:Password");
    if (PasswordPolicy.Validate(password, user.Username) is { } weak)
    {
        var message = $"DefaultAdmin:Password không đạt yêu cầu bảo mật ({weak}). Đặt mật khẩu mạnh hơn trong cấu hình.";
        if (services.GetRequiredService<IHostEnvironment>().IsProduction()) throw new InvalidOperationException(message);
        services.GetRequiredService<ILoggerFactory>().CreateLogger("Security").LogWarning("{Message}", message);
    }
    user.PasswordHash = services.GetRequiredService<IPasswordHasher<User>>().HashPassword(user, password);
    db.Users.Add(user);
    await db.SaveChangesAsync();
}
// Các câu kiểm tra schema dùng chung cho các hàm Ensure* bên dưới.
static async Task<bool> ColumnExistsAsync(WareHubDbContext db, string table, string column) =>
    await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS `Value` FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = {0} AND column_name = {1}", table, column).SingleAsync() > 0;
static async Task<bool> TableExistsAsync(WareHubDbContext db, string table) =>
    await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS `Value` FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = {0}", table).SingleAsync() > 0;
static async Task<bool> IndexExistsAsync(WareHubDbContext db, string table, string indexName) =>
    await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS `Value` FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = {0} AND index_name = {1}", table, indexName).SingleAsync() > 0;
static async Task EnsureDeviceColumnAsync(WareHubDbContext db, string columnName)
{
    if (await ColumnExistsAsync(db, "devices", columnName)) return;
    var sql = columnName switch
    {
        "producer" => "ALTER TABLE devices ADD COLUMN producer VARCHAR(100) NULL",
        "ip_address" => "ALTER TABLE devices ADD COLUMN ip_address VARCHAR(45) NULL",
        "os_name" => "ALTER TABLE devices ADD COLUMN os_name VARCHAR(100) NULL",
        "office_name" => "ALTER TABLE devices ADD COLUMN office_name VARCHAR(100) NULL",
        "phone_number" => "ALTER TABLE devices ADD COLUMN phone_number VARCHAR(30) NULL",
        "sim_serial" => "ALTER TABLE devices ADD COLUMN sim_serial VARCHAR(50) NULL",
        _ => throw new InvalidOperationException("Cột thiết bị không hợp lệ"),
    };
    await db.Database.ExecuteSqlRawAsync(sql);
}
#pragma warning disable EF1002 // table/indexName/columnExpression are always hardcoded call-site literals from EnsureSchemaAsync above, never user input
static async Task EnsureIndexAsync(WareHubDbContext db, string table, string indexName, string columnExpression)
{
    if (!await IndexExistsAsync(db, table, indexName))
        await db.Database.ExecuteSqlRawAsync($"CREATE INDEX `{indexName}` ON `{table}` ({columnExpression})");
}
static async Task EnsureIndexDroppedAsync(WareHubDbContext db, string table, string indexName)
{
    if (await IndexExistsAsync(db, table, indexName))
        await db.Database.ExecuteSqlRawAsync($"DROP INDEX `{indexName}` ON `{table}`");
}
#pragma warning restore EF1002
static async Task EnsureHandoverTableAsync(WareHubDbContext db)
{
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS handovers (
            Id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `no` VARCHAR(12) NOT NULL,
            device_id INT NULL,
            device_ma VARCHAR(50) NULL,
            full_name VARCHAR(100) NULL,
            payload LONGTEXT NULL,
            user_id INT NOT NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            UNIQUE INDEX IX_handovers_no (`no`)
        )
        """);
    if (!await ColumnExistsAsync(db, "handovers", "payload"))
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE handovers ADD COLUMN payload LONGTEXT NULL AFTER full_name");
}
static async Task EnsureDeviceHistoryTableAsync(WareHubDbContext db)
{
    if (await TableExistsAsync(db, "device_history")) return;
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE device_history (
            Id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            device_id INT NOT NULL,
            user_id INT NOT NULL,
            field_name VARCHAR(30) NOT NULL,
            old_value VARCHAR(255) NULL,
            new_value VARCHAR(255) NULL,
            changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX IX_device_history_ChangedAt (changed_at),
            INDEX IX_device_history_DeviceId (device_id),
            CONSTRAINT FK_device_history_devices FOREIGN KEY (device_id) REFERENCES devices (Id) ON DELETE CASCADE,
            CONSTRAINT FK_device_history_users FOREIGN KEY (user_id) REFERENCES users (Id) ON DELETE RESTRICT
        )
        """);
}
