using System.Net.Http.Json;
using System.Text.Json.Serialization;
using LocationDemo.Api.Location.Abstractions;
using LocationDemo.Api.Location.Models;
using Microsoft.Extensions.Options;

namespace LocationDemo.Api.Location.Providers.Here;

public sealed class HereLocationService : ILocationService
{
    private readonly HttpClient _httpClient;
    private readonly HereOptions _options;

    public HereLocationService(HttpClient httpClient, IOptions<HereOptions> options)
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

        var url = $"{_options.GeocodeBaseUrl}/geocode?q={Uri.EscapeDataString(address)}&apiKey={_options.ApiKey}";
        var response = await _httpClient.GetFromJsonAsync<HereGeocodeResponse>(url, cancellationToken);

        var first = response?.Items?.FirstOrDefault();
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
            FormattedAddress = first.Address?.Label ?? address,
            Latitude = first.Position.Lat,
            Longitude = first.Position.Lng,
            City = first.Address?.City,
            Confidence = first.Scoring?.QueryScore ?? 0,
            MatchLevel = first.ResultType,
            HouseNumber = first.Address?.HouseNumber
        };
    }

    public async Task<RouteResult> GetRouteAsync(Coordinate from, Coordinate to, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var origin = $"{from.Latitude},{from.Longitude}";
        var destination = $"{to.Latitude},{to.Longitude}";
        var url = $"{_options.RoutingBaseUrl}/routes?transportMode=car&origin={origin}&destination={destination}&return=summary,polyline&apiKey={_options.ApiKey}";

        var response = await _httpClient.GetFromJsonAsync<HereRouteResponse>(url, cancellationToken);
        var section = response?.Routes?.FirstOrDefault()?.Sections?.FirstOrDefault();
        var summary = section?.Summary;
        var polyline = section?.Polyline;

        return new RouteResult
        {
            DistanceMeters = summary?.Length ?? 0,
            DurationSeconds = summary?.Duration ?? 0,
            Path = new[] { from, to },
            Polyline = polyline
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
            $"q={Uri.EscapeDataString(request.Query)}",
            $"apiKey={_options.ApiKey}"
        };

        if (request.At is not null)
        {
            parameters.Add($"at={request.At.Latitude},{request.At.Longitude}");
        }
        else if (!string.IsNullOrWhiteSpace(request.In))
        {
            parameters.Add($"in={Uri.EscapeDataString(request.In)}");
        }

        if (request.Limit is not null && request.Limit > 0)
        {
            parameters.Add($"limit={request.Limit}");
        }

        var url = $"https://autosuggest.search.hereapi.com/v1/autosuggest?{string.Join("&", parameters)}";
        var response = await _httpClient.GetFromJsonAsync<HereAutosuggestResponse>(url, cancellationToken);

        var items = response?.Items?.Select(item => new AutosuggestItem
            {
                Title = item.Title ?? string.Empty,
                Id = item.Id,
                ResultType = item.ResultType,
                AddressLabel = item.Address?.Label,
                City = item.Address?.City,
                Position = item.Position is null ? null : new Coordinate(item.Position.Lat, item.Position.Lng)
            })
            .ToArray() ?? Array.Empty<AutosuggestItem>();

        return new AutosuggestResponse
        {
            Items = items
        };
    }

    public async Task<GeocodeResult> ReverseGeocodeAsync(Coordinate coordinate, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var at = $"{coordinate.Latitude},{coordinate.Longitude}";
        var url = $"https://revgeocode.search.hereapi.com/v1/revgeocode?at={at}&lang=en-US&apiKey={_options.ApiKey}";

        var response = await _httpClient.GetFromJsonAsync<HereGeocodeResponse>(url, cancellationToken);
        var first = response?.Items?.FirstOrDefault();
        if (first is null || first.Position is null)
        {
            return new GeocodeResult
            {
                FormattedAddress = string.Empty,
                Latitude = coordinate.Latitude,
                Longitude = coordinate.Longitude,
                City = null,
                Confidence = 0,
                MatchLevel = null,
                HouseNumber = null
            };
        }

        return new GeocodeResult
        {
            FormattedAddress = first.Address?.Label ?? string.Empty,
            Latitude = first.Position.Lat,
            Longitude = first.Position.Lng,
            City = first.Address?.City,
            Confidence = first.Scoring?.QueryScore ?? 0,
            MatchLevel = first.ResultType,
            HouseNumber = first.Address?.HouseNumber
        };
    }

    public async Task<IsolineResponse> GetIsolineAsync(IsolineRequest request, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var origin = $"{request.Origin.Latitude},{request.Origin.Longitude}";
        var url = $"https://isoline.router.hereapi.com/v8/isolines" +
                  $"?origin={origin}" +
                  $"&transportMode={Uri.EscapeDataString(request.TransportMode)}" +
                  $"&routingMode={Uri.EscapeDataString(request.RoutingMode)}" +
                  $"&range[type]={Uri.EscapeDataString(request.RangeType)}" +
                  $"&range[values]={request.RangeValue}" +
                  $"&apiKey={_options.ApiKey}";

        var response = await _httpClient.GetFromJsonAsync<HereIsolineResponse>(url, cancellationToken);
        var isolines = response?.Isolines?.Select(i => new Isoline
            {
                Range = new IsolineRange
                {
                    Type = i.Range?.Type ?? request.RangeType,
                    Value = i.Range?.Value ?? request.RangeValue
                },
                Polygons = i.Polygons?.Select(p => new IsolinePolygon
                    {
                        Outer = p.Outer ?? string.Empty
                    })
                    .ToArray() ?? Array.Empty<IsolinePolygon>()
            })
            .ToArray() ?? Array.Empty<Isoline>();

        return new IsolineResponse
        {
            Isolines = isolines
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
            $"q={Uri.EscapeDataString(request.Query)}",
            $"apiKey={_options.ApiKey}"
        };

        if (request.At is not null)
        {
            parameters.Add($"at={request.At.Latitude},{request.At.Longitude}");
        }
        else if (!string.IsNullOrWhiteSpace(request.In))
        {
            parameters.Add($"in={Uri.EscapeDataString(request.In)}");
        }

        if (request.Limit is not null && request.Limit > 0)
        {
            parameters.Add($"limit={request.Limit}");
        }

        var url = $"https://discover.search.hereapi.com/v1/discover?{string.Join("&", parameters)}";
        var response = await _httpClient.GetFromJsonAsync<HerePoiResponse>(url, cancellationToken);

        var items = response?.Items?.Select(item => new PoiSearchItem
            {
                Title = item.Title ?? string.Empty,
                Id = item.Id,
                AddressLabel = item.Address?.Label,
                Category = item.Categories?.FirstOrDefault()?.Name,
                Position = item.Position is null ? null : new Coordinate(item.Position.Lat, item.Position.Lng),
                DistanceMeters = item.Distance
            })
            .ToArray() ?? Array.Empty<PoiSearchItem>();

        return new PoiSearchResponse
        {
            Items = items
        };
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException("HERE API key is missing. Configure Here:ApiKey in appsettings.");
        }
    }

    private sealed class HereGeocodeResponse
    {
        [JsonPropertyName("items")]
        public List<HereGeocodeItem>? Items { get; init; }
    }

    private sealed class HereGeocodeItem
    {
        [JsonPropertyName("resultType")]
        public string? ResultType { get; init; }

        [JsonPropertyName("position")]
        public HerePosition? Position { get; init; }

        [JsonPropertyName("address")]
        public HereAddress? Address { get; init; }

        [JsonPropertyName("scoring")]
        public HereScoring? Scoring { get; init; }
    }

    private sealed class HerePosition
    {
        [JsonPropertyName("lat")]
        public double Lat { get; init; }

        [JsonPropertyName("lng")]
        public double Lng { get; init; }
    }

    private sealed class HereAddress
    {
        [JsonPropertyName("label")]
        public string? Label { get; init; }

        [JsonPropertyName("city")]
        public string? City { get; init; }

        [JsonPropertyName("houseNumber")]
        public string? HouseNumber { get; init; }
    }

    private sealed class HereScoring
    {
        [JsonPropertyName("queryScore")]
        public double QueryScore { get; init; }
    }

    private sealed class HereRouteResponse
    {
        [JsonPropertyName("routes")]
        public List<HereRoute>? Routes { get; init; }
    }

    private sealed class HereRoute
    {
        [JsonPropertyName("sections")]
        public List<HereRouteSection>? Sections { get; init; }
    }

    private sealed class HereRouteSection
    {
        [JsonPropertyName("summary")]
        public HereRouteSummary? Summary { get; init; }

        [JsonPropertyName("polyline")]
        public string? Polyline { get; init; }
    }

    private sealed class HereRouteSummary
    {
        [JsonPropertyName("length")]
        public double Length { get; init; }

        [JsonPropertyName("duration")]
        public double Duration { get; init; }
    }

    private sealed class HereAutosuggestResponse
    {
        [JsonPropertyName("items")]
        public List<HereAutosuggestItem>? Items { get; init; }
    }

    private sealed class HereAutosuggestItem
    {
        [JsonPropertyName("title")]
        public string? Title { get; init; }

        [JsonPropertyName("id")]
        public string? Id { get; init; }

        [JsonPropertyName("resultType")]
        public string? ResultType { get; init; }

        [JsonPropertyName("address")]
        public HereAddress? Address { get; init; }

        [JsonPropertyName("position")]
        public HerePosition? Position { get; init; }
    }

    private sealed class HereIsolineResponse
    {
        [JsonPropertyName("isolines")]
        public List<HereIsoline>? Isolines { get; init; }
    }

    private sealed class HereIsoline
    {
        [JsonPropertyName("range")]
        public HereIsolineRange? Range { get; init; }

        [JsonPropertyName("polygons")]
        public List<HereIsolinePolygon>? Polygons { get; init; }
    }

    private sealed class HereIsolineRange
    {
        [JsonPropertyName("type")]
        public string? Type { get; init; }

        [JsonPropertyName("value")]
        public int? Value { get; init; }
    }

    private sealed class HereIsolinePolygon
    {
        [JsonPropertyName("outer")]
        public string? Outer { get; init; }
    }

    private sealed class HerePoiResponse
    {
        [JsonPropertyName("items")]
        public List<HerePoiItem>? Items { get; init; }
    }

    private sealed class HerePoiItem
    {
        [JsonPropertyName("title")]
        public string? Title { get; init; }

        [JsonPropertyName("id")]
        public string? Id { get; init; }

        [JsonPropertyName("address")]
        public HereAddress? Address { get; init; }

        [JsonPropertyName("categories")]
        public List<HerePoiCategory>? Categories { get; init; }

        [JsonPropertyName("position")]
        public HerePosition? Position { get; init; }

        [JsonPropertyName("distance")]
        public double? Distance { get; init; }
    }

    private sealed class HerePoiCategory
    {
        [JsonPropertyName("name")]
        public string? Name { get; init; }
    }
}
