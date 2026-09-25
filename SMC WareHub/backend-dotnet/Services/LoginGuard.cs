using System.Collections.Concurrent;

namespace WareHub.Api.Services;

/// <summary>
/// Chặn dò mật khẩu: đăng nhập sai nhiều lần thì khoá tạm, mỗi lần bị khoá lại thì thời gian khoá tăng gấp đôi.
/// Hai lớp: theo cặp (địa chỉ IP, tên đăng nhập) để chặn dò 1 tài khoản, và theo riêng địa chỉ IP để chặn dò nhiều tài khoản.
/// Cố ý KHÔNG khoá theo riêng tên đăng nhập: nếu không, kẻ tấn công chỉ cần gõ sai tên admin liên tục là admin thật cũng bị khoá.
/// Bộ đếm nằm trong bộ nhớ (mỗi bản chạy có bộ đếm riêng, khởi động lại thì xoá) — đủ cho việc chặn tấn công vét cạn.
/// </summary>
public sealed class LoginGuard
{
    private const int MaxFailuresPerPair = 5;
    private const int MaxFailuresPerIp = 30;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan BaseLock = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan MaxLock = TimeSpan.FromHours(1);
    private const int MaxEntries = 50_000; // chặn kẻ tấn công làm phình bộ nhớ bằng vô số tên đăng nhập khác nhau

    private sealed class Entry
    {
        public int Failures;
        public int Locks;
        public DateTimeOffset WindowStart;
        public DateTimeOffset LockedUntil;
    }

    private readonly ConcurrentDictionary<string, Entry> _entries = new();
    private readonly Func<DateTimeOffset> _now;

    public LoginGuard() : this(() => DateTimeOffset.UtcNow) { }
    public LoginGuard(Func<DateTimeOffset> now) => _now = now;

    private static string PairKey(string ip, string username) => $"p|{ip}|{username.Trim().ToLowerInvariant()}";
    private static string IpKey(string ip) => $"i|{ip}";

    /// <summary>Còn bị khoá bao lâu (null = được phép thử).</summary>
    public TimeSpan? RemainingLock(string ip, string username)
    {
        var now = _now();
        TimeSpan? worst = null;
        foreach (var key in new[] { PairKey(ip, username), IpKey(ip) })
        {
            if (_entries.TryGetValue(key, out var entry))
                lock (entry)
                    if (entry.LockedUntil > now && (worst is null || entry.LockedUntil - now > worst)) worst = entry.LockedUntil - now;
        }
        return worst;
    }

    public void RecordFailure(string ip, string username)
    {
        if (_entries.Count > MaxEntries) Prune();
        Bump(PairKey(ip, username), MaxFailuresPerPair);
        Bump(IpKey(ip), MaxFailuresPerIp);
    }

    /// <summary>Đăng nhập đúng: xoá bộ đếm của cặp này (bộ đếm theo IP vẫn giữ để chặn kẻ thử nhiều tài khoản).</summary>
    public void RecordSuccess(string ip, string username) => _entries.TryRemove(PairKey(ip, username), out _);

    private void Bump(string key, int limit)
    {
        var now = _now();
        var entry = _entries.GetOrAdd(key, _ => new Entry { WindowStart = now });
        lock (entry)
        {
            if (now - entry.WindowStart > Window && entry.LockedUntil <= now) { entry.Failures = 0; entry.WindowStart = now; }
            entry.Failures++;
            if (entry.Failures >= limit && entry.LockedUntil <= now)
            {
                var duration = TimeSpan.FromTicks(Math.Min(BaseLock.Ticks * (1L << Math.Min(entry.Locks, 4)), MaxLock.Ticks));
                entry.LockedUntil = now + duration;
                entry.Locks++;
                entry.Failures = 0;
                entry.WindowStart = now;
            }
        }
    }

    private void Prune()
    {
        var now = _now();
        foreach (var (key, entry) in _entries)
            lock (entry)
                if (entry.LockedUntil <= now && now - entry.WindowStart > Window) _entries.TryRemove(key, out _);
    }
}
