using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using LocationDemo.Api.Location.Abstractions;
using LocationDemo.Api.Location.Models.Autosuggest;
using LocationDemo.Api.Location.Models.Geocode;
using LocationDemo.Api.Location.Models.Isoline;
using LocationDemo.Api.Location.Models.PoiSearch;
using LocationDemo.Api.Location.Models.ReverseGeocode;
using LocationDemo.Api.Location.Models.Route;
using LocationDemo.Api.Location.Models.Shared;
using Microsoft.Extensions.Options;

namespace LocationDemo.Api.Location.Providers.Azure;

public sealed class AzureLocationService : ILocationService
{
    private readonly HttpClient _httpClient;
    private readonly AzureMapsOptions _options;

    public AzureLocationService(HttpClient httpClient, IOptions<AzureMapsOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<GeocodeResult> GeocodeAsync(string address, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            throw new ArgumentException("Address is required.", nameof(address));
        }

        EnsureConfigured();

        var url = $"{_options.BaseUrl}/search/address/json?api-version=1.0&subscription-key={_options.SubscriptionKey}" +
                  $"&query={Uri.EscapeDataString(address)}&limit=1&language={_options.Language}&countrySet={_options.CountrySet}";
        var response = await _httpClient.GetFromJsonAsync<AzureSearchResponse>(url, cancellationToken);
        var first = response?.Results?.FirstOrDefault();

        if (first is null || first.Position is null)
        {
            return new GeocodeResult
            {
                FormattedAddress = address,
                Latitude = 0,
                Longitude = 0,
                City = null,
                Confidence = 0
            };
        }

        return new GeocodeResult
        {
            FormattedAddress = first.Address?.FreeformAddress ?? address,
            Latitude = first.Position.Lat,
            Longitude = first.Position.Lon,
            City = first.Address?.Municipality ?? first.Address?.MunicipalitySubdivision,
            Confidence = first.Score ?? 0,
            MatchLevel = first.EntityType,
            HouseNumber = first.Address?.StreetNumber
        };
    }

    public async Task<GeocodeResult> ReverseGeocodeAsync(Coordinate coordinate, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var url = $"{_options.BaseUrl}/search/address/reverse/json?api-version=1.0&subscription-key={_options.SubscriptionKey}" +
                  $"&query={coordinate.Latitude},{coordinate.Longitude}&language={_options.Language}";
        var response = await _httpClient.GetFromJsonAsync<AzureReverseResponse>(url, cancellationToken);
        var first = response?.Addresses?.FirstOrDefault();

        if (first is null || string.IsNullOrWhiteSpace(first.Position))
        {
            return new GeocodeResult
            {
                FormattedAddress = string.Empty,
                Latitude = coordinate.Latitude,
                Longitude = coordinate.Longitude,
                City = null,
                Confidence = 0
            };
        }

        var parts = first.Position.Split(',', StringSplitOptions.TrimEntries);
        var lat = parts.Length > 0 && double.TryParse(parts[0], out var la) ? la : coordinate.Latitude;
        var lon = parts.Length > 1 && double.TryParse(parts[1], out var lo) ? lo : coordinate.Longitude;

        return new GeocodeResult
        {
            FormattedAddress = first.Address?.FreeformAddress ?? string.Empty,
            Latitude = lat,
            Longitude = lon,
            City = first.Address?.Municipality ?? first.Address?.MunicipalitySubdivision,
            Confidence = 0,
            MatchLevel = null,
            HouseNumber = first.Address?.StreetNumber
        };
    }

    public async Task<AutosuggestResponse> AutosuggestAsync(AutosuggestRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            throw new ArgumentException("Query is required.", nameof(request.Query));
        }

        EnsureConfigured();

        var parameters = new List<string>
        {
            $"query={Uri.EscapeDataString(request.Query)}",
            "api-version=1.0",
            $"subscription-key={_options.SubscriptionKey}",
            "limit=6",
            $"language={_options.Language}",
            $"countrySet={_options.CountrySet}"
        };

        if (request.At is not null)
        {
            var at = request.At;
            parameters.Add($"lat={at.Latitude}");
            parameters.Add($"lon={at.Longitude}");
            parameters.Add("radius=5000");
        }

