using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Infrastructure.BackgroundJobs;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// Deletes what the public forms filed once it has served its purpose. A contact message
/// and a reservation request carry personal data, and Ley 172-13 allows keeping it only as
/// long as the purpose it was given for needs it; the privacy policy states these same
/// periods (<c>lib/legal.ts</c> in the frontend), so the two change together. Once a day,
/// counted from the node's creation; deletion is permanent — the recycle bin would only
/// keep the data somewhere else.
/// </summary>
public sealed class FormRetention : RecurringBackgroundJobBase
{
    /// <summary>Inbox alias → how long its items are kept.</summary>
    public static readonly IReadOnlyDictionary<string, TimeSpan> Periods = new Dictionary<string, TimeSpan>
    {
        // Long enough to follow up an enquiry, a business listing or an advertising deal.
        ["contactInbox"] = TimeSpan.FromDays(730),
        // Long enough to answer a claim about a reservation that went wrong.
        ["reservationInbox"] = TimeSpan.FromDays(365),
    };

    private readonly IContentService _contentService;
    private readonly IContentTypeService _contentTypeService;
    private readonly ILogger<FormRetention> _logger;

    public FormRetention(
        IContentService contentService,
        IContentTypeService contentTypeService,
        ILogger<FormRetention> logger)
        : base(TimeSpan.FromDays(1))
    {
        _contentService = contentService;
        _contentTypeService = contentTypeService;
        _logger = logger;
    }

    /// <summary>A few minutes after startup, clear of the seeder.</summary>
    public override TimeSpan Delay => TimeSpan.FromMinutes(10);

    public override Task RunJobAsync(CancellationToken cancellationToken)
    {
        foreach ((string inboxAlias, TimeSpan period) in Periods)
        {
            IContent? inbox = PublicForms.FindInbox(_contentService, _contentTypeService, inboxAlias);
            if (inbox is null)
            {
                continue;
            }

            DateTime cutoff = DateTime.Now - period;
            List<IContent> expired = _contentService
                .GetPagedChildren(inbox.Id, 0, int.MaxValue, out _, null, null, null, false)
                .Where(item => item.CreateDate < cutoff)
                .ToList();

            foreach (IContent item in expired)
            {
                cancellationToken.ThrowIfCancellationRequested();
                _contentService.Delete(item);
            }

            if (expired.Count > 0)
            {
                _logger.LogInformation(
                    "CityGuide: deleted {Count} items older than {Days} days from {Inbox}",
                    expired.Count, period.TotalDays, inboxAlias);
            }
        }

        return Task.CompletedTask;
    }
}
