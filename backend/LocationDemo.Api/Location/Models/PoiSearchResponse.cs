namespace LocationDemo.Api.Location.Models;

public sealed class PoiSearchResponse
{
    public IReadOnlyList<PoiSearchItem> Items { get; init; } = Array.Empty<PoiSearchItem>();
}
