namespace LocationDemo.Api.Location.Models;

public sealed class PoiSearchItem
{
    public string Title { get; init; } = string.Empty;
    public string? Id { get; init; }
    public string? AddressLabel { get; init; }
    public string? Category { get; init; }
    public Coordinate? Position { get; init; }
    public double? DistanceMeters { get; init; }
}
