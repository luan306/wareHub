using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using WareHub.Api.Data;

namespace WareHub.Api.Services;

/// <summary>
/// Nhớ tạm người dùng đã đăng nhập trong vài giây để mỗi yêu cầu API không phải hỏi MySQL lại một lần
/// (trước đây mọi yêu cầu đều tốn 1 truy vấn chỉ để kiểm tra tài khoản còn hoạt động).
/// Sửa/khoá/xoá người dùng gọi <see cref="Invalidate"/> nên có hiệu lực ngay trên máy chủ đang xử lý; nếu chạy nhiều
/// bản song song (blue-green) thì bản còn lại thấy thay đổi chậm nhất <see cref="Ttl"/>.
/// </summary>
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
        if (user is null) _entries.TryRemove(id, out _); // không nhớ "không tồn tại": tài khoản mới tạo dùng được ngay
        else _entries[id] = (user, DateTimeOffset.UtcNow + Ttl);
        return user;
    }

    public void Invalidate(int id) => _entries.TryRemove(id, out _);
}
