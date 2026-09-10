using Microsoft.Extensions.Caching.Memory;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// What the portal's public forms — the contact one and the reservation one — need from
/// the CMS and from the request, in one place: the inbox each files into, the trimming
/// every field gets, who is sending as far as a throttle needs to know, and the throttle
/// itself. Both endpoints are open to anyone, so both guard the same way.
/// </summary>
internal static class PublicForms
{
    /// <summary>
    /// The single inbox node of a type, under the site root, or null when the schema or
    /// the node is missing (an installation that has not run the seeder yet).
    /// </summary>
    public static IContent? FindInbox(
        IContentService contentService,
        IContentTypeService contentTypeService,
        string contentTypeAlias)
    {
        if (contentTypeService.Get(contentTypeAlias) is null)
        {
            return null;
        }

        IContent? site = contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        return site is null
            ? null
            : contentService
                .GetPagedChildren(site.Id, 0, 100, out _, null, null, null, false)
                .FirstOrDefault(c => c.ContentType.Alias == contentTypeAlias);
    }

    /// <summary>Trimmed and capped: the visitor decides the text, not its length.</summary>
    public static string Clean(string? value, int maxLength)
    {
        string trimmed = value?.Trim() ?? string.Empty;
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    /// <summary>An empty optional field reads better as a dash than as nothing.</summary>
    public static string Or(string value) => string.IsNullOrEmpty(value) ? "—" : value;

    /// <summary>
    /// Who is sending, as far as a throttle needs to know. The portal calls these
    /// endpoints server-side, so without the forwarded address every visitor would share
    /// one bucket. It is a courtesy limit and the header can be forged; what actually
    /// guards an inbox is the validation and the honeypot on each endpoint.
    /// </summary>
    public static string? ClientAddress(HttpContext context)
    {
        string? forwarded = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        string? first = forwarded?.Split(',').FirstOrDefault()?.Trim();
        return string.IsNullOrEmpty(first)
            ? context.Connection.RemoteIpAddress?.ToString()
            : first;
    }

    /// <summary>Submissions one address made inside the current hour.</summary>
    private sealed class SendCount
    {
        public int Value;
    }

    /// <summary>
    /// Counts what one address sent in the last hour. In memory on purpose: this stops
    /// the obvious flood, and a restart losing the count costs nothing. The counter is
    /// mutated in place so a new submission never pushes the window forward.
    /// </summary>
    public static bool WithinRateLimit(IMemoryCache cache, string bucket, string? address, int maxPerHour)
    {
        if (address is null)
        {
            return true;
        }

        SendCount count = cache.GetOrCreate($"{bucket}:{address}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
            return new SendCount();
        })!;
        return Interlocked.Increment(ref count.Value) <= maxPerHour;
    }
}
