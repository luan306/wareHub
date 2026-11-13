namespace WareHub.Api.Services;

public sealed class GlpiTokenCache
{
    public string? Token { get; set; }
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.MinValue;
    public SemaphoreSlim Lock { get; } = new(1, 1);
}
