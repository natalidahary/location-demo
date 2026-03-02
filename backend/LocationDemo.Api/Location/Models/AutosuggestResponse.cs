namespace LocationDemo.Api.Location.Models;

public sealed class AutosuggestResponse
{
    public IReadOnlyList<AutosuggestItem> Items { get; init; } = Array.Empty<AutosuggestItem>();
}
