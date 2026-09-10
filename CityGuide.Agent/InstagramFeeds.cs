using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>An Instagram business account as Meta's business discovery describes it.</summary>
public record InstagramProfile(
    string Username, string? Name, int Followers, int MediaCount,
    IReadOnlyList<InstagramPost> Posts);

/// <summary>One publication of that account: what it says, when, and where it is.</summary>
public record InstagramPost(
    DateTimeOffset Taken, string MediaType, string? Caption, string Permalink, string? MediaUrl);

/// <summary>
/// The Instagram handle a place stores as its website.
///
/// It is where the events of a beach town are announced. A bar in Juan Dolio has no
/// site of its own — <see cref="EventSources"/> finds nothing to read for it, because
/// <see cref="MenuSources.CanRead"/> refuses instagram.com like every other social
/// profile — and yet the same node already carries the address of the feed where its
/// live music is written down every week. Nothing has to be captured by hand: the
/// handle is the "website" the CMS holds.
///
/// Only Meta's own business discovery reads that feed (see
/// <see cref="MetaClient.DiscoverAsync"/>). Scraping instagram.com is a login wall from
/// a datacenter address, which is what already answers the agent's runner with 405 on
/// Eventbrite, and it is against the network's terms besides.
/// </summary>
public static partial class InstagramFeeds
{
    /// <summary>Path segments of instagram.com that name something other than an
    /// account: a post, a reel, a story. A place whose "website" points at one names no
    /// feed this side can follow.</summary>
    private static readonly HashSet<string> NotAnAccount = new(StringComparer.OrdinalIgnoreCase)
    {
        "p", "reel", "reels", "stories", "explore", "tv", "s", "accounts", "direct", "about",
    };

    /// <summary>
    /// The account <paramref name="website"/> points at, or null when it points at
    /// something else — a real site, a Facebook page, one single post. The value stored
    /// in the CMS is whatever an editor or a Google answer wrote there, so a bare
    /// "instagram.com/…" without a scheme and a plain "@cuenta" are both read.
    /// </summary>
    public static string? HandleOf(string? website)
    {
        if (string.IsNullOrWhiteSpace(website))
        {
            return null;
        }

        string value = website.Trim();
        if (value.StartsWith('@'))
        {
            return Handle(value[1..]);
        }

        if (!value.Contains("://", StringComparison.Ordinal))
        {
            value = $"https://{value}";
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out Uri? url)
            || !IsInstagram(url.Host)
            || url.Segments.Length < 2)
        {
            return null;
        }

        string first = url.Segments[1].Trim('/');
        return NotAnAccount.Contains(first) ? null : Handle(first);
    }

    private static bool IsInstagram(string host)
    {
        host = host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? host[4..] : host;
        return host.Equals("instagram.com", StringComparison.OrdinalIgnoreCase)
            || host.Equals("instagr.am", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>A handle is letters, digits, dots and underscores and nothing else:
    /// anything left over is a path or a query string that came along.</summary>
    private static string? Handle(string value)
    {
        value = value.Split('?')[0].Split('/')[0].TrimStart('@').Trim();
        return value.Length > 0 && HandleShape().IsMatch(value) ? value.ToLowerInvariant() : null;
    }

    [GeneratedRegex(@"^[A-Za-z0-9._]{1,30}$")]
    private static partial Regex HandleShape();
}
