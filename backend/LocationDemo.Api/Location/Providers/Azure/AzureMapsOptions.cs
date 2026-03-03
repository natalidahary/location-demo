namespace LocationDemo.Api.Location.Providers.Azure;

public sealed class AzureMapsOptions
{
    public const string SectionName = "AzureMaps";

    public string SubscriptionKey { get; init; } = string.Empty;
    public string BaseUrl { get; init; } = "https://atlas.microsoft.com";
    public string Language { get; init; } = "he-IL";
    public string CountrySet { get; init; } = "IL";
}
