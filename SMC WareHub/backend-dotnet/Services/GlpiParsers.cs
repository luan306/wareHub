using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace WareHub.Api.Services;

/// <summary>
/// Đọc phần chi tiết của 1 máy tính từ các phản hồi của GLPI (Component/Processor, Memory, HardDrive, cổng mạng,
/// hệ điều hành, phần mềm) thành chuỗi ngắn gọn để điền vào thiết bị/phiếu bàn giao.
/// Không giả định cứng hình dạng JSON (mỗi phiên bản GLPI hơi khác nhau): tìm tên trong đối tượng lồng nhau
/// (vd. "processor": { "name": ... }) hoặc ở ngay dòng, và bỏ qua những gì không hiểu thay vì báo lỗi.
/// </summary>
public static class GlpiParsers
{
    // Danh sách kết quả có thể là mảng trần, hoặc bọc trong { "items": [...] } / { "data": [...] }.
    public static IReadOnlyList<JsonElement> Items(JsonElement? body)
    {
        if (body is not { } root) return [];
        if (root.ValueKind == JsonValueKind.Array) return root.EnumerateArray().ToList();
        if (root.ValueKind == JsonValueKind.Object)
        {
            foreach (var key in new[] { "items", "data", "results", "rows" })
                if (root.TryGetProperty(key, out var inner) && inner.ValueKind == JsonValueKind.Array)
                    return inner.EnumerateArray().ToList();
            return [root];
        }
        return [];
    }

    // Tên hiển thị của 1 dòng: ưu tiên đối tượng lồng nhau theo khoá gợi ý (processor -> { name }), rồi tới name/designation.
    public static string? NameOf(JsonElement item, params string[] nestedKeys)
    {
        if (item.ValueKind == JsonValueKind.String) return Clean(item.GetString());
        if (item.ValueKind != JsonValueKind.Object) return null;
        foreach (var key in nestedKeys)
        {
            if (!TryGetIgnoreCase(item, key, out var nested)) continue;
            if (nested.ValueKind == JsonValueKind.String && Clean(nested.GetString()) is { } text) return text;
            if (nested.ValueKind == JsonValueKind.Object && DirectName(nested) is { } inner) return inner;
        }
        return DirectName(item);
    }

    private static string? DirectName(JsonElement obj)
    {
        foreach (var key in new[] { "name", "designation", "completename", "label" })
            if (TryGetIgnoreCase(obj, key, out var value) && value.ValueKind == JsonValueKind.String && Clean(value.GetString()) is { } text)
                return text;
        return null;
    }

    private static bool TryGetIgnoreCase(JsonElement obj, string key, out JsonElement value)
    {
        if (obj.ValueKind == JsonValueKind.Object)
            foreach (var property in obj.EnumerateObject())
                if (string.Equals(property.Name, key, StringComparison.OrdinalIgnoreCase)) { value = property.Value; return true; }
        value = default;
        return false;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // Số (MiB) ở dòng hoặc trong đối tượng lồng nhau; chấp nhận cả số lẫn chuỗi số.
    private static double? NumberOf(JsonElement item, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (TryGetIgnoreCase(item, key, out var direct) && ToNumber(direct) is { } n) return n;
            foreach (var property in item.ValueKind == JsonValueKind.Object ? item.EnumerateObject() : [])
                if (property.Value.ValueKind == JsonValueKind.Object && TryGetIgnoreCase(property.Value, key, out var nested) && ToNumber(nested) is { } m) return m;
        }
        return null;
    }

    private static double? ToNumber(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Number => value.GetDouble(),
        JsonValueKind.String when double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
        _ => null,
    };

    // "Intel(R) Core(TM) i5-1335U CPU @ 4.60GHz" -> "Intel Core i5-1335U @ 4.60GHz"
    public static string? Cpu(JsonElement? body)
    {
        var names = Items(body)
            .Select(i => NameOf(i, "processor", "deviceprocessor", "device"))
            .Where(n => n is not null)
            .Select(n => Regex.Replace(Regex.Replace(n!, @"\((R|TM|tm|r)\)", ""), @"\s+CPU\b", "", RegexOptions.IgnoreCase))
            .Select(n => Regex.Replace(n, @"\s+", " ").Trim())
            .Distinct()
            .ToList();
        return names.Count == 0 ? null : string.Join(" + ", names);
    }

