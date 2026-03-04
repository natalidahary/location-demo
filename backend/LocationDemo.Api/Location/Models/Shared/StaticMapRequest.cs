namespace LocationDemo.Api.Location.Models.Shared;

public sealed class StaticMapRequest
{
    public Coordinate Center { get; init; } = new(0, 0);
    public double Zoom { get; init; } = 12;
    public int Width { get; init; } = 512;
    public int Height { get; init; } = 512;
    public IReadOnlyList<Coordinate>? Path { get; init; }
}
