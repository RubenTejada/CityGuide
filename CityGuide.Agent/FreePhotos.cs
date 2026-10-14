using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>An image and where it came from; the source goes into the media item's
/// name, so an editor opening the Media library can tell a Wikimedia photo from a
/// Google one and follow it back to its licence. <paramref name="Credit"/> is what the
/// page has to print beside it, and is null for a picture that needs none — the one a
/// venue or an event publishes of itself.</summary>
public record FoundImage(byte[] Bytes, string ContentType, string Source, PhotoCredit? Credit = null);

/// <summary>
/// Who took a photo, under what licence, and the page it is published on. A Commons
/// photograph is CC BY or CC BY-SA or public domain, and the first two are only ours to
/// show with the author's name, the licence and a link (Ley 65-00 makes the name a moral
/// right besides); a Google place photo may only be shown with the attribution Google
/// hands over with it. Stored on the media item (photoAuthor, photoLicense, photoSource),
/// so the credit travels with the picture wherever a node points at it. The licence is
/// null for Google, whose photos carry terms rather than one; the frontend names the
/// provider from the address of the source.
/// </summary>
public record PhotoCredit(string? Author, string? License, string? Source)
{
    public bool IsEmpty =>
        string.IsNullOrWhiteSpace(Author) && string.IsNullOrWhiteSpace(License) && string.IsNullOrWhiteSpace(Source);
}

/// <summary>
/// The images that cost nothing, tried before Google's. A Google place photo is
/// billed per download ($7 per 1.000, 1.000 free a month) while these are free, and
/// for the places a guide leads with — a monument, a beach, a park — Wikimedia
/// Commons is also the better picture: a photograph of the whole landmark instead of
/// a visitor's phone snapshot. For a business it is the other way round, so the
/// order the caller uses is Commons for landmarks, the site's own og:image next, and
/// Google last (see PhotoAsync in Program).
/// </summary>
public partial class FreePhotos(WebFiles web)
{
    [GeneratedRegex("""<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>""",
        RegexOptions.IgnoreCase)]
    private static partial Regex ImageMetaTag();

    [GeneratedRegex("""content=["']([^"']+)["']""", RegexOptions.IgnoreCase)]
    private static partial Regex MetaContent();

