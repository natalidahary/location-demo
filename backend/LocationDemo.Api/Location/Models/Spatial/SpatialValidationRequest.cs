using LocationDemo.Api.Location.Models.Shared;

namespace LocationDemo.Api.Location.Models.Spatial;
public sealed class SpatialValidationRequest
{
    public string AreaId { get; init; } = string.Empty;
    public Coordinate Coordinate { get; init; } = new(0, 0);
}
