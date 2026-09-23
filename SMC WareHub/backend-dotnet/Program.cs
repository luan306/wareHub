using System.IdentityModel.Tokens.Jwt;
using System.Linq.Expressions;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using QRCoder;
using WareHub.Api.Contracts;
using WareHub.Api.Data;
using WareHub.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var configuration = builder.Configuration;
var connectionString = configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Thiếu ConnectionStrings:Default");
var jwtSecret = configuration["Jwt:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
    throw new InvalidOperationException("Jwt:Secret phải có tối thiểu 32 ký tự");

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
});
builder.Services.AddResponseCompression(options => options.EnableForHttps = true);
builder.Services.AddDbContext<WareHubDbContext>(options =>
    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString), mysql =>
        mysql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorNumbersToAdd: null)
             .CommandTimeout(30)));
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.Configure<GlpiOptions>(configuration.GetSection(GlpiOptions.SectionName));
builder.Services.AddHttpClient<GlpiClient>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ValidateIssuer = false,
        ValidateAudience = false,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1)
    };
});
builder.Services.AddAuthorization(options => options.AddPolicy("admin", policy => policy.RequireRole("admin")));
var origins = configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseResponseCompression();
app.Use(async (context, next) =>
{
    try
    {
        await next();
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
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WareHubDbContext>();
        var id = context.User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = int.TryParse(id, out var userId)
            ? await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId)
            : null;
        if (user is null || !user.IsActive)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Tài khoản không tồn tại hoặc đã bị khóa" });
            return;
        }
        context.Items["CurrentUser"] = user;
    }
    await next();
});
app.UseAuthorization();

await InitializeDatabaseAsync(app.Services, configuration);

app.MapGet("/api/health", () => Results.Ok(new { ok = true }));

var auth = app.MapGroup("/api/auth");
auth.MapPost("/login", async (LoginRequest request, WareHubDbContext db, IPasswordHasher<User> hasher, IConfiguration config) =>
{
    var username = request.Username?.Trim();
    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(request.Password))
        return Results.BadRequest(new { error = "Vui lòng nhập tên đăng nhập và mật khẩu" });
    var user = await db.Users.SingleOrDefaultAsync(x => x.Username == username);
    if (user is null || !user.IsActive || !VerifyPassword(user, request.Password, hasher))
        return Results.Json(new { error = "Sai tên đăng nhập hoặc mật khẩu" }, statusCode: StatusCodes.Status401Unauthorized);
    return Results.Ok(new { token = CreateToken(user, config), user = UserDto(user) });
});
auth.MapGet("/me", (HttpContext context) => Results.Ok(new { user = UserDto((User)context.Items["CurrentUser"]!) })).RequireAuthorization();

