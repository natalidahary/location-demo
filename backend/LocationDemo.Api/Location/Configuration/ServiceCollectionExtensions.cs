using LocationDemo.Api.Location.Abstractions;
using LocationDemo.Api.Location.Providers.Azure;
using LocationDemo.Api.Location.Quality;
using LocationDemo.Api.Location.Spatial;

namespace LocationDemo.Api.Location.Configuration;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddLocationServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AzureMapsOptions>(configuration.GetSection(AzureMapsOptions.SectionName));
        services.AddHttpClient<ILocationService, AzureLocationService>();

        services.Configure<GeocodeQualityOptions>(configuration.GetSection(GeocodeQualityOptions.SectionName));

        services.Configure<SpatialValidationOptions>(configuration.GetSection(SpatialValidationOptions.SectionName));
        services.AddSingleton<ISpatialValidator, GeoJsonSpatialValidator>();

        return services;
    }
}
