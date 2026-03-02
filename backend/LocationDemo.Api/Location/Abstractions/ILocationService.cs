using LocationDemo.Api.Location.Models.Autosuggest;
using LocationDemo.Api.Location.Models.Geocode;
using LocationDemo.Api.Location.Models.Isoline;
using LocationDemo.Api.Location.Models.PoiSearch;
using LocationDemo.Api.Location.Models.Route;
using LocationDemo.Api.Location.Models.Shared;

namespace LocationDemo.Api.Location.Abstractions;

public interface ILocationService
{
    Task<GeocodeResult> GeocodeAsync(string address, CancellationToken cancellationToken = default);
    Task<RouteResult> GetRouteAsync(Coordinate from, Coordinate to, CancellationToken cancellationToken = default);
    Task<AutosuggestResponse> AutosuggestAsync(AutosuggestRequest request, CancellationToken cancellationToken = default);
    Task<GeocodeResult> ReverseGeocodeAsync(Coordinate coordinate, CancellationToken cancellationToken = default);
    Task<IsolineResponse> GetIsolineAsync(IsolineRequest request, CancellationToken cancellationToken = default);
    Task<PoiSearchResponse> SearchPoiAsync(PoiSearchRequest request, CancellationToken cancellationToken = default);
}
