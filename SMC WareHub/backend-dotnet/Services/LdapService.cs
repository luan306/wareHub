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
        connection.Credential = new NetworkCredential(_options.BindUsername, _options.BindPassword);
        connection.Bind();

        var filter = string.IsNullOrWhiteSpace(query)
            ? "(&(objectCategory=person)(objectClass=user))"
            : $"(&(objectCategory=person)(objectClass=user)(|(cn=*{EscapeFilter(query)}*)(sAMAccountName=*{EscapeFilter(query)}*)(employeeNumber=*{EscapeFilter(query)}*)))";
        var request = new SearchRequest(_options.BaseDn, filter, SearchScope.Subtree, "cn", "sAMAccountName", "mail", "department", "employeeNumber", "givenName", "sn");
        request.SizeLimit = MaxResults;
        var response = (SearchResponse)connection.SendRequest(request);

        var results = new List<LdapUserMatch>();
        foreach (SearchResultEntry entry in response.Entries)
        {
            var username = entry.Attributes["sAMAccountName"]?[0]?.ToString();
            var givenName = entry.Attributes["givenName"]?.Count > 0 ? entry.Attributes["givenName"][0]?.ToString() : null;
            var surname = entry.Attributes["sn"]?.Count > 0 ? entry.Attributes["sn"][0]?.ToString() : null;
            var fullName = !string.IsNullOrWhiteSpace(givenName) && !string.IsNullOrWhiteSpace(surname)
                ? $"{givenName} {surname}"
                : entry.Attributes["cn"]?[0]?.ToString();
            var email = entry.Attributes["mail"]?.Count > 0 ? entry.Attributes["mail"][0]?.ToString() : null;
            var department = entry.Attributes["department"]?.Count > 0 ? entry.Attributes["department"][0]?.ToString() : null;
            var employeeId = entry.Attributes["employeeNumber"]?.Count > 0 ? entry.Attributes["employeeNumber"][0]?.ToString() : null;
            if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(fullName))
                results.Add(new LdapUserMatch(username, fullName, email, department, employeeId));
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

    private static string EscapeFilter(string value) =>
        value.Replace("\\", "\\5c").Replace("*", "\\2a").Replace("(", "\\28").Replace(")", "\\29").Replace("\0", "\\00");
}
