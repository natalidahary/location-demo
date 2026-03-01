using System.Collections.Concurrent;
using LocationDemo.Api.Location.Models;
using Microsoft.Extensions.Options;
using NetTopologySuite.Features;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using ModelCoordinate = LocationDemo.Api.Location.Models.Coordinate;
using NtsCoordinate = NetTopologySuite.Geometries.Coordinate;

namespace LocationDemo.Api.Location.Spatial;

public sealed class GeoJsonSpatialValidator : ISpatialValidator
{
    private readonly SpatialValidationOptions _options;
    private readonly IHostEnvironment _environment;
    private readonly GeometryFactory _geometryFactory;
    private readonly Lazy<IReadOnlyDictionary<string, Geometry>> _areas;

    public GeoJsonSpatialValidator(IOptions<SpatialValidationOptions> options, IHostEnvironment environment)
    {
        _options = options.Value;
        _environment = environment;
        _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
        _areas = new Lazy<IReadOnlyDictionary<string, Geometry>>(LoadAreas);
    }

    public Task<SpatialValidationResult> IsInsideAsync(string areaId, ModelCoordinate coordinate, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(areaId))
        {
            throw new ArgumentException("AreaId is required.", nameof(areaId));
        }

        var areas = _areas.Value;
        if (!areas.TryGetValue(areaId, out var geometry))
        {
            return Task.FromResult(new SpatialValidationResult
            {
                AreaId = areaId,
                IsInside = false,
                Reason = "Area not found."
            });
        }

        var point = _geometryFactory.CreatePoint(new NtsCoordinate(coordinate.Longitude, coordinate.Latitude));
        var isInside = geometry.Covers(point);

        return Task.FromResult(new SpatialValidationResult
        {
            AreaId = areaId,
            IsInside = isInside,
            Reason = isInside ? null : "Point is outside the area."
        });
    }

    private IReadOnlyDictionary<string, Geometry> LoadAreas()
    {
        var path = _options.GeoJsonPath;
        if (!Path.IsPathRooted(path))
        {
            path = Path.Combine(_environment.ContentRootPath, path);
        }

        if (!File.Exists(path))
        {
            return new Dictionary<string, Geometry>(StringComparer.OrdinalIgnoreCase);
        }

        var json = File.ReadAllText(path);
        if (string.IsNullOrWhiteSpace(json))
        {
            return new Dictionary<string, Geometry>(StringComparer.OrdinalIgnoreCase);
        }

        var reader = new GeoJsonReader();
        var featureCollection = reader.Read<FeatureCollection>(json);

        var results = new Dictionary<string, Geometry>(StringComparer.OrdinalIgnoreCase);

        foreach (var feature in featureCollection)
        {
            if (feature.Geometry is null)
            {
                continue;
            }

            var id = ResolveFeatureId(feature);
            if (string.IsNullOrWhiteSpace(id))
            {
                continue;
            }

            results[id] = feature.Geometry;
        }

        return results;
    }

    private static string? ResolveFeatureId(IFeature feature)
    {
        if (feature.Attributes is null)
        {
            return null;
        }

        if (feature.Attributes.Exists("id"))
        {
            return feature.Attributes["id"]?.ToString();
        }

        if (feature.Attributes.Exists("name"))
        {
            return feature.Attributes["name"]?.ToString();
        }

        return null;
    }
}
