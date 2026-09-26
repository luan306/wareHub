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
/// Đường dẫn lấy từ cấu hình; đường nào để trống thì dò trong tài liệu OpenAPI của GLPI (nếu tải được), không thấy thì thử
/// đường dẫn mặc định. Nguồn nào lỗi liên tục sẽ bị bỏ qua cho phần còn lại của lần đồng bộ để không gọi hàng nghìn lần vô ích.
/// </summary>
public sealed partial class GlpiClient
{
    private const int FailuresBeforeSkip = 5;

    private readonly SemaphoreSlim _endpointLock = new(1, 1);
    private Dictionary<string, string?>? _endpoints;
    private string? _specUrl;
    private readonly ConcurrentDictionary<string, int> _sourceFailures = new();
    private readonly ConcurrentDictionary<string, int> _sourceSuccesses = new();

    public bool DetailsEnabled => _options.SyncDetails;

    private string VersionPrefix()
    {
        var index = _options.ComputerEndpoint.IndexOf("/Assets", StringComparison.OrdinalIgnoreCase);
        return index > 0 ? _options.ComputerEndpoint[..index] : "";
    }

    private static readonly (string Key, string[] Names)[] DiscoveredSources =
    [
        ("net", ["NetworkPort", "NetworkPorts", "IPAddress", "IPAddresses", "NetworkName", "NetworkNames"]),
        ("os", ["OperatingSystem", "OperatingSystems", "OS"]),
        ("software", ["Software", "Softwares", "SoftwareVersion", "SoftwareVersions"]),
    ];

