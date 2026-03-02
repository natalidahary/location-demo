using LocationDemo.Api.Location.Abstractions;
using LocationDemo.Api.Location.Configuration;
using LocationDemo.Api.Location.Models;
using LocationDemo.Api.Location.Quality;
using LocationDemo.Api.Location.Spatial;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddLocationServices(builder.Configuration);
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("AllowFrontend");

app.MapPost("/locations/geocode", async (
    GeocodeRequest request,
    ILocationService service,
    ISpatialValidator validator,
    IOptions<GeocodeQualityOptions> qualityOptions,
    IOptions<SpatialValidationOptions> options,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Address))
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "InvalidAddress",
            "Address is required."));
    }

    var result = await service.GeocodeAsync(request.Address, ct);

    var quality = qualityOptions.Value;
    if (quality.MinConfidence > 0 && result.Confidence < quality.MinConfidence)
    {
        return Results.Conflict(ApiResponse<GeocodeValidationResult>.Fail(
            "LowConfidenceMatch",
            $"Geocoding confidence {result.Confidence:0.00} is below required threshold {quality.MinConfidence:0.00}.",
            new GeocodeValidationResult
            {
                Geocode = result,
                Validation = new SpatialValidationResult
                {
                    AreaId = options.Value.DefaultAreaId,
                    IsInside = false,
                    Reason = "Low confidence match."
                }
            }));
    }

    if (quality.RequireHouseNumber)
    {
        var isHouseLevel = string.Equals(result.MatchLevel, "houseNumber", StringComparison.OrdinalIgnoreCase)
            || !string.IsNullOrWhiteSpace(result.HouseNumber);

        if (!isHouseLevel)
        {
            return Results.Conflict(ApiResponse<GeocodeValidationResult>.Fail(
                "MatchLevelTooLow",
                "Geocoding result is not at house-level precision.",
                new GeocodeValidationResult
                {
                    Geocode = result,
                    Validation = new SpatialValidationResult
                    {
                        AreaId = options.Value.DefaultAreaId,
                        IsInside = false,
                        Reason = "Match level too low."
                    }
                }));
        }
    }

    if (quality.EnforceCityMatch && !string.IsNullOrWhiteSpace(request.City))
    {
        if (!string.Equals(result.City, request.City, StringComparison.OrdinalIgnoreCase))
        {
            return Results.Conflict(ApiResponse<GeocodeValidationResult>.Fail(
                "CityMismatch",
                $"Geocoding city '{result.City ?? "Unknown"}' does not match requested city '{request.City}'.",
                new GeocodeValidationResult
                {
                    Geocode = result,
                    Validation = new SpatialValidationResult
                    {
                        AreaId = options.Value.DefaultAreaId,
                        IsInside = false,
                        Reason = "City mismatch."
                    }
                }));
        }
    }

    var areaId = options.Value.DefaultAreaId;
    if (string.IsNullOrWhiteSpace(areaId))
    {
        return Results.Json(
            ApiResponse<string>.Fail(
                "SpatialValidationNotConfigured",
                "Spatial validation is not configured. Set SpatialValidation:DefaultAreaId."),
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var validation = await validator.IsInsideAsync(areaId, new Coordinate(result.Latitude, result.Longitude), ct);
    var response = new GeocodeValidationResult
    {
        Geocode = result,
        Validation = validation
    };

    if (!validation.IsInside)
    {
        return Results.Conflict(ApiResponse<GeocodeValidationResult>.Fail(
            "OutOfServiceArea",
            $"The address is outside the {validation.AreaId} responsibility zone.",
            response,
            new Dictionary<string, object>
            {
                ["areaId"] = validation.AreaId
            }));
    }

    return Results.Ok(ApiResponse<GeocodeValidationResult>.Ok(response));
})
.WithName("Geocode");

