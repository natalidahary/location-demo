using LocationDemo.Api.Location.Models.Shared;

namespace LocationDemo.Api.Location.Models.Route;

public sealed class RouteRequest
{
    public Coordinate From { get; init; } = new(0, 0);
    public Coordinate To { get; init; } = new(0, 0);
}
