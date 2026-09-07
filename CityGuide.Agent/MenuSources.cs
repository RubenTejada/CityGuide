using System.Text.Json;
using System.Text.RegularExpressions;

using PDFtoImage;

using SkiaSharp;

namespace CityGuide.Agent;

/// <summary>The pages of one menu and the address they were read from. The source is
/// stored beside the images: it is what an editor follows to check a price, and what
/// the page declares as "hasMenu" to a search engine.</summary>
public record FoundMenu(IReadOnlyList<FoundImage> Pages, string SourceUrl);

/// <summary>
/// The menu of a restaurant, read from its own site. Google's Places API states no
/// menu — only the address of the site — so this is the one source there is, and it
/// answers in the three shapes a restaurant publishes: a PDF (rasterized here, one
/// image per page), the pictures of a printed carta uploaded to a "menú" page, or a
/// single image linked straight from the home page.
///
/// Nothing here is billed: the site is fetched over the same throttled client every
/// free source uses. A restaurant that publishes its carta only on Instagram has no
/// menu as far as this pass is concerned, and a place without one keeps its page
/// exactly as it was.
/// </summary>
public partial class MenuSources(WebFiles web, int maxPages)
{
    /// <summary>How many links off the home page are followed before giving up. A site
    /// that says "menú" in four places and means none of them is not worth a fifth
    /// request.</summary>
    private const int MaxCandidates = 4;

    /// <summary>A picture too small to read is not a menu page: it is the icon beside
    /// the word "menú" in the navigation bar.</summary>
    private const int MinImageBytes = 20_000;

