namespace WareHub.Api.Contracts;

public sealed class LdapOptions
{
    public const string SectionName = "Ldap";

    public string? Host { get; set; }

    public int Port { get; set; } = 389;

    public bool UseSsl { get; set; }

    public string? BaseDn { get; set; }

    public string? BindUsername { get; set; }
    public string? BindPassword { get; set; }

    public string? UserPrincipalSuffix { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(BaseDn)
        && !string.IsNullOrWhiteSpace(BindUsername) && !string.IsNullOrWhiteSpace(BindPassword);
}