    // Tổng dung lượng RAM (GLPI lưu MiB): 1 thanh -> "8GB"; nhiều thanh -> "16GB (2 x 8GB)".
    public static string? Ram(JsonElement? body)
    {
        var sizes = Items(body).Select(i => NumberOf(i, "size", "capacity")).Where(s => s is > 0).Select(s => s!.Value).ToList();
        if (sizes.Count == 0)
        {
            // Không có số: dùng tên (vd. "8GB") nếu có.
            var names = Items(body).Select(i => NameOf(i, "memory", "devicememory", "device")).Where(n => n is not null).Distinct().ToList();
            return names.Count == 0 ? null : string.Join(" + ", names);
        }
        var totalGb = sizes.Sum() / 1024d;
        var text = $"{Round(totalGb)}GB";
        if (sizes.Count > 1 && sizes.Distinct().Count() == 1) text += $" ({sizes.Count} x {Round(sizes[0] / 1024d)}GB)";
        return text;
    }

    // Ổ cứng: ưu tiên tên model do GLPI đặt (vd. "SSD 250 GB"); không có tên thì dùng dung lượng.
    public static string? Storage(JsonElement? body)
    {
        var parts = new List<string>();
        foreach (var item in Items(body))
        {
            var name = NameOf(item, "harddrive", "deviceharddrive", "device");
            var capacityMib = NumberOf(item, "capacity", "size");
            if (name is not null && Regex.IsMatch(name, @"\d\s*(GB|TB|G|T)\b", RegexOptions.IgnoreCase)) parts.Add(Regex.Replace(name, @"(\d)\s+(GB|TB)", "$1$2", RegexOptions.IgnoreCase));
            else if (capacityMib is > 0) parts.Add(FormatStorage(capacityMib.Value, name));
            else if (name is not null) parts.Add(name);
        }
        var distinct = parts.Distinct().ToList();
        return distinct.Count == 0 ? null : string.Join(" + ", distinct);
    }

    private static string FormatStorage(double mib, string? name)
    {
        var gb = mib / 1024d;
        var size = gb >= 1000 ? $"{Round(gb / 1024d)}TB" : $"{Round(gb)}GB";
        return string.IsNullOrWhiteSpace(name) ? size : $"{name} {size}";
    }

    private static string Round(double value) => Math.Round(value, value < 10 ? 1 : 0, MidpointRounding.AwayFromZero).ToString("0.#", CultureInfo.InvariantCulture);

    private static readonly Regex IPv4 = new(@"^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$", RegexOptions.Compiled);
    private static readonly string[] NotAnAddressKeys = ["mask", "netmask", "gateway", "subnet", "dns", "broadcast", "network", "netaddr"];

    // IP: gom mọi chuỗi IPv4 hợp lệ trong phản hồi (trừ mặt nạ mạng/gateway/loopback/link-local), không trùng lặp.
    public static string? Ip(params JsonElement?[] bodies)
    {
        var found = new List<string>();
        foreach (var body in bodies) if (body is { } b) CollectIps(b, "", found);
        var unique = found.Distinct().ToList();
        return unique.Count == 0 ? null : string.Join(", ", unique);
    }