var devices = app.MapGroup("/api/devices").RequireAuthorization();
devices.MapGet("/", async (string? search, string? loai, string? lifecycle_status, string? sortBy, string? sortDir, int? page, int? pageSize, WareHubDbContext db) =>
{
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
    var currentPage = Math.Max(page ?? 1, 1);
    var limit = Math.Clamp(pageSize ?? 24, 1, 100);
    var total = await query.CountAsync();
    var rows = await query.Skip((currentPage - 1) * limit).Take(limit).ToListAsync();
    return Results.Ok(new { devices = rows, total, page = currentPage, pageSize = limit, totalPages = Math.Max((int)Math.Ceiling(total / (double)limit), 1) });
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
    var changes = DiffDevice(before, after);
    if (changes.Count > 0)
        db.DeviceHistory.AddRange(changes.Select(c => new DeviceHistory { DeviceId = id, UserId = currentUser.Id, FieldName = c.Field, OldValue = c.OldValue, NewValue = c.NewValue }));
    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
}).RequireAuthorization("admin");
devices.MapGet("/history", async (string? search, string? from, string? to, int page, int pageSize, WareHubDbContext db) =>
{
    page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize == 0 ? 30 : pageSize, 1, 100);
    var query = db.DeviceHistory.AsNoTracking().AsQueryable();
    if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => x.Device.Ma.Contains(search) || x.Device.Ten.Contains(search) || x.User.FullName.Contains(search));
    if (DateTime.TryParse(from, out var fromDate)) query = query.Where(x => x.ChangedAt >= fromDate.Date);
    if (DateTime.TryParse(to, out var toDate)) query = query.Where(x => x.ChangedAt < toDate.Date.AddDays(1));
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.ChangedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new { x.Id, changed_at = x.ChangedAt, x.Device.Ma, x.Device.Ten, field_name = x.FieldName, old_value = x.OldValue, new_value = x.NewValue, changed_by = x.User.FullName })
        .ToListAsync();
    return Results.Ok(new { history = rows, total, page, pageSize });
}).RequireAuthorization("admin");
devices.MapGet("/glpi-debug", (GlpiClient glpi, IConfiguration config) =>
{
    var section = config.GetSection("Glpi");
    return Results.Ok(new
    {
        isConfigured = glpi.IsConfigured,
        sectionExists = section.Exists(),
        baseUrlLen = section["BaseUrl"]?.Length ?? -1,
        clientIdLen = section["ClientId"]?.Length ?? -1,
        usernameLen = section["Username"]?.Length ?? -1,
        passwordLen = section["Password"]?.Length ?? -1,
    });
}).RequireAuthorization("admin");
devices.MapPost("/glpi-sync", async (HttpContext context, WareHubDbContext db, GlpiClient glpi) =>
{
    if (!glpi.IsConfigured)
        return Results.BadRequest(new { error = "Chưa cấu hình kết nối GLPI. Thêm mục \"Glpi\" (BaseUrl, ClientId, ClientSecret, Username, Password) vào appsettings.Development.json." });

    List<GlpiAsset> computers;
    try { computers = await glpi.GetComputersAsync(context.RequestAborted); }
    catch (InvalidOperationException ex) { return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway); }

    // Lỗi phía điện thoại (vd. sai đường dẫn) không được làm hỏng phần máy tính đã lấy được.
    List<GlpiAsset> phones = [];
    string? phoneError = null;
    try { phones = await glpi.GetPhonesAsync(context.RequestAborted); }
    catch (InvalidOperationException ex) { phoneError = ex.Message; }

    var assets = computers.Select(c => (Asset: c, Loai: "laptop", Kho: "24"))
        .Concat(phones.Select(p => (Asset: p, Loai: "phone", Kho: "12")))
        .ToList();

    var currentUser = (User)context.Items["CurrentUser"]!;
    var existingBySerial = await db.Devices.ToDictionaryAsync(x => x.Ma);
    var seenSerials = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    int created = 0, updated = 0, unchanged = 0, skipped = 0, duplicates = 0;

    foreach (var (c, loai, kho) in assets)
    {
        var serial = Truncate(c.Serial, 50);
        if (string.IsNullOrWhiteSpace(serial)) { skipped++; continue; }
        if (!seenSerials.Add(serial)) { duplicates++; continue; }

        if (existingBySerial.TryGetValue(serial, out var existing))
        {
            var before = SnapshotDevice(existing);
            existing.Ten = Truncate(c.Name, 150) is { Length: > 0 } newTen ? newTen : existing.Ten;
            existing.Model = Truncate(c.Model?.Name, 150);
            existing.Producer = Truncate(c.Manufacturer?.Name, 100);
            existing.UserName = Truncate(c.User?.Name, 100);
            existing.PhongBan = Truncate(c.Location?.Name, 100);
            existing.GhiChu = Truncate(c.Comment, 500);
            var after = SnapshotDevice(existing);
            var changes = DiffDevice(before, after);
            if (changes.Count > 0)
            {
                db.DeviceHistory.AddRange(changes.Select(ch => new DeviceHistory { DeviceId = existing.Id, UserId = currentUser.Id, FieldName = ch.Field, OldValue = ch.OldValue, NewValue = ch.NewValue }));
                updated++;
            }
            else unchanged++;
        }
        else
        {
            db.Devices.Add(new Device
            {
                Ma = serial,
                Ten = Truncate(c.Name, 150) is { Length: > 0 } ten ? ten : serial,
                Loai = loai,
                Kho = kho,
                Model = Truncate(c.Model?.Name, 150),
                Producer = Truncate(c.Manufacturer?.Name, 100),
                UserName = Truncate(c.User?.Name, 100),
                PhongBan = Truncate(c.Location?.Name, 100),
                GhiChu = Truncate(c.Comment, 500),
                IsActive = true,
                LifecycleStatus = "old",
            });
            created++;
        }
    }

    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true, total = assets.Count, computers = computers.Count, phones = phones.Count, phone_error = phoneError, created, updated, unchanged, skipped, duplicates });
}).RequireAuthorization("admin");
devices.MapPost("/{id:int}/clone", async (int id, CloneRequest request, WareHubDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Ma)) return Results.BadRequest(new { error = "Vui lòng nhập mã thiết bị mới" });
    var source = await db.Devices.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
    if (source is null) return Results.NotFound(new { error = "Không tìm thấy thiết bị gốc" });
    var clone = new Device { Ma = request.Ma.Trim(), Ten = source.Ten, Loai = source.Loai, Kho = source.Kho, Model = source.Model, Cpu = source.Cpu, Ram = source.Ram, Storage = source.Storage, IsActive = true, LifecycleStatus = "old", UserName = source.UserName, RegisteredAt = source.RegisteredAt, PhongBan = source.PhongBan, GhiChu = source.GhiChu, Producer = source.Producer, IpAddress = source.IpAddress };
    db.Devices.Add(clone); try { await db.SaveChangesAsync(); return Results.Created($"/api/devices/{clone.Id}", new { id = clone.Id }); } catch (DbUpdateException) { return Results.Conflict(new { error = $"Mã thiết bị \"{request.Ma}\" đã tồn tại" }); }
}).RequireAuthorization("admin");
devices.MapDelete("/{id:int}", async (int id, WareHubDbContext db) =>
{
    var device = await db.Devices.FindAsync(id); if (device is null) return Results.NotFound(new { error = "Không tìm thấy thiết bị" });
    db.Devices.Remove(device); await db.SaveChangesAsync(); return Results.Ok(new { ok = true });
}).RequireAuthorization("admin");

