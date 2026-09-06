using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>An image and where it came from; the source goes into the media item's
/// name, so an editor opening the Media library can tell a Wikimedia photo from a
/// Google one and follow it back to its licence.</summary>
public record FoundImage(byte[] Bytes, string ContentType, string Source);

/// <summary>
/// The images that cost nothing, tried before Google's. A Google place photo is
/// billed per download ($7 per 1.000, 1.000 free a month) while these are free, and
/// for the places a guide leads with — a monument, a beach, a park — Wikimedia
/// Commons is also the better picture: a photograph of the whole landmark instead of
/// a visitor's phone snapshot. For a business it is the other way round, so the
/// order the caller uses is Commons for landmarks, the site's own og:image next, and
/// Google last (see PhotoAsync in Program).
/// </summary>
public partial class FreePhotos(HttpClient http)
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
                return new FoundImage(bytes, contentType, $"Wikimedia Commons — {file.Title}");
            }
        }

        return null;
    }

    private record CommonsFile(string Title, string ThumbUrl, int Width, int Height);

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
            + "&prop=imageinfo|coordinates|categories&cllimit=20&iiprop=url|size"
            + "&iiurlwidth=1280&format=json";

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

            candidates.Add(new CommonsFile(fileName, thumb, width, height));
        }

        return candidates.OrderBy(Shape).ThenByDescending(f => (long)f.Width * f.Height).FirstOrDefault();
    }

    /// <summary>
    /// Whether the file says it was taken in this city. A name alone does not: half the
    /// country has a Parque Duarte and a Playa Bonita. In order of how much it proves —
    /// the file's own coordinates inside the city rectangle, the city named in its title
    /// or in one of its categories, or, for a name distinctive enough to stand on its own
    /// (two significant words or more), the country. A file that says none of it is left
    /// to the next source rather than guessed at.
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

        if (TextMatch.Tokens(city).Any(haystack.Contains))
        {
            return true;
        }

        return TextMatch.Tokens(name).Length > 1
            && (haystack.Contains("dominican") || haystack.Contains("dominicana"));
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
        if (!Uri.TryCreate(website, UriKind.Absolute, out Uri? site)
            || (site.Scheme != Uri.UriSchemeHttp && site.Scheme != Uri.UriSchemeHttps)
            || SocialHosts.Any(host => site.Host.EndsWith(host, StringComparison.OrdinalIgnoreCase)))
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
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("user-agent", UserAgent);
            HttpResponseMessage response = await http.SendAsync(request);
            string? contentType = response.Content.Headers.ContentType?.MediaType;
            if (!response.IsSuccessStatusCode
                || contentType is null
                || !contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
                || contentType.Contains("svg", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            byte[] bytes = await response.Content.ReadAsByteArrayAsync();
            return bytes.Length < 15_000 ? null : (bytes, contentType);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! imagen gratuita {url}: {ex.Message}");
            return null;
        }
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

    private async Task<string?> GetStringAsync(string url)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("user-agent", UserAgent);
            HttpResponseMessage response = await http.SendAsync(request);
            return response.IsSuccessStatusCode ? await response.Content.ReadAsStringAsync() : null;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! fuente gratuita {url}: {ex.Message}");
            return null;
        }
    }

    /// <summary>Places whose "website" is a social profile: their og:image is the
    /// account's avatar or a generic card, never a picture of the place, so they are
    /// left to Google rather than turned into a logo on a card.</summary>
    private static readonly string[] SocialHosts =
        ["instagram.com", "facebook.com", "fb.com", "linktr.ee", "x.com", "twitter.com", "tiktok.com"];

    /// <summary>Wikimedia's policy asks for an agent that identifies the tool and
    /// says where to reach it; the same one goes to every site so nobody has to guess
    /// who is fetching. The portal's own contact page is the address.</summary>
    private const string UserAgent =
        "QueHacerRD-Agent/1.0 (+https://quehacerrd.com/santo-domingo/contacto)";
}
