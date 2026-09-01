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

    private async Task<JsonDocument?> QueryAsync(string siteId, string query)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/graphql")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { query }),
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

    /// <summary>Every movie currently listed for the site (now playing + coming soon).</summary>
    public async Task<List<CinemaMovie>> GetMoviesAsync(string siteId)
    {
        using JsonDocument? doc = await QueryAsync(siteId,
            "{ movies { data { name urlSlug posterImage synopsis genre rating duration trailerYoutubeId releaseDate } } }");
        var movies = new List<CinemaMovie>();
        if (doc?.RootElement.GetProperty("data").TryGetProperty("movies", out JsonElement list) != true
            || !list.TryGetProperty("data", out JsonElement items))
        {
            return movies;
        }

        foreach (JsonElement m in items.EnumerateArray())
        {
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

    private static string? Text(JsonElement el, string name) =>
        el.TryGetProperty(name, out JsonElement v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private static decimal? Number(JsonElement el, string name) =>
        el.TryGetProperty(name, out JsonElement v) && v.ValueKind == JsonValueKind.Number
            ? v.GetDecimal() : null;
}
