using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// Drops the "¿Qué está cerca?" projection as soon as content changes, so the
/// next request rebuilds it. Same four notifications the frontend cache
/// invalidator listens to — anything that changes what the portal shows also
/// changes what is near a place.
/// </summary>
public class NearbyIndexInvalidator :
    INotificationHandler<ContentPublishedNotification>,
    INotificationHandler<ContentUnpublishedNotification>,
    INotificationHandler<ContentDeletedNotification>,
    INotificationHandler<ContentMovedToRecycleBinNotification>
{
    private readonly NearbyIndex _index;

    public NearbyIndexInvalidator(NearbyIndex index) => _index = index;

    public void Handle(ContentPublishedNotification notification) => _index.Invalidate();

    public void Handle(ContentUnpublishedNotification notification) => _index.Invalidate();

    public void Handle(ContentDeletedNotification notification) => _index.Invalidate();

    public void Handle(ContentMovedToRecycleBinNotification notification) => _index.Invalidate();
}
