namespace CityGuide.Agent;

/// <summary>What happened to one activity a pass read: it was already published, it is
/// only being planned, it was created, or the CMS refused it.</summary>
public enum EventOutcome
{
    Duplicate,
    Planned,
    Created,
    Failed,
}

/// <summary>
/// An <see cref="AgendaEvent"/> becomes an event node of a city's "Eventos", deduped
/// against what is already there.
///
/// Two passes read the same kind of announcement from two different places — the site a
/// place publishes (<see cref="VenueEvents"/>) and the Instagram account it publishes
/// instead (<see cref="InstagramEvents"/>) — and what they do with what they find is
/// identical down to the printed line: the same schedule, the same values, the same key.
/// Only the reading differs, so only the reading lives in each pass.
/// </summary>
public class EventWriter(UmbracoClient umbraco, EventsCityConfig city, string sourceName)
{
    private Guid _eventos;
    private Guid _eventType;
    private HashSet<string> _existing = [];

    /// <summary>The city as a person writes it, for the prompts that name it.</summary>
    public string CityName => city.CityPath.Trim('/').Split('/').Last().Replace('-', ' ');

    /// <summary>Finds the city's events section and reads what it already holds. False
    /// when the city has no such section, which is a skip and not a failure.</summary>
    public async Task<bool> OpenAsync()
    {
        if (await umbraco.GetContentByPathAsync($"{city.CityPath}/eventos") is not { } eventos)
        {
            Console.Error.WriteLine("  Events page not found in CMS, skipping.");
            return false;
        }

        _eventos = eventos.Id;
        _eventType = await umbraco.GetDocumentTypeIdAsync("Event");
        _existing = await ExistingAsync();
        return true;
    }

    /// <summary>
    /// Publishes the activity under the city's events, taking <paramref name="venue"/>
    /// as where it happens and <paramref name="website"/> as the page it was read from.
    /// Prints the one line the plan and the run share, and writes nothing unless
    /// <paramref name="apply"/>.
    /// </summary>
    public async Task<EventOutcome> AddAsync(
        AgendaEvent activity, UmbracoClient.PublishedPlace venue, string website, bool apply)
    {
        (DateTime start, string? recurrence) = Schedule(activity);
        string label = recurrence is null
            ? $"{start:yyyy-MM-dd}"
            : $"cada {EventRecurrence.SpanishDays[(int)activity.Weekday!.Value]}, desde {start:yyyy-MM-dd}";
        if (!_existing.Add(Key(activity.Name, venue.Name, activity.Date, activity.Weekday)))
        {
            Console.WriteLine($"    = {activity.Name} ({label}) — ya publicado");
            return EventOutcome.Duplicate;
        }

        Console.WriteLine($"    + {activity.Name} ({label})"
            + (activity.Category is null ? "" : $" [{activity.Category}]"));
        if (!apply)
        {
            return EventOutcome.Planned;
        }

        try
        {
            await umbraco.CreateDocumentAsync(
                _eventos, _eventType, activity.Name,
                Values(activity, venue, start, recurrence, website, sourceName));
            return EventOutcome.Created;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"    ! {activity.Name}: {ex.Message}");
            return EventOutcome.Failed;
        }
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
    /// "website" is the page or the publication it was read from, so a visitor can check
    /// it — and so can an editor, which is what a flyer nobody transcribed needs most.
    /// </summary>
    private static object[] Values(
        AgendaEvent activity, UmbracoClient.PublishedPlace place, DateTime start,
        string? recurrence, string website, string source) =>
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
        new { alias = "website", value = (object)website },
        new { alias = "source", value = (object)$"agent:{source}" },
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
    /// that a second pass would publish the Thursday music again beside itself. The two
    /// passes share the key as well as the section, so the site and the feed of one bar
    /// announcing the same night publish it once.
    /// </summary>
    private async Task<HashSet<string>> ExistingAsync()
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(_eventos))
        {
            if (child.DocumentTypeId != _eventType
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
