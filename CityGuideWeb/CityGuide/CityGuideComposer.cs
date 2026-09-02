using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Notifications;

namespace CityGuideWeb.CityGuide;

public class CityGuideComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddHttpClient();
        // El limitador del formulario de contacto cuenta en memoria.
        builder.Services.AddMemoryCache();
        builder.Services.AddSingleton<NearbyIndex>();
        builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, CityGuideSeeder>();
        builder
            .AddNotificationAsyncHandler<ContentPublishedNotification, FrontendCacheInvalidator>()
            .AddNotificationAsyncHandler<ContentUnpublishedNotification, FrontendCacheInvalidator>()
            .AddNotificationAsyncHandler<ContentDeletedNotification, FrontendCacheInvalidator>()
            .AddNotificationAsyncHandler<ContentMovedToRecycleBinNotification, FrontendCacheInvalidator>();
        builder
            .AddNotificationHandler<ContentPublishedNotification, NearbyIndexInvalidator>()
            .AddNotificationHandler<ContentUnpublishedNotification, NearbyIndexInvalidator>()
            .AddNotificationHandler<ContentDeletedNotification, NearbyIndexInvalidator>()
            .AddNotificationHandler<ContentMovedToRecycleBinNotification, NearbyIndexInvalidator>();
    }
}