    [GeneratedRegex("""<script[^>]+application/ld\+json[^>]*>(.*?)</script>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex LdJsonBlock();

    [GeneratedRegex("""<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex AnchorTag();

    [GeneratedRegex("""<img\b[^>]*>""", RegexOptions.IgnoreCase)]
    private static partial Regex ImageTag();

    // Lazy-loaded images carry the real address in a data attribute and a placeholder
    // in "src", so the data ones are read first — the order of the alternatives is
    // what decides, since only the first match of the tag is taken.
    [GeneratedRegex("""(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']""",
        RegexOptions.IgnoreCase)]
    private static partial Regex ImageSource();

    [GeneratedRegex("""alt=["']([^"']*)["']""", RegexOptions.IgnoreCase)]
    private static partial Regex ImageAlt();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex Tag();

    /// <summary>What a link or a file name says when it leads to the carta. Normalized,
    /// so "Menú" and "MENU" are the same word.</summary>
    private static readonly string[] MenuWords =
        ["menu", "menus", "carta", "cartas", "comida", "platos", "food"];

    private static bool SaysMenu(string? text) =>
        text is not null && MenuWords.Any(TextMatch.Normalize(text).Contains);

    /// <summary>Sites that hold somebody else's catalogue: a delivery app, a booking
    /// service, a review portal. A restaurant that stores one of them as its website is
    /// left alone — their terms do not allow copying what they list, and the prices
    /// there are theirs and not the restaurant's.</summary>
    private static readonly string[] AggregatorHosts =
    [
        "pedidosya.com", "ubereats.com", "uber.com", "rappi.com", "glovoapp.com",
        "doordash.com", "grubhub.com", "wolt.com", "tripadvisor.com", "tripadvisor.es",
        "opentable.com", "reservaya.com.do", "yelp.com", "zomato.com", "thefork.com",
        "restaurantguru.com", "sirved.com", "menupages.com",
    ];

    /// <summary>Whether this pass may read a place's website at all: an address it can
    /// fetch (see WebFiles) that is the restaurant's own and not a catalogue somebody
    /// else owns. The pass filters its candidates by this before spending a request.</summary>
    public static bool CanRead(string? website) =>
        WebFiles.ReadableSite(website) is Uri site
        && !AggregatorHosts.Any(host =>
            site.Host.Equals(host, StringComparison.OrdinalIgnoreCase)
            || site.Host.EndsWith($".{host}", StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// The menu published on <paramref name="website"/>, or null when the site has
    /// none this side can read. The home page is asked first — for what it declares as
    /// its menu (schema.org "hasMenu") and for the links that say so — and each
    /// candidate is followed once: a PDF becomes one image per page, a page becomes the
    /// menu pictures on it, and a page that only links the PDF is followed one step
    /// further. The first candidate that yields pages wins; nothing accumulates across
    /// two of them, since two links usually mean the same carta twice.
    /// </summary>
    public async Task<FoundMenu?> FindAsync(string? website)
    {
        if (!CanRead(website)
            || WebFiles.ReadableSite(website) is not Uri site
            || await web.GetStringAsync(site.AbsoluteUri) is not string html)
        {
            return null;
        }

        foreach (Uri candidate in MenuLinks(html, site).Take(MaxCandidates))
        {
            if (await PagesAtAsync(candidate, followLinks: true) is { Count: > 0 } pages)
            {
                return new FoundMenu(pages, candidate.AbsoluteUri);
            }
        }

        return null;
    }

    /// <summary>
    /// The menu pages one address holds: a PDF rasterized page by page, an image taken
    /// as the single page it is, or the menu pictures of an HTML page. A page that
    /// carries no picture of its own but links the PDF is followed one step further,
    /// which is the shape of most restaurant sites — "Nuestra carta" is a page with a
    /// download button on it.
    /// </summary>
    private async Task<IReadOnlyList<FoundImage>> PagesAtAsync(Uri url, bool followLinks)
    {
        if (await web.GetFileAsync(url.AbsoluteUri) is not (byte[] bytes, string contentType))
        {
            return [];
        }

        if (contentType.Contains("pdf", StringComparison.OrdinalIgnoreCase))
        {
            return PdfPages(bytes, url);
        }

        if (contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return contentType.Contains("svg", StringComparison.OrdinalIgnoreCase)
                || bytes.Length < MinImageBytes
                    ? []
                    : [new FoundImage(bytes, contentType, $"Sitio del lugar — {url.Host}")];
        }

        if (!contentType.Contains("html", StringComparison.OrdinalIgnoreCase))
        {
            return [];
        }

        string html = System.Text.Encoding.UTF8.GetString(bytes);
        if (await MenuImagesAsync(html, url) is { Count: > 0 } pictures)
        {
            return pictures;
        }

        if (!followLinks)
        {
            return [];
        }

        // "Nuestra carta" reached, and it is a page with a PDF on it: one more step,
        // and only towards a file — following a second HTML page would walk the site.
        foreach (Uri nested in MenuLinks(html, url).Where(IsFile).Take(2))
        {
            if (await PagesAtAsync(nested, followLinks: false) is { Count: > 0 } pages)
            {
                return pages;
            }
        }

        return [];
    }

    /// <summary>Every page of a PDF as a PNG, capped at what a menu is worth showing.
    /// A file this side cannot render — encrypted, or not the PDF its content type
    /// claimed — costs the place its menu and nothing else.</summary>
    private IReadOnlyList<FoundImage> PdfPages(byte[] pdf, Uri url)
    {
        try
        {
            var pages = new List<FoundImage>();
            // 1.400 px wide is a page that reads on a phone and in the viewer without
            // being a photograph-sized download; the height follows the paper. A menu
            // page is a photograph of dishes as often as it is text, and a JPEG of it
            // weighs a quarter of the PNG at a quality nobody can tell apart.
            var options = new RenderOptions(Width: 1400, WithAspectRatio: true);
            // pdfium is shipped for Windows, macOS and Linux, which is every platform
            // the agent runs on — locally and in its container.
#pragma warning disable CA1416
            foreach (SKBitmap page in Conversion.ToImages(pdf, (string?)null, options).Take(maxPages))
#pragma warning restore CA1416
            {
                using (page)
                {
                    using SKData jpeg = page.Encode(SKEncodedImageFormat.Jpeg, 85);
                    pages.Add(new FoundImage(
                        jpeg.ToArray(), "image/jpeg", $"Sitio del lugar — {url.Host} (PDF)"));
                }
            }

            return pages;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"    ! PDF {url}: {ex.Message}");
            return [];
        }
    }

    /// <summary>
    /// The pictures of a menu on an HTML page: the images whose own address or
    /// description says so. Every other image on the page is the dining room, the chef
    /// and the logo, which is why nothing is taken on size alone.
    /// </summary>
    private async Task<IReadOnlyList<FoundImage>> MenuImagesAsync(string html, Uri page)
    {
        var pages = new List<FoundImage>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match tag in ImageTag().Matches(html))
        {
            if (pages.Count >= maxPages
                || ImageSource().Match(tag.Value) is not { Success: true } source
                || !Uri.TryCreate(page, source.Groups[1].Value.Trim(), out Uri? image)
                || !seen.Add(image.AbsoluteUri))
            {
                continue;
            }

            string alt = ImageAlt().Match(tag.Value) is { Success: true } altText
                ? altText.Groups[1].Value
                : "";
            if ((!SaysMenu(image.AbsolutePath) && !SaysMenu(alt))
                || await web.GetFileAsync(image.AbsoluteUri) is not (byte[] bytes, string contentType)
                || !contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
                || contentType.Contains("svg", StringComparison.OrdinalIgnoreCase)
                || bytes.Length < MinImageBytes)
            {
                continue;
            }

            pages.Add(new FoundImage(bytes, contentType, $"Sitio del lugar — {page.Host}"));
        }

        return pages;
    }

    /// <summary>
    /// Where a page says its menu is, best first: what it declares to a search engine
    /// ("hasMenu"), then the files whose name says "carta" — the PDF is the menu
    /// itself, not a page about it — and last the links whose address or text says so.
    /// A link off the site is dropped: a restaurant's "menú" button often opens a
    /// delivery app, whose catalogue is not this portal's to copy.
    /// </summary>
    private static IEnumerable<Uri> MenuLinks(string html, Uri page)
    {
        var declared = new List<Uri>();
        var files = new List<Uri>();
        var links = new List<Uri>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(List<Uri> bucket, string href)
        {
            // "#menu" is the navigation scrolling down the page it is already on.
            if (href.StartsWith('#')
                || !Uri.TryCreate(page, href.Trim(), out Uri? url)
                || (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps)
                || !SameSite(url, page)
                || !seen.Add(url.AbsoluteUri))
            {
                return;
            }

            bucket.Add(url);
        }

        foreach (string href in DeclaredMenus(html))
        {
            Add(declared, href);
        }

        foreach (Match anchor in AnchorTag().Matches(html))
        {
            string href = anchor.Groups[1].Value;
            string text = Tag().Replace(anchor.Groups[2].Value, " ");
            if (!SaysMenu(href) && !SaysMenu(text))
            {
                continue;
            }

            Add(Uri.TryCreate(page, href.Trim(), out Uri? url) && IsFile(url) ? files : links, href);
        }

        return declared.Concat(files).Concat(links);
    }

    /// <summary>Whether two addresses belong to the same site. "www" is not part of
    /// the answer: a site served at www.restaurante.com links its own carta as
    /// restaurante.com half the time, and reading that as another site is what would
    /// leave the PDF unread.</summary>
    private static bool SameSite(Uri url, Uri page) =>
        Bare(url).Equals(Bare(page), StringComparison.OrdinalIgnoreCase);

    private static string Bare(Uri url) =>
        url.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? url.Host[4..] : url.Host;

    /// <summary>An address that is the menu rather than a page about it.</summary>
    private static bool IsFile(Uri url) =>
        Path.GetExtension(url.AbsolutePath) is ".pdf" or ".jpg" or ".jpeg" or ".png" or ".webp";

    /// <summary>
    /// The "hasMenu" of the page's own structured data, however it is written: a URL,
    /// an object carrying one, or a list of either. It is the only statement on the
    /// page that means "this is the menu" instead of merely reading like it.
    /// </summary>
    private static IEnumerable<string> DeclaredMenus(string html)
    {
        foreach (Match block in LdJsonBlock().Matches(html))
        {
            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(block.Groups[1].Value);
            }
            catch (JsonException)
            {
                continue;
            }

            using (document)
            {
                foreach (string url in MenuUrls(document.RootElement))
                {
                    yield return url;
                }
            }
        }
    }

    /// <summary>Every "hasMenu" (or "menu") value anywhere in a structured-data
    /// document: the restaurant is often nested inside an "@graph" or an array of
    /// several things the page describes.</summary>
    private static IEnumerable<string> MenuUrls(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Array:
                foreach (string url in element.EnumerateArray().SelectMany(MenuUrls))
                {
                    yield return url;
                }

                break;
            case JsonValueKind.Object:
                foreach (JsonProperty property in element.EnumerateObject())
                {
                    bool isMenu = property.NameEquals("hasMenu") || property.NameEquals("menu");
                    foreach (string url in isMenu ? MenuValues(property.Value) : MenuUrls(property.Value))
                    {
                        yield return url;
                    }
                }

                break;
        }
    }

    /// <summary>The address inside a "hasMenu": the string itself, the "url" of the
    /// object, or each of a list.</summary>
    private static IEnumerable<string> MenuValues(JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.String when value.GetString() is { Length: > 0 } url:
                yield return url;
                break;
            case JsonValueKind.Array:
                foreach (string url in value.EnumerateArray().SelectMany(MenuValues))
                {
                    yield return url;
                }

                break;
            case JsonValueKind.Object when value.TryGetProperty("url", out JsonElement url)
                && url.GetString() is { Length: > 0 } address:
                yield return address;
                break;
        }
    }
}
