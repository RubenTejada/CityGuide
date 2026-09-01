using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// Tells the Next.js frontend to drop its cached Delivery API responses as soon
/// as content changes, so editors see their edits without waiting out the
/// time-based revalidation window. Fire-and-forget: a frontend that is down or
/// unconfigured must never fail a publish.
///
/// Configuration (App Service settings in production):
///   CityGuide:FrontendBaseUrl    e.g. https://quehacerrd.com
///   CityGuide:RevalidateSecret   shared with the frontend's REVALIDATE_SECRET
/// </summary>
public class FrontendCacheInvalidator :
    INotificationAsyncHandler<ContentPublishedNotification>,
    INotificationAsyncHandler<ContentUnpublishedNotification>,
    INotificationAsyncHandler<ContentDeletedNotification>,
    INotificationAsyncHandler<ContentMovedToRecycleBinNotification>
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FrontendCacheInvalidator> _logger;

    public FrontendCacheInvalidator(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<FrontendCacheInvalidator> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public Task HandleAsync(ContentPublishedNotification notification, CancellationToken cancellationToken)
        => InvalidateAsync(cancellationToken);

    public Task HandleAsync(ContentUnpublishedNotification notification, CancellationToken cancellationToken)
        => InvalidateAsync(cancellationToken);

    public Task HandleAsync(ContentDeletedNotification notification, CancellationToken cancellationToken)
        => InvalidateAsync(cancellationToken);

    public Task HandleAsync(ContentMovedToRecycleBinNotification notification, CancellationToken cancellationToken)
        => InvalidateAsync(cancellationToken);

    private async Task InvalidateAsync(CancellationToken cancellationToken)
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
            var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/api/revalidate");
            request.Headers.Add("x-revalidate-secret", secret);
            HttpResponseMessage response = await http.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Frontend revalidation returned {Status}", (int)response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Frontend revalidation failed");
        }
    }
}
