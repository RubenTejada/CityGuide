using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

public record ScrapedEvent(
    string Name, string Url, DateTime Start, DateTime? End,
    string? Venue, string? Address, string? Description, string? ImageUrl = null);

/// <summary>
/// Keeps the "Eventos" section in sync with public event portals. Sources are
/// configured (Events:Sources) with a parsing strategy per portal:
///  - "jsonld-listing": schema.org Event objects embedded in the listing page
///    itself (Eventbrite).
///  - "jsonld-detail": listing page links to detail pages that carry an Event
///    JSON-LD block (TodoTickets).
///  - "ticketexpress": og:title/og:url on detail pages, date parsed from the
///    Spanish prose ("el viernes 26 de junio...").
/// Portal-sourced events are published immediately (deterministic data, like
/// the cinema sync). Only events this agent created (source = "agent:*") are
/// ever deleted, and only once their date has passed — manual events are never
/// touched. All fetches go through the throttled HttpClient: slow but never
/// blocked. No LLM tokens are spent here.
/// </summary>
public partial class EventSync(HttpClient http, UmbracoClient umbraco, EventsConfig config)
{
    [GeneratedRegex("""<script type=.application/ld\+json.[^>]*>(.*?)</script>""", RegexOptions.Singleline)]
    private static partial Regex JsonLdBlocks();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex HtmlTags();

    public async Task RunAsync()
    {
        Console.WriteLine($"\n== Event sync: {config.CityPath}/eventos");
        (Guid Id, string Name)? eventos = await umbraco.GetContentByPathAsync($"{config.CityPath}/eventos");
        if (eventos is null)
        {
            Console.Error.WriteLine("  Events page not found in CMS, skipping.");
            return;
        }

        // Existing event items: url (website) → id, plus agent-created stale candidates.
        Guid eventTypeId = await umbraco.GetDocumentTypeIdAsync("Event");
        var byUrl = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        var byNameDate = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var agentPast = new List<(Guid Id, string Name)>();
        foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(eventos.Value.Id))
        {
            if (child.DocumentTypeId != eventTypeId)
            {
                continue;
            }

            UmbracoClient.DocumentDetail? detail = await umbraco.GetDocumentTextValuesAsync(child.Id);
            if (detail is null)
            {
                continue;
            }

            string? website = detail.TextValues.GetValueOrDefault("website");
            if (!string.IsNullOrEmpty(website))
            {
                byUrl[website] = child.Id;
            }

            DateTime? start = ParseCmsDate(detail.TextValues.GetValueOrDefault("startDate"));
            if (start is not null)
            {
                byNameDate.Add(NameDateKey(child.Name, start.Value));
            }

            bool fromAgent = detail.TextValues.GetValueOrDefault("source")?.StartsWith("agent:") == true;
            DateTime? last = ParseCmsDate(detail.TextValues.GetValueOrDefault("endDate")) ?? start;
            if (fromAgent && last is not null && last.Value.Date < DateTime.Today)
            {
                agentPast.Add((child.Id, child.Name));
            }
        }

        foreach (EventSourceConfig source in config.Sources)
        {
            List<ScrapedEvent> events;
            try
            {
                events = await ScrapeSourceAsync(source);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! {source.Name}: {ex.Message}");
                continue;
            }

            Console.WriteLine($"  {source.Name}: {events.Count} eventos futuros");
            foreach (ScrapedEvent ev in events)
            {
                if (ev.Name.Contains("cancelado", StringComparison.OrdinalIgnoreCase)
                    || ev.Name.Contains("pospuesto", StringComparison.OrdinalIgnoreCase))
                {
                    continue; // portals keep cancelled/postponed events listed for refunds
                }

                if (byUrl.ContainsKey(ev.Url) || !byNameDate.Add(NameDateKey(ev.Name, ev.Start)))
                {
                    continue; // already in CMS, or same event seen via another portal
                }

                // Main image: the event's JSON-LD image, uploaded to the Media
                // library. Image failures never block creating the event.
                string? photoValue = null;
                if (ev.ImageUrl is not null)
                {
                    try
                    {
                        (byte[] Bytes, string ContentType)? image = await FetchImageAsync(ev.ImageUrl);
                        if (image is not null)
                        {
                            Guid mediaKey = await umbraco.CreateMediaImageAsync(
                                ev.Name, image.Value.Bytes, image.Value.ContentType);
                            photoValue = $"[{{\"key\":\"{Guid.NewGuid()}\",\"mediaKey\":\"{mediaKey}\"}}]";
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine($"  ! imagen de {ev.Name}: {ex.Message}");
                    }
                }

                object[] values =
                [
                    .. photoValue is null
                        ? Array.Empty<object>()
                        : [new { alias = "photo", value = (object)photoValue }],
                    new { alias = "description", value = (object)(ev.Description ?? "") },
                    new { alias = "startDate", value = (object)ev.Start.ToString("yyyy-MM-dd HH:mm:ss") },
                    new { alias = "endDate", value = (object?)(ev.End?.ToString("yyyy-MM-dd HH:mm:ss") ?? "") },
                    new { alias = "venueName", value = (object)(ev.Venue ?? "") },
                    new { alias = "address", value = (object)(ev.Address ?? "") },
                    new { alias = "website", value = (object)ev.Url },
                    new { alias = "source", value = (object)$"agent:{source.Name}" },
                ];
                try
                {
                    Guid id = await umbraco.CreateDocumentAsync(eventos.Value.Id, eventTypeId, ev.Name, values);
                    byUrl[ev.Url] = id;
                    Console.WriteLine($"  + {ev.Name} ({ev.Start:yyyy-MM-dd})");
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"  ! {ev.Name} failed: {ex.Message}");
                }
            }
        }

