using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// The portal's visitors are Umbraco members: whoever signs in with Google or with an
/// email link becomes one, keyed by their email address, which both methods prove.
/// That puts them in the backoffice's Members section, where an editor blocks an
/// abusive one by clearing "Approved" or locking them out — and a blocked member can
/// neither sign in nor write, and every review they wrote goes off the portal.
/// </summary>
public static class MemberAccounts
{
    public static bool IsBlocked(IMember member) => !member.IsApproved || member.IsLockedOut;

    /// <summary>The member a portal request names, or null when it is gone or blocked.</summary>
    public static IMember? Active(IMemberService memberService, Guid key)
    {
        IMember? member = memberService.GetById(key);
        return member is null || IsBlocked(member) ? null : member;
    }
}

/// <summary>
/// Keeps the copy of each member's name and standing on their reviews in step with the
/// member node, and tells the frontend when a page of reviews changed because of it —
/// an editor who blocks a member from the backoffice sees the reviews go at once.
/// </summary>
public class MemberReviewSync :
    INotificationAsyncHandler<MemberSavedNotification>,
    INotificationAsyncHandler<MemberDeletedNotification>
{
    private readonly ReviewStore _store;
    private readonly FrontendRevalidator _revalidator;

    public MemberReviewSync(ReviewStore store, FrontendRevalidator revalidator)
    {
        _store = store;
        _revalidator = revalidator;
    }

    public async Task HandleAsync(MemberSavedNotification notification, CancellationToken cancellationToken)
    {
        int changed = notification.SavedEntities.Sum(member =>
            _store.SyncAuthor(member.Key, member.Name ?? string.Empty, MemberAccounts.IsBlocked(member)));
        if (changed > 0)
        {
            await _revalidator.RevalidateAsync(FrontendRevalidator.ReviewsTag, cancellationToken);
        }
    }

    public async Task HandleAsync(MemberDeletedNotification notification, CancellationToken cancellationToken)
    {
        int removed = notification.DeletedEntities.Sum(member => _store.DeleteMember(member.Key));
        if (removed > 0)
        {
            await _revalidator.RevalidateAsync(FrontendRevalidator.ReviewsTag, cancellationToken);
        }
    }
}
