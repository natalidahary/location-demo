namespace LocationDemo.Api.Location.Models;

public sealed class GeocodeRequest
{
    public string Address { get; init; } = string.Empty;
    public string? City { get; init; }
}
