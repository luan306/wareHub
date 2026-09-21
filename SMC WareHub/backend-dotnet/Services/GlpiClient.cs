using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using WareHub.Api.Contracts;

namespace WareHub.Api.Services;

public sealed record GlpiRef(int? Id, string? Name);

public sealed class GlpiAsset
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Comment { get; set; }
    public string? Serial { get; set; }
    public string? Otherserial { get; set; }
    public GlpiRef? Manufacturer { get; set; }
    public GlpiRef? User { get; set; }
    public GlpiRef? Model { get; set; }
    public GlpiRef? Type { get; set; }
    public GlpiRef? Location { get; set; }
}

/// <summary>
/// Gọi GLPI High-Level REST API (OAuth2 "password" grant) để lấy danh sách máy tính (Computer).
/// Token được cache trong bộ nhớ tới khi gần hết hạn thì tự xin lại — không cần đăng nhập lại mỗi lần gọi.
/// </summary>
public sealed class GlpiClient(HttpClient http, IOptions<GlpiOptions> optionsAccessor, ILogger<GlpiClient> logger)
{
    private static readonly JsonSerializerOptions SnakeCaseJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    private readonly GlpiOptions _options = optionsAccessor.Value;
    private string? _cachedToken;
    private DateTimeOffset _tokenExpiresAt = DateTimeOffset.MinValue;

    public bool IsConfigured => _options.IsConfigured;

    private async Task<string> GetAccessTokenAsync(CancellationToken ct)
    {
        if (_cachedToken is not null && DateTimeOffset.UtcNow < _tokenExpiresAt)
            return _cachedToken;

        var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl}/token");
        var basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_options.ClientId}:{_options.ClientSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basicAuth);
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "password",
            ["username"] = _options.Username!,
            ["password"] = _options.Password!,
            ["scope"] = _options.Scope,
        });

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("GLPI token request failed ({Status}): {Body}", response.StatusCode, body);
            throw new InvalidOperationException($"Không lấy được token từ GLPI (HTTP {(int)response.StatusCode}). Kiểm tra lại client_id/client_secret/username/password.");
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        var accessToken = root.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("Phản hồi từ GLPI không có access_token");
        var expiresIn = root.TryGetProperty("expires_in", out var expiresEl) ? expiresEl.GetInt32() : 3600;

        _cachedToken = accessToken;
        _tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(expiresIn - 30, 30)); // trừ hao 30s cho an toàn
        return accessToken;
    }

    public Task<List<GlpiAsset>> GetComputersAsync(CancellationToken ct = default) => GetAssetsAsync(_options.ComputerEndpoint, "máy tính", ct);

    public Task<List<GlpiAsset>> GetPhonesAsync(CancellationToken ct = default) => GetAssetsAsync(_options.PhoneEndpoint, "điện thoại", ct);

    // GLPI chỉ trả tối đa `limit` dòng mỗi lần, nên phải lặp theo start cho tới khi hết. Dừng khi một trang không
    // thêm được id mới nào (phòng trường hợp máy chủ bỏ qua start/limit và trả lại trang đầu mãi).
    private async Task<List<GlpiAsset>> GetAssetsAsync(string endpoint, string label, CancellationToken ct)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Chưa cấu hình kết nối GLPI (thiếu BaseUrl/ClientId/Username/Password trong appsettings).");

        const int pageSize = 100;
        const int maxItems = 50_000;
        var token = await GetAccessTokenAsync(ct);
        var all = new List<GlpiAsset>();
        var seen = new HashSet<int>();

        for (var start = 0; start < maxItems; start += pageSize)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, $"{_options.BaseUrl}{endpoint}?start={start}&limit={pageSize}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var response = await http.SendAsync(request, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogError("GLPI {Label} list request failed ({Status}): {Body}", label, response.StatusCode, body);
                throw new InvalidOperationException($"Không lấy được danh sách {label} từ GLPI (HTTP {(int)response.StatusCode}). Kiểm tra lại đường dẫn {endpoint} trong cấu hình.");
            }

            var page = JsonSerializer.Deserialize<List<GlpiAsset>>(body, SnakeCaseJson) ?? [];
            var added = 0;
            foreach (var item in page)
                if (seen.Add(item.Id)) { all.Add(item); added++; }

            if (page.Count < pageSize || added == 0) break;
        }

        return all;
    }
}
