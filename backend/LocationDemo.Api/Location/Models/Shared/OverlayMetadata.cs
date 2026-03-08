namespace LocationDemo.Api.Location.Models.Shared;

public sealed class OverlayMetadata
{
    public string? Id { get; set; }
    public string Mode { get; set; } = "manual";
    public double Opacity { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public IReadOnlyList<Coordinate> Corners { get; set; } = Array.Empty<Coordinate>();
    public string? ImageFileName { get; set; }
    public string? ImageContentType { get; set; }
    public string? ImageBlobName { get; set; }
    public string? ImageUrl { get; set; }
    public string? MetadataBlobName { get; set; }
}
