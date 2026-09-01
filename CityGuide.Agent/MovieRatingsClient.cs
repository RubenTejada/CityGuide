using System.Text.Json;

namespace CityGuide.Agent;

/// <summary>Review scores of a movie, as shown on its portal page.</summary>
public record MovieRatings(
    string? ImdbId,
    string? ImdbRating,
    string? ImdbVotes,
    string? RottenTomatoes,
    string? OriginalTitle);

/// <summary>
/// Looks up IMDb and Rotten Tomatoes scores for a cartelera movie.
///
/// Caribbean Cinemas only ever gives the Spanish release title ("Cómo Entrenar
/// a tu Dragón"), which neither service indexes, so the lookup runs in two
/// steps: TMDb resolves the localized title to the IMDb id and the original
/// title, and OMDb turns that id into the IMDb rating plus the Rotten Tomatoes
/// score (it exposes both in one document). With only an OMDb key configured
/// the title is queried there directly, which still works for the films whose
/// title is not translated. Everything degrades to null: no key, no match or a
/// failing request means the portal simply shows no scores.
/// </summary>
public class MovieRatingsClient(HttpClient http, MovieRatingsConfig config)
{
    private const string TmdbBase = "https://api.themoviedb.org/3";
    private const string OmdbBase = "https://www.omdbapi.com/";

    public bool Enabled =>
        config.Enabled
        && (!string.IsNullOrWhiteSpace(config.TmdbApiKey) || !string.IsNullOrWhiteSpace(config.OmdbApiKey));

    /// <summary>
    /// Scores for a movie, or null when nothing could be resolved (the caller
    /// then keeps whatever the CMS already stores). <paramref name="knownImdbId"/>
    /// is the id stored on a previous run: an IMDb id never changes, so passing
    /// it skips the TMDb round trip and only refreshes the scores.
    /// </summary>
    public async Task<MovieRatings?> LookupAsync(string title, int? year, string? knownImdbId = null)
    {
        if (!Enabled)
        {
            return null;
        }

        try
        {
            string? imdbId = knownImdbId;
            string? originalTitle = null;

            if (string.IsNullOrWhiteSpace(imdbId) && !string.IsNullOrWhiteSpace(config.TmdbApiKey))
            {
                (imdbId, originalTitle) = await ResolveWithTmdbAsync(title, year);
            }

            if (string.IsNullOrWhiteSpace(config.OmdbApiKey))
            {
                // TMDb alone still gives the IMDb link, just no scores.
                return imdbId is null ? null : new MovieRatings(imdbId, null, null, null, originalTitle);
            }

            string omdbQuery = imdbId is not null
                ? $"i={Uri.EscapeDataString(imdbId)}"
                : $"t={Uri.EscapeDataString(title)}{(year is null ? "" : $"&y={year}")}";
            using JsonDocument? omdb = await GetJsonAsync(
                $"{OmdbBase}?apikey={Uri.EscapeDataString(config.OmdbApiKey)}&{omdbQuery}");
            JsonElement? root = omdb?.RootElement;
            if (root is null || Text(root.Value, "Response") != "True")
            {
                return imdbId is null ? null : new MovieRatings(imdbId, null, null, null, originalTitle);
            }

            return new MovieRatings(
                imdbId ?? Text(root.Value, "imdbID"),
                Score(Text(root.Value, "imdbRating")),
                Digits(Text(root.Value, "imdbVotes")),
                RottenTomatoesScore(root.Value),
                originalTitle ?? Text(root.Value, "Title"));
        }
        catch
        {
            return null;
        }
    }

    /// <summary>The IMDb id and original title of the best TMDb match, or (null, null).</summary>
    private async Task<(string?, string?)> ResolveWithTmdbAsync(string title, int? year)
    {
        string search = $"{TmdbBase}/search/movie?api_key={Uri.EscapeDataString(config.TmdbApiKey)}"
            + $"&query={Uri.EscapeDataString(title)}&language=es-MX&include_adult=false"
            + (year is null ? "" : $"&year={year}");
        using JsonDocument? found = await GetJsonAsync(search);
        if (found?.RootElement.TryGetProperty("results", out JsonElement results) != true
            || results.GetArrayLength() == 0)
        {
            return (null, null);
        }

        JsonElement best = results[0];
        string? originalTitle = Text(best, "original_title");
        if (!best.TryGetProperty("id", out JsonElement idElement) || idElement.ValueKind != JsonValueKind.Number)
        {
            return (null, originalTitle);
        }

        using JsonDocument? external = await GetJsonAsync(
            $"{TmdbBase}/movie/{idElement.GetInt32()}/external_ids?api_key={Uri.EscapeDataString(config.TmdbApiKey)}");
        string? imdbId = external is null ? null : Text(external.RootElement, "imdb_id");
        return (string.IsNullOrWhiteSpace(imdbId) ? null : imdbId, originalTitle);
    }

    private async Task<JsonDocument?> GetJsonAsync(string url)
    {
        HttpResponseMessage response = await http.GetAsync(url);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        return JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    }

    /// <summary>The "Rotten Tomatoes" entry of OMDb's Ratings array, as a bare percentage.</summary>
    private static string? RottenTomatoesScore(JsonElement root)
    {
        if (!root.TryGetProperty("Ratings", out JsonElement ratings) || ratings.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (JsonElement entry in ratings.EnumerateArray())
        {
            if (Text(entry, "Source") == "Rotten Tomatoes")
            {
                return Digits(Text(entry, "Value"));
            }
        }

        return null;
    }

    /// <summary>OMDb writes "N/A" where it has no value.</summary>
    private static string? Text(JsonElement el, string name) =>
        el.TryGetProperty(name, out JsonElement v)
        && v.ValueKind == JsonValueKind.String
        && v.GetString() is { Length: > 0 } s
        && s != "N/A"
            ? s
            : null;

    private static string? Score(string? value) =>
        double.TryParse(value, System.Globalization.CultureInfo.InvariantCulture, out double _) ? value : null;

    /// <summary>"1,234,567" / "91%" → "1234567" / "91".</summary>
    private static string? Digits(string? value) =>
        value is null ? null : new string([.. value.Where(char.IsAsciiDigit)]) is { Length: > 0 } d ? d : null;
}
