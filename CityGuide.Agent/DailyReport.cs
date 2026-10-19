using System.Globalization;
using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>
/// What the agent did in the last day, by email: the articles it wrote, the
/// establishments, events and films it added, what it posted on the networks, the Google
/// searches it spent, and every error the day's runs printed.
///
/// The content is read back from the CMS — what was created in the window, and the
/// social and query logs on each city node — rather than collected while the passes run:
/// the day is two scheduled runs and whatever was dispatched by hand, each one its own
/// process in its own container, and the CMS is the one place that saw all of them. The
/// errors are the one thing the CMS never sees, so the workflow gathers them from the
/// logs of the day's runs and hands them over as a file.
/// </summary>
public partial class DailyReport(UmbracoClient umbraco, ReportConfig config, string siteUrl)
{
    private static readonly CultureInfo Spanish = CultureInfo.GetCultureInfo("es-DO");

    /// <summary>How many places are listed by name per city; the rest is a count.</summary>
    private const int MaxPlacesListed = 25;

    private const int MaxErrorsListed = 40;

    public record Report(string Subject, string Body);

    /// <summary>
    /// Builds the report of everything created since <paramref name="since"/>.
    /// <paramref name="errorLines"/> are the raw error lines of the day's runs (the
    /// timestamp of a workflow log is stripped, and repeats are counted once);
    /// <paramref name="runLines"/> one line per workflow run of the day.
    /// </summary>
    public async Task<Report> BuildAsync(
        DateTime since, IReadOnlyList<string> errorLines, IReadOnlyList<string> runLines)
    {
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);
        List<UmbracoClient.PublishedNode> cities = await umbraco.GetPublishedNodesAsync("city", ContentCultures.Spanish);
        List<UmbracoClient.PublishedItem> New(List<UmbracoClient.PublishedItem> items) =>
            [.. items.Where(i => i.CreateDate.ToUniversalTime() >= since).OrderBy(i => i.Path)];

        List<UmbracoClient.PublishedItem> articles = New(await umbraco.GetPublishedItemsAsync("article"));
        List<UmbracoClient.PublishedItem> places =
        [
            .. New(await umbraco.GetPublishedItemsAsync("place")),
            .. New(await umbraco.GetPublishedItemsAsync("mall")),
        ];
        List<UmbracoClient.PublishedItem> events = New(await umbraco.GetPublishedItemsAsync("eventItem"));
        List<UmbracoClient.PublishedItem> movies = New(await umbraco.GetPublishedItemsAsync("movie"));
        List<(string Error, int Count)> errors = Errors(errorLines);

        var body = new StringBuilder();
        body.AppendLine($"Reporte del agente de QueHacerRD — {DateTime.UtcNow.AddHours(-4).ToString("dddd d 'de' MMMM 'de' yyyy", Spanish)}");
        body.AppendLine($"Lo creado desde {since.AddHours(-4):yyyy-MM-dd HH:mm} (hora de Santo Domingo).");
        body.AppendLine();
        body.AppendLine("RESUMEN");
        body.AppendLine($"- Artículos publicados: {articles.Count}");
        body.AppendLine($"- Establecimientos nuevos: {places.Count}");
        body.AppendLine($"- Eventos nuevos: {events.Count}");
        body.AppendLine($"- Películas nuevas en cartelera: {movies.Count}");
        body.AppendLine($"- Errores distintos: {errors.Count}");

        var socialTotal = 0;
        var searchesToday = 0;
        var searchesMonth = 0;
        var perCity = new StringBuilder();
        foreach (UmbracoClient.PublishedNode city in cities.OrderBy(c => c.Name))
        {
            string prefix = $"/{city.Path.Trim('/')}/";
            bool InCity(UmbracoClient.PublishedItem item) =>
                item.Path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);

            UmbracoClient.CityAgentConfig? agent = await umbraco.GetCityAgentConfigAsync(prefix.TrimEnd('/'));
            List<string> posted =
            [
                .. (agent?.SocialLog.Values ?? Enumerable.Empty<UmbracoClient.SocialLogEntry>())
                    .Where(e => e.Date.ToDateTime(TimeOnly.MinValue) >= since.Date)
                    .Select(e => e.Name),
            ];
            int asked = agent?.QueryLog.Values.Count(d => d == today) ?? 0;
            searchesToday += asked;
            searchesMonth += agent?.QueryLog.Values.Count(d => d.Year == today.Year && d.Month == today.Month) ?? 0;
            socialTotal += posted.Count;

