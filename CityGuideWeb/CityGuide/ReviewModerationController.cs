using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Web.Common.Authorization;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// What the "Reseñas" dashboard in the Content section reads and writes: the newest
/// reviews of the whole portal, hidden ones included, and the switch that hides one.
/// A backoffice endpoint under the Management API, so it takes the editor's own
/// session and the same content-section permission the tree does.
/// </summary>
[ApiController]
[VersionedApiBackOfficeRoute("cityguide/reviews")]
[ApiExplorerSettings(GroupName = "CityGuide")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessContent)]
public class ReviewModerationController : ManagementApiControllerBase
{
    private const int MaxTake = 100;

    private readonly ReviewStore _store;
    private readonly IContentService _contentService;
    private readonly IMemberService _memberService;
    private readonly FrontendRevalidator _revalidator;

    public ReviewModerationController(
        ReviewStore store,
        IContentService contentService,
        IMemberService memberService,
        FrontendRevalidator revalidator)
    {
        _store = store;
        _contentService = contentService;
        _memberService = memberService;
        _revalidator = revalidator;
    }

    public record ModerationItem(
        int Id, Guid PlaceKey, string PlaceName, Guid MemberKey, string Author, string? AuthorEmail,
        bool AuthorBlocked, int Rating, string? Comment, DateTime UpdatedUtc, bool Hidden);

    public record ModerationPage(long Total, IEnumerable<ModerationItem> Items);

    public record HiddenRequest(bool Hidden);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int skip = 0, [FromQuery] int take = 50)
    {
        (List<ReviewRow> rows, long total) = _store.Latest(Math.Max(0, skip), Math.Clamp(take, 1, MaxTake));

        Dictionary<Guid, string> places = _contentService
            .GetByIds(rows.Select(r => r.PlaceKey).Distinct())
            .ToDictionary(c => c.Key, c => c.GetCultureName("es-DO") ?? c.Name ?? string.Empty);
        Dictionary<Guid, IMember> members = (await _memberService.GetByKeysAsync(rows.Select(r => r.MemberKey).Distinct().ToArray()))
            .ToDictionary(m => m.Key);

        return Ok(new ModerationPage(total, rows.Select(r => new ModerationItem(
            r.Id,
            r.PlaceKey,
            places.GetValueOrDefault(r.PlaceKey) ?? "—",
            r.MemberKey,
            r.AuthorName,
            members.GetValueOrDefault(r.MemberKey)?.Email,
            r.AuthorBlocked,
            r.Rating,
            r.Comment,
            ReviewsController.Utc(r.UpdatedUtc),
            r.Hidden))));
    }

    [HttpPut("{id:int}/hidden")]
    public async Task<IActionResult> SetHidden(int id, [FromBody] HiddenRequest request)
    {
        if (!_store.SetHidden(id, request.Hidden))
        {
            return NotFound();
        }

        await _revalidator.RevalidateAsync(FrontendRevalidator.ReviewsTag);
        return Ok(new { hidden = request.Hidden });
    }
}
