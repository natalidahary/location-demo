namespace LocationDemo.Api.Location.Models.Geocode;

public sealed class GeocodeResult
{
    public string FormattedAddress { get; init; } = string.Empty;
    public double Latitude { get; init; }
    public double Longitude { get; init; }
    public string? City { get; init; }
    public double Confidence { get; init; }
    public string? MatchLevel { get; init; }
    public string? HouseNumber { get; init; }
}
