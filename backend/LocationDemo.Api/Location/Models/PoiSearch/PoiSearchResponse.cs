namespace LocationDemo.Api.Location.Models.PoiSearch;

public sealed class PoiSearchResponse
{
    public IReadOnlyList<PoiSearchItem> Items { get; init; } = Array.Empty<PoiSearchItem>();
}
