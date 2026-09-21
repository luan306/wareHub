namespace WareHub.Api.Contracts;

/// <summary>
/// Cấu hình kết nối tới GLPI High-Level REST API (OAuth2 "password" grant).
/// Đọc từ appsettings.Development.json (local) hoặc biến môi trường Glpi__* (Docker).
/// </summary>
public sealed class GlpiOptions
{
    public const string SectionName = "Glpi";

    /// <summary>Vd: https://glpi.smcmfg.com.vn/api.php — KHÔNG có dấu / ở cuối.</summary>
    public string? BaseUrl { get; set; }
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }

    /// <summary>Tài khoản dịch vụ dùng để đăng nhập lấy token (nên tạo tài khoản riêng, chỉ quyền đọc).</summary>
    public string? Username { get; set; }
    public string? Password { get; set; }

    public string Scope { get; set; } = "api";

    /// <summary>Đường dẫn (không kèm BaseUrl) để lấy danh sách máy tính. Có thể chỉnh nếu khác API version.</summary>
    public string ComputerEndpoint { get; set; } = "/v2.3/Assets/Computer";

    /// <summary>Đường dẫn lấy danh sách điện thoại (Phone) từ GLPI.</summary>
    public string PhoneEndpoint { get; set; } = "/v2.3/Assets/Phone";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(ClientId)
        && !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Password);
}
