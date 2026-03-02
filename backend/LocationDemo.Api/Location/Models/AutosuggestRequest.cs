namespace LocationDemo.Api.Location.Models;

public sealed class AutosuggestRequest
{
    public string Query { get; init; } = string.Empty;
    public Coordinate? At { get; init; }
    public string? In { get; init; }
    public int? Limit { get; init; }
}
