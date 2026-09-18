using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// Tells the Next.js frontend to drop its cached Delivery API responses as soon
/// as content changes, so editors see their edits without waiting out the
/// time-based revalidation window.
/// </summary>
public class FrontendCacheInvalidator :
    INotificationAsyncHandler<ContentPublishedNotification>,
    INotificationAsyncHandler<ContentUnpublishedNotification>,
    INotificationAsyncHandler<ContentDeletedNotification>,
    INotificationAsyncHandler<ContentMovedToRecycleBinNotification>
{
    private readonly FrontendRevalidator _revalidator;

    public FrontendCacheInvalidator(FrontendRevalidator revalidator) => _revalidator = revalidator;

    public Task HandleAsync(ContentPublishedNotification notification, CancellationToken cancellationToken)
        => _revalidator.RevalidateAsync(FrontendRevalidator.ContentTag, cancellationToken);

    public Task HandleAsync(ContentUnpublishedNotification notification, CancellationToken cancellationToken)
        => _revalidator.RevalidateAsync(FrontendRevalidator.ContentTag, cancellationToken);

    public Task HandleAsync(ContentDeletedNotification notification, CancellationToken cancellationToken)
        => _revalidator.RevalidateAsync(FrontendRevalidator.ContentTag, cancellationToken);

    public Task HandleAsync(ContentMovedToRecycleBinNotification notification, CancellationToken cancellationToken)
        => _revalidator.RevalidateAsync(FrontendRevalidator.ContentTag, cancellationToken);
}

/// <summary>
/// Drops one cache tag on the frontend ("/api/revalidate"). Content changes drop
/// "umbraco"; a review an editor hides, or a member blocked, drops "reviews" — the
/// portal's own writes drop that tag themselves. Fire-and-forget: a frontend that is
/// down or unconfigured must never fail a publish.
///
/// Configuration (App Service settings in production):
///   CityGuide:FrontendBaseUrl    e.g. https://quehacerrd.com
///   CityGuide:RevalidateSecret   shared with the frontend's REVALIDATE_SECRET
/// </summary>
public sealed class FrontendRevalidator
{
    public const string ContentTag = "umbraco";
    public const string ReviewsTag = "reviews";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FrontendRevalidator> _logger;

    public FrontendRevalidator(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<FrontendRevalidator> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task RevalidateAsync(string tag, CancellationToken cancellationToken = default)
    {
        string? baseUrl = _configuration["CityGuide:FrontendBaseUrl"];
        string? secret = _configuration["CityGuide:RevalidateSecret"];
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(secret))
        {
            return;
        }

        try
        {
            HttpClient http = _httpClientFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(10);
            var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"{baseUrl.TrimEnd('/')}/api/revalidate?tag={Uri.EscapeDataString(tag)}");
            request.Headers.Add("x-revalidate-secret", secret);
            HttpResponseMessage response = await http.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Frontend revalidation of {Tag} returned {Status}", tag, (int)response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Frontend revalidation of {Tag} failed", tag);
        }
    }
}
