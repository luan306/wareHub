using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace WareHub.Api.Data;

[Table("users")]
public sealed class User
{
    public int Id { get; set; }
    [Column("username")] public string Username { get; set; } = "";
    [Column("password_hash")] public string PasswordHash { get; set; } = "";
    [Column("full_name")] public string FullName { get; set; } = "";
    public string Role { get; set; } = "staff";
    [Column("is_active")] public bool IsActive { get; set; } = true;
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    public ICollection<PrintHistory> PrintHistory { get; set; } = new List<PrintHistory>();
}

[Table("devices")]
public sealed class Device
{
    public int Id { get; set; }
    public string Ma { get; set; } = "";
    public string Ten { get; set; } = "";
    public string Loai { get; set; } = "";
    public string Kho { get; set; } = "";
    public string? Model { get; set; }
    public string? Cpu { get; set; }
    public string? Ram { get; set; }
    public string? Storage { get; set; }
    [Column("is_active")] public bool IsActive { get; set; }
    [Column("lifecycle_status")] public string LifecycleStatus { get; set; } = "new";
    [Column("user_name")] public string? UserName { get; set; }
    [Column("registered_at")] public DateOnly? RegisteredAt { get; set; }
    [Column("phong_ban")] public string? PhongBan { get; set; }
    [Column("ghi_chu")] public string? GhiChu { get; set; }
    [Column("producer")] public string? Producer { get; set; }
    [Column("ip_address")] public string? IpAddress { get; set; }
    // Lấy từ GLPI khi đồng bộ (dùng làm giá trị mặc định cho phiếu bàn giao): tên hệ điều hành và bản Office.
    [Column("os_name")] public string? OsName { get; set; }
    [Column("office_name")] public string? OfficeName { get; set; }
    /// <summary>Số điện thoại của SIM đang gắn trong máy (điện thoại) — in ở ô Mobile phone number của phiếu bàn giao.</summary>
    [Column("phone_number")] public string? PhoneNumber { get; set; }
    /// <summary>Số serial (ICCID) của SIM.</summary>
    [Column("sim_serial")] public string? SimSerial { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
    public ICollection<PrintHistory> PrintHistory { get; set; } = new List<PrintHistory>();
}

[Table("print_history")]
public sealed class PrintHistory
{
    public int Id { get; set; }
    [Column("device_id")] public int DeviceId { get; set; }
    [Column("user_id")] public int UserId { get; set; }
    [Column("printed_at")] public DateTime PrintedAt { get; set; }
    public Device Device { get; set; } = null!;
    public User User { get; set; } = null!;
}

[Table("device_history")]
public sealed class DeviceHistory
{
    public int Id { get; set; }
    [Column("device_id")] public int DeviceId { get; set; }
    [Column("user_id")] public int UserId { get; set; }
    [Column("field_name")] public string FieldName { get; set; } = "";
    [Column("old_value")] public string? OldValue { get; set; }
    [Column("new_value")] public string? NewValue { get; set; }
    [Column("changed_at")] public DateTime ChangedAt { get; set; }
    public Device Device { get; set; } = null!;
    public User User { get; set; } = null!;
}

[Table("handovers")]
public sealed class Handover
{
    public int Id { get; set; }
    [Column("no")] public string No { get; set; } = "";
    [Column("device_id")] public int? DeviceId { get; set; }
    [Column("device_ma")] public string? DeviceMa { get; set; }
    [Column("full_name")] public string? FullName { get; set; }
    [Column("payload")] public string? Payload { get; set; }
    [Column("user_id")] public int UserId { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}
