using System.Text.Json;
using System.Text.RegularExpressions;

using PDFtoImage;

using SkiaSharp;

namespace CityGuide.Agent;

/// <summary>
/// One menu and the address it was read from, in whichever of the two shapes the site
/// publishes: the pages of a carta as images, or the text of a menu page for the model
/// to structure. Never both — a site that scans its carta has no text to read, and one
/// that writes it out has no pages. The source is stored beside either: it is what an
/// editor follows to check a price, and what the page declares as "hasMenu" to a search
/// engine.
/// </summary>
public record FoundMenu(IReadOnlyList<FoundImage> Pages, string SourceUrl, string? Text = null);

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
public partial class MenuSources(WebFiles web, int maxPages, int maxTextCharacters)
{
    /// <summary>How many links off the home page are followed before giving up. A site
    /// that says "menú" in four places and means none of them is not worth a fifth
    /// request.</summary>
    private const int MaxCandidates = 4;

    /// <summary>A picture too small to read is not a menu page: it is the icon beside
    /// the word "menú" in the navigation bar.</summary>
    private const int MinImageBytes = 20_000;

    /// <summary>How many prices a page has to show before its text is taken for a
    /// carta. One is a "desde RD$500" on the home page; several are a menu.</summary>
    private const int MinPrices = 5;

    /// <summary>Shorter than this the page is a banner, not a carta.</summary>
    private const int MinTextLength = 300;

