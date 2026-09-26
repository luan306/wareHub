using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
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
    // "Delivery form" của máy tính trong GLPI (nếu có) — công ty dùng số này làm số phiếu bàn giao từ trước khi có WareHub.
    public string? Deliveryform { get; set; }
    // Mọi trường JSON không khớp property nào ở trên (vd SIM có "msin" — Mobile Subscriber Identification Number — không
    // có sẵn chỗ chứa riêng): giữ lại thô để đọc thử theo nhiều tên trường khác nhau bằng ExtraString, không cần biết
    // trước chính xác GLPI đặt tên gì.
    [System.Text.Json.Serialization.JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }

    public string? ExtraString(string key)
    {
        if (Extra is null) return null;
        foreach (var (k, v) in Extra)
        {
            if (!string.Equals(k, key, StringComparison.OrdinalIgnoreCase)) continue;
            if (v.ValueKind == JsonValueKind.String) return v.GetString();
            if (v.ValueKind == JsonValueKind.Number) return v.GetRawText();
        }
        return null;
    }
}

/// <summary>
/// Gọi GLPI High-Level REST API (OAuth2 "password" grant) để lấy danh sách máy tính (Computer).
/// Token được cache trong bộ nhớ tới khi gần hết hạn thì tự xin lại — không cần đăng nhập lại mỗi lần gọi.
/// </summary>
public sealed partial class GlpiClient(HttpClient http, IOptions<GlpiOptions> optionsAccessor, ILogger<GlpiClient> logger)
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

    // Token dùng chung cho nhiều yêu cầu song song: chỉ 1 luồng xin token mới, các luồng khác chờ rồi dùng lại.
    private readonly SemaphoreSlim _tokenLock = new(1, 1);

    private void InvalidateToken() => _tokenExpiresAt = DateTimeOffset.MinValue;

    private async Task<string> GetAccessTokenAsync(CancellationToken ct)
    {
        if (_cachedToken is not null && DateTimeOffset.UtcNow < _tokenExpiresAt)
            return _cachedToken;
        await _tokenLock.WaitAsync(ct);
        try
        {
            if (_cachedToken is not null && DateTimeOffset.UtcNow < _tokenExpiresAt)
                return _cachedToken;
            return await RequestTokenAsync(ct);
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private async Task<string> RequestTokenAsync(CancellationToken ct)
    {

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

    public Task<List<GlpiAsset>> GetMonitorsAsync(CancellationToken ct = default) => GetAssetsAsync(_options.MonitorEndpoint, "màn hình", ct);

    public async Task<List<GlpiAsset>> GetTabletsAsync(CancellationToken ct = default)
    {
        var endpoint = Blank(_options.TabletEndpoint);
        if (endpoint is null)
        {
            if (!IsConfigured)
                throw new InvalidOperationException("Chưa cấu hình kết nối GLPI (thiếu BaseUrl/ClientId/Username/Password trong appsettings).");
            var prefix = VersionPrefix();
            var custom = (await LoadSpecPathsAsync(prefix, ct))
                .Select(p => Regex.Match(p, @"/Assets/Custom/([^/{}]+)$", RegexOptions.IgnoreCase))
                .Where(m => m.Success)
                .ToList();
            var found = custom.FirstOrDefault(m => m.Groups[1].Value.Replace("_", "").Replace("-", "").Contains("tablet", StringComparison.OrdinalIgnoreCase));
            if (found is null)
                throw new InvalidOperationException(custom.Count > 0
                    ? $"Không tìm thấy loại tài sản máy tính bảng trong GLPI. Các loại tự định nghĩa có: {string.Join(", ", custom.Select(m => m.Groups[1].Value))}. Đặt Glpi:TabletEndpoint cho đúng."
                    : "Không dò được đường dẫn máy tính bảng (Tablet Device) từ tài liệu API của GLPI. Đặt Glpi:TabletEndpoint, dạng /v2.3/Assets/Custom/<tên hệ thống>.");
            var path = found.Value;
            endpoint = path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? path : prefix + path;
        }
        return await GetAssetsAsync(endpoint, "máy tính bảng", ct);
    }

    // SIM không gắn trực tiếp vào máy qua API (không có "/Assets/Phone/{id}/.../Simcard" đáng tin cậy — thử thì GLPI trả lỗi
    // ở nhiều bản). Thay vào đó lấy TOÀN BỘ danh sách SIM 1 lần rồi khớp với điện thoại theo NGƯỜI ĐANG DÙNG (xem
    // GlpiParsers.MatchPhonesByUser) — không cần biết đúng cấu trúc liên kết SIM↔điện thoại của từng bản GLPI.
    public async Task<List<GlpiAsset>> GetSimcardsAsync(CancellationToken ct = default)
    {
        var endpoint = Blank(_options.SimcardListEndpoint);
        if (endpoint is not null) return await GetAssetsAsync(endpoint, "SIM", ct);

        if (!IsConfigured)
            throw new InvalidOperationException("Chưa cấu hình kết nối GLPI (thiếu BaseUrl/ClientId/Username/Password trong appsettings).");
        var prefix = VersionPrefix();
        var discovered = (await LoadSpecPathsAsync(prefix, ct))
            .Where(p => !p.Contains('{') && p.Contains("simcard", StringComparison.OrdinalIgnoreCase))
            .Select(p => p.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? p : prefix + p);
        var candidates = discovered.Concat([$"{prefix}/Assets/Simcard", $"{prefix}/Assets/DeviceSimcard"]).Distinct().ToList();

        List<string> errors = [];
        foreach (var candidate in candidates)
        {
            try { return await GetAssetsAsync(candidate, "SIM", ct); }
            catch (InvalidOperationException ex) { errors.Add($"{candidate}: {ex.Message}"); }
        }
        throw new InvalidOperationException($"Không tìm được danh sách SIM trong GLPI (đã thử: {string.Join(" | ", candidates)}). Đặt Glpi:SimcardListEndpoint cho đúng.");
    }

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
