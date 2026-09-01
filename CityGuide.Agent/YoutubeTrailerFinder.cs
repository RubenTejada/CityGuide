using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>
/// Finds an official YouTube trailer in Latin American Spanish by scraping
/// YouTube's search results (ytInitialData JSON). Same selection rules as the
/// frontend fallback (frontend/lib/trailers.ts): trailer-ish title, not the
/// watermarked Caribbean Cinemas channel, 30s–10min, preferring "latino".
/// </summary>
public partial class YoutubeTrailerFinder(HttpClient http)
{
    private sealed record Video(string Id, string Title, string Channel, int Seconds);

    [GeneratedRegex("tr[aá]iler|trailer|avance|teaser", RegexOptions.IgnoreCase)]
    private static partial Regex TrailerWords();

    [GeneratedRegex("latino", RegexOptions.IgnoreCase)]
    private static partial Regex LatinoWord();

    [GeneratedRegex("espa[ñn]ol|subtitulad|doblad", RegexOptions.IgnoreCase)]
    private static partial Regex SpanishWords();

    public async Task<string?> FindAsync(string movieName)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get,
                $"https://www.youtube.com/results?search_query={Uri.EscapeDataString($"{movieName} tráiler oficial español latino")}");
            request.Headers.Add("user-agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36");
            request.Headers.Add("accept-language", "es-419,es;q=0.9");

            HttpResponseMessage response = await http.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            string html = await response.Content.ReadAsStringAsync();
            const string marker = "ytInitialData = ";
            int start = html.IndexOf(marker, StringComparison.Ordinal);
            if (start < 0)
            {
                return null;
            }

            int end = html.IndexOf(";</script>", start, StringComparison.Ordinal);
            if (end < 0)
            {
                return null;
            }

            using JsonDocument doc = JsonDocument.Parse(html[(start + marker.Length)..end]);
            var videos = new List<Video>();
            Collect(doc.RootElement, videos);

            List<Video> candidates = [.. videos.Where(v =>
                TrailerWords().IsMatch(v.Title)
                && !v.Channel.Contains("caribbean", StringComparison.OrdinalIgnoreCase)
                && v.Seconds is > 30 and < 600)];

            Video? match =
                candidates.FirstOrDefault(v => LatinoWord().IsMatch(v.Title))
                ?? candidates.FirstOrDefault(v => SpanishWords().IsMatch($"{v.Title} {v.Channel}"))
                ?? candidates.FirstOrDefault();
            return match?.Id;
        }
        catch
        {
            return null;
        }
    }

    private static void Collect(JsonElement node, List<Video> videos)
    {
        if (videos.Count >= 12)
        {
            return;
        }

        if (node.ValueKind == JsonValueKind.Object)
        {
            if (node.TryGetProperty("videoRenderer", out JsonElement r)
                && r.TryGetProperty("videoId", out JsonElement id))
            {
                videos.Add(new Video(
                    id.GetString() ?? "",
                    FirstRun(r, "title"),
                    FirstRun(r, "ownerText"),
                    LengthToSeconds(r)));
                return;
            }

            foreach (JsonProperty prop in node.EnumerateObject())
            {
                Collect(prop.Value, videos);
            }
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            foreach (JsonElement item in node.EnumerateArray())
            {
                Collect(item, videos);
            }
        }
    }

    private static string FirstRun(JsonElement renderer, string prop) =>
        renderer.TryGetProperty(prop, out JsonElement el)
            && el.TryGetProperty("runs", out JsonElement runs)
            && runs.GetArrayLength() > 0
            && runs[0].TryGetProperty("text", out JsonElement text)
            ? text.GetString() ?? "" : "";

    private static int LengthToSeconds(JsonElement renderer)
    {
        if (!renderer.TryGetProperty("lengthText", out JsonElement el)
            || !el.TryGetProperty("simpleText", out JsonElement text))
        {
            return 0;
        }

        int total = 0;
        foreach (string part in (text.GetString() ?? "").Split(':'))
        {
            if (!int.TryParse(part, out int n))
            {
                return 0;
            }

            total = total * 60 + n;
        }

        return total;
    }
}
