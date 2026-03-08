using LocationDemo.Api.Location.Abstractions;
using LocationDemo.Api.Location.Models.Autosuggest;
using LocationDemo.Api.Location.Models.Geocode;
using LocationDemo.Api.Location.Models.Isoline;
using LocationDemo.Api.Location.Models.PoiSearch;
using LocationDemo.Api.Location.Models.ReverseGeocode;
using LocationDemo.Api.Location.Models.Route;
using LocationDemo.Api.Location.Models.Shared;
using LocationDemo.Api.Location.Models.Spatial;
using LocationDemo.Api.Location.Configuration;
using LocationDemo.Api.Location.Providers.Azure;
using LocationDemo.Api.Location.Quality;
using LocationDemo.Api.Location.Spatial;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.WebUtilities;
using System.Globalization;
using Azure.Storage.Blobs;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

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

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
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

app.MapPost("/overlays", async (HttpRequest request, IConfiguration config, CancellationToken ct) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(ApiResponse<string>.Fail("InvalidForm", "Expected multipart form data."));
    }

    var form = await request.ReadFormAsync(ct);
    var image = form.Files.GetFile("image");
    var metadataJson = form["metadata"].FirstOrDefault();

    if (image is null || string.IsNullOrWhiteSpace(metadataJson))
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "MissingData",
            "Image file and metadata are required."));
    }

    var metadata = JsonSerializer.Deserialize<OverlayMetadata>(metadataJson, new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    });

    if (metadata is null || metadata.Corners.Count != 4)
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "InvalidMetadata",
            "Overlay metadata is invalid."));
    }

    var connectionString =
        config["AZURE_STORAGE_CONNECTION_STRING"]
        ?? config["AzureStorage:ConnectionString"]
        ?? config["ConnectionStrings:AzureStorage"];
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return Results.Json(
            ApiResponse<string>.Fail(
                "StorageNotConfigured",
                "Azure Storage connection string is missing."),
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var container = new BlobContainerClient(connectionString, "overlays");
    await container.CreateIfNotExistsAsync(cancellationToken: ct);

    var id = string.IsNullOrWhiteSpace(metadata.Id) ? Guid.NewGuid().ToString("N") : metadata.Id;
    var ext = Path.GetExtension(image.FileName);
    if (string.IsNullOrWhiteSpace(ext))
    {
        ext = image.ContentType == "image/png" ? ".png" : ".jpg";
    }

    var imageBlobName = $"{id}{ext}";
    var imageBlob = container.GetBlobClient(imageBlobName);
    await using (var stream = image.OpenReadStream())
    {
        await imageBlob.UploadAsync(stream, overwrite: true, cancellationToken: ct);
    }

    metadata.Id = id;
    metadata.ImageFileName = image.FileName;
    metadata.ImageContentType = image.ContentType;
    metadata.ImageBlobName = imageBlobName;
    metadata.ImageUrl = imageBlob.Uri.ToString();
    metadata.CreatedAt = DateTimeOffset.UtcNow;

    var metadataBlobName = $"{id}.json";
    metadata.MetadataBlobName = metadataBlobName;
    var metadataBlob = container.GetBlobClient(metadataBlobName);
    var metadataBytes = JsonSerializer.SerializeToUtf8Bytes(metadata, new JsonSerializerOptions
    {
        WriteIndented = true
    });
    await using (var metaStream = new MemoryStream(metadataBytes))
    {
        await metadataBlob.UploadAsync(metaStream, overwrite: true, cancellationToken: ct);
    }

    return Results.Ok(ApiResponse<OverlayMetadata>.Ok(metadata));
})
.WithName("SaveOverlay");

app.MapDelete("/overlays/{id}", async (string id, IConfiguration config, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(id))
    {
        return Results.BadRequest(ApiResponse<string>.Fail(
            "InvalidId",
            "Overlay id is required."));
    }

    var connectionString =
        config["AZURE_STORAGE_CONNECTION_STRING"]
        ?? config["AzureStorage:ConnectionString"]
        ?? config["ConnectionStrings:AzureStorage"];
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return Results.Json(
            ApiResponse<string>.Fail(
                "StorageNotConfigured",
                "Azure Storage connection string is missing."),
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var container = new BlobContainerClient(connectionString, "overlays");
    await container.CreateIfNotExistsAsync(cancellationToken: ct);

    var metadataBlobName = $"{id}.json";
    var metadataBlob = container.GetBlobClient(metadataBlobName);
    if (!await metadataBlob.ExistsAsync(ct))
    {
        return Results.NotFound(ApiResponse<string>.Fail(
            "OverlayNotFound",
            "Overlay metadata not found."));
    }

    OverlayMetadata? metadata = null;
    await using (var metaStream = new MemoryStream())
    {
        var download = await metadataBlob.DownloadToAsync(metaStream, ct);
        metaStream.Position = 0;
        metadata = await JsonSerializer.DeserializeAsync<OverlayMetadata>(
            metaStream,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true },
            ct);
    }

    if (!string.IsNullOrWhiteSpace(metadata?.ImageBlobName))
    {
        var imageBlob = container.GetBlobClient(metadata.ImageBlobName);
        await imageBlob.DeleteIfExistsAsync(cancellationToken: ct);
    }

    await metadataBlob.DeleteIfExistsAsync(cancellationToken: ct);

    return Results.Ok(ApiResponse<string>.Ok("Deleted"));
})
.WithName("DeleteOverlay");