    private static void CollectIps(JsonElement element, string key, List<string> found)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject()) CollectIps(property.Value, property.Name, found);
                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray()) CollectIps(item, key, found);
                break;
            case JsonValueKind.String:
                var text = element.GetString()?.Trim() ?? "";
                if (!IPv4.IsMatch(text)) break;
                if (NotAnAddressKeys.Any(k => key.Contains(k, StringComparison.OrdinalIgnoreCase))) break;
                if (text.StartsWith("127.") || text.StartsWith("169.254.") || text.StartsWith("255.") || text == "0.0.0.0") break;
                found.Add(text);
                break;
        }
    }

    // Hệ điều hành -> đúng tên lựa chọn trong form phiếu (Win 11/10 Professional); loại khác giữ tên gốc của GLPI.
    public static string? Windows(JsonElement? body)
    {
        var name = Items(body)
            .Select(i => AllNames(i).FirstOrDefault(n => n.Contains("windows", StringComparison.OrdinalIgnoreCase)) ?? NameOf(i, "operatingsystem", "operating_system", "os"))
            .FirstOrDefault(n => n is not null);
        return name is null ? null : MapWindows(name);
    }

    public static string MapWindows(string name)
    {
        var pro = Regex.IsMatch(name, @"\bpro(fessional)?\b", RegexOptions.IgnoreCase);
        if (Regex.IsMatch(name, @"windows\s*11", RegexOptions.IgnoreCase) && pro) return "Win 11 Professional";
        if (Regex.IsMatch(name, @"windows\s*10", RegexOptions.IgnoreCase) && pro) return "Win 10 Professional";
        return name;
    }

    // Office: tìm phần mềm có "Office" trong tên; lấy năm/365 nếu có -> "Office 365", "Office 2019"...
    public static string? Office(JsonElement? body)
    {
        var names = Items(body).SelectMany(AllNames).Where(n => (n.Contains("office", StringComparison.OrdinalIgnoreCase) || n.Contains("microsoft 365", StringComparison.OrdinalIgnoreCase)) && !n.Contains("teams", StringComparison.OrdinalIgnoreCase)).ToList();
        if (names.Count == 0) return null;
        // Ưu tiên tên có ghi năm/365 (bản Office thật); "Microsoft Office Professional Plus 2019 - en-us" -> Office 2019.
        foreach (var name in names)
        {
            var m = Regex.Match(name, @"\b(365|2013|2016|2019|2021|2024)\b");
            if (m.Success) return $"Office {m.Value}";
        }
        return names[0];
    }

    private static readonly string[] PhoneNumberKeys = ["caller_num", "callernum", "phonenumber", "phone_number", "msisdn", "number"];
    private static readonly Regex PhoneNumberShape = new(@"^\+?[\d\s.\-()]{8,20}$", RegexOptions.Compiled);

    // SIM của điện thoại: số điện thoại (thường nằm ở "line" gắn với SIM) và serial ICCID (chuỗi số dài ở "serial"/"iccid").
    // Chỉ nhận chuỗi đúng dạng số điện thoại để không điền nhầm mã khác vào ô Mobile phone number.
    public static (string? PhoneNumber, string? Serial) Sim(JsonElement? body)
    {
        string? phone = null, serial = null;
        foreach (var item in Items(body))
        {
            WalkSim(item, "", ref phone, ref serial);
            if (phone is not null && serial is not null) break;
        }
        return (phone, serial);
    }

    private static void WalkSim(JsonElement element, string key, ref string? phone, ref string? serial)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject()) WalkSim(property.Value, property.Name, ref phone, ref serial);
                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray()) WalkSim(item, key, ref phone, ref serial);
                break;
            case JsonValueKind.String:
            case JsonValueKind.Number:
                var text = (element.ValueKind == JsonValueKind.String ? element.GetString() : element.GetRawText())?.Trim();
                if (string.IsNullOrEmpty(text)) break;
                var lower = key.ToLowerInvariant();
                if (serial is null && (lower is "serial" or "iccid") && Regex.IsMatch(text, @"^\d{15,22}$")) serial = text;
                else if (phone is null && PhoneNumberKeys.Contains(lower) && PhoneNumberShape.IsMatch(text) && !Regex.IsMatch(text, @"^\d{15,}$")) phone = text;
                break;
        }
    }

    // Mọi chuỗi ở khoá "name" trong cây JSON (phần mềm thường lồng: softwareversion -> software -> name).
    private static IEnumerable<string> AllNames(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (property.Value.ValueKind == JsonValueKind.String && property.Name.Equals("name", StringComparison.OrdinalIgnoreCase) && Clean(property.Value.GetString()) is { } text)
                        yield return text;
                    else
                        foreach (var inner in AllNames(property.Value)) yield return inner;
                }
                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                    foreach (var inner in AllNames(item)) yield return inner;
                break;
        }
    }

    public static string Preview(JsonElement? body, int max = 600)
    {
        if (body is not { } b) return "";
        var text = JsonSerializer.Serialize(b);
        return text.Length <= max ? text : text[..max] + "…";
    }
}
