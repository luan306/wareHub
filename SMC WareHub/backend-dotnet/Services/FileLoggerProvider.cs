namespace WareHub.Api.Services;

public sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly string _directory;
    private readonly object _writeLock = new();
    private StreamWriter? _writer;
    private string? _writerDate;

    public FileLoggerProvider(string directory)
    {
        _directory = directory;
        try { Directory.CreateDirectory(_directory); } catch { }
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(categoryName, this);
    public void Dispose() { lock (_writeLock) { _writer?.Dispose(); _writer = null; } }

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
                try { Directory.CreateDirectory(_directory); OpenWriter(today); _writer!.WriteLine(line); }
                catch { _writer = null; }
            }
        }
    }

    private void OpenWriter(string today)
    {
        _writer?.Dispose();
        _writer = new StreamWriter(Path.Combine(_directory, $"app-{today}.log"), append: true) { AutoFlush = true };
        _writerDate = today;
    }

    private sealed class FileLogger(string category, FileLoggerProvider provider) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
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