app.MapPost("/locations/poi", async (
    PoiSearchRequest request,
    ILocationService service,
    ISpatialValidator validator,
    IOptions<SpatialValidationOptions> spatialOptions,
    CancellationToken ct) =>
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
    var areaId = spatialOptions.Value.DefaultAreaId;
    if (string.IsNullOrWhiteSpace(areaId))
    {
        return Results.Problem(
            title: "Spatial validation is not configured.",
            detail: "DefaultAreaId is missing in SpatialValidation options.",
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var filteredItems = new List<PoiSearchItem>();
    foreach (var item in result.Items)
    {
        if (item.Position is null)
        {
            continue;
        }

        var inside = await validator.IsInsideAsync(areaId, item.Position, ct);
        if (inside.IsInside)
        {
            filteredItems.Add(item);
        }
    }

    var filtered = new PoiSearchResponse
    {
        Items = filteredItems.ToArray()
    };

    return Results.Ok(ApiResponse<PoiSearchResponse>.Ok(filtered));
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

app.MapPost("/locations/static-map", async (
    StaticMapRequest request,
    IOptions<AzureMapsOptions> options,
    IHttpClientFactory httpClientFactory,
    CancellationToken ct) =>
{
    var azure = options.Value;
    if (string.IsNullOrWhiteSpace(azure.SubscriptionKey))
    {
        return Results.Problem(
            title: "Azure Maps key missing.",
            detail: "Configure AzureMaps:SubscriptionKey.");
    }

    var width = Math.Clamp(request.Width, 64, 2048);
    var height = Math.Clamp(request.Height, 64, 2048);
    var zoomInt = (int)Math.Round(request.Zoom, MidpointRounding.AwayFromZero);
    var zoom = Math.Clamp(zoomInt, 0, 22);

    var query = new Dictionary<string, string?>
    {
        ["api-version"] = "2024-04-01",
        ["tilesetId"] = "microsoft.base.road",
        ["center"] = $"{request.Center.Longitude.ToString(CultureInfo.InvariantCulture)},{request.Center.Latitude.ToString(CultureInfo.InvariantCulture)}",
        ["zoom"] = zoom.ToString(CultureInfo.InvariantCulture),
        ["width"] = width.ToString(CultureInfo.InvariantCulture),
        ["height"] = height.ToString(CultureInfo.InvariantCulture),
        ["format"] = "png",
        ["language"] = string.IsNullOrWhiteSpace(azure.Language) ? null : azure.Language
    };

    if (request.Path is { Count: > 1 })
    {
        var sampled = request.Path;
        if (sampled.Count > 100)
        {
            var step = (int)Math.Ceiling(sampled.Count / 100d);
            sampled = sampled.Where((_, index) => index % step == 0).ToArray();
        }

        var coordText = string.Join(
            "|",
            sampled.Select(p =>
                $"{p.Longitude.ToString(CultureInfo.InvariantCulture)} {p.Latitude.ToString(CultureInfo.InvariantCulture)}"));

        query["path"] = $"lc2dd4bf|lw4|la0.9||{coordText}";

        var start = sampled.First();
        var end = sampled.Last();
        query["pins"] =
            $"default|sc0.9|lc06b6b3||{start.Longitude.ToString(CultureInfo.InvariantCulture)} {start.Latitude.ToString(CultureInfo.InvariantCulture)}" +
            $"|{end.Longitude.ToString(CultureInfo.InvariantCulture)} {end.Latitude.ToString(CultureInfo.InvariantCulture)}";
    }
    var baseUrl = $"{azure.BaseUrl.TrimEnd('/')}/map/static";
    var url = QueryHelpers.AddQueryString(baseUrl, query);
    var client = httpClientFactory.CreateClient();
    var response = await client.GetAsync($"{url}&subscription-key={Uri.EscapeDataString(azure.SubscriptionKey)}", ct);

    if (!response.IsSuccessStatusCode)
    {
        var body = await response.Content.ReadAsStringAsync(ct);
        return Results.Problem(
            title: "Static map request failed.",
            detail: $"Azure Maps returned {(int)response.StatusCode}: {body}");
    }

    var bytes = await response.Content.ReadAsByteArrayAsync(ct);
    return Results.File(bytes, "image/png");
})
.WithName("StaticMap");

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
