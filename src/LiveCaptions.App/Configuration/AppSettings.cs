namespace LiveCaptions.App.Configuration;

public sealed class AppSettings
{
    public string AzureRegion { get; set; } = "eastus";

    public string RecognitionLanguage { get; set; } = "en-US";

    public string? OutputDeviceId { get; set; }

    public double FontSize { get; set; } = 28;

    public bool StartAutomatically { get; set; }
}
