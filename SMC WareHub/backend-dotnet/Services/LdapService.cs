using System.DirectoryServices.Protocols;
using System.Net;
using Microsoft.Extensions.Options;
using WareHub.Api.Contracts;

namespace WareHub.Api.Services;

public sealed record LdapUserMatch(string Username, string FullName, string? Email, string? Department = null, string? EmployeeId = null);

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

    public const int MaxResults = 500;

    public Task<List<LdapUserMatch>> SearchUsersAsync(string? query, CancellationToken ct) => Task.Run(() =>
    {
        if (!IsConfigured) throw new InvalidOperationException("Chưa cấu hình kết nối LDAP (mục \"Ldap\" trong cấu hình).");
        ct.ThrowIfCancellationRequested();
        using var connection = Connect();
        connection.Bind(new NetworkCredential(_options.BindUsername, _options.BindPassword));

        var filter = string.IsNullOrWhiteSpace(query)
            ? "(&(objectCategory=person)(objectClass=user))"
            : $"(&(objectCategory=person)(objectClass=user)(|(cn=*{EscapeFilter(query)}*)(sAMAccountName=*{EscapeFilter(query)}*)(employeeNumber=*{EscapeFilter(query)}*)))";
        var request = new SearchRequest(_options.BaseDn, filter, SearchScope.Subtree, "cn", "sAMAccountName", "mail", "department", "employeeNumber", "givenName", "sn");
        request.SizeLimit = MaxResults;
        var response = (SearchResponse)connection.SendRequest(request);

        var results = new List<LdapUserMatch>();
        foreach (SearchResultEntry entry in response.Entries)
        {
            try
            {
                var username = AttributeValue(entry, "sAMAccountName");
                var givenName = AttributeValue(entry, "givenName");
                var surname = AttributeValue(entry, "sn");
                var fullName = !string.IsNullOrWhiteSpace(givenName) && !string.IsNullOrWhiteSpace(surname)
                    ? $"{surname} {givenName}"
                    : AttributeValue(entry, "cn");
                var email = AttributeValue(entry, "mail");
                var department = AttributeValue(entry, "department");
                var employeeId = AttributeValue(entry, "employeeNumber");
                if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(fullName))
                    results.Add(new LdapUserMatch(username, fullName, email, department, employeeId));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Bỏ qua 1 bản ghi AD đọc lỗi khi tìm LDAP (DN: {Dn})", entry.DistinguishedName);
            }
        }
        return results.Take(MaxResults).ToList();
    }, ct);

    public Task<bool> VerifyPasswordAsync(string username, string password, CancellationToken ct) => Task.Run(() =>
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(password)) return false;
        var upn = username.Contains('@') ? username : $"{username}{_options.UserPrincipalSuffix}";
        try
        {
            using var connection = Connect();
            connection.Bind(new NetworkCredential(upn, password));
            return true;
        }
        catch (LdapException ex)
        {
            logger.LogWarning("LDAP bind thất bại cho {User}: {Message}", username, ex.Message);
            return false;
        }
    }, ct);

    private static string? AttributeValue(SearchResultEntry entry, string name) =>
        entry.Attributes[name]?.Count > 0 ? entry.Attributes[name][0]?.ToString() : null;

    private static string EscapeFilter(string value) =>
        value.Replace("\\", "\\5c").Replace("*", "\\2a").Replace("(", "\\28").Replace(")", "\\29").Replace("\0", "\\00");
}