    private async Task EnsureEndpointsAsync(bool refresh, CancellationToken ct)
    {
        if (_endpoints is not null && !refresh) return;
        await _endpointLock.WaitAsync(ct);
        try
        {
            if (_endpoints is not null && !refresh) return;
            var prefix = VersionPrefix();
            var map = new Dictionary<string, string?>
            {
                ["cpu"] = Blank(_options.ProcessorEndpoint),
                ["ram"] = Blank(_options.MemoryEndpoint),
                ["hdd"] = Blank(_options.HardDriveEndpoint),
                ["net"] = Blank(_options.NetworkPortEndpoint),
                ["os"] = Blank(_options.OperatingSystemEndpoint),
                ["software"] = Blank(_options.SoftwareEndpoint),
                ["sim"] = Blank(_options.SimcardEndpoint),
            };
            if (map.Where(kv => kv.Key != "sim").Any(kv => kv.Value is null))
            {
                var paths = await LoadSpecPathsAsync(prefix, ct);
                foreach (var (key, names) in DiscoveredSources)
                {
                    if (map[key] is not null) continue;
                    map[key] = paths.Select(p => new { Path = p, Match = Regex.Match(p, @"/Assets/Computer/\{[^}]+\}/([^/]+)$", RegexOptions.IgnoreCase) })
                        .Where(x => x.Match.Success && names.Contains(x.Match.Groups[1].Value, StringComparer.OrdinalIgnoreCase))
                        .OrderBy(x => Array.FindIndex(names, n => n.Equals(x.Match.Groups[1].Value, StringComparison.OrdinalIgnoreCase)))
                        .Select(x => x.Path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? x.Path : prefix + x.Path)
                        .FirstOrDefault()
                        // Không dò được (không tải được tài liệu API): thử tên chuẩn của GLPI.
                        ?? $"{prefix}/Assets/Computer/{{id}}/{names[0]}";
                }
            }
            if (map["sim"] is null)
            {
                var simNames = new[] { "Simcard", "SimCard", "Simcards", "SimCards", "DeviceSimcard" };
                var paths = await LoadSpecPathsAsync(prefix, ct);
                map["sim"] = paths.Select(p => new { Path = p, Match = Regex.Match(p, @"/Assets/Phone/\{[^}]+\}/(?:Component/)?([^/]+)$", RegexOptions.IgnoreCase) })
                    .Where(x => x.Match.Success && simNames.Contains(x.Match.Groups[1].Value, StringComparer.OrdinalIgnoreCase))
                    .Select(x => x.Path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? x.Path : prefix + x.Path)
                    .FirstOrDefault()
                    ?? $"{prefix}/Assets/Phone/{{id}}/Component/Simcard";
            }
            _endpoints = map;
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

    // Gọi 1 nguồn chi tiết của 1 máy. Trả về null nếu nguồn không có/lỗi (đã ghi cảnh báo, không ném lỗi).
    private async Task<(JsonElement? Body, int Status, string? Url)> FetchSourceAsync(string key, int glpiId, GlpiDetailReport? report, CancellationToken ct)
    {
        var template = _endpoints![key];
        if (template is null) return (null, 0, null);
        if (_sourceFailures.GetValueOrDefault(key) >= FailuresBeforeSkip && _sourceSuccesses.GetValueOrDefault(key) == 0) return (null, 0, template);

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
                if (!response.IsSuccessStatusCode)
                {
                    _sourceFailures.AddOrUpdate(key, 1, (_, n) => n + 1);
                    report?.Warn(key, $"GLPI trả HTTP {(int)response.StatusCode} ở {template} — bỏ qua nguồn này. Kiểm tra/đặt lại đường dẫn trong cấu hình Glpi.");
                    return (null, (int)response.StatusCode, url);
                }
                using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
                _sourceSuccesses.AddOrUpdate(key, 1, (_, n) => n + 1);
                return (doc.RootElement.Clone(), (int)response.StatusCode, url);
            }
            catch (Exception exception) when (exception is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
            {
                _sourceFailures.AddOrUpdate(key, 1, (_, n) => n + 1);
                report?.Warn(key, $"Lỗi khi gọi {template}: {exception.Message}");
                return (null, 0, url);
            }
        }
        return (null, 401, url);
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

    /// <summary>SIM (số điện thoại + serial) của nhiều điện thoại, song song có giới hạn. Key = mã điện thoại trong GLPI. progress(đã xong, tổng) được gọi sau mỗi máy.</summary>
    public async Task<Dictionary<int, GlpiPhoneDetails>> GetDetailsForPhonesAsync(IEnumerable<int> glpiIds, GlpiDetailReport report, Action<int, int>? progress = null, CancellationToken ct = default)
    {
        _sourceFailures.Clear();
        _sourceSuccesses.Clear();
        await EnsureEndpointsAsync(true, ct);
        var results = new ConcurrentDictionary<int, GlpiPhoneDetails>();
        var ids = glpiIds.Distinct().ToList();
        var completed = 0;
        using var gate = new SemaphoreSlim(Math.Clamp(_options.DetailConcurrency, 1, 20));
        await Task.WhenAll(ids.Select(async id =>
        {
            await gate.WaitAsync(ct);
            try
            {
                var sim = await FetchSourceAsync("sim", id, report, ct);
                var (number, serial) = GlpiParsers.Sim(sim.Body);
                results[id] = new GlpiPhoneDetails(number, serial);
            }
            finally { gate.Release(); progress?.Invoke(Interlocked.Increment(ref completed), ids.Count); }
        }));
        return new Dictionary<int, GlpiPhoneDetails>(results);
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

    /// <summary>Công cụ kiểm tra SIM của 1 điện thoại: đường dẫn đang dùng, phản hồi thô và số điện thoại/serial đọc được.</summary>
    public async Task<object> ProbePhoneAsync(int glpiId, CancellationToken ct = default)
    {
        _sourceFailures.Clear();
        _sourceSuccesses.Clear();
        await EnsureEndpointsAsync(true, ct);
        var report = new GlpiDetailReport();
        var sim = await FetchSourceAsync("sim", glpiId, report, ct);
        var (number, serial) = GlpiParsers.Sim(sim.Body);
        return new { spec_url = _specUrl, endpoint = _endpoints!["sim"], url = sim.Url, status = sim.Status, preview = GlpiParsers.Preview(sim.Body, 1500), parsed = new { phone_number = number, sim_serial = serial }, warnings = report.Warnings };
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
        return new GlpiProbeResult(_specUrl, new Dictionary<string, string?>(_endpoints!), calls, parsed);
    }
}
