namespace WareHub.Api.Services;

public sealed class GlpiSyncJob
{
    private readonly object _lock = new();
    private bool _running;
    private string _phase = "";
    private int _done, _total;
    private DateTimeOffset? _startedAt, _finishedAt;
    private object? _result;
    private string? _error;

    public bool TryStart(Func<GlpiSyncJob, Task> work, ILogger logger)
    {
        lock (_lock)
        {
            if (_running) return false;
            _running = true;
            _phase = "lists"; _done = 0; _total = 0;
            _startedAt = DateTimeOffset.UtcNow; _finishedAt = null;
            _result = null; _error = null;
        }
        _ = Task.Run(async () =>
        {
            try { await work(this); }
            catch (Exception ex)
            {
                logger.LogError(ex, "GLPI sync failed");
                Fail("Lỗi không mong muốn khi đồng bộ GLPI, xem nhật ký máy chủ.");
            }
            finally
            {
                lock (_lock) { _running = false; _finishedAt = DateTimeOffset.UtcNow; }
            }
        });
        return true;
    }

    public void Report(string phase, int done = 0, int total = 0)
    {
        lock (_lock) { _phase = phase; _done = done; _total = total; }
    }

    public void Complete(object result) { lock (_lock) _result = result; }
    public void Fail(string message) { lock (_lock) { _error = message; _result = null; } }

    public object Snapshot()
    {
        lock (_lock)
            return new { running = _running, phase = _phase, done = _done, total = _total, started_at = _startedAt, finished_at = _finishedAt, result = _result, error = _error };
    }
}
