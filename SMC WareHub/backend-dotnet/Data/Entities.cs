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
    [Column("auth_source")] public string AuthSource { get; set; } = "local";
    [Column("is_active")] public bool IsActive { get; set; } = true;
    [Column("created_at")] public DateTime CreatedAt { get; set; }
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
    [Column("os_name")] public string? OsName { get; set; }
    [Column("office_name")] public string? OfficeName { get; set; }
    [Column("phone_number")] public string? PhoneNumber { get; set; }
    [Column("sim_serial")] public string? SimSerial { get; set; }
    [Column("glpi_id")] public int? GlpiId { get; set; }
    [Column("glpi_type")] public string? GlpiType { get; set; }
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
    [Column("printed_by_name")] public string PrintedByName { get; set; } = "";
    [Column("printed_at")] public DateTime PrintedAt { get; set; }
    public Device Device { get; set; } = null!;
}

[Table("device_history")]
public sealed class DeviceHistory
{
    public int Id { get; set; }
    [Column("device_id")] public int DeviceId { get; set; }
    [Column("user_id")] public int UserId { get; set; }
    [Column("changed_by_name")] public string ChangedByName { get; set; } = "";
    [Column("field_name")] public string FieldName { get; set; } = "";
    [Column("old_value")] public string? OldValue { get; set; }
    [Column("new_value")] public string? NewValue { get; set; }
    [Column("changed_at")] public DateTime ChangedAt { get; set; }
    public Device Device { get; set; } = null!;
}

[Table("api_keys")]
public sealed class ApiKey
{
    public int Id { get; set; }
    [Column("name")] public string Name { get; set; } = "";
    [Column("key_hash")] public string KeyHash { get; set; } = "";
    [Column("scopes")] public string Scopes { get; set; } = "";
    [Column("created_by_name")] public string? CreatedByName { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
    [Column("last_used_at")] public DateTime? LastUsedAt { get; set; }
}

[Table("device_loans")]
public sealed class DeviceLoan
{
    public int Id { get; set; }
    [Column("no")] public string No { get; set; } = "";
    [Column("borrower_name")] public string BorrowerName { get; set; } = "";
    [Column("department")] public string? Department { get; set; }
    [Column("employee_id")] public string? EmployeeId { get; set; }
    [Column("cost_center")] public string? CostCenter { get; set; }
    [Column("borrowed_at")] public DateTime BorrowedAt { get; set; }
    [Column("due_at")] public DateTime? DueAt { get; set; }
    [Column("returned_at")] public DateTime? ReturnedAt { get; set; }
    [Column("payload")] public string? Payload { get; set; }
    [Column("signature")] public string? Signature { get; set; }
    [Column("user_id")] public int UserId { get; set; }
    [Column("created_by_name")] public string? CreatedByName { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}

[Table("handovers")]
public sealed class Handover
{
    public int Id { get; set; }
    [Column("no")] public string No { get; set; } = "";
    [Column("kind")] public string Kind { get; set; } = "computer";
    [Column("device_id")] public int? DeviceId { get; set; }
    [Column("device_ma")] public string? DeviceMa { get; set; }
    [Column("full_name")] public string? FullName { get; set; }
    [Column("payload")] public string? Payload { get; set; }
    [Column("user_id")] public int UserId { get; set; }
    [Column("created_by_name")] public string? CreatedByName { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; }
}