    [GeneratedRegex("""<script[^>]+application/ld\+json[^>]*>(.*?)</script>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex LdJsonBlock();

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

    /// <summary>A price as a Dominican carta writes it. The currency is what tells a
    /// menu from an article about the restaurant.</summary>
    [GeneratedRegex(@"(?:RD\$|US\$|\$)\s?\d")]
    private static partial Regex Price();

    /// <summary>What a link or a file name says when it leads to the carta. Normalized,
    /// so "Menú" and "MENU" are the same word.</summary>
    private static readonly string[] MenuWords =
        ["menu", "menus", "carta", "cartas", "comida", "platos", "food"];

    /// <summary>Everything that separates one word from another in a link, a file name
    /// or the text on a button: a path is words too, only punctuated differently, and a
    /// digit ends a word as surely as a hyphen ("Menu2024.pdf").</summary>
    [GeneratedRegex("[^a-z]+")]
    private static partial Regex NotWord();

    /// <summary>Whether a link, a file name or the words on a button say "carta" — as a
    /// word of its own and not as a run of letters inside one. A menu host writes its
    /// own name into every address it serves ("imenupro" carries "menu"), so a substring
    /// match takes the thumbnail of every dish for a page of the carta.</summary>
    private static bool SaysMenu(string? text) =>
        text is not null
        && NotWord().Split(TextMatch.Normalize(text))
            .Any(word => MenuWords.Contains(word, StringComparer.Ordinal));

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
    ///
    /// Which is why <paramref name="name"/> decides the order: one site publishes
    /// several cartas when it belongs to a club or a hotel with more than one
    /// restaurant, and each is named after the place it feeds
    /// ("menu-cabamar", "menu-cafeteria"). Without that the first link wins and a
    /// restaurant is given the cafeteria's menu.
    /// </summary>
    public async Task<FoundMenu?> FindAsync(string? website, string name)
    {
        if (!CanRead(website)
            || WebFiles.ReadableSite(website) is not Uri site
            || await web.GetStringAsync(site.AbsoluteUri) is not string html)
        {
            return null;
        }

        FoundMenu? text = null;
        IEnumerable<Uri> candidates = MenuLinks(html, site)
            .OrderByDescending(url => TextMatch.Matches(name, url.AbsoluteUri));
        foreach (Uri candidate in candidates.Take(MaxCandidates))
        {
            FoundMenu? found = await ReadAsync(candidate, followLinks: true);
            if (found is { Pages.Count: > 0 })
            {
                return found;
            }

            // A page written out in text is an answer, but the wrong one while another
            // candidate may still hold the scanned carta: it is kept and returned last.
            text ??= found;
        }

        // A site of one page keeps its carta on the page it has, and no link leads to it.
        return text ?? MenuText(html, site);
    }

    /// <summary>
    /// The menu one address holds: a PDF rasterized page by page, an image taken as the
    /// single page it is, the menu pictures of an HTML page — or, when the page carries
    /// no picture of its own, the text of the carta written out on it. A page that only
    /// links the PDF is followed one step further, which is the shape of most restaurant
    /// sites: "Nuestra carta" is a page with a download button on it.
    /// </summary>
    private async Task<FoundMenu?> ReadAsync(Uri url, bool followLinks)
    {
        if (await web.GetFileAsync(url.AbsoluteUri) is not (byte[] bytes, string contentType))
        {
            return null;
        }

        if (contentType.Contains("pdf", StringComparison.OrdinalIgnoreCase))
        {
            return Menu(PdfPages(bytes, url), url);
        }

        if (contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return contentType.Contains("svg", StringComparison.OrdinalIgnoreCase)
                || bytes.Length < MinImageBytes
                    ? null
                    : Menu([new FoundImage(bytes, contentType, $"Sitio del lugar — {url.Host}")], url);
        }

        if (!contentType.Contains("html", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        string html = System.Text.Encoding.UTF8.GetString(bytes);
        if (await MenuImagesAsync(html, url) is { Count: > 0 } pictures)
        {
            return Menu(pictures, url);
        }

        // "Nuestra carta" reached, and it is a page with a PDF on it: one more step,
        // and only towards a file — following a second HTML page would walk the site.
        if (followLinks)
        {
            foreach (Uri nested in MenuLinks(html, url).Where(IsFile).Take(2))
            {
                if (await ReadAsync(nested, followLinks: false) is { Pages.Count: > 0 } found)
                {
                    return found;
                }
            }
        }

        if (MenuText(html, url) is { } written)
        {
            return written;
        }

        // A menu page with nothing on it is a frame around somebody's menu maker
        // (iMenuPro, Flipsnack, a Drive viewer): the carta is one request further, on a
        // host CanRead already vouches for. Only from a page that said it was the menu,
        // and never from that page in turn, or the pass would walk the web.
        if (followLinks)
        {
            foreach (Uri frame in Frames(html, url).Take(2))
            {
                if (await ReadAsync(frame, followLinks: false) is { } embedded)
                {
                    return embedded;
                }
            }
        }

        return null;
    }

    private static FoundMenu? Menu(IReadOnlyList<FoundImage> pages, Uri url) =>
        pages.Count > 0 ? new FoundMenu(pages, url.AbsoluteUri) : null;

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
            // A menu link may leave the site: half the restaurants that publish a carta
            // at all publish it on a menu host (iMenuPro, Flipsnack, a Drive PDF), and
            // that is still their own carta — what CanRead keeps out is the delivery app
            // and the review portal, whose prices belong to somebody else.
            if (href.StartsWith('#')
                || !Uri.TryCreate(page, href.Trim(), out Uri? url)
                || (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps)
                || !(WebFiles.SameSite(url, page) || CanRead(url.AbsoluteUri))
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

        foreach ((string href, string text) in WebFiles.Anchors(html))
        {
            if (!SaysMenu(href) && !SaysMenu(text))
            {
                continue;
            }

            Add(Uri.TryCreate(page, href.Trim(), out Uri? url) && IsFile(url) ? files : links, href);
        }

        return declared.Concat(files).Concat(links);
    }

    [GeneratedRegex("""<iframe\b[^>]*src=["']([^"']+)["']""", RegexOptions.IgnoreCase)]
    private static partial Regex FrameTag();

    /// <summary>What a page embeds, when that is an address this pass may read: the
    /// menu makers a restaurant frames instead of publishing the carta itself.</summary>
    private static IEnumerable<Uri> Frames(string html, Uri page)
    {
        foreach (Match tag in FrameTag().Matches(html))
        {
            if (Uri.TryCreate(page, tag.Groups[1].Value.Trim(), out Uri? url)
                && (WebFiles.SameSite(url, page) || CanRead(url.AbsoluteUri)))
            {
                yield return url;
            }
        }
    }

    /// <summary>
    /// The text of a page when it reads like a carta, capped at what one model call is
    /// worth. Half the restaurants write their menu out — sections, dishes and prices as
    /// HTML — and a picture is not what that is; this is what the model turns into the
    /// carta the portal renders.
    ///
    /// A page only counts when it carries prices, several of them. Without that rule the
    /// "Nosotros" page of every restaurant would be sent to the model, which would
    /// dutifully invent a menu out of it.
    /// </summary>
    private FoundMenu? MenuText(string html, Uri url)
    {
        string text = WebFiles.ReadableText(html);
        if (Price().Matches(text).Count < MinPrices)
        {
            // A menu maker writes the dishes into the page and draws the prices in the
            // browser, out of a payload the page carries with it: the visible text of
            // such a carta shows every section and not one price. Reading that payload
            // is what reaches those menus without a headless browser — and it is still
            // the page saying what it costs. A page with no prices anywhere has none,
            // and is left alone by the check below.
            text = $"{text}\n{ScriptText(html)}";
        }

        if (text.Length < MinTextLength || Price().Matches(text).Count < MinPrices)
        {
            return null;
        }

        return new FoundMenu(
            [],
            url.AbsoluteUri,
            text.Length > maxTextCharacters ? text[..maxTextCharacters] : text);
    }

    [GeneratedRegex("""<script\b(?![^>]*\bsrc=)[^>]*>(.*?)</script>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex InlineScript();

    /// <summary>What the page carries for its own scripts to draw, flattened: the data
    /// of a menu the browser renders. Only what the page itself holds — a file it loads
    /// is another request, and a carta is never worth walking a bundle for.</summary>
    private static string ScriptText(string html) =>
        string.Join(
            "\n",
            InlineScript().Matches(html).Select(block => block.Groups[1].Value.Trim()));

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
