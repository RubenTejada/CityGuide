using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// The portal's own reviews of an establishment, beside the Google rating the agent
/// stores on the node. Reading is what every place page and listing does; writing is a
/// signed-in visitor through the portal's server, which names the member it acts for
/// (<see cref="PortalApiAttribute"/>). Reviews publish at once: an editor takes one
/// down from the "Reseñas" dashboard, or blocks its author in the Members section.
/// </summary>
[ApiController]
[Route("api/reviews")]
[PortalApi]
public class ReviewsController : ControllerBase
{
    private readonly ReviewStore _store;
    private readonly IMemberService _memberService;
    private readonly IContentService _contentService;

    public ReviewsController(ReviewStore store, IMemberService memberService, IContentService contentService)
    {
        _store = store;
        _memberService = memberService;
        _contentService = contentService;
    }

    public record ReviewView(int Id, string Author, int Rating, string? Comment, DateTime CreatedUtc, DateTime UpdatedUtc);

    /// <summary>The member's own review, which carries whether an editor hid it.</summary>
    public record OwnReviewView(int Rating, string? Comment, DateTime UpdatedUtc, bool Hidden);

    public record ReviewSubmission(Guid? Member, int? Rating, string? Comment, string? Locale);

    /// <summary>Every place with visible reviews: what a listing needs to rate its cards.</summary>
    [HttpGet("summaries")]
    public IActionResult Summaries() => Ok(_store.Summaries());

    /// <summary>
    /// One place's reviews and summary. With <c>member</c>, also that member's own review
    /// and whether the place is on their list — what the page's controls start from.
    /// </summary>
    [HttpGet("{placeKey:guid}")]
    public IActionResult Get(Guid placeKey, [FromQuery] Guid? member = null)
    {
        _store.Summaries().TryGetValue(placeKey, out ReviewSummary? summary);
        List<ReviewView> reviews = _store.ForPlace(placeKey).Select(ToView).ToList();

        if (member is not Guid memberKey)
        {
            return Ok(new { summary, reviews });
        }

        ReviewRow? own = _store.Find(placeKey, memberKey);
        return Ok(new
        {
            summary,
            reviews,
            mine = own is null ? null : new OwnReviewView(own.Rating, own.Comment, Utc(own.UpdatedUtc), own.Hidden),
            favorite = _store.IsFavorite(memberKey, placeKey),
        });
    }

    [HttpPut("{placeKey:guid}")]
    public IActionResult Put(Guid placeKey, [FromBody] ReviewSubmission request)
    {
        bool english = request.Locale == "en";

        IMember? member = request.Member is Guid key ? MemberAccounts.Active(_memberService, key) : null;
        if (member is null)
        {
            return StatusCode(403, new
            {
                error = english ? "Sign in again to leave your review." : "Vuelve a entrar para dejar tu opinión.",
            });
        }

        if (!AccountController.IsRateablePlace(_contentService, placeKey))
        {
            return NotFound(new
            {
                error = english ? "This place does not take reviews." : "Este lugar no recibe opiniones.",
            });
        }

        if (request.Rating is not int rating || rating < ReviewRules.MinRating || rating > ReviewRules.MaxRating)
        {
            return BadRequest(new
            {
                error = english ? "Choose from one to five stars." : "Elige de una a cinco estrellas.",
            });
        }

        string comment = PublicForms.Clean(request.Comment, ReviewRules.MaxComment);
        ReviewRow row = _store.Save(placeKey, member.Key, member.Name ?? string.Empty, rating, comment);
        return Ok(new OwnReviewView(row.Rating, row.Comment, Utc(row.UpdatedUtc), row.Hidden));
    }

    [HttpDelete("{placeKey:guid}")]
    public IActionResult Delete(Guid placeKey, [FromQuery] Guid member)
    {
        if (MemberAccounts.Active(_memberService, member) is null)
        {
            return StatusCode(403);
        }

        _store.Delete(placeKey, member);
        return Ok(new { ok = true });
    }

    private static ReviewView ToView(ReviewRow row) =>
        new(row.Id, row.AuthorName, row.Rating, row.Comment, Utc(row.CreatedUtc), Utc(row.UpdatedUtc));

    /// <summary>The database hands dates back with no kind; they were written as UTC, and the JSON must say so.</summary>
    internal static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);
}
