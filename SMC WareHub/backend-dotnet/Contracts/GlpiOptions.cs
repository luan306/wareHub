namespace WareHub.Api.Contracts;

public sealed class GlpiOptions
{
    public const string SectionName = "Glpi";

    public string? BaseUrl { get; set; }
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }

    public string? Username { get; set; }
    public string? Password { get; set; }

    public string Scope { get; set; } = "api";

    public string ComputerEndpoint { get; set; } = "/v2.3/Assets/Computer";

    public string PhoneEndpoint { get; set; } = "/v2.3/Assets/Phone";

    public string MonitorEndpoint { get; set; } = "/v2.3/Assets/Monitor";

    public string PrinterEndpoint { get; set; } = "/v2.3/Assets/Printer";

    public string? TabletEndpoint { get; set; }

    public string ProcessorEndpoint { get; set; } = "/v2.3/Assets/Computer/{id}/Component/Processor";
    public string MemoryEndpoint { get; set; } = "/v2.3/Assets/Computer/{id}/Component/Memory";
    public string HardDriveEndpoint { get; set; } = "/v2.3/Assets/Computer/{id}/Component/HardDrive";
    public string? NetworkPortEndpoint { get; set; }
    public string? OperatingSystemEndpoint { get; set; }
    public string? SoftwareEndpoint { get; set; }

    public string? SimcardListEndpoint { get; set; }

    public bool SyncDetails { get; set; } = true;

    public int DetailConcurrency { get; set; } = 6;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(ClientId)
        && !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Password);
}
