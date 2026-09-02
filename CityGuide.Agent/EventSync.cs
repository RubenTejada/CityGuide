using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

public record ScrapedEvent(
    string Name, string Url, DateTime Start, DateTime? End,
    string? Venue, string? Address, string? Description, string? ImageUrl = null,
    double? Latitude = null, double? Longitude = null);

/// <summary>
/// Keeps the "Eventos" section in sync with public event portals. Sources are
/// configured (Events:Sources) with a parsing strategy per portal:
///  - "jsonld-listing": schema.org Event objects embedded in the listing page
///    itself (Eventbrite).
///  - "jsonld-detail": listing page links to detail pages that carry an Event
///    JSON-LD block (TodoTickets).
/// Every portal lists the whole country, so an event is only imported once its
/// location is inside the city being synced — see <see cref="EventVenues"/>,
/// which also turns the venue into a place of the portal (a bar, an attraction)
/// and gives the event the coordinates that put it on the map. TuBoleta (dates
/// loaded by JavaScript), Uepa Tickets (Cloudflare) and TicketExpress (a listing
/// frozen in 2020, with no venue on the page and no date beyond loose prose, so
/// nothing can say where or when its events are) are deliberately not scraped.
/// Portal-sourced events are published immediately (deterministic data, like
/// the cinema sync). Only events this agent created (source = "agent:*") are
/// ever deleted, and only once their date has passed — manual events are never
/// touched. All fetches go through the throttled HttpClient: slow but never
/// blocked. Scraping and dedupe are plain code; the one model call per source is
/// the category (see <see cref="EventCategories"/>), which no portal states.
/// </summary>
public partial class EventSync(
    HttpClient http, UmbracoClient umbraco, EventsConfig config,
    GooglePlacesClient? google = null, IEnrichmentClient? enricher = null)
{
    [GeneratedRegex("""<script type=.application/ld\+json.[^>]*>(.*?)</script>""", RegexOptions.Singleline)]
    private static partial Regex JsonLdBlocks();

    public async Task RunAsync()
    {
        Console.WriteLine($"\n== Event sync: {config.CityPath}/eventos");
        (Guid Id, string Name)? eventos = await umbraco.GetContentByPathAsync($"{config.CityPath}/eventos");
        if (eventos is null)
        {
            Console.Error.WriteLine("  Events page not found in CMS, skipping.");
            return;
        }

        EventVenues venues = await VenuesAsync();

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

            List<ScrapedEvent> candidates =
            [
                .. events.Where(ev =>
                    // portals keep cancelled/postponed events listed for refunds
                    !ev.Name.Contains("cancelado", StringComparison.OrdinalIgnoreCase)
                    && !ev.Name.Contains("pospuesto", StringComparison.OrdinalIgnoreCase)
                    // already in CMS, or same event seen via another portal
                    && !byUrl.ContainsKey(ev.Url)
                    && byNameDate.Add(NameDateKey(ev.Name, ev.Start))),
            ];

            // The portal covers the country; this section covers one city. Asking
            // after the dedupe above means only events about to be created are
            // located, so a pass that finds nothing new costs no Google call.
            var pending = new List<ScrapedEvent>();
            var venuePlaces = new List<DiscoveredPlace?>();
            var foreign = 0;
            foreach (ScrapedEvent ev in candidates)
            {
                EventLocation location;
                try
                {
                    location = await venues.LocateAsync(ev);
                }
                catch (Exception ex)
                {
                    // A failed lookup is not an answer: leave the event for the next
                    // pass instead of importing it or deciding it is not ours.
                    Console.Error.WriteLine($"  ! ubicación de {ev.Name}: {ex.Message}");
                    byNameDate.Remove(NameDateKey(ev.Name, ev.Start));
                    continue;
                }

                if (!location.InCity)
                {
                    foreign++;
                    continue;
                }

                pending.Add(ev);
                venuePlaces.Add(location.Venue);
            }

            if (foreign > 0)
            {
                Console.WriteLine($"  {foreign} fuera de {config.CityPath.Trim('/')}, descartado(s)");
            }

            Dictionary<int, string> categories = await ClassifyAsync(pending);

            foreach ((ScrapedEvent ev, int position) in pending.Select((ev, i) => (ev, i)))
            {
                // The venue as a place of the portal, when its Google types belong to
                // one of the configured sections. Never blocks creating the event.
                DiscoveredPlace? venue = venuePlaces[position];
                if (venue is not null)
                {
                    try
                    {
                        await venues.FileAsync(venue);
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine($"  ! lugar {venue.Name}: {ex.Message}");
                    }
                }

                // Main image, uploaded to the Media library. Image failures never
                // block creating the event.
                string? photoValue = null;
                try
                {
                    (byte[] Bytes, string ContentType)? image = await FindImageAsync(ev);
                    if (image is not null)
                    {
                        Guid mediaKey = await umbraco.CreateMediaImageAsync(
                            ev.Name, image.Value.Bytes, image.Value.ContentType);
                        photoValue = $"[{{\"key\":\"{Guid.NewGuid()}\",\"mediaKey\":\"{mediaKey}\"}}]";
                    }
                    else
                    {
                        Console.Error.WriteLine($"  ? {ev.Name}: sin imagen principal");
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"  ! imagen de {ev.Name}: {ex.Message}");
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
                    // What the portal declared, else where Google put the venue: the
                    // events map plots only the events that carry coordinates. The CMS
                    // coordinate type stores decimal(_,6); more decimals fail publish.
                    .. (ev.Latitude ?? venue?.Latitude) is double eventLat
                        && (ev.Longitude ?? venue?.Longitude) is double eventLng
                        ? new object[]
                        {
                            new { alias = "latitude", value = (object)Math.Round(eventLat, 6) },
                            new { alias = "longitude", value = (object)Math.Round(eventLng, 6) },
                        }
                        : [],
                    .. categories.TryGetValue(position, out string? category)
                        ? new object[] { new { alias = "category", value = (object)category } }
                        : [],
                ];
                try
                {
                    Guid id = await umbraco.CreateDocumentAsync(eventos.Value.Id, eventTypeId, ev.Name, values);
                    byUrl[ev.Url] = id;
                    Console.WriteLine($"  + {ev.Name} ({ev.Start:yyyy-MM-dd})"
                        + (categories.TryGetValue(position, out string? label) ? $" [{label}]" : ""));
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

    /// <summary>
    /// The venue side of the sync, built from the city node's "Agente" tab: the
    /// rectangle every event is judged against and the category prompts a venue
    /// created as a place is written with. Warns once when the city has no
    /// rectangle, which leaves the sync importing the whole country as before.
    /// </summary>
    private async Task<EventVenues> VenuesAsync()
    {
        UmbracoClient.CityAgentConfig? city = await umbraco.GetCityAgentConfigAsync(config.CityPath);
        var venues = new EventVenues(umbraco, google, enricher, config, city);
        if (venues.Area is null)
        {
            Console.Error.WriteLine(
                $"  ! {config.CityPath} no tiene \"agentArea\" — sin ese rectángulo no se puede "
                + "saber qué eventos son de la ciudad y se importan todos.");
        }

        return venues;
    }

    /// <summary>
    /// Maintenance pass over the events this agent already created: the ones whose
    /// venue is not in the city go to the recycle bin. The sync only learned to ask
    /// where an event happens after importing the whole country — Santiago, Higüey,
    /// Punta Cana — and the events it stored carry no coordinates, so each venue is
    /// looked up on Google inside the city rectangle exactly as a new event would be.
    /// Events created by hand (or seeded) are never touched, and nothing is written
    /// without <paramref name="apply"/>.
    /// </summary>
    public async Task PurgeForeignAsync(bool apply)
    {
        Console.WriteLine(apply
            ? $"\n== Eliminando eventos fuera de {config.CityPath.Trim('/')}"
            : "\n== Eventos fuera de la ciudad (simulación; agrega --apply para aplicarla)");

        (Guid Id, string Name)? eventos = await umbraco.GetContentByPathAsync($"{config.CityPath}/eventos");
        if (eventos is null)
        {
            Console.Error.WriteLine("  Events page not found in CMS, skipping.");
            return;
        }

        EventVenues venues = await VenuesAsync();
        if (venues.Area is null)
        {
            Console.Error.WriteLine("  Sin rectángulo de ciudad no hay nada que comprobar.");
            return;
        }

        Guid eventTypeId = await umbraco.GetDocumentTypeIdAsync("Event");
        var kept = 0;
        var removed = 0;
        foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(eventos.Value.Id))
        {
            if (child.DocumentTypeId != eventTypeId
                || await umbraco.GetDocumentTextValuesAsync(child.Id) is not { } detail
                || detail.TextValues.GetValueOrDefault("source")?.StartsWith("agent:") != true)
            {
                continue;
            }

            var stored = new ScrapedEvent(
                child.Name, detail.TextValues.GetValueOrDefault("website") ?? "", DateTime.Today, null,
                detail.TextValues.GetValueOrDefault("venueName"),
                detail.TextValues.GetValueOrDefault("address"),
                detail.TextValues.GetValueOrDefault("description"),
                Latitude: ParseCoordinate(detail.TextValues.GetValueOrDefault("latitude")),
                Longitude: ParseCoordinate(detail.TextValues.GetValueOrDefault("longitude")));

            EventLocation location;
            try
            {
                location = await venues.LocateAsync(stored, withVenue: false);
            }
            catch (Exception ex)
            {
                // Never read a failed lookup as "not in the city": that would recycle
                // the section over a Google outage.
                Console.Error.WriteLine($"  ! {child.Name}: {ex.Message} — se deja como está");
                continue;
            }

            if (location.InCity)
            {
                kept++;
                continue;
            }

            removed++;
            Console.WriteLine($"  - {child.Name} ({stored.Venue ?? "sin lugar"})");
            if (apply)
            {
                await umbraco.RecycleDocumentAsync(child.Id);
            }
        }

        Console.WriteLine(apply
            ? $"  {removed} evento(s) a la papelera, {kept} conservado(s)"
            : $"  {removed} evento(s) irían a la papelera, {kept} se conservarían");
    }

    /// <summary>
    /// Categories the events about to be created, in batches, keyed by their
    /// position in <paramref name="events"/>. Without a model — or when the call
    /// fails — every position is missing and the events are created without a
    /// category, which the frontend simply omits.
    /// </summary>
    private async Task<Dictionary<int, string>> ClassifyAsync(IReadOnlyList<ScrapedEvent> events)
    {
        var categories = new Dictionary<int, string>();
        if (enricher is null || events.Count == 0)
        {
            return categories;
        }

        for (int offset = 0; offset < events.Count; offset += EventCategories.BatchSize)
        {
            List<ScrapedEvent> batch = [.. events.Skip(offset).Take(EventCategories.BatchSize)];
            try
            {
                foreach ((int position, string category) in await enricher.ClassifyEventsAsync(batch))
                {
                    categories[offset + position] = category;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! categorización: {ex.Message}");
            }
        }

        return categories;
    }

    /// <summary>
    /// Maintenance pass over the events this agent already created: recategorizes
    /// them and reports what would change, writing only with <paramref name="apply"/>.
    /// Events created by hand (or seeded) keep the category their editor chose —
    /// this only touches "agent:*" ones, which is also what the sync deletes.
    /// </summary>
    public async Task RecategorizeAsync(bool apply)
    {
        Console.WriteLine(apply
            ? $"\n== Recategorizando eventos del agente en {config.CityPath}/eventos"
            : $"\n== Recategorización de eventos (simulación; agrega --apply para aplicarla)");
        if (enricher is null)
        {
            Console.Error.WriteLine("  Sin modelo configurado — nada que hacer.");
            return;
        }

        (Guid Id, string Name)? eventos = await umbraco.GetContentByPathAsync($"{config.CityPath}/eventos");
        if (eventos is null)
        {
            Console.Error.WriteLine("  Events page not found in CMS, skipping.");
            return;
        }

        Guid eventTypeId = await umbraco.GetDocumentTypeIdAsync("Event");
        var ids = new List<Guid>();
        var current = new List<string?>();
        var events = new List<ScrapedEvent>();
        foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(eventos.Value.Id))
        {
            if (child.DocumentTypeId != eventTypeId
                || await umbraco.GetDocumentTextValuesAsync(child.Id) is not { } detail
                || detail.TextValues.GetValueOrDefault("source")?.StartsWith("agent:") != true)
            {
                continue;
            }

            ids.Add(child.Id);
            current.Add(detail.TextValues.GetValueOrDefault("category"));
            events.Add(new ScrapedEvent(
                child.Name, detail.TextValues.GetValueOrDefault("website") ?? "", DateTime.Today, null,
                detail.TextValues.GetValueOrDefault("venueName"), null,
                detail.TextValues.GetValueOrDefault("description")));
        }

        Console.WriteLine($"  {events.Count} eventos creados por el agente");
        Dictionary<int, string> categories = await ClassifyAsync(events);
        var changed = 0;
        for (var i = 0; i < events.Count; i++)
        {
            if (!categories.TryGetValue(i, out string? category) || category == current[i])
            {
                continue;
            }

            changed++;
            Console.WriteLine($"  {events[i].Name}: {current[i] ?? "(sin categoría)"} → {category}");
            if (apply)
            {
                await umbraco.SetTextValueAsync(ids[i], "category", category);
            }
        }

        Console.WriteLine(apply
            ? $"  {changed} eventos recategorizados"
            : $"  {changed} eventos cambiarían de categoría");
    }

    /// <summary>
    /// Diagnostic ("--scrape-events"): what each source yields and whether the city
    /// filter would keep it — the same rule the sync applies, so a portal that stops
    /// stating coordinates shows up here first. Reads the city node and Google;
    /// writes nothing.
    /// </summary>
    public async Task ReportSourcesAsync()
    {
        EventVenues venues = await VenuesAsync();
        foreach (EventSourceConfig source in config.Sources)
        {
            List<ScrapedEvent> scraped;
            try
            {
                scraped = await ScrapeSourceAsync(source);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"\n== {source.Name} FAILED: {ex.Message}");
                continue;
            }

            Console.WriteLine($"\n== {source.Name}: {scraped.Count} eventos futuros");
            foreach (ScrapedEvent ev in scraped)
            {
                string verdict;
                try
                {
                    EventLocation location = await venues.LocateAsync(ev);
                    verdict = location.InCity
                        ? location.Venue is { } place ? $"sí ({place.Name})" : "sí"
                        : "no";
                }
                catch (Exception ex)
                {
                    verdict = $"error: {ex.Message}";
                }

                Console.WriteLine(
                    $"  {ev.Start:yyyy-MM-dd HH:mm}  {ev.Name}  [{ev.Venue}]  en la ciudad: {verdict}");
            }
        }
    }

    // ---- Strategies ----

    /// <summary>Scrapes one configured source (no CMS access) — also used by the
    /// agent's "--scrape-events" diagnostic mode.</summary>
    public Task<List<ScrapedEvent>> ScrapeSourceAsync(EventSourceConfig source) => source.Kind switch
    {
        "jsonld-listing" => FromJsonLdListingAsync(source),
        "jsonld-detail" => FromJsonLdDetailsAsync(source),
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

    // ---- Parsing helpers ----

    /// <summary>Content of an og: meta tag, HTML-decoded; null when absent.</summary>
    private static string? OgContent(string html, string property)
    {
        Match m = Regex.Match(html, "<meta property=\"" + Regex.Escape(property) + "\"\\s+content=\"([^\"]+)\"");
        return m.Success ? System.Net.WebUtility.HtmlDecode(m.Groups[1].Value).Trim() : null;
    }

    /// <summary>
    /// Main image of an event, in order of preference: the image the source
    /// declared, the og:image of its ticket page, and finally a Google photo of
    /// the venue. An event without any image falls back to the section picture in
    /// the frontend, which looks the same for every event — worth two extra
    /// requests to avoid.
    /// </summary>
    private async Task<(byte[] Bytes, string ContentType)?> FindImageAsync(ScrapedEvent ev)
    {
        if (ev.ImageUrl is not null && await FetchImageAsync(ev.ImageUrl) is { } declared)
        {
            return declared;
        }

        try
        {
            string? og = OgContent(await FetchAsync(ev.Url), "og:image");
            if (og is not null && await FetchImageAsync(og) is { } fromPage)
            {
                return fromPage;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! og:image de {ev.Name}: {ex.Message}");
        }

        if (google is null || string.IsNullOrWhiteSpace(ev.Venue))
        {
            return null;
        }

        string city = config.CityPath.Trim('/').Split('/').Last().Replace('-', ' ');
        string? photoName = await google.FindPhotoAsync($"{ev.Venue}, {city}");
        return photoName is null ? null : await google.DownloadPhotoAsync(photoName);
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
        double? latitude = null;
        double? longitude = null;
        if (e.TryGetProperty("location", out JsonElement loc) && loc.ValueKind == JsonValueKind.Object)
        {
            venue = Text(loc, "name");

            // Both portals state the venue's coordinates, which is what decides
            // whether the event belongs to the city — the locality they file it
            // under does not: Escenario 360 reads "Los Alcarrizos" and stands on
            // Av. John F. Kennedy.
            if (loc.TryGetProperty("geo", out JsonElement geo) && geo.ValueKind == JsonValueKind.Object)
            {
                latitude = Coordinate(geo, "latitude");
                longitude = Coordinate(geo, "longitude");
            }

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
            System.Net.WebUtility.HtmlDecode(name).Trim(), url, start, end, venue, address, description, imageUrl,
            latitude, longitude);
    }

    /// <summary>A schema.org coordinate, which both portals write as a string.</summary>
    private static double? Coordinate(JsonElement geo, string property) =>
        geo.TryGetProperty(property, out JsonElement value)
            ? value.ValueKind switch
            {
                JsonValueKind.Number => value.GetDouble(),
                JsonValueKind.String => ParseCoordinate(value.GetString()),
                _ => null,
            }
            : null;

    /// <summary>A coordinate written as text, invariant — the CMS and every portal
    /// use a decimal point whatever the machine's culture says.</summary>
    private static double? ParseCoordinate(string? value) =>
        double.TryParse(
            value, System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out double parsed)
            ? parsed
            : null;

    private static DateTime? ParseCmsDate(string? value) =>
        DateTime.TryParse(value, out DateTime parsed) ? parsed : null;

    private static string NameDateKey(string name, DateTime start) =>
        $"{Regex.Replace(name.ToLowerInvariant(), "[^a-z0-9áéíóúñ]", "")}|{start:yyyyMMdd}";
}
