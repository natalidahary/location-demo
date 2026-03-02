namespace LocationDemo.Api.Location.Abstractions;

using LocationDemo.Api.Location.Models;

public interface ILocationService
{
    Task<GeocodeResult> GeocodeAsync(string address, CancellationToken cancellationToken = default);
    Task<RouteResult> GetRouteAsync(Coordinate from, Coordinate to, CancellationToken cancellationToken = default);
    Task<AutosuggestResponse> AutosuggestAsync(AutosuggestRequest request, CancellationToken cancellationToken = default);
    Task<GeocodeResult> ReverseGeocodeAsync(Coordinate coordinate, CancellationToken cancellationToken = default);
    Task<IsolineResponse> GetIsolineAsync(IsolineRequest request, CancellationToken cancellationToken = default);
}
