using System.Collections.Concurrent;

namespace WareHub.Api.Services;

public sealed class LoginGuard
{
    private const int MaxFailuresPerPair = 5;
    private const int MaxFailuresPerIp = 30;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan BaseLock = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan MaxLock = TimeSpan.FromHours(1);
    private const int MaxEntries = 50_000;

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

        if (_entries.Count > MaxEntries)
        {
            var toTrim = _entries.Count - MaxEntries * 3 / 4;
            foreach (var (key, entry) in _entries)
            {
                if (toTrim <= 0) break;
                bool locked;
                lock (entry) locked = entry.LockedUntil > now;
                if (!locked && _entries.TryRemove(key, out _)) toTrim--;
            }
        }
    }
}
