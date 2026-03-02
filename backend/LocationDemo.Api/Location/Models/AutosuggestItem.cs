namespace LocationDemo.Api.Location.Models;

public sealed class AutosuggestItem
{
    public string Title { get; init; } = string.Empty;
    public string? Id { get; init; }
    public string? ResultType { get; init; }
    public string? AddressLabel { get; init; }
    public string? City { get; init; }
    public Coordinate? Position { get; init; }
}
