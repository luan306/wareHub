namespace WareHub.Api.Contracts;

/// <summary>
/// Cấu hình kết nối tới Active Directory/LDAP công ty, dùng cho: (1) ô "Thêm từ LDAP" ở trang Người dùng (admin
/// tìm theo tên/tài khoản, chọn ra để tạo user WareHub gắn với tài khoản AD đó); (2) xác thực mật khẩu lúc đăng
/// nhập cho những user đã gắn LDAP (User.AuthSource = "ldap") — không áp dụng cho tài khoản local (vd. admin gốc).
/// Đọc từ appsettings.Development.json (local) hoặc biến môi trường Ldap__* (Docker/Windows Service).
/// </summary>
public sealed class LdapOptions
{
    public const string SectionName = "Ldap";

    /// <summary>Địa chỉ domain controller, vd. "dc01.smcmfg.com.vn" hoặc IP nội bộ.</summary>
    public string? Host { get; set; }

    /// <summary>389 (LDAP thường) hoặc 636 (LDAPS, có mã hoá — khuyên dùng nếu domain controller hỗ trợ).</summary>
    public int Port { get; set; } = 389;

    public bool UseSsl { get; set; }

    /// <summary>Gốc cây thư mục để tìm kiếm, vd. "DC=smcmfg,DC=com,DC=vn".</summary>
    public string? BaseDn { get; set; }

    /// <summary>
    /// Tài khoản dịch vụ dùng để tra cứu (search) danh sách người dùng AD — chỉ cần quyền đọc, không cần quyền quản
    /// trị domain. Dạng UPN thường dùng được luôn, vd. "svc-warehub@smcmfg.com.vn".
    /// </summary>
    public string? BindUsername { get; set; }
    public string? BindPassword { get; set; }

    /// <summary>
    /// Phần hậu tố ghép vào tên đăng nhập khi XÁC THỰC MẬT KHẨU người dùng cuối (không phải tài khoản dịch vụ ở trên),
    /// vd. "@smcmfg.com.vn" để "luan.ndt" lúc đăng nhập thành "luan.ndt@smcmfg.com.vn" trước khi bind vào AD.
    /// </summary>
    public string? UserPrincipalSuffix { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(BaseDn)
        && !string.IsNullOrWhiteSpace(BindUsername) && !string.IsNullOrWhiteSpace(BindPassword);
}