            perCity.AppendLine();
            perCity.AppendLine($"== {city.Name.ToUpper(Spanish)}");
            Section(perCity, "Artículos", articles.Where(InCity), a => $"{a.Name}\n    {Link(a.Path)}");
            List<UmbracoClient.PublishedItem> cityPlaces = [.. places.Where(InCity)];
            Section(perCity, "Establecimientos nuevos", cityPlaces.Take(MaxPlacesListed),
                p => $"{p.Name} — {Where(p.Path)}\n    {Link(p.Path)}", cityPlaces.Count);
            Section(perCity, "Eventos nuevos", events.Where(InCity),
                e => $"{e.Name}{(e.Text.GetValueOrDefault("startDate") is { } start ? $" ({start[..Math.Min(10, start.Length)]})" : "")}");
            Section(perCity, "Películas nuevas", movies.Where(InCity), m => m.Name);
            Section(perCity, "Publicado en Facebook/Instagram", posted, name => name);
            perCity.AppendLine($"  Búsquedas de Google hoy: {asked}");
        }

        body.AppendLine($"- Publicaciones en redes: {socialTotal}");
        body.AppendLine($"- Búsquedas de Google hoy: {searchesToday} (este mes: {searchesMonth})");
        body.Append(perCity);

        body.AppendLine();
        body.AppendLine("== ERRORES");
        if (errors.Count == 0)
        {
            body.AppendLine("  Ninguno.");
        }

        foreach ((string error, int count) in errors.Take(MaxErrorsListed))
        {
            body.AppendLine($"  - {error}{(count > 1 ? $" (×{count})" : "")}");
        }

        if (errors.Count > MaxErrorsListed)
        {
            body.AppendLine($"  … y {errors.Count - MaxErrorsListed} más.");
        }

        if (runLines.Count > 0)
        {
            body.AppendLine();
            body.AppendLine("== CORRIDAS DEL DÍA");
            foreach (string run in runLines)
            {
                body.AppendLine($"  {run}");
            }
        }

        string subject = $"QueHacerRD — reporte diario {DateTime.UtcNow.AddHours(-4):yyyy-MM-dd}: "
            + $"{articles.Count} artículo(s), {places.Count} establecimiento(s), {errors.Count} error(es)";
        return new Report(subject, body.ToString());
    }

    /// <summary>Sends the report to <see cref="ReportConfig.To"/>. Throws when the SMTP
    /// server refuses it, so the workflow step shows red instead of a silent day.</summary>
    public async Task SendAsync(Report report)
    {
        using var client = new SmtpClient(config.SmtpHost, config.SmtpPort)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(config.SmtpUsername, config.SmtpPassword),
        };
        using var message = new MailMessage(
            string.IsNullOrWhiteSpace(config.From) ? config.SmtpUsername : config.From, config.To)
        {
            Subject = report.Subject,
            Body = report.Body,
            BodyEncoding = Encoding.UTF8,
            SubjectEncoding = Encoding.UTF8,
        };
        await client.SendMailAsync(message);
    }

    public bool CanSend =>
        !string.IsNullOrWhiteSpace(config.To) && !string.IsNullOrWhiteSpace(config.SmtpHost)
        && !string.IsNullOrWhiteSpace(config.SmtpUsername) && !string.IsNullOrWhiteSpace(config.SmtpPassword);

    private static void Section<T>(
        StringBuilder text, string title, IEnumerable<T> items, Func<T, string> line, int? total = null)
    {
        List<T> list = [.. items];
        if (list.Count == 0)
        {
            return;
        }

        int count = total ?? list.Count;
        text.AppendLine($"  {title} ({count}):");
        foreach (T item in list)
        {
            text.AppendLine($"  - {line(item)}");
        }

        if (count > list.Count)
        {
            text.AppendLine($"  … y {count - list.Count} más.");
        }
    }

    [GeneratedRegex(@"^\S*\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*")]
    private static partial Regex LogTimestamp();

    /// <summary>
    /// The error lines, each once with how many times it was printed, in the order they
    /// first appeared. A stack frame is not an error of its own — the line above it is —
    /// and the same failure repeated by both daily runs is one error seen twice.
    /// </summary>
    private static List<(string Error, int Count)> Errors(IReadOnlyList<string> lines)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        var order = new List<string>();
        foreach (string raw in lines)
        {
            string line = LogTimestamp().Replace(raw.Trim(), "").Trim().TrimStart('!', ' ');
            if (line.Length == 0 || line.StartsWith("at ", StringComparison.Ordinal)
                || line.StartsWith("---", StringComparison.Ordinal))
            {
                continue;
            }

            if (line.Length > 300)
            {
                line = line[..300] + "…";
            }

            if (counts.TryAdd(line, 1))
            {
                order.Add(line);
            }
            else
            {
                counts[line]++;
            }
        }

        return [.. order.Select(line => (line, counts[line]))];
    }

    /// <summary>Where a node was filed, as its section path under the city.</summary>
    private static string Where(string path) =>
        string.Join(" / ", path.Trim('/').Split('/').Skip(1).SkipLast(1));

    private string Link(string path) => $"{siteUrl.TrimEnd('/')}/{path.Trim('/')}";
}
