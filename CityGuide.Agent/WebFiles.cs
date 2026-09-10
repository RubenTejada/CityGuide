using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>
/// The plain web fetches the free sources share: the place's own site and Wikimedia
/// answer over the same throttled client, with the same agent string, and a request
/// that fails is never allowed to take down the pass that made it. What the bytes are
/// good for is each caller's business — a photo has to be an image over 15 KB, a menu
/// may also be a PDF — so nothing here filters by content type.
/// </summary>
public partial class WebFiles(HttpClient http)
{
    /// <summary>Wikimedia's policy asks for an agent that identifies the tool and
    /// says where to reach it; the same one goes to every site so nobody has to guess
    /// who is fetching. The portal's own contact page is the address.</summary>
    private const string UserAgent =
        "QueHacerRD-Agent/1.0 (+https://quehacerrd.com/santo-domingo/contacto)";

    /// <summary>Places whose "website" is a social profile: nothing there is
    /// addressable — the og:image is the account's avatar and the menu is a photo in a
    /// feed no request may read — so both free sources leave them alone.</summary>
    private static readonly string[] SocialHosts =
        ["instagram.com", "facebook.com", "fb.com", "linktr.ee", "x.com", "twitter.com", "tiktok.com"];

    /// <summary>The site a place stores, when it is one this agent may read: an
    /// absolute http(s) address that is not a social profile. Null otherwise.</summary>
    public static Uri? ReadableSite(string? website) =>
        Uri.TryCreate(website, UriKind.Absolute, out Uri? site)
        && (site.Scheme == Uri.UriSchemeHttp || site.Scheme == Uri.UriSchemeHttps)
        && !SocialHosts.Any(host => site.Host.EndsWith(host, StringComparison.OrdinalIgnoreCase))
            ? site
            : null;

    /// <summary>The body of a page as text, or null when the request failed.</summary>
    public async Task<string?> GetStringAsync(string url)
    {
        try
        {
            HttpResponseMessage response = await SendAsync(url);
            return response.IsSuccessStatusCode ? await response.Content.ReadAsStringAsync() : null;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! fuente gratuita {url}: {ex.Message}");
            return null;
        }
    }

    /// <summary>A file with the content type the server declared, or null when the
    /// request failed. The declared type is what the caller decides on: a site serving
    /// an HTML error page where a picture was announced must not be taken for one.</summary>
    public async Task<(byte[] Bytes, string ContentType)?> GetFileAsync(string url)
    {
        try
        {
            HttpResponseMessage response = await SendAsync(url);
            if (!response.IsSuccessStatusCode
                || response.Content.Headers.ContentType?.MediaType is not string contentType)
            {
                return null;
            }

            return (await response.Content.ReadAsByteArrayAsync(), contentType);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! archivo gratuito {url}: {ex.Message}");
            return null;
        }
    }

    [GeneratedRegex("""<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex AnchorTag();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex Tag();

    [GeneratedRegex("""<(script|style|noscript|svg)\b[^>]*>.*?</\1>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex Noise();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>The links of a page with the words a reader sees on them, in the order
    /// they appear. Every pass that walks a place's own site looks for the same thing —
    /// a link whose address or label says what is behind it — so the scan lives here
    /// rather than once per pass.</summary>
    public static IEnumerable<(string Href, string Text)> Anchors(string html)
    {
        foreach (Match anchor in AnchorTag().Matches(html))
        {
            yield return (anchor.Groups[1].Value, Tag().Replace(anchor.Groups[2].Value, " "));
        }
    }

    /// <summary>An HTML page as the text a reader sees: scripts and styles dropped, every
    /// tag a line break, entities decoded, blank lines collapsed. Crude on purpose — the
    /// model reads it, and neither a carta nor an agenda minds being flattened.</summary>
    public static string ReadableText(string html)
    {
        string stripped = Tag().Replace(Noise().Replace(html, " "), "\n");
        IEnumerable<string> lines = System.Net.WebUtility.HtmlDecode(stripped)
            .Split('\n')
            .Select(line => Whitespace().Replace(line, " ").Trim())
            .Where(line => line.Length > 0);
        return string.Join("\n", lines);
    }

    /// <summary>Whether two addresses belong to the same site. "www" is not part of
    /// the answer: a site served at www.restaurante.com links its own carta as
    /// restaurante.com half the time, and reading that as another site is what would
    /// leave the PDF unread.</summary>
    public static bool SameSite(Uri url, Uri page) =>
        Bare(url).Equals(Bare(page), StringComparison.OrdinalIgnoreCase);

    private static string Bare(Uri url) =>
        url.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? url.Host[4..] : url.Host;

    private Task<HttpResponseMessage> SendAsync(string url)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("user-agent", UserAgent);
        return http.SendAsync(request);
    }
}
