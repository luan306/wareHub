using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace WareHub.Api.Services;

public sealed record GlpiComputerDetails(string? Cpu, string? Ram, string? Storage, string? Ip, string? Windows, string? Office)
{
    public bool HasAny => Cpu is not null || Ram is not null || Storage is not null || Ip is not null || Windows is not null || Office is not null;
}

/// <summary>Gom cảnh báo trong 1 lần đồng bộ chi tiết (mỗi nguồn báo 1 lần, không lặp lại cho từng máy).</summary>
public sealed class GlpiDetailReport
{
    private readonly ConcurrentDictionary<string, string> _warnings = new();
    public IReadOnlyCollection<string> Warnings => _warnings.Values.ToList();
    public void Warn(string key, string message) => _warnings.TryAdd(key, message);
}

public sealed record GlpiPhoneDetails(string? PhoneNumber, string? SimSerial)
{
    public bool HasAny => PhoneNumber is not null || SimSerial is not null;
}

public sealed record GlpiProbeResult(string? SpecUrl, IReadOnlyDictionary<string, string?> Endpoints, IReadOnlyList<GlpiProbeCall> Calls, GlpiComputerDetails Parsed);
public sealed record GlpiProbeCall(string Source, string? Url, int Status, string Preview);

/// <summary>
/// Lấy chi tiết từng máy tính từ GLPI: các bộ phận (bộ xử lý, RAM, ổ cứng), cổng mạng/IP, hệ điều hành, phần mềm.
/// Mỗi nguồn có THỂ có nhiều đường dẫn khả dĩ (candidate) — ví dụ "os" thử lần lượt "OperatingSystem" rồi
/// "Component/OperatingSystem" rồi "Item_OperatingSystem" (các cách đặt tên khác nhau tuỳ bản GLPI) — dùng cái đầu tiên
/// trả về thành công rồi ghi nhớ cho các lần gọi sau (không thử lại từ đầu mỗi lần). Nguồn nào lỗi liên tục sẽ bị bỏ qua
/// cho phần còn lại của lần đồng bộ để không gọi hàng nghìn lần vô ích.
/// </summary>
public sealed partial class GlpiClient
{
    private const int FailuresBeforeSkip = 5;

    private readonly SemaphoreSlim _endpointLock = new(1, 1);
    private Dictionary<string, List<string>>? _endpointCandidates;
    // Đường dẫn đã xác nhận dùng được cho mỗi nguồn (key) trong lần đồng bộ này — gọi thẳng, không thử lại các candidate khác.
    private readonly ConcurrentDictionary<string, string> _confirmedEndpoint = new();
    private string? _specUrl;
    private readonly ConcurrentDictionary<string, int> _sourceFailures = new();
    private readonly ConcurrentDictionary<string, int> _sourceSuccesses = new();

    public bool DetailsEnabled => _options.SyncDetails;

    private string VersionPrefix()
    {
        var index = _options.ComputerEndpoint.IndexOf("/Assets", StringComparison.OrdinalIgnoreCase);
        return index > 0 ? _options.ComputerEndpoint[..index] : "";
    }

    // Tên gọi khác nhau của cùng 1 khái niệm, dùng để nhận diện đường dẫn phù hợp trong tài liệu API (nếu tải được).
    // Không có "net" và "os": bản GLPI của công ty không có route nào lấy IP hay hệ điều hành của Computer qua REST API
    // (đã thử OperatingSystem/Component/OperatingSystem/Item_OperatingSystem, cả 3 đều 404 trên dữ liệu thật) nên không
    // tự dò/đoán nữa, tránh gọi phí công + hiện cảnh báo mỗi lần đồng bộ. Muốn bật lại (bản GLPI khác có hỗ trợ) thì đặt
    // thẳng Glpi:NetworkPortEndpoint / Glpi:OperatingSystemEndpoint.
    private static readonly (string Key, string[] Names)[] DiscoveredSources =
    [
        ("software", ["SoftwareInstallation", "SoftwareInstallations", "Software", "Softwares", "SoftwareVersion", "SoftwareVersions", "Item_SoftwareVersion", "Item_SoftwareVersions"]),
    ];

    // Không dò được từ tài liệu API (hoặc tài liệu không tải được) thì thử lần lượt các cách đặt tên phổ biến của GLPI,
    // từ "chuẩn" nhất tới các biến thể ít gặp hơn.
    private static readonly Dictionary<string, string[]> FallbackTemplates = new()
    {
        ["software"] = ["/Assets/Computer/{id}/SoftwareInstallation", "/Assets/Computer/{id}/Software", "/Assets/Computer/{id}/Component/Software", "/Assets/Computer/{id}/Item_SoftwareVersion", "/Assets/Computer/{id}/SoftwareVersion"],
    };