    /// <summary>Google types whose places are landmarks: what Commons photographs
    /// well and what a stock storefront picture would waste.</summary>
    private static readonly HashSet<string> LandmarkTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "tourist_attraction", "historical_landmark", "historical_place", "monument", "museum",
        "art_gallery", "cultural_center", "park", "national_park", "state_park", "botanical_garden",
        "beach", "natural_feature", "plaza", "church", "place_of_worship", "cathedral", "mosque",
        "synagogue", "amusement_park", "zoo", "aquarium", "stadium", "arena", "concert_hall",
        "performing_arts_theater", "auditorium", "observation_deck", "marina", "shopping_mall",
    };

    /// <summary>Whether Commons is worth asking for this place: the section it lives
    /// in says so (a node under "atracciones", a plaza) or its Google types do.</summary>
    public static bool IsLandmark(string routePath, IEnumerable<string>? googleTypes = null) =>
        routePath.Split('/').Any(segment => segment.Equals("atracciones", StringComparison.OrdinalIgnoreCase))
        || (googleTypes ?? []).Any(LandmarkTypes.Contains);

    /// <summary>
    /// A Wikimedia Commons photograph of the place, or null. The search is the place
    /// name plus the city, and the bare name when that finds nothing — Commons indexes
    /// "Playa Macao" under Higüey, not under Punta Cana. A hit only counts when the
    /// file's own title carries the significant words of the name, because Commons
    /// answers everything with something: "Pan Oliva, Santo Domingo" would otherwise
    /// come back with a photograph of the Zona Colonial.
    /// </summary>
    public async Task<FoundImage?> FromCommonsAsync(string name, string cityName, GeoArea? cityArea = null)
    {
        // "Santiago de los Caballeros, República Dominicana" narrows the search to
        // nothing; the city on its own is what Commons files a picture under.
        string city = cityName.Split(',')[0].Trim();
        foreach (string search in new[] { $"{name} {city}", name })
        {
            if (await BestCommonsFileAsync(search, name, city, cityArea) is { } file
                && await DownloadAsync(file.ThumbUrl) is (byte[] bytes, string contentType))
            {
                return new FoundImage(bytes, contentType, $"{CommonsSource}{file.Title}", file.Credit);
            }
        }

        return null;
    }

    /// <summary>What a Commons media item's name carries before the file's own title
    /// ("Parque Duarte — Wikimedia Commons — Park Duarte 212.jpg"), which is how the
    /// credit backfill finds the file a picture was downloaded from.</summary>
    public const string CommonsSource = "Wikimedia Commons — ";

    /// <summary>
    /// The credit of each Commons file named, by the title it was asked for ("Park Duarte
    /// 212.jpg", with or without "File:"). One request per fifty titles, and free; a file
    /// Commons no longer holds is simply missing from the answer.
    /// </summary>
    public async Task<Dictionary<string, PhotoCredit>> CommonsCreditsAsync(IEnumerable<string> fileTitles)
    {
        var credits = new Dictionary<string, PhotoCredit>(StringComparer.OrdinalIgnoreCase);
        foreach (string[] batch in fileTitles.Distinct(StringComparer.OrdinalIgnoreCase).Chunk(50))
        {
            string titles = string.Join("|", batch.Select(t =>
                t.StartsWith("File:", StringComparison.OrdinalIgnoreCase) ? t : "File:" + t));
            string url = "https://commons.wikimedia.org/w/api.php?action=query"
                + $"&titles={Uri.EscapeDataString(titles)}&prop=imageinfo&iiprop=url|extmetadata"
                + $"&iiextmetadatafilter={CreditFields}&format=json";

            using JsonDocument? doc = await GetJsonAsync(url);
            if (doc is null || !doc.RootElement.TryGetProperty("query", out JsonElement result)
                || !result.TryGetProperty("pages", out JsonElement pages))
            {
                continue;
            }

            // Commons answers under the title it normalised ("File:Park_Duarte.jpg" comes
            // back as "File:Park Duarte.jpg"), so the answer is keyed back by the name
            // both sides agree on: the title without its prefix, spaces for underscores.
            foreach (JsonElement page in pages.EnumerateObject().Select(p => p.Value))
            {
                if (page.TryGetProperty("title", out JsonElement title)
                    && page.TryGetProperty("imageinfo", out JsonElement infos)
                    && infos.GetArrayLength() > 0
                    && CreditOf(infos[0]) is { } credit)
                {
                    credits[BareTitle(title.GetString() ?? "")] = credit;
                }
            }
        }

        return credits;
    }

    /// <summary>A Commons title as both the media name and the API's answer spell it.</summary>
    public static string BareTitle(string title) =>
        (title.StartsWith("File:", StringComparison.OrdinalIgnoreCase) ? title[5..] : title).Replace('_', ' ').Trim();

    /// <summary>The extmetadata fields a credit is read from.</summary>
    private const string CreditFields = "Artist|LicenseShortName";

    /// <summary>
    /// The credit of one Commons file from its imageinfo: the author out of the "Artist"
    /// HTML (a user link, a Flickr link, sometimes a whole paragraph), the licence's short
    /// name and the file's own page. "No machine-readable author" is Commons saying it
    /// does not know, and is stored as no author rather than printed as one — the page
    /// the credit links to names whoever the uploader did.
    /// </summary>
    private static PhotoCredit? CreditOf(JsonElement info)
    {
        string? Field(string name) =>
            info.TryGetProperty("extmetadata", out JsonElement meta)
            && meta.TryGetProperty(name, out JsonElement field)
            && field.TryGetProperty("value", out JsonElement value)
                ? value.GetString()
                : null;

        string? author = Field("Artist") is string html ? AuthorOf(html) : null;
        string? license = Field("LicenseShortName")?.Trim();
        string? page = info.TryGetProperty("descriptionurl", out JsonElement d) ? d.GetString() : null;
        var credit = new PhotoCredit(author, string.IsNullOrEmpty(license) ? null : license, page);
        return credit.IsEmpty ? null : credit;
    }

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex HtmlTag();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    private static string? AuthorOf(string html)
    {
        string text = Whitespace().Replace(WebUtility.HtmlDecode(HtmlTag().Replace(html, " ")), " ").Trim();
        if (text.Length == 0 || text.StartsWith("No machine-readable author", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        // A Flickr import often names its author by the address of the account
        // ("https://www.flickr.com/photos/bez_uk/"): the account is the name.
        if (Uri.TryCreate(text, UriKind.Absolute, out Uri? profile) && profile.Scheme.StartsWith("http"))
        {
            text = profile.Segments.LastOrDefault(s => s.Trim('/').Length > 0)?.Trim('/') ?? profile.Host;
        }

        text = text.StartsWith("User:", StringComparison.OrdinalIgnoreCase) ? text[5..] : text;
        return text.Length > 120 ? text[..117].TrimEnd() + "…" : text;
    }

    private record CommonsFile(string Title, string ThumbUrl, int Width, int Height, PhotoCredit? Credit);

    /// <summary>
    /// The best Commons file for one search: of those whose title carries the place's
    /// name and that are big enough to fill a card, the one whose shape suits it. A
    /// monument is photographed upright and a beach lengthwise, so a portrait is kept
    /// rather than dropped — it is only ranked behind a landscape, and behind both goes
    /// the panorama that would be cropped to a strip.
    /// </summary>
    private async Task<CommonsFile?> BestCommonsFileAsync(
        string search, string name, string city, GeoArea? cityArea)
    {
        // Coordinates and categories ride along on the same request, and they are what
        // says the picture was taken here: Commons holds a "Parque Duarte" in Santiago
        // and another in the Zona Colonial, and only one of them belongs on this page.
        string url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search"
            + $"&gsrsearch={Uri.EscapeDataString(search)}&gsrnamespace=6&gsrlimit=8"
            + "&prop=imageinfo|coordinates|categories&cllimit=20&iiprop=url|size|extmetadata"
            + $"&iiextmetadatafilter={CreditFields}&iiurlwidth=1280&format=json";

        using JsonDocument? doc = await GetJsonAsync(url);
        if (doc is null
            || !doc.RootElement.TryGetProperty("query", out JsonElement result)
            || !result.TryGetProperty("pages", out JsonElement pages))
        {
            return null;
        }

        var candidates = new List<CommonsFile>();
        foreach (JsonElement page in pages.EnumerateObject().Select(p => p.Value))
        {
            if (!page.TryGetProperty("title", out JsonElement titleElement)
                || titleElement.GetString() is not string title
                || !page.TryGetProperty("imageinfo", out JsonElement infos)
                || infos.GetArrayLength() == 0)
            {
                continue;
            }

            JsonElement info = infos[0];
            int width = info.TryGetProperty("width", out JsonElement w) ? w.GetInt32() : 0;
            int height = info.TryGetProperty("height", out JsonElement h) ? h.GetInt32() : 0;
            string? thumb = info.TryGetProperty("thumburl", out JsonElement t) ? t.GetString() : null;
            if (thumb is null || Math.Max(width, height) < 800 || Math.Min(width, height) < 500)
            {
                continue;
            }

            // "File:Monumento a los Héroes de la Restauración 0459.JPG" carries the name;
            // "File:Calvario 2575.jpg" is what a loose search answers with, and
            // "File:RiverScape MetroPark, Dayton" is what a substring match calls a
            // Scape Park — hence whole words, not letters inside one.
            string fileName = title.StartsWith("File:", StringComparison.OrdinalIgnoreCase) ? title[5..] : title;
            string bare = Path.GetFileNameWithoutExtension(fileName);
            if (!TextMatch.MatchesWords(name, bare) || !IsHere(page, bare, name, city, cityArea))
            {
                continue;
            }

            candidates.Add(new CommonsFile(fileName, thumb, width, height, CreditOf(info)));
        }

        return candidates.OrderBy(Shape).ThenByDescending(f => (long)f.Width * f.Height).FirstOrDefault();
    }

    /// <summary>
    /// Whether the file says it was taken in this city. A name alone does not: half the
    /// country has a Parque Duarte and a Playa Bonita. In order of how much it proves —
    /// the file's own coordinates inside the city rectangle, the city named in full in
    /// its title or in one of its categories ("Santiago de los Caballeros"), one word of
    /// the city beside the country, or, for a name distinctive enough to stand on its own
    /// (two significant words or more), the country alone. One word of the city is not
    /// enough by itself: "Santiago" is also Chile, Cuba and Compostela, and the Parque
    /// Central of Santiago de los Caballeros was given a picture of the Santiago metro.
    /// A file that says none of it is left to the next source rather than guessed at.
    /// </summary>
    private static bool IsHere(
        JsonElement page, string title, string name, string city, GeoArea? cityArea)
    {
        if (cityArea is not null
            && page.TryGetProperty("coordinates", out JsonElement coords)
            && coords.GetArrayLength() > 0
            && coords[0].TryGetProperty("lat", out JsonElement lat)
            && coords[0].TryGetProperty("lon", out JsonElement lon))
        {
            return cityArea.Contains(lat.GetDouble(), lon.GetDouble());
        }

        string haystack = TextMatch.Normalize(title + " " + string.Join(" ",
            page.TryGetProperty("categories", out JsonElement categories)
                ? categories.EnumerateArray()
                    .Select(c => c.TryGetProperty("title", out JsonElement t) ? t.GetString() ?? "" : "")
                : []));

        if (haystack.Contains(TextMatch.Normalize(city)))
        {
            return true;
        }

        bool country = haystack.Contains("dominican") || haystack.Contains("dominicana");
        return country
            && (TextMatch.Tokens(city).Any(haystack.Contains) || TextMatch.Tokens(name).Length > 1);
    }

    /// <summary>0 for a card-shaped landscape, 1 for a portrait, 2 for a panorama.</summary>
    private static int Shape(CommonsFile file)
    {
        double ratio = (double)file.Width / file.Height;
        return ratio is >= 1.15 and <= 2.1 ? 0 : ratio < 1.15 ? 1 : 2;
    }

    /// <summary>
    /// The image the place's own site declares for social previews (og:image, else
    /// twitter:image), or null. It is the picture the business chose to represent
    /// itself, which is the next best thing to a Google photo and costs nothing.
    /// </summary>
    public async Task<FoundImage?> FromWebsiteAsync(string website)
    {
        if (WebFiles.ReadableSite(website) is not Uri site)
        {
            return null;
        }

        string? html = await GetStringAsync(site.AbsoluteUri);
        if (html is null)
        {
            return null;
        }

        foreach (Match tag in ImageMetaTag().Matches(html))
        {
            if (MetaContent().Match(tag.Value) is { Success: true } content
                && Uri.TryCreate(site, content.Groups[1].Value.Trim(), out Uri? image)
                && await DownloadAsync(image.AbsoluteUri) is (byte[] bytes, string contentType))
            {
                return new FoundImage(bytes, contentType, $"Sitio del lugar — {image.Host}");
            }
        }

        return null;
    }

    /// <summary>Downloads an image, or null when the answer is not one: a site that
    /// serves an HTML error page for a missing og:image, or a 1 KB placeholder, must
    /// not end up as a place's main picture.</summary>
    private async Task<(byte[] Bytes, string ContentType)?> DownloadAsync(string url)
    {
        if (await web.GetFileAsync(url) is not (byte[] bytes, string contentType))
        {
            return null;
        }

        return !contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
            || contentType.Contains("svg", StringComparison.OrdinalIgnoreCase)
            || bytes.Length < 15_000
                ? null
                : (bytes, contentType);
    }

    private async Task<JsonDocument?> GetJsonAsync(string url)
    {
        string? body = await GetStringAsync(url);
        if (body is null)
        {
            return null;
        }

        try
        {
            return JsonDocument.Parse(body);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private Task<string?> GetStringAsync(string url) => web.GetStringAsync(url);
}
