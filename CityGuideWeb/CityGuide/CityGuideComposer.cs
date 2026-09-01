using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Notifications;

namespace CityGuideWeb.CityGuide;

public class CityGuideComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddHttpClient();
        builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, CityGuideSeeder>();
        builder
            .AddNotificationAsyncHandler<ContentPublishedNotification, FrontendCacheInvalidator>()
            .AddNotificationAsyncHandler<ContentUnpublishedNotification, FrontendCacheInvalidator>()
            .AddNotificationAsyncHandler<ContentDeletedNotification, FrontendCacheInvalidator>()
            .AddNotificationAsyncHandler<ContentMovedToRecycleBinNotification, FrontendCacheInvalidator>();
    }
}