        foreach ((Guid id, string name) in agentPast)
        {
            await umbraco.DeleteDocumentAsync(id);
            Console.WriteLine($"  - {name} (evento pasado)");
        }
    }

    // ---- Strategies ----

    /// <summary>Scrapes one configured source (no CMS access) — also used by the
    /// agent's "--scrape-events" diagnostic mode.</summary>
    public Task<List<ScrapedEvent>> ScrapeSourceAsync(EventSourceConfig source) => source.Kind switch
    {
        "jsonld-listing" => FromJsonLdListingAsync(source),
        "jsonld-detail" => FromJsonLdDetailsAsync(source),
        "ticketexpress" => FromTicketExpressAsync(source),
        _ => throw new InvalidOperationException($"Unknown source kind '{source.Kind}'"),
    };

    /// <summary>Event JSON-LD embedded directly in the listing page (Eventbrite ItemList).</summary>
    private async Task<List<ScrapedEvent>> FromJsonLdListingAsync(EventSourceConfig source)
    {
        string html = await FetchAsync(source.Url);
        return [.. ExtractJsonLdEvents(html).Take(config.MaxPerSource)];
    }

    /// <summary>Listing page links to detail pages carrying Event JSON-LD (TodoTickets).</summary>
    private async Task<List<ScrapedEvent>> FromJsonLdDetailsAsync(EventSourceConfig source)
    {
        string listing = await FetchAsync(source.Url);
        var baseUri = new Uri(source.Url);
        var events = new List<ScrapedEvent>();
        foreach (string link in Regex.Matches(listing, source.LinkPattern)
                     .Select(m => new Uri(baseUri, m.Groups[1].Value).AbsoluteUri)
                     .Distinct()
                     .Take(config.MaxPerSource))
        {
            try
            {
                string html = await FetchAsync(link);
                string? ogImage = OgContent(html, "og:image");
                events.AddRange(ExtractJsonLdEvents(html)
                    .Select(ev => ev.ImageUrl is null ? ev with { ImageUrl = ogImage } : ev));
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! {source.Name} {link}: {ex.Message}");
            }
        }

        return events;
    }

    /// <summary>TicketExpress: no structured data — og:title plus a Spanish prose date.</summary>
    private async Task<List<ScrapedEvent>> FromTicketExpressAsync(EventSourceConfig source)
    {
        string listing = await FetchAsync(source.Url);
        var baseUri = new Uri(source.Url);
        var events = new List<ScrapedEvent>();
        foreach (string link in Regex.Matches(listing, source.LinkPattern)
                     .Select(m => new Uri(baseUri, m.Groups[1].Value).AbsoluteUri)
                     .Distinct()
                     .Take(config.MaxPerSource))
        {
            try
            {
                string html = await FetchAsync(link);
                string? name = OgContent(html, "og:title");
                DateTime? date = ParseSpanishProseDate(HtmlTags().Replace(html, " "));
                if (name is null || date is null || date.Value.Date < DateTime.Today)
                {
                    continue;
                }

                events.Add(new ScrapedEvent(
                    name, link, date.Value, null, null, null, "", OgContent(html, "og:image")));
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! {source.Name} {link}: {ex.Message}");
            }
        }

        return events;
    }

    // ---- Parsing helpers ----

    /// <summary>Content of an og: meta tag, HTML-decoded; null when absent.</summary>
    private static string? OgContent(string html, string property)
    {
        Match m = Regex.Match(html, "<meta property=\"" + Regex.Escape(property) + "\"\\s+content=\"([^\"]+)\"");
        return m.Success ? System.Net.WebUtility.HtmlDecode(m.Groups[1].Value).Trim() : null;
    }

    /// <summary>Downloads an image URL; null unless the response is an image.</summary>
    private async Task<(byte[] Bytes, string ContentType)?> FetchImageAsync(string url)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36");
        HttpResponseMessage response = await http.SendAsync(request);
        string contentType = response.Content.Headers.ContentType?.MediaType ?? "";
        if (!response.IsSuccessStatusCode || !contentType.StartsWith("image/", StringComparison.Ordinal))
        {
            return null;
        }

        byte[] bytes = await response.Content.ReadAsByteArrayAsync();
        return bytes.Length == 0 ? null : (bytes, contentType);
    }

    private async Task<string> FetchAsync(string url)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("user-agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36");
        request.Headers.Add("accept-language", "es-DO,es;q=0.9");
        HttpResponseMessage response = await http.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync();
    }

    /// <summary>All schema.org objects whose @type ends in "Event", from any ld+json
    /// block: single object, array, ItemList or @graph. Past events are dropped.</summary>
    private static IEnumerable<ScrapedEvent> ExtractJsonLdEvents(string html)
    {
        var events = new List<ScrapedEvent>();
        foreach (Match match in JsonLdBlocks().Matches(html))
        {
            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(match.Groups[1].Value.Trim());
            }
            catch (JsonException)
            {
                continue;
            }

            using (doc)
            {
                CollectEvents(doc.RootElement, events);
            }
        }

        return events.Where(e => e.Start.Date >= DateTime.Today);
    }

    private static void CollectEvents(JsonElement element, List<ScrapedEvent> events)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Array:
                foreach (JsonElement item in element.EnumerateArray())
                {
                    CollectEvents(item, events);
                }

                return;
            case JsonValueKind.Object:
                break;
            default:
                return;
        }

        string? type = element.TryGetProperty("@type", out JsonElement typeEl) && typeEl.ValueKind == JsonValueKind.String
            ? typeEl.GetString()
            : null;
        if (type is not null && type.EndsWith("Event", StringComparison.Ordinal))
        {
            if (ToEvent(element) is { } ev)
            {
                events.Add(ev);
            }

            return;
        }

        foreach (string key in new[] { "@graph", "itemListElement", "item" })
        {
            if (element.TryGetProperty(key, out JsonElement nested))
            {
                CollectEvents(nested, events);
            }
        }
    }

    private static ScrapedEvent? ToEvent(JsonElement e)
    {
        string? Text(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out JsonElement v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        string? url = Text(e, "url");
        string? name = Text(e, "name") ?? Text(e, "description");
        if (url is null || name is null || !DateTime.TryParse(Text(e, "startDate"), out DateTime start))
        {
            return null;
        }

        DateTime? end = DateTime.TryParse(Text(e, "endDate"), out DateTime endParsed) ? endParsed : null;
        string? venue = null;
        string? address = null;
        if (e.TryGetProperty("location", out JsonElement loc) && loc.ValueKind == JsonValueKind.Object)
        {
            venue = Text(loc, "name");
            if (loc.TryGetProperty("address", out JsonElement addr) && addr.ValueKind == JsonValueKind.Object)
            {
                address = string.Join(", ",
                    new[] { Text(addr, "streetAddress"), Text(addr, "addressLocality") }
                        .Where(s => !string.IsNullOrWhiteSpace(s) && s!.Trim(',', ' ').Length > 0)
                        .Select(s => s!.Trim()));
            }
        }

        string? description = Text(e, "description");
        if (description is not null && description.Length > 500)
        {
            description = description[..500];
        }

        // "image" can be a URL string, an array of URLs, or an ImageObject.
        string? imageUrl = null;
        if (e.TryGetProperty("image", out JsonElement img))
        {
            imageUrl = img.ValueKind switch
            {
                JsonValueKind.String => img.GetString(),
                JsonValueKind.Array when img.GetArrayLength() > 0 && img[0].ValueKind == JsonValueKind.String
                    => img[0].GetString(),
                JsonValueKind.Object => Text(img, "url"),
                _ => null,
            };
        }

        return new ScrapedEvent(
            System.Net.WebUtility.HtmlDecode(name).Trim(), url, start, end, venue, address, description, imageUrl);
    }

    private static readonly string[] SpanishMonths =
    [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];

    [GeneratedRegex(@"\b(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de[l]?\s+(\d{4}))?", RegexOptions.IgnoreCase)]
    private static partial Regex ProseDate();

    /// <summary>First "26 de junio [de 2026]" in the text; without a year, the
    /// next future occurrence is assumed. Null when no date is found.</summary>
    internal static DateTime? ParseSpanishProseDate(string text)
    {
        foreach (Match m in ProseDate().Matches(text))
        {
            int month = Array.IndexOf(SpanishMonths, m.Groups[2].Value.ToLowerInvariant()) + 1;
            int day = int.Parse(m.Groups[1].Value);
            if (month == 0 || day is < 1 or > 31)
            {
                continue;
            }

            int year = m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : DateTime.Today.Year;
            if (!DateTime.TryParse($"{year}-{month:00}-{day:00}", out DateTime date))
            {
                continue;
            }

            if (!m.Groups[3].Success && date.Date < DateTime.Today)
            {
                date = date.AddYears(1);
            }

            return date.AddHours(20); // portals rarely state the hour in prose; assume evening
        }

        return null;
    }

    private static DateTime? ParseCmsDate(string? value) =>
        DateTime.TryParse(value, out DateTime parsed) ? parsed : null;

    private static string NameDateKey(string name, DateTime start) =>
        $"{Regex.Replace(name.ToLowerInvariant(), "[^a-z0-9áéíóúñ]", "")}|{start:yyyyMMdd}";
}