var users = app.MapGroup("/api/users").RequireAuthorization("admin");
users.MapGet("/", async (WareHubDbContext db) => Results.Ok(new { users = await db.Users.AsNoTracking().OrderByDescending(x => x.CreatedAt).ToListAsync() }));
users.MapPost("/", async (UserCreateRequest request, WareHubDbContext db, IPasswordHasher<User> hasher) =>
{
    var username = request.Username?.Trim(); var fullName = request.FullName?.Trim();
    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(fullName) || string.IsNullOrWhiteSpace(request.Password)) return Results.BadRequest(new { error = "Vui lòng nhập đầy đủ tên đăng nhập, mật khẩu, họ tên" });
    if (username.Length > 50) return Results.BadRequest(new { error = "Tên đăng nhập không được vượt quá 50 ký tự" });
    if (fullName.Length > 100) return Results.BadRequest(new { error = "Họ tên không được vượt quá 100 ký tự" });
    if (request.Password.Length < 6) return Results.BadRequest(new { error = "Mật khẩu cần tối thiểu 6 ký tự" });
    if (request.Role is not ("admin" or "staff")) return Results.BadRequest(new { error = "Vai trò không hợp lệ" });
    if (await db.Users.AnyAsync(x => x.Username == username)) return Results.Conflict(new { error = $"Tên đăng nhập \"{username}\" đã tồn tại" });
    var user = new User { Username = username, FullName = fullName, Role = request.Role }; user.PasswordHash = hasher.HashPassword(user, request.Password); db.Users.Add(user); await db.SaveChangesAsync(); return Results.Created($"/api/users/{user.Id}", new { id = user.Id });
});
users.MapPut("/{id:int}", async (int id, UserUpdateRequest request, WareHubDbContext db, IPasswordHasher<User> hasher) =>
{
    var user = await db.Users.FindAsync(id); if (user is null) return Results.NotFound(new { error = "Không tìm thấy người dùng" });
    if (request.FullName is not null) { if (string.IsNullOrWhiteSpace(request.FullName)) return Results.BadRequest(new { error = "Họ tên không được để trống" }); user.FullName = request.FullName.Trim(); }
    if (request.Role is not null) { if (request.Role is not ("admin" or "staff")) return Results.BadRequest(new { error = "Vai trò không hợp lệ" }); user.Role = request.Role; }
    if (request.IsActive.HasValue) user.IsActive = request.IsActive.Value;
    if (!string.IsNullOrWhiteSpace(request.Password)) { if (request.Password.Length < 6) return Results.BadRequest(new { error = "Mật khẩu cần tối thiểu 6 ký tự" }); user.PasswordHash = hasher.HashPassword(user, request.Password); }
    await db.SaveChangesAsync(); return Results.Ok(new { ok = true });
});
users.MapDelete("/{id:int}", async (int id, HttpContext context, WareHubDbContext db) =>
{
    var current = (User)context.Items["CurrentUser"]!; if (current.Id == id) return Results.BadRequest(new { error = "Không thể tự xoá chính mình" });
    var user = await db.Users.FindAsync(id); if (user is null) return Results.NotFound(new { error = "Không tìm thấy người dùng" }); db.Users.Remove(user); await db.SaveChangesAsync(); return Results.Ok(new { ok = true });
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
    page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100); var query = db.PrintHistory.AsNoTracking().AsQueryable();
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
    var query = db.Handovers.AsNoTracking().AsQueryable();
    if (!string.IsNullOrWhiteSpace(search))
    {
        var term = search.Trim();
        query = query.Where(x => x.No.Contains(term) || (x.FullName ?? "").Contains(term) || (x.DeviceMa ?? "").Contains(term) || (x.Payload ?? "").Contains(term));
    }
    var currentPage = Math.Max(page ?? 1, 1);
    var limit = Math.Clamp(pageSize ?? 30, 1, 100);
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
    return Results.Ok(new { handovers = items, total, page = currentPage, pageSize = limit, totalPages = Math.Max((int)Math.Ceiling(total / (double)limit), 1) });
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
    }.FirstOrDefault(field => (field.Value?.Length ?? 0) > field.Max);
    return tooLong.Label is not null ? $"{tooLong.Label} không được vượt quá {tooLong.Max} ký tự" : null;
}
static Device ToDevice(DeviceRequest request) { var device = new Device { IsActive = true, LifecycleStatus = "old" }; CopyDevice(device, request); return device; }
static void CopyDevice(Device target, DeviceRequest request) { target.Ma = request.Ma!.Trim(); target.Ten = request.Ten!.Trim(); target.Loai = request.Loai!; target.Kho = request.Loai == "phone" ? "12" : "24"; target.Model = request.Model; target.Cpu = request.Cpu; target.Ram = request.Ram; target.Storage = request.Storage; target.UserName = request.UserName; target.RegisteredAt = request.RegisteredAt; target.PhongBan = request.PhongBan; target.GhiChu = request.GhiChu; target.Producer = request.Producer; target.IpAddress = request.IpAddress; }
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
};
static List<(string Field, string? OldValue, string? NewValue)> DiffDevice(Dictionary<string, string?> before, Dictionary<string, string?> after) =>
    before.Where(entry => entry.Value != after[entry.Key]).Select(entry => (entry.Key, entry.Value, after[entry.Key])).ToList();
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
static object UserDto(User user) => new { user.Id, user.Username, user.FullName, user.Role, is_active = user.IsActive };
static bool VerifyPassword(User user, string password, IPasswordHasher<User> hasher)
{
    if (user.PasswordHash.StartsWith("$2", StringComparison.Ordinal))
        return BCrypt.Net.BCrypt.Verify(password, user.PasswordHash);
    return hasher.VerifyHashedPassword(user, user.PasswordHash, password) != PasswordVerificationResult.Failed;
}
static string CreateToken(User user, IConfiguration config) { var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim(JwtRegisteredClaimNames.UniqueName, user.Username), new Claim(ClaimTypes.Role, user.Role), new Claim("full_name", user.FullName) }; var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Secret"]!)); var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256); var expires = DateTime.UtcNow.AddHours(config.GetValue("Jwt:ExpiresInHours", 8)); return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(claims: claims, expires: expires, signingCredentials: credentials)); }
static async Task InitializeDatabaseAsync(IServiceProvider services, IConfiguration configuration) { await using var scope = services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<WareHubDbContext>(); for (var attempt = 1; attempt <= 20; attempt++) { try { await db.Database.EnsureCreatedAsync(); await EnsureDeviceColumnAsync(db, "producer"); await EnsureDeviceColumnAsync(db, "ip_address"); await EnsureIndexAsync(db, "devices", "IX_devices_Loai", "`Loai`"); await EnsureIndexAsync(db, "devices", "IX_devices_LifecycleStatus", "`lifecycle_status`"); await EnsureIndexAsync(db, "devices", "IX_devices_PhongBan", "`phong_ban`"); await EnsureIndexAsync(db, "print_history", "IX_print_history_PrintedAt", "`printed_at`"); await EnsureDeviceHistoryTableAsync(db); await EnsureHandoverTableAsync(db); await EnsureIndexAsync(db, "handovers", "IX_handovers_CreatedAt", "`created_at`");
        // Chỉ mục thừa/không còn dùng — idx_devices_loai và idx_devices_phong_ban trùng cột với IX_devices_Loai/IX_devices_PhongBan ở trên (tạo ra ngoài code trước đây);
        // IX_devices_IsActive vô dụng từ khi mọi thiết bị luôn is_active = true (không còn giá trị nào khác để lọc). Giữ lại chỉ khiến mỗi lần ghi thiết bị chậm hơn, không giúp gì cho truy vấn.
        await EnsureIndexDroppedAsync(db, "devices", "idx_devices_loai"); await EnsureIndexDroppedAsync(db, "devices", "idx_devices_phong_ban"); await EnsureIndexDroppedAsync(db, "devices", "IX_devices_IsActive"); if (!await db.Users.AnyAsync()) { var user = new User { Username = configuration["DefaultAdmin:User"] ?? "admin", FullName = configuration["DefaultAdmin:FullName"] ?? "Quản trị viên", Role = "admin" }; var password = configuration["DefaultAdmin:Password"] ?? throw new InvalidOperationException("Thiếu DefaultAdmin:Password"); user.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>().HashPassword(user, password); db.Users.Add(user); await db.SaveChangesAsync(); } return; } catch when (attempt < 20) { await Task.Delay(2000); } } }
