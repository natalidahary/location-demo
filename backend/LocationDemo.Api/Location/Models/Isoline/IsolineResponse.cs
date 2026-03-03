using LocationDemo.Api.Location.Models.Shared;

namespace LocationDemo.Api.Location.Models.Isoline;

public sealed class IsolineResponse
{
    public IReadOnlyList<Isoline> Isolines { get; init; } = Array.Empty<Isoline>();
}

public sealed class Isoline
{
    public IsolineRange Range { get; init; } = new();
    public IReadOnlyList<IsolinePolygon> Polygons { get; init; } = Array.Empty<IsolinePolygon>();
}

public sealed class IsolineRange
{
    public string Type { get; init; } = string.Empty;
    public int Value { get; init; }
}

public sealed class IsolinePolygon
{
    public string Outer { get; init; } = string.Empty;
    public IReadOnlyList<Coordinate> Coordinates { get; init; } = Array.Empty<Coordinate>();
}
