using System.Net.Http.Headers;
using System.Text.RegularExpressions;

namespace WareHub.Api.Services;

/// <summary>
/// Lấy IP của máy tính bằng cách "đóng vai người dùng": đăng nhập vào giao diện web GLPI (như khi mở trình duyệt),
/// rồi gọi đúng đường nội bộ mà trang tự dùng để tải tab "Network ports" (glpi/ajax/common.tabs.php), đọc HTML trả về
/// để tách địa chỉ IP ra. Dùng CHUNG tài khoản đã cấu hình (Glpi:Username/Password) — không cần xin thêm quyền gì.
/// Cách này không thuộc bộ REST API chính thức nên PHỤ THUỘC giao diện GLPI hiện tại; nếu công ty nâng cấp/đổi giao diện
/// GLPI, cách đọc HTML này có thể phải chỉnh lại. Vì vậy hiện chỉ dùng qua công cụ kiểm tra (glpi-probe-ip), CHƯA nối
/// vào lần đồng bộ hàng loạt — nối vào sau khi đã xác nhận đọc đúng trên dữ liệu thật.
/// </summary>
public sealed partial class GlpiClient
{
    private string? _webSessionCookie;
    private DateTimeOffset _webSessionExpiresAt = DateTimeOffset.MinValue;
    private readonly SemaphoreSlim _webLoginLock = new(1, 1);

    // BaseUrl cấu hình dạng https://glpi.congty.vn/api.php — bỏ "/api.php" để ra gốc trang web (nơi có /index.php, /ajax/...).
    private string WebBaseUrl()
    {
        var baseUrl = _options.BaseUrl!.TrimEnd('/');
        var index = baseUrl.LastIndexOf("/api.php", StringComparison.OrdinalIgnoreCase);
        return index > 0 ? baseUrl[..index] : baseUrl;
    }

    private static string? ExtractSetCookie(HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var values)) return null;
        var pairs = values.Select(v => v.Split(';')[0]).Where(v => v.Contains('=')).ToList();
        return pairs.Count > 0 ? string.Join("; ", pairs) : null;
    }

    private static readonly Regex CsrfTokenPattern = new("""name=["']_glpi_csrf_token["']\s+value=["']([^"']+)["']""", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Đăng nhập vào giao diện web (khác hẳn đăng nhập API): lấy trang đăng nhập để có mã CSRF + cookie ban đầu, rồi
    // gửi tên đăng nhập/mật khẩu. Phiên nhớ 20 phút, gần hết thì tự đăng nhập lại (xem GetWebSessionCookieAsync).
    private async Task<string> WebLoginAsync(CancellationToken ct)
    {
        var baseUrl = WebBaseUrl();
        using var getRequest = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/index.php");
        using var getResponse = await http.SendAsync(getRequest, ct);
        var loginPageHtml = await getResponse.Content.ReadAsStringAsync(ct);
        var initialCookie = ExtractSetCookie(getResponse);
        var csrfMatch = CsrfTokenPattern.Match(loginPageHtml);

        using var postRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/index.php");
        if (initialCookie is not null) postRequest.Headers.Add("Cookie", initialCookie);
        var form = new Dictionary<string, string> { ["login_name"] = _options.Username!, ["login_password"] = _options.Password! };
        if (csrfMatch.Success) form["_glpi_csrf_token"] = csrfMatch.Groups[1].Value;
        postRequest.Content = new FormUrlEncodedContent(form);
        using var postResponse = await http.SendAsync(postRequest, ct);
        var sessionCookie = ExtractSetCookie(postResponse) ?? initialCookie;
        if (sessionCookie is null)
            throw new InvalidOperationException("Không đăng nhập được vào giao diện web GLPI (không nhận được cookie phiên). Kiểm tra lại Glpi:Username/Password có đăng nhập web được không.");

        _webSessionCookie = sessionCookie;
        _webSessionExpiresAt = DateTimeOffset.UtcNow.AddMinutes(20);
        return sessionCookie;
    }

    private async Task<string> GetWebSessionCookieAsync(CancellationToken ct, bool force = false)
    {
        if (!force && _webSessionCookie is not null && DateTimeOffset.UtcNow < _webSessionExpiresAt) return _webSessionCookie;
        await _webLoginLock.WaitAsync(ct);
        try
        {
            if (!force && _webSessionCookie is not null && DateTimeOffset.UtcNow < _webSessionExpiresAt) return _webSessionCookie;
            return await WebLoginAsync(ct);
        }
        finally { _webLoginLock.Release(); }
    }

    // Trang đăng nhập trả về khi phiên đã hết hạn (thay vì nội dung tab) — nhận diện bằng ô nhập mật khẩu của form đăng nhập.
    private static bool LooksLikeLoginPage(string html) => html.Contains("login_password", StringComparison.OrdinalIgnoreCase);

    /// <summary>Lấy HTML thô của 1 tab trên trang chi tiết Computer trong GLPI (tabName vd "NetworkPort", "Infocom").
    /// glpiId = mã máy trong GLPI. Tự đăng nhập lại 1 lần nếu phiên vừa hết hạn giữa chừng.</summary>
    public async Task<string> FetchTabHtmlAsync(string tabName, int glpiId, CancellationToken ct = default)
    {
        if (!IsConfigured) throw new InvalidOperationException("Chưa cấu hình kết nối GLPI (thiếu BaseUrl/Username/Password trong appsettings).");
        var baseUrl = WebBaseUrl();
        var path = $"/ajax/common.tabs.php?_glpi_tab={tabName}%241&formoptions=data-track-changes%3Dtrue&withtemplate=&_target=%2Ffront%2Fcomputer.form.php&_itemtype=Computer&id={glpiId}";

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var cookie = await GetWebSessionCookieAsync(ct, force: attempt > 0);
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}{path}");
            request.Headers.Add("Cookie", cookie);
            request.Headers.Add("X-Requested-With", "XMLHttpRequest");
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/html"));
            using var response = await http.SendAsync(request, ct);
            var html = await response.Content.ReadAsStringAsync(ct);
            if (response.IsSuccessStatusCode && !LooksLikeLoginPage(html)) return html;
            if (attempt == 0) continue; // phiên có thể vừa hết hạn — đăng nhập lại rồi thử thêm 1 lần
            throw new InvalidOperationException($"Không đọc được tab {tabName} từ giao diện web GLPI (HTTP {(int)response.StatusCode}{(LooksLikeLoginPage(html) ? ", có vẻ bị đưa về trang đăng nhập" : "")}).");
        }
        throw new InvalidOperationException($"Không đọc được tab {tabName} từ giao diện web GLPI.");
    }

    /// <summary>Lấy HTML thô của tab "Network ports" cho 1 máy tính và IP tách được từ đó.</summary>
    public async Task<(string Html, string? Ip)> FetchNetworkPortTabAsync(int glpiId, CancellationToken ct = default)
    {
        var html = await FetchTabHtmlAsync("NetworkPort", glpiId, ct);
        return (html, GlpiParsers.ExtractIpFromHtml(html));
    }

    /// <summary>Lấy HTML thô của tab "Infocom" (thông tin quản lý/tài chính) và số "Delivery form" tách được từ đó.</summary>
    public async Task<(string Html, string? DeliveryForm)> FetchInfocomTabAsync(int glpiId, CancellationToken ct = default)
    {
        var html = await FetchTabHtmlAsync("Infocom", glpiId, ct);
        return (html, GlpiParsers.ExtractInputValueByName(html, "deliveryform"));
    }
}