        var url = $"{_options.BaseUrl}/search/fuzzy/json?{string.Join("&", parameters)}";
        var response = await _httpClient.GetFromJsonAsync<AzureSearchResponse>(url, cancellationToken);

        var items = response?.Results?.Select(item => new AutosuggestItem
            {
                Title = item.Poi?.Name ?? item.Address?.FreeformAddress ?? string.Empty,
                Id = item.Id,
                ResultType = item.EntityType,
                AddressLabel = item.Address?.FreeformAddress,
                City = item.Address?.Municipality ?? item.Address?.MunicipalitySubdivision,
                Position = item.Position is null ? null : new Coordinate(item.Position.Lat, item.Position.Lon)
            })
            .ToArray() ?? Array.Empty<AutosuggestItem>();

        return new AutosuggestResponse { Items = items };
    }

    public async Task<RouteResult> GetRouteAsync(Coordinate from, Coordinate to, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var url = $"{_options.BaseUrl}/route/directions/json?api-version=1.0&subscription-key={_options.SubscriptionKey}&query={from.Latitude},{from.Longitude}:{to.Latitude},{to.Longitude}";
        var response = await _httpClient.GetFromJsonAsync<AzureRouteResponse>(url, cancellationToken);
        var route = response?.Routes?.FirstOrDefault();
        var summary = route?.Summary;
        var points = route?.Legs?.FirstOrDefault()?.Points ?? new List<AzurePoint>();

        var path = points.Select(p => new Coordinate(p.Latitude, p.Longitude)).ToArray();

        return new RouteResult
        {
            DistanceMeters = summary?.LengthInMeters ?? 0,
            DurationSeconds = summary?.TravelTimeInSeconds ?? 0,
            Path = path,
            Polyline = null
        };
    }

    public async Task<IsolineResponse> GetIsolineAsync(IsolineRequest request, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var origin = $"{request.Origin.Latitude},{request.Origin.Longitude}";
        var url = $"{_options.BaseUrl}/route/range/json?api-version=1.0&subscription-key={_options.SubscriptionKey}&query={origin}&timeBudgetInSec={request.RangeValue}&travelMode={request.TransportMode}";
        var response = await _httpClient.GetFromJsonAsync<AzureRangeResponse>(url, cancellationToken);

        var polygons = response?.ReachableRange?.Boundary ?? new List<AzurePoint>();
        var coords = polygons.Select(p => new Coordinate(p.Latitude, p.Longitude)).ToArray();

        return new IsolineResponse
        {
            Isolines = coords.Length == 0
                ? Array.Empty<Isoline>()
                : new[]
                {
                    new Isoline
                    {
                        Range = new IsolineRange { Type = request.RangeType, Value = request.RangeValue },
                        Polygons = new[]
                        {
                            new IsolinePolygon { Outer = string.Empty, Coordinates = coords }
                        }
                    }
                }
        };
    }

    public async Task<PoiSearchResponse> SearchPoiAsync(PoiSearchRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            throw new ArgumentException("Query is required.", nameof(request.Query));
        }

        EnsureConfigured();

        var parameters = new List<string>
        {
            $"query={Uri.EscapeDataString(request.Query)}",
            "api-version=1.0",
            $"subscription-key={_options.SubscriptionKey}",
            "limit=10",
            "idxSet=POI",
            $"language={_options.Language}",
            $"countrySet={_options.CountrySet}"
        };

        if (request.At is not null)
        {
            var at = request.At;
            parameters.Add($"lat={at.Latitude}");
            parameters.Add($"lon={at.Longitude}");
            parameters.Add("radius=3000");
        }

        var url = $"{_options.BaseUrl}/search/fuzzy/json?{string.Join("&", parameters)}";
        var response = await _httpClient.GetFromJsonAsync<AzureSearchResponse>(url, cancellationToken);

        var items = response?.Results?.Select(item => new PoiSearchItem
            {
                Title = item.Poi?.Name ?? item.Address?.FreeformAddress ?? string.Empty,
                Id = item.Id,
                AddressLabel = item.Address?.FreeformAddress,
                Category = GetCategoryName(item.Poi?.Categories?.FirstOrDefault()),
                Position = item.Position is null ? null : new Coordinate(item.Position.Lat, item.Position.Lon),
                DistanceMeters = item.Dist
            })
            .ToArray() ?? Array.Empty<PoiSearchItem>();

        return new PoiSearchResponse { Items = items };
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_options.SubscriptionKey))
        {
            throw new InvalidOperationException("Azure Maps subscription key is missing. Configure AzureMaps:SubscriptionKey in appsettings.");
        }
    }

    private sealed class AzureSearchResponse
    {
        [JsonPropertyName("results")]
        public List<AzureSearchResult>? Results { get; init; }
    }

    private sealed class AzureReverseResponse
    {
        [JsonPropertyName("addresses")]
        public List<AzureReverseAddress>? Addresses { get; init; }
    }

    private sealed class AzureReverseAddress
    {
        [JsonPropertyName("address")]
        public AzureAddress? Address { get; init; }

        [JsonPropertyName("position")]
        public string? Position { get; init; }
    }

    private sealed class AzureSearchResult
    {
        [JsonPropertyName("id")]
        public string? Id { get; init; }

        [JsonPropertyName("score")]
        public double? Score { get; init; }

        [JsonPropertyName("entityType")]
        public string? EntityType { get; init; }

        [JsonPropertyName("position")]
        public AzurePosition? Position { get; init; }

        [JsonPropertyName("address")]
        public AzureAddress? Address { get; init; }

        [JsonPropertyName("poi")]
        public AzurePoi? Poi { get; init; }

        [JsonPropertyName("dist")]
        public double? Dist { get; init; }
    }

    private sealed class AzurePosition
    {
        [JsonPropertyName("lat")]
        public double Lat { get; init; }

        [JsonPropertyName("lon")]
        public double Lon { get; init; }
    }

    private sealed class AzureAddress
    {
        [JsonPropertyName("freeformAddress")]
        public string? FreeformAddress { get; init; }

        [JsonPropertyName("municipality")]
        public string? Municipality { get; init; }

        [JsonPropertyName("municipalitySubdivision")]
        public string? MunicipalitySubdivision { get; init; }

        [JsonPropertyName("streetNumber")]
        public string? StreetNumber { get; init; }
    }

    private sealed class AzurePoi
    {
        [JsonPropertyName("name")]
        public string? Name { get; init; }

        [JsonPropertyName("categories")]
        public List<JsonElement>? Categories { get; init; }
    }
    
    private static string? GetCategoryName(JsonElement? element)
    {
        if (element is null)
        {
            return null;
        }

        if (element.Value.ValueKind == JsonValueKind.String)
        {
            return element.Value.GetString();
        }

        if (element.Value.ValueKind == JsonValueKind.Object &&
            element.Value.TryGetProperty("name", out var nameProp))
        {
            return nameProp.GetString();
        }

        return null;
    }

    private sealed class AzureRouteResponse
    {
        [JsonPropertyName("routes")]
        public List<AzureRoute>? Routes { get; init; }
    }

    private sealed class AzureRoute
    {
        [JsonPropertyName("summary")]
        public AzureRouteSummary? Summary { get; init; }

        [JsonPropertyName("legs")]
        public List<AzureRouteLeg>? Legs { get; init; }
    }

    private sealed class AzureRouteLeg
    {
        [JsonPropertyName("points")]
        public List<AzurePoint>? Points { get; init; }
    }

    private sealed class AzureRouteSummary
    {
        [JsonPropertyName("lengthInMeters")]
        public double LengthInMeters { get; init; }

        [JsonPropertyName("travelTimeInSeconds")]
        public double TravelTimeInSeconds { get; init; }
    }

    private sealed class AzureRangeResponse
    {
        [JsonPropertyName("reachableRange")]
        public AzureReachableRange? ReachableRange { get; init; }
    }

    private sealed class AzureReachableRange
    {
        [JsonPropertyName("boundary")]
        public List<AzurePoint>? Boundary { get; init; }
    }

    private sealed class AzurePoint
    {
        [JsonPropertyName("latitude")]
        public double Latitude { get; init; }

        [JsonPropertyName("longitude")]
        public double Longitude { get; init; }
    }
}
