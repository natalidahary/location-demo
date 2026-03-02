namespace LocationDemo.Api.Location.Models;

public sealed class ReverseGeocodeRequest
{
    public Coordinate Coordinate { get; init; } = new(0, 0);
}
