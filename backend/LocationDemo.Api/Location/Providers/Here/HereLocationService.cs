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
        var url = $"{_options.RoutingBaseUrl}/routes?transportMode=car&origin={origin}&destination={destination}&return=summary&apiKey={_options.ApiKey}";

        var response = await _httpClient.GetFromJsonAsync<HereRouteResponse>(url, cancellationToken);
        var summary = response?.Routes?.FirstOrDefault()?.Sections?.FirstOrDefault()?.Summary;

        return new RouteResult
        {
            DistanceMeters = summary?.Length ?? 0,
            DurationSeconds = summary?.Duration ?? 0,
            Path = new[] { from, to }
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
}
