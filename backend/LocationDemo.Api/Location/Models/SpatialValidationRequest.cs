namespace LocationDemo.Api.Location.Models;

public sealed class SpatialValidationRequest
{
    public string AreaId { get; init; } = string.Empty;
    public Coordinate Coordinate { get; init; } = new(0, 0);
}
