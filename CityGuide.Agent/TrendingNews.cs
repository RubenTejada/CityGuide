using System.Globalization;
using System.Net;
using System.Xml.Linq;

namespace CityGuide.Agent;

/// <summary>A headline of the day: what it says, who published it, where it is read
/// and when it came out.</summary>
public record Headline(string Title, string Source, string Url, DateTimeOffset Published);

/// <summary>
/// What a city is talking about today, from the two free feeds Google publishes without
/// a key: Google News searched for the city's name over the last two days, and Google
/// Trends' daily searches for the country. Neither is billed and neither needs an
/// account; a feed that fails answers with nothing and the article is planned from the
/// portal's own calendar instead.
///
/// The news search is asked twice per city — the bare name, and the name next to the
/// words of the portal's subject (festival, gastronomía, playa…) — because the bare
/// name alone answers with the police page and the weather, and there is a Santiago de
/// los Caballeros in Sinaloa too. Telling what is useful from what is not is left to
/// the model that plans the article, which is told which subjects to leave alone.
/// </summary>
public class TrendingNews(HttpClient http)
{
    private const string NewsSearch = "https://news.google.com/rss/search";

    /// <summary>Google redirects the Dominican edition to the Latin American Spanish one,
    /// so that is the one asked for; the city in the query is what makes it local.</summary>
    private const string NewsEdition = "hl=es-419&gl=US&ceid=US:es-419";

    private const string TrendsFeed = "https://trends.google.com/trending/rss?geo=DO";

    private static readonly XNamespace Trends = "https://trends.google.com/trending/rss";

    /// <summary>The portal's subjects, put next to the city's name in the second search.</summary>
    private const string LeisureWords =
        "festival OR concierto OR gastronomía OR restaurante OR turismo OR playa OR evento OR cultura OR béisbol";

    /// <summary>How old a headline may be and still be today's news.</summary>
    private static readonly TimeSpan MaxAge = TimeSpan.FromDays(2);

    /// <summary>
    /// Headlines that name the city, newest first and without repeats. A name with
    /// " y " in it is two towns sharing one city node ("Juan Dolio y Guayacanes"), and
    /// either one in a headline is news about it.
    /// </summary>
    public async Task<List<Headline>> ForCityAsync(string cityName, int max = 25)
    {
        string names = string.Join(" OR ", cityName
            .Split(" y ", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(name => $"\"{name}\""));
        var headlines = new List<Headline>();
        foreach (string query in new[] { $"({names}) ({LeisureWords})", names })
        {
            string url = $"{NewsSearch}?q={Uri.EscapeDataString($"{query} when:2d")}&{NewsEdition}";
            headlines.AddRange(await ReadNewsAsync(url));
        }

        return Distinct(headlines).Take(max).ToList();
    }

    /// <summary>What the country is searching for today, one headline per news item
    /// Google Trends attaches to each search — the search term itself says too little
    /// ("puerto plata") to plan anything from.</summary>
    public async Task<List<Headline>> NationalAsync(int max = 20)
    {
        XDocument? feed = await ReadFeedAsync(TrendsFeed);
        if (feed is null)
        {
            return [];
        }

        var headlines = new List<Headline>();
        foreach (XElement item in feed.Descendants("item"))
        {
            DateTimeOffset published = ParseDate(item.Element("pubDate")?.Value);
            foreach (XElement news in item.Elements(Trends + "news_item"))
            {
                string title = Clean(news.Element(Trends + "news_item_title")?.Value);
                string link = news.Element(Trends + "news_item_url")?.Value.Trim() ?? "";
                if (title.Length > 0 && Uri.IsWellFormedUriString(link, UriKind.Absolute))
                {
                    headlines.Add(new Headline(
                        title, Clean(news.Element(Trends + "news_item_source")?.Value), link, published));
                }
            }
        }

        return Distinct(headlines).Take(max).ToList();
    }

    private async Task<List<Headline>> ReadNewsAsync(string url)
    {
        XDocument? feed = await ReadFeedAsync(url);
        if (feed is null)
        {
            return [];
        }

        var headlines = new List<Headline>();
        DateTimeOffset oldest = DateTimeOffset.UtcNow - MaxAge;
        foreach (XElement item in feed.Descendants("item"))
        {
            string source = Clean(item.Element("source")?.Value);
            string title = Clean(item.Element("title")?.Value);
            // Google News appends the outlet to the title ("… - Listín Diario"), and the
            // outlet is already its own field.
            if (source.Length > 0 && title.EndsWith($" - {source}", StringComparison.Ordinal))
            {
                title = title[..^(source.Length + 3)];
            }

            string link = item.Element("link")?.Value.Trim() ?? "";
            DateTimeOffset published = ParseDate(item.Element("pubDate")?.Value);
            if (title.Length > 0 && published >= oldest
                && Uri.IsWellFormedUriString(link, UriKind.Absolute))
            {
                headlines.Add(new Headline(title, source, link, published));
            }
        }

        return headlines;
    }

    private async Task<XDocument?> ReadFeedAsync(string url)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            // Both feeds answer a bare client with an empty body.
            request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (compatible; QueHacerRD-Agent/1.0)");
            HttpResponseMessage response = await http.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"  ! noticias {url}: {(int)response.StatusCode}");
                return null;
            }

            return XDocument.Parse(await response.Content.ReadAsStringAsync());
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! noticias {url}: {ex.Message}");
            return null;
        }
    }

    private static IEnumerable<Headline> Distinct(IEnumerable<Headline> headlines) =>
        headlines
            .OrderByDescending(h => h.Published)
            .DistinctBy(h => TextMatch.Normalize(h.Title));

    /// <summary>The text of a feed field, decoded and on one line. Square brackets go:
    /// a title is written into a Markdown link, and a bracket would end it early.</summary>
    private static string Clean(string? value) =>
        string.Join(' ', WebUtility.HtmlDecode(value ?? "")
                .Replace('[', '(').Replace(']', ')')
                .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
            .Trim();

    private static DateTimeOffset ParseDate(string? value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out DateTimeOffset date)
            ? date
            : DateTimeOffset.UtcNow;
}
