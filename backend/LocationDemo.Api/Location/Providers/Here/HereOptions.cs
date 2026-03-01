namespace LocationDemo.Api.Location.Providers.Here;

public sealed class HereOptions
{
    public const string SectionName = "Here";

    public string ApiKey { get; init; } = string.Empty;
    public string GeocodeBaseUrl { get; init; } = "https://geocode.search.hereapi.com/v1";
    public string RoutingBaseUrl { get; init; } = "https://router.hereapi.com/v8";
}
