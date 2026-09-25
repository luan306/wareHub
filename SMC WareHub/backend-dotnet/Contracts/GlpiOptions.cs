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

    /// <summary>Đường dẫn lấy danh sách màn hình (Monitor).</summary>
    public string MonitorEndpoint { get; set; } = "/v2.3/Assets/Monitor";

    /// <summary>
    /// Đường dẫn lấy danh sách máy tính bảng. "Tablet Device" là loại tài sản tự định nghĩa trong GLPI nên đường dẫn
    /// dạng /v2.3/Assets/Custom/&lt;tên hệ thống&gt;. Để trống thì tự dò từ tài liệu API của GLPI (tìm mục có chữ "tablet").
    /// </summary>
    public string? TabletEndpoint { get; set; }

    // Chi tiết từng máy tính (CPU/RAM/ổ cứng/IP/hệ điều hành/Office). {id} là mã của máy trong GLPI.
    // Ba đường đầu là đường dẫn chuẩn của GLPI (xem trang Swagger /api.php/doc). Các đường để trống được tự dò
    // từ tài liệu API của GLPI; có thể chỉ định thẳng nếu bản GLPI của bạn khác.
    public string ProcessorEndpoint { get; set; } = "/v2.3/Assets/Computer/{id}/Component/Processor";
    public string MemoryEndpoint { get; set; } = "/v2.3/Assets/Computer/{id}/Component/Memory";
    public string HardDriveEndpoint { get; set; } = "/v2.3/Assets/Computer/{id}/Component/HardDrive";
    public string? NetworkPortEndpoint { get; set; }
    public string? OperatingSystemEndpoint { get; set; }
    public string? SoftwareEndpoint { get; set; }

    /// <summary>
    /// Đường dẫn lấy SIM đang gắn trong 1 điện thoại ({id} là mã điện thoại trong GLPI). Để trống thì tự dò từ tài liệu API
    /// (tìm mục Simcard dưới /Assets/Phone/{id}/...). SIM cho ra số điện thoại (từ Line) và serial ICCID.
    /// </summary>
    public string? SimcardEndpoint { get; set; }

    /// <summary>Tắt (false) nếu chỉ muốn đồng bộ danh sách, không lấy chi tiết từng máy (nhanh hơn nhưng không có CPU/RAM/IP).</summary>
    public bool SyncDetails { get; set; } = true;

    /// <summary>Số máy được hỏi chi tiết cùng lúc. Tăng cho nhanh hơn, giảm nếu GLPI phản hồi chậm/lỗi.</summary>
    public int DetailConcurrency { get; set; } = 6;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(ClientId)
        && !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Password);
}
