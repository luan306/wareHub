namespace WareHub.Api.Services;

/// <summary>
/// Đồng bộ GLPI chạy nền: bấm nút chỉ "bắt đầu" rồi trả lời ngay, trình duyệt hỏi tiến độ định kỳ.
/// Trước đây cả lần đồng bộ nằm trong 1 yêu cầu HTTP; với hàng nghìn thiết bị nó chạy lâu hơn thời gian chờ của trình duyệt (30 giây),
/// trình duyệt bỏ cuộc, máy chủ thấy khách ngắt kết nối và huỷ luôn việc đồng bộ giữa chừng.
/// Mỗi lúc chỉ chạy 1 lần đồng bộ; trạng thái nằm trong bộ nhớ (mất khi khởi động lại máy chủ, khi đó bấm đồng bộ lại là được).
/// </summary>
public sealed class GlpiSyncJob
{
    private readonly object _lock = new();
    private bool _running;
    private string _phase = "";
    private int _done, _total;
    private DateTimeOffset? _startedAt, _finishedAt;
    private object? _result;
    private string? _error;

    /// <summary>Bắt đầu chạy nền; trả về false nếu đang có 1 lần đồng bộ khác chạy.</summary>
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

    /// <summary>phase: lists | computers | phones | saving. done/total dùng cho thanh tiến độ (0 = không có số).</summary>
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
