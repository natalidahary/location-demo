namespace LocationDemo.Api.Location.Models;

public sealed class SpatialValidationResult
{
    public string AreaId { get; init; } = string.Empty;
    public bool IsInside { get; init; }
    public string? Reason { get; init; }
}
