using LocationDemo.Api.Location.Models.Shared;

namespace LocationDemo.Api.Location.Models.PoiSearch;

public sealed class PoiSearchRequest
{
    public string Query { get; init; } = string.Empty;
    public Coordinate? At { get; init; }
    public string? In { get; init; }
    public int? Limit { get; init; }
}
