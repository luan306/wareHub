namespace WareHub.Api.Services;

/// <summary>
/// Ghi thêm log ra file (song song với console), mỗi ngày 1 file trong thư mục <c>logs/</c> cạnh nơi chạy ứng dụng.
/// Cửa sổ console/Debug Console chỉ giữ được vài trăm dòng gần nhất và mất hết khi đóng cửa sổ; file thì xem lại được
/// bất cứ lúc nào, kể cả sau khi tắt ứng dụng — không cần copy tay từ màn hình nữa.
/// </summary>
public sealed class FileLoggerProvider(string directory) : ILoggerProvider
{
    private readonly object _writeLock = new();

    public ILogger CreateLogger(string categoryName) => new FileLogger(categoryName, directory, _writeLock);
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
                    Directory.CreateDirectory(directory);
                    File.AppendAllText(Path.Combine(directory, $"app-{DateTime.Now:yyyy-MM-dd}.log"), line + Environment.NewLine);
                }
                catch { /* bỏ qua */ }
            }
        }
    }
}
