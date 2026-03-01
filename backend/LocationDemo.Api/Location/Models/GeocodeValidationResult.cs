namespace LocationDemo.Api.Location.Models;

public sealed class GeocodeValidationResult
{
    public GeocodeResult Geocode { get; init; } = new();
    public SpatialValidationResult Validation { get; init; } = new();
    public bool IsAllowed => Validation.IsInside;
}
