using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Notifications;

namespace CityGuideWeb.CityGuide;

public class CityGuideComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
        => builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, CityGuideSeeder>();
}
