namespace CityGuide.Agent;

/// <summary>Where a scraped event happens: whether it is inside the city being
/// synced, and the Google place its venue turned out to be (null when the venue
/// could not be resolved, which for an event without coordinates is also what
/// says it is not ours).</summary>
public sealed record EventLocation(bool InCity, DiscoveredPlace? Venue);

/// <summary>
/// The venue side of the event sync. Every ticket portal lists the whole country
/// — "GRAN ARENA DEL CIBAO" and "Cielo Beach Club" sit in the same feed as the
/// Teatro Nacional — so an event only belongs to the city when its location is
/// inside the city's rectangle (the "agentArea" of the city node, the same box
/// that confines every Google query). Two answers, cheapest first:
///  - the portal states coordinates in its JSON-LD (TodoTickets and Eventbrite
///    both do): the rectangle decides for free, and a locality that disagrees
///    with them is ignored — Escenario 360 is filed under "Los Alcarrizos" and
///    stands on Av. John F. Kennedy.
///  - it does not: the venue name is looked up on Google restricted to that same
///    rectangle, and only a place whose name carries every significant word of
///    the venue counts. Nothing found means the event is not ours.
/// Resolving the venue also yields a full place, so a venue the portal has no
/// page for yet — a bar, a theatre, an attraction — is created in the section
/// its Google types belong to (Events:VenueSections), like any discovered place:
/// as a draft unless the run publishes immediately, deduped by Google place id.
/// </summary>
public class EventVenues(
    UmbracoClient umbraco,
    GooglePlacesClient? google,
    IEnrichmentClient? enricher,
    EventsConfig config,
    UmbracoClient.CityAgentConfig? city)
{
    private readonly Dictionary<string, Guid> _knownPlaceIds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, (Guid Id, Dictionary<string, Guid> Siblings)> _sections =
        new(StringComparer.OrdinalIgnoreCase);

    private bool _baselineLoaded;

    /// <summary>The city rectangle, or null when the city node carries no "agentArea"
    /// — without it there is nothing to filter against and every event is kept.</summary>
    public GeoArea? Area => city?.Area;

    /// <summary>
    /// Whether the event happens in this city, and — unless <paramref name="withVenue"/>
    /// says the caller has no use for it — its venue as a Google place. When only the
    /// venue can answer the question, this throws whatever the lookup throws: a failed
    /// request must never be read as "not in the city", or an outage would drop (or
    /// delete) everything. Coordinates having already answered it, a venue that cannot
    /// be looked up costs nothing but the venue.
    /// </summary>
    public async Task<EventLocation> LocateAsync(ScrapedEvent ev, bool withVenue = true)
    {
        if (Area is not { } area)
        {
            return new EventLocation(true, null);
        }

        if (ev.Latitude is double latitude && ev.Longitude is double longitude)
        {
            if (!area.Contains(latitude, longitude))
            {
                return new EventLocation(false, null);
            }

            try
            {
                return new EventLocation(true, withVenue ? await ResolveAsync(ev.Venue, area) : null);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! lugar de {ev.Name}: {ex.Message}");
                return new EventLocation(true, null);
            }
        }

        DiscoveredPlace? venue = await ResolveAsync(ev.Venue, area);
        return new EventLocation(venue is not null, venue);
    }

    /// <summary>
    /// The Google place this venue is, searched inside the city rectangle. Null
    /// when there is no venue name, no Google key, or nothing found that carries
    /// every significant word of the name: "Parque Central" must not answer for
    /// the one in Santiago, and a plain miss is the answer that keeps the event out.
    /// </summary>
    private async Task<DiscoveredPlace?> ResolveAsync(string? venue, GeoArea area)
    {
        if (google is null || string.IsNullOrWhiteSpace(venue))
        {
            return null;
        }

        string cityName = city?.CityName ?? config.CityPath.Trim('/').Split('/').Last().Replace('-', ' ');
        List<DiscoveredPlace> found = await google.SearchAsync($"{venue}, {cityName}", 5, area);
        return found.FirstOrDefault(p => TextMatch.Matches(venue, p.Name, 1.0));
    }

    /// <summary>
    /// Creates the venue as a place under the section its Google types belong to,
    /// and returns that node — or null when no section covers those types (a hotel,
    /// a stadium the portal has no section for), in which case the venue has still
    /// served to place the event on the map. A venue already in the CMS, by Google
    /// place id or by name under the same parent, is never duplicated.
    /// </summary>
    public async Task<Guid?> FileAsync(DiscoveredPlace venue)
    {
        string? parentPath = config.VenueSections
            .FirstOrDefault(section => venue.Types.Any(section.Types.Contains))?.ParentPath;
        if (parentPath is null || google is null)
        {
            return null;
        }

        // Excluded on the city node: the venue still gave the event its coordinates,
        // it just never becomes a place of its own.
        if (city?.ExcludedPlaceIds.Contains(venue.GooglePlaceId) == true)
        {
            return null;
        }

        await LoadBaselineAsync();
        if (_knownPlaceIds.TryGetValue(venue.GooglePlaceId, out Guid existing))
        {
            return existing;
        }

        if (!_sections.TryGetValue(parentPath, out (Guid Id, Dictionary<string, Guid> Siblings) section))
        {
            return null;
        }

        // A venue whose name is already taken under this section is that venue: the
        // dedupe above only sees the ones that carry a Google place id, and a seeded
        // "Hard Rock Café" has none. Linking to it beats an Umbraco "(1)" twin.
        if (section.Siblings.TryGetValue(venue.Name, out Guid namesake))
        {
            _knownPlaceIds[venue.GooglePlaceId] = namesake;
            return namesake;
        }

        Guid? photoKey = null;
        if (venue.PhotoName is not null)
        {
            try
            {
                (byte[] Bytes, string ContentType)? image = await google.DownloadPhotoAsync(venue.PhotoName);
                if (image is not null)
                {
                    photoKey = await umbraco.CreateMediaImageAsync(
                        venue.Name, image.Value.Bytes, image.Value.ContentType);
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! foto de {venue.Name}: {ex.Message}");
            }
        }

        // The category prompt of the section it lands in ("bares-y-clubes"), the same
        // one a discovery run would have used for this very place.
        string[] segments = parentPath.Trim('/').Split('/');
        string? prompt = segments.Length > 1 && city is not null
            && city.CategoryPrompts.TryGetValue(segments[1], out string? categoryPrompt)
            ? categoryPrompt
            : null;
        Enrichment? enrichment = enricher is null ? null : await enricher.EnrichAsync(venue, prompt);

        Guid id = await umbraco.CreatePlaceAsync(section.Id, venue, enrichment, photoKey);
        section.Siblings[venue.Name] = id;
        _knownPlaceIds[venue.GooglePlaceId] = id;
        Console.WriteLine($"  + lugar '{venue.Name}' en {parentPath}");
        return id;
    }

    /// <summary>Everything already in the CMS the venue could duplicate: the published
    /// places of the whole site (one read) plus, per configured section, the drafts an
    /// earlier pass left there and the names already taken under it.</summary>
    private async Task LoadBaselineAsync()
    {
        if (_baselineLoaded)
        {
            return;
        }

        _baselineLoaded = true;
        foreach ((string googlePlaceId, Guid id) in await umbraco.GetKnownGooglePlaceIdsAsync())
        {
            _knownPlaceIds[googlePlaceId] = id;
        }

        foreach (string parentPath in config.VenueSections
                     .Select(section => section.ParentPath)
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (await umbraco.GetContentByPathAsync(parentPath) is not { } parent)
            {
                Console.Error.WriteLine($"  ! sección de lugares no encontrada: {parentPath}");
                continue;
            }

            foreach ((string googlePlaceId, Guid id) in await umbraco.GetDescendantPlaceIdsAsync(parent.Id))
            {
                _knownPlaceIds.TryAdd(googlePlaceId, id);
            }

            var siblings = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(parent.Id))
            {
                siblings[child.Name] = child.Id;
            }

            _sections[parentPath] = (parent.Id, siblings);
        }
    }
}
