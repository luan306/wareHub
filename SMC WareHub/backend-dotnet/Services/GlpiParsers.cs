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

    private static readonly Regex IPv4Anywhere = new(@"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b", RegexOptions.Compiled);

    // Tách IP từ HTML thô của tab "Network ports" (GlpiClient.FetchNetworkPortTabAsync — trang web GLPI, không phải JSON của
    // REST API). Không có cấu trúc rõ ràng như JSON nên chỉ dò mọi chuỗi trông giống IPv4 trong trang, loại bỏ loopback/mặt
    // nạ mạng/broadcast và những chỗ có nhãn "netmask"/"gateway"/"subnet" đứng ngay trước đó (đoán theo ngữ cảnh xung quanh).
    public static string? ExtractIpFromHtml(string html)
    {
        var found = new List<string>();
        foreach (Match match in IPv4Anywhere.Matches(html))
        {
            var text = match.Value;
            if (text.StartsWith("127.") || text.StartsWith("169.254.") || text.StartsWith("255.") || text == "0.0.0.0") continue;
            var contextStart = Math.Max(0, match.Index - 80);
            var context = html[contextStart..match.Index].ToLowerInvariant();
            if (NotAnAddressKeys.Any(context.Contains)) continue;
            found.Add(text);
        }
        return found.Count == 0 ? null : string.Join(", ", found.Distinct());
    }

    private static readonly Regex InputTag = new(@"<input\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Tách giá trị của 1 ô nhập (input) trong HTML thô của 1 tab GLPI, tìm theo thuộc tính name (không phân biệt hoa/thường,
    // không quan tâm thứ tự name/value trong thẻ). Dùng cho các trường không có trong REST API (vd "Delivery form").
    public static string? ExtractInputValueByName(string html, string fieldName)
    {
        foreach (Match tag in InputTag.Matches(html))
        {
            var nameMatch = Regex.Match(tag.Value, """name=["']([^"']+)["']""", RegexOptions.IgnoreCase);
            if (!nameMatch.Success || !string.Equals(nameMatch.Groups[1].Value, fieldName, StringComparison.OrdinalIgnoreCase)) continue;
            var valueMatch = Regex.Match(tag.Value, """value=["']([^"']*)["']""", RegexOptions.IgnoreCase);
            var value = valueMatch.Success ? System.Net.WebUtility.HtmlDecode(valueMatch.Groups[1].Value).Trim() : null;
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
        return null;
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

    private static readonly string[] MsisdnKeys = ["msin", "mobile_subscriber_identification_number", "msisdn", "phone_number", "phonenumber", "number"];

    // GLPI không có sẵn liên kết SIM ↔ điện thoại qua API đáng tin cậy giữa các bản; nên khớp qua NGƯỜI ĐANG DÙNG:
    // 1 SIM và 1 điện thoại cùng gán cho đúng 1 người thì coi SIM đó là của máy đó. Người có từ 2 SIM hoặc 2 điện thoại
    // trở lên thì không đủ để khớp chắc chắn cái nào với cái nào — bỏ qua để tránh gán sai người dùng khác.
    public static Dictionary<int, GlpiPhoneDetails> MatchPhonesByUser(IReadOnlyList<GlpiAsset> phones, IReadOnlyList<GlpiAsset> simcards)
    {
        var simsByUser = simcards
            .Where(s => !string.IsNullOrWhiteSpace(s.User?.Name))
            .GroupBy(s => s.User!.Name!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var result = new Dictionary<int, GlpiPhoneDetails>();
        foreach (var phone in phones)
        {
            var userName = phone.User?.Name?.Trim();
            if (string.IsNullOrWhiteSpace(userName)) continue;
            if (!simsByUser.TryGetValue(userName, out var sims) || sims.Count != 1) continue;
            var sim = sims[0];
            var phoneNumber = MsisdnKeys.Select(sim.ExtraString).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
            result[phone.Id] = new GlpiPhoneDetails(Clean(phoneNumber), Clean(sim.Serial));
        }
        return result;
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
