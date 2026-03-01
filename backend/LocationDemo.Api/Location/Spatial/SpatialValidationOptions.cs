namespace LocationDemo.Api.Location.Spatial;

public sealed class SpatialValidationOptions
{
    public const string SectionName = "SpatialValidation";

    public string GeoJsonPath { get; init; } = "Location/Data/service-areas.geojson";
    public string DefaultAreaId { get; init; } = "";
}
