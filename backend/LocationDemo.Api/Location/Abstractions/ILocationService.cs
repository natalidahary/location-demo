namespace LocationDemo.Api.Location.Abstractions;

using LocationDemo.Api.Location.Models;

public interface ILocationService
{
    Task<GeocodeResult> GeocodeAsync(string address, CancellationToken cancellationToken = default);
    Task<RouteResult> GetRouteAsync(Coordinate from, Coordinate to, CancellationToken cancellationToken = default);
}
