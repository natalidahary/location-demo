using LocationDemo.Api.Location.Abstractions;
using LocationDemo.Api.Location.Providers.Here;
using LocationDemo.Api.Location.Quality;
using LocationDemo.Api.Location.Spatial;

namespace LocationDemo.Api.Location.Configuration;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddLocationServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<HereOptions>(configuration.GetSection(HereOptions.SectionName));
        services.AddHttpClient<ILocationService, HereLocationService>();

        services.Configure<GeocodeQualityOptions>(configuration.GetSection(GeocodeQualityOptions.SectionName));

        services.Configure<SpatialValidationOptions>(configuration.GetSection(SpatialValidationOptions.SectionName));
        services.AddSingleton<ISpatialValidator, GeoJsonSpatialValidator>();

        return services;
    }
}