static async Task EnsureDeviceColumnAsync(WareHubDbContext db, string columnName) { var exists = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS `Value` FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'devices' AND column_name = {0}", columnName).SingleAsync(); if (exists == 0) { var sql = columnName switch { "producer" => "ALTER TABLE devices ADD COLUMN producer VARCHAR(100) NULL", "ip_address" => "ALTER TABLE devices ADD COLUMN ip_address VARCHAR(45) NULL", _ => throw new InvalidOperationException("Cột thiết bị không hợp lệ") }; await db.Database.ExecuteSqlRawAsync(sql); } }
#pragma warning disable EF1002 // table/indexName/columnExpression are always hardcoded call-site literals from InitializeDatabaseAsync above, never user input
static async Task EnsureIndexAsync(WareHubDbContext db, string table, string indexName, string columnExpression) { var exists = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS `Value` FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = {0} AND index_name = {1}", table, indexName).SingleAsync(); if (exists == 0) await db.Database.ExecuteSqlRawAsync($"CREATE INDEX `{indexName}` ON `{table}` ({columnExpression})"); }
static async Task EnsureIndexDroppedAsync(WareHubDbContext db, string table, string indexName) { var exists = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS `Value` FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = {0} AND index_name = {1}", table, indexName).SingleAsync(); if (exists > 0) await db.Database.ExecuteSqlRawAsync($"DROP INDEX `{indexName}` ON `{table}`"); }
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
    var hasPayload = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS `Value` FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'handovers' AND column_name = 'payload'").SingleAsync();
    if (hasPayload == 0) await db.Database.ExecuteSqlRawAsync("ALTER TABLE handovers ADD COLUMN payload LONGTEXT NULL AFTER full_name");
}
static async Task EnsureDeviceHistoryTableAsync(WareHubDbContext db)
{
    var exists = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS `Value` FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'device_history'").SingleAsync();
    if (exists > 0) return;
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
