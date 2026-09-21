using System.Text.Json;
using System.Text.Json.Serialization;

namespace WareHub.Api.Contracts;

public sealed record LoginRequest(string? Username, string? Password);
public sealed record DeviceRequest(string? Ma, string? Ten, string? Loai, string? Model, string? Cpu, string? Ram, string? Storage, bool IsActive = false, string? UserName = null, DateOnly? RegisteredAt = null, string? PhongBan = null, string? GhiChu = null, string? Producer = null, string? IpAddress = null);
public sealed record CloneRequest(string? Ma, bool IsActive = true);
public sealed record UserCreateRequest(string? Username, string? Password, string? FullName, string Role = "staff");
public sealed record UserUpdateRequest(string? FullName, string? Role, bool? IsActive, string? Password);
public sealed record HandoverRequest(int? DeviceId, DateOnly? RegisterDate, string? FullName, JsonElement? Data = null);
public sealed record HandoverUpdateRequest(string? FullName, JsonElement? Data = null);
public sealed record PrintRequest([property: JsonPropertyName("deviceIds")] int[]? DeviceIds);
