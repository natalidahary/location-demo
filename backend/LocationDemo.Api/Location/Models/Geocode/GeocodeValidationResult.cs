using LocationDemo.Api.Location.Models.Spatial;

namespace LocationDemo.Api.Location.Models.Geocode;

public sealed class GeocodeValidationResult
{
    public GeocodeResult Geocode { get; init; } = new();
    public SpatialValidationResult Validation { get; init; } = new();
    public bool IsAllowed => Validation.IsInside;
}
