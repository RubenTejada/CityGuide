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

        var events = new EventWriter(umbraco, city, SourceName);
        if (!await events.OpenAsync())
        {
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
                agenda = await enricher.ReadAgendaAsync(
                    place.Name, events.CityName, found.SourceUrl, found.Text);
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
                if (await events.AddAsync(activity, place, source, apply) == EventOutcome.Created)
                {
                    created++;
                }
            }
        }

        Console.WriteLine(apply
            ? $"\n  {created} evento(s) creados desde {withAgenda} sitio(s) con agenda, "
              + $"de {candidates.Count} lugar(es) leídos."
            : $"\n  {withAgenda} sitio(s) con agenda de {candidates.Count} lugar(es) leídos.");
    }
}
