namespace LocationDemo.Api.Location.Models.Autosuggest;

public sealed class AutosuggestResponse
{
    public IReadOnlyList<AutosuggestItem> Items { get; init; } = Array.Empty<AutosuggestItem>();
}
