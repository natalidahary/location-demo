using LocationDemo.Api.Location.Models;

namespace LocationDemo.Api.Location.Spatial;

public interface ISpatialValidator
{
    Task<SpatialValidationResult> IsInsideAsync(string areaId, Coordinate coordinate, CancellationToken cancellationToken = default);
}
