using System.Text.Json;

namespace CityGuide.Agent;

public record CinemaSite(
    string Id, string Name, string? Address, string? Phone, decimal? Latitude, decimal? Longitude);

public record CinemaMovie(
    string Name, string UrlSlug, string? PosterImage, string? Synopsis,
    string? Genre, string? Rating, int? Duration, string? TrailerYoutubeId,
    string? ReleaseDate)
{
    /// <summary>Release year, used to disambiguate the IMDb / Rotten Tomatoes lookup.</summary>
    public int? Year => DateTime.TryParse(ReleaseDate, out DateTime d) ? d.Year : null;
}

/// <summary>
/// Read-only client for the Caribbean Cinemas RD public GraphQL API (Indy Cinema
/// Systems). Anonymous, but requires the site-id/circuit-id/client-type headers
/// the SPA sends. Same API the frontend uses (frontend/lib/cinema.ts).
/// </summary>
public class CaribbeanCinemasClient(HttpClient http)
{
    private const string BaseUrl = "https://rd.caribbeancinemas.com";
    private const string CircuitId = "5"; // Caribbean Cinemas Dominican Republic
    // DR homepage site, the header the SPA sends for queries that span every
    // cinema; the queries themselves filter by siteIds.
    private const string AggregateSiteId = "132";

    private async Task<JsonDocument?> QueryAsync(string siteId, string query, object? variables = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/graphql")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { query, variables = variables ?? new { } }),
                System.Text.Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("site-id", siteId);
        request.Headers.Add("circuit-id", CircuitId);
        request.Headers.Add("client-type", "consumer");

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.TryGetProperty("data", out _) ? doc : null;
    }

    public async Task<CinemaSite?> GetSiteAsync(string siteId)
    {
        using JsonDocument? doc = await QueryAsync(siteId,
            $"{{ site(id: {siteId}) {{ id name address1 phone lat lon }} }}");
        if (doc?.RootElement.GetProperty("data").TryGetProperty("site", out JsonElement site) != true
            || site.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return new CinemaSite(
            siteId,
            site.GetProperty("name").GetString() ?? $"Site {siteId}",
            Text(site, "address1"),
            Text(site, "phone"),
            Number(site, "lat"),
            Number(site, "lon"));
    }

    /// <summary>
    /// The dates the portal can show, in the same window its date tabs offer:
    /// every date with a showing at the sites from today on, at most 7.
    /// </summary>
    public async Task<List<string>> GetShowingDatesAsync(IReadOnlyList<string> siteIds)
    {
        using JsonDocument? doc = await QueryAsync(AggregateSiteId,
            "query ($siteIds: [ID]) { datesWithShowing(siteIds: $siteIds) { value } }",
            new { siteIds });
        // The API returns the list as a JSON-encoded string in `value`.
        string? encoded = doc?.RootElement.GetProperty("data")
            .TryGetProperty("datesWithShowing", out JsonElement dates) == true
            && dates.ValueKind == JsonValueKind.Object
                ? Text(dates, "value") : null;
        if (encoded is null)
        {
            return [];
        }

        List<string> parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<List<string>>(encoded) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }

        string today = TodayInDr();
        return [.. parsed.Where(d => string.CompareOrdinal(d, today) >= 0).Order(StringComparer.Ordinal).Take(7)];
    }

    /// <summary>Every movie with a showing at the sites on the date, with the
    /// catalog fields its page needs.</summary>
    public async Task<List<CinemaMovie>> GetMoviesForDateAsync(string date, IReadOnlyList<string> siteIds)
    {
        using JsonDocument? doc = await QueryAsync(AggregateSiteId,
            """
            query ($date: String, $siteIds: [ID]) {
              showingsForDate(date: $date, siteIds: $siteIds) {
                data {
                  movie {
                    name urlSlug posterImage synopsis genre rating duration trailerYoutubeId releaseDate
                  }
                }
              }
            }
            """,
            new { date, siteIds });
        var movies = new List<CinemaMovie>();
        if (doc?.RootElement.GetProperty("data").TryGetProperty("showingsForDate", out JsonElement showings) != true
            || showings.ValueKind != JsonValueKind.Object
            || !showings.TryGetProperty("data", out JsonElement rows))
        {
            return movies;
        }

        foreach (JsonElement row in rows.EnumerateArray())
        {
            if (!row.TryGetProperty("movie", out JsonElement m) || m.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            string? name = Text(m, "name");
            string? slug = Text(m, "urlSlug");
            if (name is null || slug is null)
            {
                continue;
            }

            movies.Add(new CinemaMovie(
                name, slug, Text(m, "posterImage"), Text(m, "synopsis"),
                Text(m, "genre"), Text(m, "rating"),
                m.TryGetProperty("duration", out JsonElement d) && d.ValueKind == JsonValueKind.Number
                    ? d.GetInt32() : null,
                Text(m, "trailerYoutubeId"),
                Text(m, "releaseDate")));
        }

        return movies;
    }

    /// <summary>Today in the Dominican Republic (UTC-4 all year, no DST).</summary>
    private static string TodayInDr() =>
        DateTime.UtcNow.AddHours(-4).ToString("yyyy-MM-dd");

    private static string? Text(JsonElement el, string name) =>
        el.TryGetProperty(name, out JsonElement v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private static decimal? Number(JsonElement el, string name) =>
        el.TryGetProperty(name, out JsonElement v) && v.ValueKind == JsonValueKind.Number
            ? v.GetDecimal() : null;
}
