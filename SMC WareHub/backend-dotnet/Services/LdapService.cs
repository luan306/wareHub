using System.DirectoryServices.Protocols;
using System.Net;
using Microsoft.Extensions.Options;
using WareHub.Api.Contracts;

namespace WareHub.Api.Services;

public sealed record LdapUserMatch(string Username, string FullName, string? Email);

/// <summary>
/// Kết nối Active Directory qua giao thức LDAP: (1) tìm người dùng theo tên/tài khoản (dùng cho ô "Thêm từ LDAP" ở
/// trang Người dùng — tài khoản dịch vụ chỉ cần quyền đọc); (2) xác thực mật khẩu lúc đăng nhập cho user đã gắn
/// LDAP, bằng cách thử bind thẳng vào AD với chính tài khoản/mật khẩu người đó gửi lên (không lưu mật khẩu AD).
/// </summary>
public sealed class LdapService(IOptions<LdapOptions> options, ILogger<LdapService> logger)
{
    private readonly LdapOptions _options = options.Value;

    public bool IsConfigured => _options.IsConfigured;

    private LdapConnection Connect()
    {
        var connection = new LdapConnection(new LdapDirectoryIdentifier(_options.Host, _options.Port))
        {
            AuthType = AuthType.Basic,
            Timeout = TimeSpan.FromSeconds(10),
        };
        connection.SessionOptions.ProtocolVersion = 3;
        if (_options.UseSsl) connection.SessionOptions.SecureSocketLayer = true;
        return connection;
    }

    // Trần số dòng lấy về cho MỖI yêu cầu — không phải "tổng số account AD": công ty có thể có hàng nghìn tài khoản,
    // kéo hết về 1 lần vừa chậm vừa dễ treo trình duyệt khi render. 500 đủ cho hầu hết công ty vừa/nhỏ; nếu công ty
    // nhiều hơn, gõ tìm để lọc bớt lại thay vì liệt kê hết.
    public const int MaxResults = 500;

    /// <summary>
    /// Tìm người dùng AD có tên hiển thị hoặc tài khoản (sAMAccountName) chứa từ khoá, tối đa <see cref="MaxResults"/>
    /// dòng. Để trống query thì liệt kê luôn (không bắt gõ trước) — mở khung "Thêm từ LDAP" là thấy ngay danh sách
    /// thay vì ô trống trơn.
    /// </summary>
    public Task<List<LdapUserMatch>> SearchUsersAsync(string? query, CancellationToken ct) => Task.Run(() =>
    {
        if (!IsConfigured) throw new InvalidOperationException("Chưa cấu hình kết nối LDAP (mục \"Ldap\" trong cấu hình).");
        ct.ThrowIfCancellationRequested();
        using var connection = Connect();
        connection.Credential = new NetworkCredential(_options.BindUsername, _options.BindPassword);
        connection.Bind();

        var filter = string.IsNullOrWhiteSpace(query)
            ? "(&(objectCategory=person)(objectClass=user))"
            : $"(&(objectCategory=person)(objectClass=user)(|(cn=*{EscapeFilter(query)}*)(sAMAccountName=*{EscapeFilter(query)}*)))";
        var request = new SearchRequest(_options.BaseDn, filter, SearchScope.Subtree, "cn", "sAMAccountName", "mail");
        // Chặn ở tầng LDAP luôn (không chỉ cắt bớt sau khi lấy về) — base DN cả công ty có thể rất nhiều user,
        // không giới hạn ở server AD thì mỗi lần mở khung (query rỗng) sẽ kéo về toàn bộ, chậm và tốn băng thông.
        request.SizeLimit = MaxResults;
        var response = (SearchResponse)connection.SendRequest(request);

        var results = new List<LdapUserMatch>();
        foreach (SearchResultEntry entry in response.Entries)
        {
            var username = entry.Attributes["sAMAccountName"]?[0]?.ToString();
            var fullName = entry.Attributes["cn"]?[0]?.ToString();
            var email = entry.Attributes["mail"]?.Count > 0 ? entry.Attributes["mail"][0]?.ToString() : null;
            if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(fullName))
                results.Add(new LdapUserMatch(username, fullName, email));
        }
        return results.Take(MaxResults).ToList();
    }, ct);

    /// <summary>
    /// Thử bind vào AD bằng chính tài khoản người dùng — không cần biết DN thật, ghép UserPrincipalSuffix vào
    /// username là bind thẳng được với hầu hết Active Directory. Trả về false cho MỌI lỗi (sai mật khẩu, server
    /// không tới được, tài khoản bị khoá bên AD...) — không phân biệt lý do để không lộ thông tin cho người đăng nhập.
    /// </summary>
    public Task<bool> VerifyPasswordAsync(string username, string password, CancellationToken ct) => Task.Run(() =>
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(password)) return false;
        var upn = username.Contains('@') ? username : $"{username}{_options.UserPrincipalSuffix}";
        try
        {
            using var connection = Connect();
            connection.Credential = new NetworkCredential(upn, password);
            connection.Bind();
            return true;
        }
        catch (LdapException ex)
        {
            logger.LogWarning("LDAP bind thất bại cho {User}: {Message}", username, ex.Message);
            return false;
        }
    }, ct);

    // Ký tự đặc biệt trong bộ lọc LDAP (RFC 4515) phải thoát trước khi ghép thẳng từ khoá người dùng gõ vào filter,
    // tránh bị chèn thêm điều kiện lọc khác (LDAP injection) qua ô tìm kiếm.
    private static string EscapeFilter(string value) =>
        value.Replace("\\", "\\5c").Replace("*", "\\2a").Replace("(", "\\28").Replace(")", "\\29").Replace("\0", "\\00");
}
