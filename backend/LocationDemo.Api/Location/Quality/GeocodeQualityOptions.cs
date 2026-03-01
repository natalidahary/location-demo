namespace LocationDemo.Api.Location.Quality;

public sealed class GeocodeQualityOptions
{
    public const string SectionName = "GeocodeQuality";

    public double MinConfidence { get; init; } = 0.8;
    public bool RequireHouseNumber { get; init; } = true;
    public bool EnforceCityMatch { get; init; } = true;
}
