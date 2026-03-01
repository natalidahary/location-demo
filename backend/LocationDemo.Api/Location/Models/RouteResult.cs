namespace LocationDemo.Api.Location.Models;

public sealed class RouteResult
{
    public double DistanceMeters { get; init; }
    public double DurationSeconds { get; init; }
    public IReadOnlyList<Coordinate> Path { get; init; } = Array.Empty<Coordinate>();
}
