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

    public FileLoggerProvider(string directory)
    {
        _directory = directory;
        // Tạo thư mục đúng 1 lần ở đây — tạo trong Log() (chạy cho MỖI dòng log) tốn 1 lượt gọi hệ thống mỗi lần ghi,
        // dù thư mục chắc chắn đã có sẵn từ dòng log trước đó. Lỗi ở đây (ổ đĩa đầy, quyền...) không được chặn khởi động.
        try { Directory.CreateDirectory(_directory); } catch { /* bỏ qua, mỗi lần ghi vẫn tự thử lại nếu cần */ }
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(categoryName, _directory, _writeLock);
    public void Dispose() { }

    private sealed class FileLogger(string category, string directory, object writeLock) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        // Chỉ ghi Information trở lên: log Debug/Trace của thư viện quá nhiều, sẽ làm file phình to vô ích.
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{logLevel,-11}] {category}: {formatter(state, exception)}";
            if (exception is not null) line += Environment.NewLine + exception;
            lock (writeLock)
            {
                // Lỗi khi ghi log (ví dụ ổ đĩa đầy, thư mục bị khoá) không được làm hỏng chính ứng dụng.
                try
                {
                    File.AppendAllText(Path.Combine(directory, $"app-{DateTime.Now:yyyy-MM-dd}.log"), line + Environment.NewLine);
                }
                catch
                {
                    // Thư mục có thể đã bị xoá sau khi khởi động — thử tạo lại 1 lần rồi ghi lại, không âm thầm mất log mãi.
                    try { Directory.CreateDirectory(directory); File.AppendAllText(Path.Combine(directory, $"app-{DateTime.Now:yyyy-MM-dd}.log"), line + Environment.NewLine); }
                    catch { /* bỏ qua */ }
                }
            }
        }
    }
}
