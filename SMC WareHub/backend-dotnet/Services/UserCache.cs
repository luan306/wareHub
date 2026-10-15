using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using WareHub.Api.Data;

namespace WareHub.Api.Services;

public sealed class UserCache(IServiceScopeFactory scopes)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(15);
    private readonly ConcurrentDictionary<int, (User User, DateTimeOffset ExpiresAt)> _entries = new();

    public async Task<User?> GetAsync(int id, CancellationToken ct)
    {
        if (_entries.TryGetValue(id, out var hit) && hit.ExpiresAt > DateTimeOffset.UtcNow) return hit.User;

        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WareHubDbContext>();
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (user is null) _entries.TryRemove(id, out _);
        else _entries[id] = (user, DateTimeOffset.UtcNow + Ttl);
        return user;
    }

    public void Invalidate(int id) => _entries.TryRemove(id, out _);
}
