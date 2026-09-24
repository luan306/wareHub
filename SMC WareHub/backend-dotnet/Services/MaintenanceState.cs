using System.Text.Json;

namespace WareHub.Api.Services;

public sealed record MaintenanceInfo(bool Enabled, string Message, DateTimeOffset? StartedAt, DateTimeOffset? Until);

// Chế độ bảo trì: bật khi tồn tại file cờ maintenance.json (mặc định cạnh ứng dụng, đổi bằng Maintenance:FlagFile).
// Dùng file thay vì biến trong bộ nhớ để trạng thái còn nguyên khi ứng dụng được khởi động lại lúc cập nhật code,
// và để có thể bật/tắt bằng script (scripts/maintenance.ps1) ngay cả khi ứng dụng đang tắt.
public sealed class MaintenanceState
{
    public const string DefaultMessage = "Hệ thống đang bảo trì, vui lòng quay lại sau ít phút.";

    private static readonly MaintenanceInfo Off = new(false, DefaultMessage, null, null);
    private readonly string _path;
    private readonly object _lock = new();
    private MaintenanceInfo _cached = Off;
    private DateTime _stamp = DateTime.MinValue;
    private long _checkedAt;

    public MaintenanceState(IWebHostEnvironment environment, IConfiguration configuration)
    {
        var configured = configuration["Maintenance:FlagFile"];
        _path = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "maintenance.json")
            : Path.GetFullPath(configured, environment.ContentRootPath);
    }

    // Gọi ở mọi yêu cầu nên chỉ kiểm tra lại file tối đa 1 lần/giây.
    public MaintenanceInfo Current
    {
        get
        {
            var now = Environment.TickCount64;
            if (now - Interlocked.Read(ref _checkedAt) < 1000) return _cached;
            lock (_lock)
            {
                _checkedAt = now;
                if (!File.Exists(_path)) { _cached = Off; _stamp = DateTime.MinValue; return _cached; }
                var stamp = File.GetLastWriteTimeUtc(_path);
                if (stamp != _stamp) { _cached = Read(); _stamp = stamp; }
                return _cached;
            }
        }
    }

    public void Set(bool enabled, string? message, DateTimeOffset? until)
    {
        lock (_lock)
        {
            if (!enabled)
            {
                if (File.Exists(_path)) File.Delete(_path);
                _cached = Off; _stamp = DateTime.MinValue; _checkedAt = 0;
                return;
            }
            var info = new MaintenanceInfo(true, string.IsNullOrWhiteSpace(message) ? DefaultMessage : message.Trim(), DateTimeOffset.Now, until);
            File.WriteAllText(_path, JsonSerializer.Serialize(new { enabled = true, message = info.Message, started_at = info.StartedAt, until = info.Until }));
            _cached = info; _stamp = File.GetLastWriteTimeUtc(_path); _checkedAt = Environment.TickCount64;
        }
    }

    // File tồn tại = đang bảo trì (trừ khi ghi rõ "enabled": false). File hỏng vẫn tính là đang bảo trì cho an toàn.
    private MaintenanceInfo Read()
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(_path));
            var root = document.RootElement;
            if (root.TryGetProperty("enabled", out var enabled) && enabled.ValueKind == JsonValueKind.False) return Off;
            var message = root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(m.GetString()) ? m.GetString()! : DefaultMessage;
            return new MaintenanceInfo(true, message, ReadDate(root, "started_at"), ReadDate(root, "until"));
        }
        catch (Exception)
        {
            return new MaintenanceInfo(true, DefaultMessage, null, null);
        }
    }

    private static DateTimeOffset? ReadDate(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && DateTimeOffset.TryParse(value.GetString(), out var date) ? date : null;
}
