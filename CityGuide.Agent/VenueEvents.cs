namespace CityGuide.Agent;

/// <summary>
/// Fills a city's "Eventos" from the places the portal already has, reading what each
/// one announces on its own site.
///
/// It is the answer to a section no ticket portal can fill. Every portal the agent
/// scrapes sells seats, so it lists the venues with a box office — the Gran Arena, the
/// Teatro Nacional, Hard Rock — and says nothing at all about a beach town: Eventbrite's
/// own "Juan Dolio" page answers with Santo Domingo and La Romana, and not one of its
/// listings falls inside the city. What Juan Dolio has instead is a bar with live music
/// every Thursday and a club with a tournament on Sunday, written on the place's own
/// page and nowhere else.
///
/// Most of what it finds repeats: an activity stated as a weekday and no date is stored
/// with its "recurrence", and the event sync moves it to the next Thursday as each one
/// passes instead of deleting it (see <see cref="EventRecurrence"/>). So the pass is run
/// rarely and the section stays current on its own.
///
/// The site is fetched over the same throttled client the free photos and the menus use:
/// not one Google request. What it costs is one model call per place whose site has an
/// agenda page at all, which is why it needs --paid — the page is prose written for a
/// visitor ("los jueves se enciende con música en vivo"), and nothing but a model turns
/// that into a weekday.
/// </summary>
public class VenueEvents(
    EventSources agendas, UmbracoClient umbraco, IEnrichmentClient enricher,
    EventsCityConfig city, VenueEventsConfig config)
{
    /// <summary>What the events this pass creates carry as their source, so
    /// "--purge-event-source sitio" undoes a pass exactly as it undoes a portal's.</summary>
    public const string SourceName = "sitio";

    /// <summary>
    /// Reads the agenda of the <paramref name="places"/> best-rated places of the city
    /// that have a site of their own, and creates what they announce as events of the
    /// city's section. The city is the whole of the scoping — "--section" picks which
    /// cities run, exactly as it does for the event sync, and inside one there is
    /// nothing to narrow: only a handful of places have a site of their own at all.
    /// Prints the plan and writes nothing unless <paramref name="apply"/>.
    /// </summary>
    public async Task RunAsync(bool apply, int places)
    {
        Console.WriteLine(apply
            ? $"\n== Eventos desde el sitio de cada lugar: {city.CityPath}/eventos"
            : $"\n== Eventos desde el sitio de cada lugar en {city.CityPath} "
              + "(simulación; agrega --apply para aplicarla)");

        if (await umbraco.GetContentByPathAsync($"{city.CityPath}/eventos") is not { } eventos)
        {
            Console.Error.WriteLine("  Events page not found in CMS, skipping.");
            return;
        }

        string cityPrefix = $"{city.CityPath.TrimEnd('/')}/";
        List<UmbracoClient.PublishedPlace> candidates =
            [.. (await umbraco.GetPublishedPlacesAsync())
                .Where(p => p.Path.StartsWith(cityPrefix, StringComparison.OrdinalIgnoreCase)
                    && MenuSources.CanRead(p.Website)
                    && p.RatingCount >= config.MinReviews)
                .OrderByDescending(p => p.Rating)
                .ThenByDescending(p => p.RatingCount)
                .Take(places)];

        if (candidates.Count == 0)
        {
            Console.WriteLine("  Ningún lugar de la ciudad con sitio web propio que leer.");
            return;
        }

        Guid eventTypeId = await umbraco.GetDocumentTypeIdAsync("Event");
        HashSet<string> existing = await ExistingAsync(eventos.Id, eventTypeId);
        string cityName = city.CityPath.Trim('/').Split('/').Last().Replace('-', ' ');

        Console.WriteLine(
            $"  {candidates.Count} lugar(es) por leer. Solo su propio sitio, sin una sola "
            + "petición a Google; el modelo se paga una vez por sitio que tenga agenda.");

        var created = 0;
        var withAgenda = 0;
        foreach (UmbracoClient.PublishedPlace place in candidates)
        {
            IReadOnlyList<AgendaEvent> agenda;
            string source;
            try
            {
                if (await agendas.FindAsync(place.Website) is not FoundAgenda found)
                {
                    continue;
                }

                source = found.SourceUrl;
                agenda = await enricher.ReadAgendaAsync(place.Name, cityName, found.SourceUrl, found.Text);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! agenda de {place.Name}: {ex.Message}");
                continue;
            }

            if (agenda.Count == 0)
            {
                continue;
            }

            withAgenda++;
            Console.WriteLine($"  {place.Name} — {source}");
            foreach (AgendaEvent activity in agenda)
            {
                (DateTime start, string? recurrence) = Schedule(activity);
                string label = recurrence is null
                    ? $"{start:yyyy-MM-dd}"
                    : $"cada {EventRecurrence.SpanishDays[(int)activity.Weekday!.Value]}, "
                      + $"desde {start:yyyy-MM-dd}";
                if (!existing.Add(Key(activity.Name, place.Name, activity.Date, activity.Weekday)))
                {
                    Console.WriteLine($"    = {activity.Name} ({label}) — ya publicado");
                    continue;
                }

                Console.WriteLine($"    + {activity.Name} ({label})"
                    + (activity.Category is null ? "" : $" [{activity.Category}]"));
                if (!apply)
                {
                    continue;
                }

                try
                {
                    await umbraco.CreateDocumentAsync(
                        eventos.Id, eventTypeId, activity.Name,
                        Values(activity, place, start, recurrence, source));
                    created++;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"    ! {activity.Name}: {ex.Message}");
                }
            }
        }

        Console.WriteLine(apply
            ? $"\n  {created} evento(s) creados desde {withAgenda} sitio(s) con agenda, "
              + $"de {candidates.Count} lugar(es) leídos."
            : $"\n  {withAgenda} sitio(s) con agenda de {candidates.Count} lugar(es) leídos.");
    }

    /// <summary>
    /// When the event is, and the rule that repeats it. A weekly activity starts on its
    /// next night — the portal shows what is coming, not the first Thursday it ever
    /// happened — and an activity whose page states no hour starts at midnight, which is
    /// what the frontend shows anyway: it prints the day and never the time.
    /// </summary>
    private static (DateTime Start, string? Recurrence) Schedule(AgendaEvent activity)
    {
        TimeSpan time = activity.Time?.ToTimeSpan() ?? TimeSpan.Zero;
        if (activity.Weekday is { } weekday)
        {
            return (
                EventRecurrence.NextOccurrence(DateTime.Today, weekday).Add(time),
                EventRecurrence.Weekly(weekday));
        }

        return (activity.Date!.Value.ToDateTime(TimeOnly.MinValue).Add(time), null);
    }

    /// <summary>
    /// The event as the CMS stores it. The venue is the place it was read from, so the
    /// event carries its address and its coordinates — which is what puts it on the
    /// events map — and its photo, which costs no download: the picture of the bar is
    /// already in the Media library and is a truer poster than the section image.
    /// "website" is the page the agenda was read from, so a visitor can check it.
    /// </summary>
    private static object[] Values(
        AgendaEvent activity, UmbracoClient.PublishedPlace place, DateTime start,
        string? recurrence, string source) =>
    [
        .. place.PhotoMediaKey is Guid photo
            ? new object[]
            {
                new
                {
                    alias = "photo",
                    value = (object)$"[{{\"key\":\"{Guid.NewGuid()}\",\"mediaKey\":\"{photo}\"}}]",
                },
            }
            : [],
        new { alias = "description", value = (object)(activity.Description ?? "") },
        new { alias = "startDate", value = (object)start.ToString("yyyy-MM-dd HH:mm:ss") },
        new { alias = "venueName", value = (object)place.Name },
        new { alias = "address", value = (object)(place.Address ?? "") },
        new { alias = "website", value = (object)source },
        new { alias = "source", value = (object)$"agent:{SourceName}" },
        .. recurrence is null
            ? []
            : new object[] { new { alias = "recurrence", value = (object)recurrence } },
        .. activity.Category is null
            ? []
            : new object[] { new { alias = "category", value = (object)activity.Category } },
        // The CMS coordinate type stores decimal(_,6); more decimals fail publish.
        .. place.Latitude != 0 && place.Longitude != 0
            ? new object[]
            {
                new { alias = "latitude", value = (object)Math.Round(place.Latitude, 6) },
                new { alias = "longitude", value = (object)Math.Round(place.Longitude, 6) },
            }
            : [],
    ];

    /// <summary>
    /// Every event already under the section, as the key this pass dedupes by. A
    /// recurring event has no date to tell it apart — "Música en vivo" at Ruta 23 is one
    /// node forever — so the key is what it is called, where, and which night: without
    /// that a second pass would publish the Thursday music again beside itself.
    /// </summary>
    private async Task<HashSet<string>> ExistingAsync(Guid eventosId, Guid eventTypeId)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(eventosId))
        {
            if (child.DocumentTypeId != eventTypeId
                || await umbraco.GetDocumentTextValuesAsync(child.Id) is not { } detail)
            {
                continue;
            }

            string venue = detail.TextValues.GetValueOrDefault("venueName") ?? "";
            DayOfWeek? weekday = EventRecurrence.WeekdayOf(detail.TextValues.GetValueOrDefault("recurrence"));
            DateOnly? date = weekday is null
                && DateTime.TryParse(detail.TextValues.GetValueOrDefault("startDate"), out DateTime start)
                    ? DateOnly.FromDateTime(start)
                    : null;
            keys.Add(Key(child.Name, venue, date, weekday));
        }

        return keys;
    }

    private static string Key(string name, string venue, DateOnly? date, DayOfWeek? weekday) =>
        $"{TextMatch.Normalize(name)}|{TextMatch.Normalize(venue)}|{date?.ToString("yyyy-MM-dd") ?? weekday?.ToString() ?? ""}";
}
