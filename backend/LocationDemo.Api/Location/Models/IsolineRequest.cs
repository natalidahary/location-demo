namespace LocationDemo.Api.Location.Models;

public sealed class IsolineRequest
{
    public Coordinate Origin { get; init; } = new(0, 0);
    public string RangeType { get; init; } = "time";
    public int RangeValue { get; init; } = 600;
    public string TransportMode { get; init; } = "car";
    public string RoutingMode { get; init; } = "fast";
}