app.MapPost("/locations/route", async (
    RouteRequest request,
    ILocationService service,
    ISpatialValidator validator,
    IOptions<SpatialValidationOptions> options,
    CancellationToken ct) =>
{
    var areaId = options.Value.DefaultAreaId;
    if (string.IsNullOrWhiteSpace(areaId))
    {
        return Results.Json(
            ApiResponse<string>.Fail(
                "SpatialValidationNotConfigured",
                "Spatial validation is not configured. Set SpatialValidation:DefaultAreaId."),
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var fromValidation = await validator.IsInsideAsync(areaId, request.From, ct);
    if (!fromValidation.IsInside)
    {
        return Results.Conflict(ApiResponse<SpatialValidationResult>.Fail(
            "OutOfServiceArea",
            $"The route origin is outside the {fromValidation.AreaId} responsibility zone.",
            new Dictionary<string, object>
            {
                ["areaId"] = fromValidation.AreaId,
                ["point"] = "from"
            }));
    }

    var toValidation = await validator.IsInsideAsync(areaId, request.To, ct);
    if (!toValidation.IsInside)
    {
        return Results.Conflict(ApiResponse<SpatialValidationResult>.Fail(
            "OutOfServiceArea",
            $"The route destination is outside the {toValidation.AreaId} responsibility zone.",
            new Dictionary<string, object>
            {
                ["areaId"] = toValidation.AreaId,
                ["point"] = "to"
            }));
    }

    var result = await service.GetRouteAsync(request.From, request.To, ct);
    return Results.Ok(ApiResponse<RouteResult>.Ok(result));
})
.WithName("Route");

app.MapPost("/locations/autosuggest", async (AutosuggestRequest request, ILocationService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Query))
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "InvalidQuery",
            "Query is required."));
    }

    if (request.At is null && string.IsNullOrWhiteSpace(request.In))
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "InvalidBias",
            "Either 'at' or 'in' must be provided for autosuggest."));
    }

    var result = await service.AutosuggestAsync(request, ct);
    return Results.Ok(ApiResponse<AutosuggestResponse>.Ok(result));
})
.WithName("Autosuggest");

app.MapPost("/locations/reverse-geocode", async (
    ReverseGeocodeRequest request,
    ILocationService service,
    ISpatialValidator validator,
    IOptions<SpatialValidationOptions> options,
    CancellationToken ct) =>
{
    var coordinate = request.Coordinate;
    var result = await service.ReverseGeocodeAsync(coordinate, ct);

    var areaId = options.Value.DefaultAreaId;
    if (string.IsNullOrWhiteSpace(areaId))
    {
        return Results.Json(
            ApiResponse<string>.Fail(
                "SpatialValidationNotConfigured",
                "Spatial validation is not configured. Set SpatialValidation:DefaultAreaId."),
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var validation = await validator.IsInsideAsync(areaId, new Coordinate(result.Latitude, result.Longitude), ct);
    var response = new GeocodeValidationResult
    {
        Geocode = result,
        Validation = validation
    };

    if (!validation.IsInside)
    {
        return Results.Conflict(ApiResponse<GeocodeValidationResult>.Fail(
            "OutOfServiceArea",
            $"The address is outside the {validation.AreaId} responsibility zone.",
            response,
            new Dictionary<string, object>
            {
                ["areaId"] = validation.AreaId
            }));
    }

    return Results.Ok(ApiResponse<GeocodeValidationResult>.Ok(response));
})
.WithName("ReverseGeocode");

app.MapPost("/locations/isoline", async (IsolineRequest request, ILocationService service, CancellationToken ct) =>
{
    var result = await service.GetIsolineAsync(request, ct);
    return Results.Ok(ApiResponse<IsolineResponse>.Ok(result));
})
.WithName("Isoline");

app.MapPost("/locations/poi", async (PoiSearchRequest request, ILocationService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Query))
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "InvalidQuery",
            "Query is required."));
    }

    if (request.At is null && string.IsNullOrWhiteSpace(request.In))
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "InvalidBias",
            "Either 'at' or 'in' must be provided for POI search."));
    }

    var result = await service.SearchPoiAsync(request, ct);
    return Results.Ok(ApiResponse<PoiSearchResponse>.Ok(result));
})
.WithName("PoiSearch");

app.MapPost("/locations/validate", async (SpatialValidationRequest request, ISpatialValidator validator, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.AreaId))
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "InvalidAreaId",
            "AreaId is required."));
    }

    var result = await validator.IsInsideAsync(request.AreaId, request.Coordinate, ct);
    return Results.Ok(ApiResponse<SpatialValidationResult>.Ok(result));
})
.WithName("ValidateLocation");

app.MapGet("/locations/service-areas", (IOptions<SpatialValidationOptions> options, IHostEnvironment env) =>
{
    var path = options.Value.GeoJsonPath;
    if (!Path.IsPathRooted(path))
    {
        path = Path.Combine(env.ContentRootPath, path);
    }

    if (!File.Exists(path))
    {
        return Results.NotFound(ApiResponse<string>.Fail(
            "ServiceAreasNotFound",
            "Service area GeoJSON not found."));
    }

    return Results.File(path, "application/geo+json");
})
.WithName("ServiceAreas");

app.Run();
