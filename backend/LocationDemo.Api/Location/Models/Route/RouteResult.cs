using LocationDemo.Api.Location.Models.Shared;

namespace LocationDemo.Api.Location.Models.Route;

public sealed class RouteResult
{
    public double DistanceMeters { get; init; }
    public double DurationSeconds { get; init; }
    public IReadOnlyList<Coordinate> Path { get; init; } = Array.Empty<Coordinate>();
    public string? Polyline { get; init; }
}