    private async Task EnsureEndpointsAsync(bool refresh, CancellationToken ct)
    {
        if (_endpointCandidates is not null && !refresh) return;
        await _endpointLock.WaitAsync(ct);
        try
        {
            if (_endpointCandidates is not null && !refresh) return;
            var prefix = VersionPrefix();
            var map = new Dictionary<string, List<string>>
            {
                ["cpu"] = [_options.ProcessorEndpoint],
                ["ram"] = [_options.MemoryEndpoint],
                ["hdd"] = [_options.HardDriveEndpoint],
            };
            // "net"/"os" chỉ chạy khi admin tự đặt thẳng đường dẫn (đã xác nhận bản GLPI mặc định không có route nào cho
            // IP/hệ điều hành của Computer) — không có thì để rỗng, FetchSourceAsync bỏ qua ngay, không tốn cuộc gọi và
            // không báo cảnh báo.
            map["net"] = Blank(_options.NetworkPortEndpoint) is { } netEndpoint ? [netEndpoint] : [];
            map["os"] = Blank(_options.OperatingSystemEndpoint) is { } osEndpoint ? [osEndpoint] : [];
            var explicitValues = new Dictionary<string, string?>
            {
                ["software"] = Blank(_options.SoftwareEndpoint),
            };
            List<string>? specPaths = null;
            foreach (var (key, names) in DiscoveredSources)
            {
                if (explicitValues[key] is { } explicitEndpoint) { map[key] = [explicitEndpoint]; continue; }
                specPaths ??= await LoadSpecPathsAsync(prefix, ct);
                var discovered = specPaths
                    .Select(p => new { Path = p, Match = Regex.Match(p, @"/Assets/Computer/\{[^}]+\}/([^/]+)$", RegexOptions.IgnoreCase) })
                    .Where(x => x.Match.Success && names.Contains(x.Match.Groups[1].Value, StringComparer.OrdinalIgnoreCase))
                    .OrderBy(x => Array.FindIndex(names, n => n.Equals(x.Match.Groups[1].Value, StringComparison.OrdinalIgnoreCase)))
                    .Select(x => x.Path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? x.Path : prefix + x.Path);
                var fallbacks = FallbackTemplates[key].Select(t => prefix + t);
                map[key] = discovered.Concat(fallbacks).Distinct().ToList();
            }
            _endpointCandidates = map;
            // Cấu hình có thể vừa được admin sửa lại — thử lại từ đầu thay vì cứ dùng mãi đường dẫn đã xác nhận trước đó.
            if (refresh) _confirmedEndpoint.Clear();
        }
        finally
        {
            _endpointLock.Release();
        }
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // Tài liệu OpenAPI của GLPI (đường dẫn thay đổi theo phiên bản nên thử vài chỗ). Không tải được thì trả về danh sách rỗng.
    private async Task<List<string>> LoadSpecPathsAsync(string prefix, CancellationToken ct)
    {
        var token = await GetAccessTokenAsync(ct);
        foreach (var candidate in new[] { $"{prefix}/doc.json", "/doc.json", $"{prefix}/doc" })
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, $"{_options.BaseUrl}{candidate}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                using var response = await http.SendAsync(request, ct);
                if (!response.IsSuccessStatusCode || response.Content.Headers.ContentType?.MediaType?.Contains("json") != true) continue;
                using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
                if (!doc.RootElement.TryGetProperty("paths", out var paths) || paths.ValueKind != JsonValueKind.Object) continue;
                _specUrl = $"{_options.BaseUrl}{candidate}";
                return paths.EnumerateObject().Where(p => p.Value.ValueKind == JsonValueKind.Object && p.Value.TryGetProperty("get", out _)).Select(p => p.Name).ToList();
            }
            catch (Exception exception) when (exception is HttpRequestException or JsonException or TaskCanceledException)
            {
                logger.LogDebug(exception, "Không đọc được tài liệu API GLPI tại {Candidate}", candidate);
            }
        }
        logger.LogWarning("Không tải được tài liệu API của GLPI để dò đường dẫn chi tiết; dùng đường dẫn mặc định.");
        return [];
    }

    private static readonly Regex IdPlaceholder = new(@"\{[^}]+\}", RegexOptions.Compiled);

    // 1 lần gọi thật sự tới GLPI cho ĐÚNG 1 đường dẫn (không thử candidate khác); tự xin lại token nếu bị 401 một lần.
    private async Task<(JsonElement? Body, int Status, string Url)> FetchOneAsync(string template, int glpiId, CancellationToken ct)
    {
        var url = $"{_options.BaseUrl}{IdPlaceholder.Replace(template, glpiId.ToString(), 1)}";
        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                var token = await GetAccessTokenAsync(ct);
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                using var response = await http.SendAsync(request, ct);
                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized && attempt == 0) { InvalidateToken(); continue; }
                if (!response.IsSuccessStatusCode) return (null, (int)response.StatusCode, url);
                using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
                return (doc.RootElement.Clone(), (int)response.StatusCode, url);
            }
            catch (Exception exception) when (exception is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
            {
                return (null, 0, url);
            }
        }
        return (null, 401, url);
    }

    // Gọi 1 nguồn chi tiết của 1 máy: nguồn đã xác nhận thì gọi thẳng; chưa thì thử lần lượt các candidate tới khi có 1 cái
    // thành công (HTTP 2xx) rồi ghi nhớ cho các máy sau. 404 thì thử candidate kế tiếp; lỗi khác (500, mất mạng...) thì
    // dừng và báo luôn — lỗi đó không tự hết khi đổi đường dẫn.
    private async Task<(JsonElement? Body, int Status, string? Url)> FetchSourceAsync(string key, int glpiId, GlpiDetailReport? report, CancellationToken ct)
    {
        if (_confirmedEndpoint.TryGetValue(key, out var confirmed))
        {
            var (body, status, url) = await FetchOneAsync(confirmed, glpiId, ct);
            if (body is null) { _sourceFailures.AddOrUpdate(key, 1, (_, n) => n + 1); report?.Warn(key, $"GLPI trả HTTP {status} ở {confirmed} — bỏ qua nguồn này. Kiểm tra/đặt lại đường dẫn trong cấu hình Glpi."); }
            return (body, status, url);
        }

        var candidates = _endpointCandidates?.GetValueOrDefault(key) ?? [];
        if (candidates.Count == 0) return (null, 0, null);
        if (_sourceFailures.GetValueOrDefault(key) >= FailuresBeforeSkip && _sourceSuccesses.GetValueOrDefault(key) == 0) return (null, 0, candidates[0]);

        var tried = new List<string>();
        foreach (var template in candidates)
        {
            var (body, status, url) = await FetchOneAsync(template, glpiId, ct);
            tried.Add($"{template} (HTTP {status})");
            if (body is not null)
            {
                _confirmedEndpoint[key] = template;
                _sourceSuccesses.AddOrUpdate(key, 1, (_, n) => n + 1);
                return (body, status, url);
            }
            if (status is not (404 or 0)) // lỗi khác 404: nguồn có tồn tại nhưng đang lỗi, đổi đường dẫn khác cũng vô ích
            {
                _sourceFailures.AddOrUpdate(key, 1, (_, n) => n + 1);
                report?.Warn(key, $"GLPI trả HTTP {status} ở {template} — bỏ qua nguồn này. Kiểm tra/đặt lại đường dẫn trong cấu hình Glpi.");
                return (null, status, url);
            }
            if (status == 0)
            {
                _sourceFailures.AddOrUpdate(key, 1, (_, n) => n + 1);
                report?.Warn(key, $"Lỗi khi gọi {template} (mất kết nối hoặc quá thời gian chờ).");
                return (null, 0, url);
            }
        }
        _sourceFailures.AddOrUpdate(key, 1, (_, n) => n + 1);
        report?.Warn(key, candidates.Count > 1
            ? $"GLPI không có đường dẫn nào khớp cho '{key}' — đã thử: {string.Join("; ", tried)}. Đặt đúng đường dẫn trong cấu hình Glpi."
            : $"GLPI trả HTTP 404 ở {candidates[0]} — bỏ qua nguồn này. Kiểm tra/đặt lại đường dẫn trong cấu hình Glpi.");
        return (null, 404, candidates[^1]);
    }

    private GlpiComputerDetails ParseDetails(JsonElement? cpu, JsonElement? ram, JsonElement? hdd, JsonElement? net, JsonElement? os, JsonElement? software) =>
        new(GlpiParsers.Cpu(cpu), GlpiParsers.Ram(ram), GlpiParsers.Storage(hdd), GlpiParsers.Ip(net), GlpiParsers.Windows(os), GlpiParsers.Office(software));

    public async Task<GlpiComputerDetails> GetComputerDetailsAsync(int glpiId, GlpiDetailReport report, CancellationToken ct = default)
    {
        await EnsureEndpointsAsync(false, ct);
        var cpu = FetchSourceAsync("cpu", glpiId, report, ct);
        var ram = FetchSourceAsync("ram", glpiId, report, ct);
        var hdd = FetchSourceAsync("hdd", glpiId, report, ct);
        var net = FetchSourceAsync("net", glpiId, report, ct);
        var os = FetchSourceAsync("os", glpiId, report, ct);
        var software = FetchSourceAsync("software", glpiId, report, ct);
        await Task.WhenAll(cpu, ram, hdd, net, os, software);
        return ParseDetails(cpu.Result.Body, ram.Result.Body, hdd.Result.Body, net.Result.Body, os.Result.Body, software.Result.Body);
    }

    /// <summary>Lấy chi tiết cho nhiều máy, song song có giới hạn (Glpi:DetailConcurrency). Key = mã máy trong GLPI. progress(đã xong, tổng) được gọi sau mỗi máy.</summary>
    public async Task<Dictionary<int, GlpiComputerDetails>> GetDetailsForComputersAsync(IEnumerable<int> glpiIds, GlpiDetailReport report, Action<int, int>? progress = null, CancellationToken ct = default)
    {
        _sourceFailures.Clear();
        _sourceSuccesses.Clear();
        await EnsureEndpointsAsync(true, ct);
        var results = new ConcurrentDictionary<int, GlpiComputerDetails>();
        var ids = glpiIds.Distinct().ToList();
        var completed = 0;
        using var gate = new SemaphoreSlim(Math.Clamp(_options.DetailConcurrency, 1, 20));
        await Task.WhenAll(ids.Select(async id =>
        {
            await gate.WaitAsync(ct);
            try { results[id] = await GetComputerDetailsAsync(id, report, ct); }
            finally { gate.Release(); progress?.Invoke(Interlocked.Increment(ref completed), ids.Count); }
        }));
        return new Dictionary<int, GlpiComputerDetails>(results);
    }

    /// <summary>Công cụ kiểm tra cho admin: gọi mọi nguồn chi tiết của 1 máy và trả về phản hồi thô + kết quả đã đọc.</summary>
    public async Task<GlpiProbeResult> ProbeComputerAsync(int glpiId, CancellationToken ct = default)
    {
        _sourceFailures.Clear();
        _sourceSuccesses.Clear();
        await EnsureEndpointsAsync(true, ct);
        var report = new GlpiDetailReport();
        var keys = new[] { "cpu", "ram", "hdd", "net", "os", "software" };
        var fetched = await Task.WhenAll(keys.Select(async key => (Key: key, Result: await FetchSourceAsync(key, glpiId, report, ct))));
        var byKey = fetched.ToDictionary(x => x.Key, x => x.Result);
        var calls = fetched.Select(x => new GlpiProbeCall(x.Key, x.Result.Url, x.Result.Status, GlpiParsers.Preview(x.Result.Body, 1200))).ToList();
        var parsed = ParseDetails(byKey["cpu"].Body, byKey["ram"].Body, byKey["hdd"].Body, byKey["net"].Body, byKey["os"].Body, byKey["software"].Body);
        var endpointsView = keys.ToDictionary(k => k, string? (k) => _confirmedEndpoint.TryGetValue(k, out var c) ? c : _endpointCandidates?.GetValueOrDefault(k)?.FirstOrDefault());
        return new GlpiProbeResult(_specUrl, endpointsView, calls, parsed);
    }

    /// <summary>Công cụ kiểm tra cho admin: liệt kê đường dẫn thật trong tài liệu API của GLPI có chứa 1 từ khoá (không phân
    /// biệt hoa/thường) — dùng khi các đường dẫn tự đoán (net/os/software) đều sai, để biết tên chuẩn GLPI đang dùng.</summary>
    public async Task<object> ProbeSpecPathsAsync(string? keyword, CancellationToken ct = default)
    {
        var prefix = VersionPrefix();
        var paths = await LoadSpecPathsAsync(prefix, ct);
        var matched = string.IsNullOrWhiteSpace(keyword) ? paths : paths.Where(p => p.Contains(keyword, StringComparison.OrdinalIgnoreCase)).ToList();
        return new { spec_url = _specUrl, total_paths = paths.Count, matched };
    }

    /// <summary>Công cụ kiểm tra cho admin: xem thô vài dòng đầu của danh sách SIM (để đối chiếu tên trường thật, vd MSISDN).</summary>
    public async Task<object> ProbeSimcardsAsync(CancellationToken ct = default)
    {
        var simcards = await GetSimcardsAsync(ct);
        return new
        {
            endpoint = Blank(_options.SimcardListEndpoint) ?? "(tự dò)",
            total = simcards.Count,
            sample = simcards.Take(5).Select(s => new { s.Id, s.Name, s.Serial, user = s.User?.Name, extra_keys = s.Extra?.Keys.ToList() ?? [] }),
        };
    }
}
