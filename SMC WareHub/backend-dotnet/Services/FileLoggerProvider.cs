namespace WareHub.Api.Services;

/// <summary>
/// Ghi thêm log ra file (song song với console), mỗi ngày 1 file trong thư mục <c>logs/</c> cạnh nơi chạy ứng dụng.
/// Cửa sổ console/Debug Console chỉ giữ được vài trăm dòng gần nhất và mất hết khi đóng cửa sổ; file thì xem lại được
/// bất cứ lúc nào, kể cả sau khi tắt ứng dụng — không cần copy tay từ màn hình nữa.
/// </summary>
public sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly string _directory;
    private readonly object _writeLock = new();
    private StreamWriter? _writer;
    private string? _writerDate;

    public FileLoggerProvider(string directory)
    {
        _directory = directory;
        // Tạo thư mục đúng 1 lần ở đây — tạo trong Log() (chạy cho MỖI dòng log) tốn 1 lượt gọi hệ thống mỗi lần ghi,
        // dù thư mục chắc chắn đã có sẵn từ dòng log trước đó. Lỗi ở đây (ổ đĩa đầy, quyền...) không được chặn khởi động.
        try { Directory.CreateDirectory(_directory); } catch { /* bỏ qua, mỗi lần ghi vẫn tự thử lại nếu cần */ }
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(categoryName, this);
    public void Dispose() { lock (_writeLock) { _writer?.Dispose(); _writer = null; } }

    // Giữ 1 StreamWriter mở xuyên suốt cho file của NGÀY HIỆN TẠI thay vì mở file - ghi - đóng file lại từ đầu cho
    // MỖI dòng log — chỉ mở lại đúng 1 lần khi sang ngày mới. Mỗi dòng log vẫn ghi tuần tự (khoá chung, cần thiết để
    // không bị xen dòng giữa nhiều luồng) nhưng không còn trả giá mở/đóng file lặp lại hàng trăm/nghìn lần mỗi giây
    // khi log ra nhiều (vd đang bị dò mật khẩu liên tục, mỗi lần thử đều ghi 1 dòng audit/security).
    private void WriteLine(string line)
    {
        lock (_writeLock)
        {
            var today = DateTime.Now.ToString("yyyy-MM-dd");
            try
            {
                if (_writer is null || _writerDate != today) OpenWriter(today);
                _writer!.WriteLine(line);
            }
            catch
            {
                // File/thư mục có thể đã bị xoá hoặc khoá sau khi mở — thử mở lại 1 lần rồi ghi lại, không âm thầm mất log mãi.
                try { Directory.CreateDirectory(_directory); OpenWriter(today); _writer!.WriteLine(line); }
                catch { _writer = null; }
            }
        }
    }

    // Gọi bên trong lock. AutoFlush để mất điện/sập tiến trình đột ngột vẫn không mất dòng vừa ghi (giữ đúng tính
    // chất "ghi xong là thấy ngay trong file" mà File.AppendAllText trước đây có).
    private void OpenWriter(string today)
    {
        _writer?.Dispose();
        _writer = new StreamWriter(Path.Combine(_directory, $"app-{today}.log"), append: true) { AutoFlush = true };
        _writerDate = today;
    }

    private sealed class FileLogger(string category, FileLoggerProvider provider) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        // Chỉ ghi Information trở lên: log Debug/Trace của thư viện quá nhiều, sẽ làm file phình to vô ích.
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{logLevel,-11}] {category}: {formatter(state, exception)}";
            if (exception is not null) line += Environment.NewLine + exception;
            provider.WriteLine(line);
        }
    }
}
