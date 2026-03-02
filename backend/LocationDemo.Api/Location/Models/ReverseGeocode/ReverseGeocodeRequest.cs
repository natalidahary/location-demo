using LocationDemo.Api.Location.Models.Shared;

namespace LocationDemo.Api.Location.Models.ReverseGeocode;

public sealed class ReverseGeocodeRequest
{
    public Coordinate Coordinate { get; init; } = new(0, 0);
}
