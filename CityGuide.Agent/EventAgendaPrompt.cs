using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>
/// One thing that happens at a place, as its own page states it: either on a date
/// ("12 de octubre, torneo de voleibol") or every week on the same night ("música en
/// vivo todos los jueves"). Never both — a page that gives a weekday and no date is
/// the recurring kind, which is most of what a beach town has.
/// </summary>
public record AgendaEvent(
    string Name, DateOnly? Date, DayOfWeek? Weekday, TimeOnly? Time,
    string? Description, string? Category);

/// <summary>
/// Reading a place's agenda page into the events the portal publishes. The page is
/// prose written for a visitor — "los jueves se enciende con música en vivo hasta
/// tarde" — and no portal states it as data, so the model is what turns it into a
/// date, a weekday and a name.
///
/// The prompt copies, it never infers. A page about renting a hall for a wedding
/// comes back empty, which matters: "Eventos" on a hotel's site means its salones and
/// its banquet menus, and a model asked for events would dutifully invent a season out
/// of it. So would a page that merely says the place is lively at night: an event needs
/// a date the page states or a weekday it names, and nothing else counts.
/// </summary>
public static partial class EventAgendaPrompt
{
    public const string ToolName = "save_venue_events";

    public const string ToolDescription =
        "Save the events this venue's own page announces, for the city guide portal.";

    /// <summary>What one page may yield before the rest is a listing of somebody
    /// else's calendar. A page over this is cut, not dropped.</summary>
    private const int MaxEvents = 20;

    private const int MaxNameLength = 120;
    private const int MaxDescriptionLength = 400;

    /// <summary>How far ahead a stated date may be before it is somebody's archive
    /// heading rather than a coming event. A year is generous for a beach town.</summary>
    private const int MaxDaysAhead = 400;

    /// <summary>JSON schema of the forced tool call (same shape for Anthropic
    /// input_schema and OpenAI parameters).</summary>
    public static object Schema => new
    {
        type = "object",
        properties = new
        {
            events = new
            {
                type = "array",
                description =
                    "Un elemento por actividad que la página anuncie con fecha o con día "
                    + "de la semana. Vacío si la página no anuncia ninguna.",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        name = new
                        {
                            type = "string",
                            description =
                                "Cómo se llama la actividad, en español y en pocas palabras "
                                + "(\"Música en vivo\", \"Noche de karaoke\", \"Torneo de voleibol "
                                + "de playa\"). Sin el nombre del local: la página del evento ya "
                                + "dice dónde es.",
                        },
                        date = new
                        {
                            type = "string",
                            description =
                                "La fecha exacta que dice la página, en formato aaaa-mm-dd. "
                                + "Solo si la página la dice. Si la actividad es semanal, deja "
                                + "este campo fuera y responde \"weekday\".",
                        },
                        weekday = new
                        {
                            type = "string",
                            @enum = EventRecurrence.SpanishDays,
                            description =
                                "El día de la semana, solo si la página nombra ese día para "
                                + "esta actividad (\"todos los jueves\", \"cada miércoles\", "
                                + "\"viernes y sábados\" → un elemento por día). Si la página "
                                + "da una fecha concreta, deja este campo fuera; si dice que "
                                + "es diaria o todas las noches, no hay día que responder y la "
                                + "actividad no va en la respuesta.",
                        },
                        time = new
                        {
                            type = "string",
                            description = "La hora a la que empieza, en formato 24 h (\"21:00\"), "
                                + "si la página la dice.",
                        },
                        description = new
                        {
                            type = "string",
                            description =
                                "Una o dos frases en español sobre la actividad, con lo que dice "
                                + "la página y nada más. Sin precios que la página no dé.",
                        },
                        category = new { type = "string", @enum = EventCategories.Options },
                        evidence = new
                        {
                            type = "string",
                            description =
                                "La frase de la página, copiada palabra por palabra, que dice "
                                + "que esta actividad ocurre ese día o esa fecha. Cópiala tal "
                                + "cual, sin resumirla ni corregirla. Si no puedes señalar una "
                                + "frase así, la actividad no va en la respuesta.",
                        },
                    },
                    required = new[] { "name", "evidence" },
                },
            },
        },
        required = new[] { "events" },
    };

    public static string UserMessage(string placeName, string cityName, string pageUrl, string pageText) =>
        $"""
        Esta es la página web de "{placeName}", un establecimiento de {cityName}
        (República Dominicana). Dirección de la página: {pageUrl}

        Saca las actividades abiertas al público que la página anuncie: conciertos,
        música en vivo, karaoke, fiestas, torneos, degustaciones, noches temáticas.

        Reglas, en este orden:
        1. Copia, no deduzcas. Si la página no dice ni una fecha ni un día de la
           semana para algo, ese algo no es un evento y no va en la respuesta.
        2. Algo que pasa todos los días ("actividades diarias", "todas las noches",
           "cada día") no tiene día que publicar: déjalo fuera. Nunca elijas un día
           de la semana que la página no haya escrito.
        3. Una página sobre alquilar salones para bodas, congresos o eventos
           corporativos no anuncia ninguna actividad: responde con la lista vacía.
        4. Que el sitio sea animado, tenga discoteca o "ambiente nocturno" tampoco es
           un evento. Un horario de apertura no es un evento.
        5. El programa de animación de un hotel para sus huéspedes —aeróbicos, aqua
           gym, club infantil, juegos junto a la piscina— no es un evento de la
           ciudad. Un concierto, una fiesta o un show al que se puede ir sí lo es.
        6. Si dice que algo pasa todas las semanas el mismo día, responde "weekday"
           y no inventes una fecha. Si da una fecha concreta, responde "date".
        7. Un rango de días es el horario del local, no un evento: "Miércoles a
           Sábado – 20h" dice cuándo abre y nada más.
        8. Por cada actividad copia en "evidence" la frase exacta de la página que
           la anuncia con su día o su fecha. Se comprueba contra la página: si no
           aparece tal cual, la actividad se descarta.
        9. No repitas la misma actividad dos veces.

        Hoy es {DateTime.Today:yyyy-MM-dd}.

        Texto de la página:
        {pageText}
        """;

    /// <summary>
    /// The events of the tool call, dropping what cannot become one: no name, neither a
    /// date nor a weekday, a date already past or so far ahead it is an archive heading,
    /// and — the one that matters — a weekday the page never wrote.
    ///
    /// A schema that offers a day of the week gets one: asked about a resort's nightly
    /// show, the model answered "viernes", and no wording of the rules stopped it. So
    /// the answer is checked against <paramref name="pageText"/> instead of trusted: a
    /// weekly event survives only when the page names that day in so many words. It is
    /// the same discipline the menu prompt applies to a carta of three dishes — the CMS
    /// only ever receives what this side could verify.
    /// </summary>
    public static IReadOnlyList<AgendaEvent> Parse(JsonElement input, string pageText)
    {
        // The page is flattened before it is searched: ReadableText makes every tag a
        // line break, so a sentence wrapped in a <b> arrives in three pieces and a quote
        // of it would never be found. Both sides are compared as one run of words.
        string page = Flatten(pageText);
        if (!input.TryGetProperty("events", out JsonElement events)
            || events.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var parsed = new List<AgendaEvent>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (JsonElement item in events.EnumerateArray())
        {
            if (Text(item, "name") is not { Length: > 0 } name)
            {
                continue;
            }

            DateOnly? date = Date(Text(item, "date"));
            DayOfWeek? weekday = EventRecurrence.WeekdayOf(Text(item, "weekday"));
            if (weekday is { } day && !Announces(page, Text(item, "evidence"), day))
            {
                weekday = null;
            }

            if (date is null && weekday is null)
            {
                continue;
            }

            // A date and a weekday together is a single night the page happens to say
            // the weekday of; the date is the more specific answer and wins.
            if (date is not null)
            {
                weekday = null;
            }

            if (!seen.Add($"{TextMatch.Normalize(name)}|{date}|{weekday}"))
            {
                continue;
            }

            parsed.Add(new AgendaEvent(
                Cut(name, MaxNameLength), date, weekday, Time(Text(item, "time")),
                Text(item, "description") is { Length: > 0 } summary
                    ? Cut(summary, MaxDescriptionLength)
                    : null,
                Text(item, "category") is { Length: > 0 } category
                    && EventCategories.Options.Contains(category)
                        ? category
                        : null));
            if (parsed.Count == MaxEvents)
            {
                break;
            }
        }

        return parsed;
    }

    /// <summary>
    /// Whether the page really announces something on <paramref name="weekday"/>, which
    /// is the one question this side can answer for itself and the one the model keeps
    /// getting wrong. It is asked to quote the sentence that says so, and the quote has
    /// to be in the page: a resort's nightly show came back as "viernes" under two
    /// different wordings of the rules, and no quote of it exists.
    ///
    /// A quote that does exist is still not always an announcement. "Miércoles a Sábado
    /// – 20h" is when the restaurant opens, and a model asked for events read two
    /// cultural evenings into it — so a sentence that runs from one day to another is
    /// an opening-hours line and never an event.
    /// </summary>
    private static bool Announces(string page, string? evidence, DayOfWeek weekday)
    {
        if (evidence is not { Length: > 0 })
        {
            return false;
        }

        string quote = Flatten(evidence);
        string day = TextMatch.Normalize(EventRecurrence.SpanishDays[(int)weekday]);
        if (!quote.Contains(day, StringComparison.Ordinal)
            || !page.Contains(quote, StringComparison.Ordinal))
        {
            return false;
        }

        // Two different weekdays with nothing but a connector between them: a range.
        return DayRange().Matches(quote).All(range =>
            range.Groups[1].Value.TrimEnd('s') == range.Groups[2].Value.TrimEnd('s'));
    }

    /// <summary>Text as one run of lowercase, unaccented words, which is how a quote is
    /// compared with the page it should have come from.</summary>
    private static string Flatten(string value) =>
        Whitespace().Replace(TextMatch.Normalize(value), " ").Trim();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>"miércoles a sábado", "de lunes a viernes", "jueves - domingo": how an
    /// opening-hours line names the days a place is open. The days are matched without
    /// their accents, since the quote is compared flattened.</summary>
    [GeneratedRegex(
        @"(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)"
        + @"\s*(?:a|al|hasta|-|–|—|/)\s*"
        + @"(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)")]
    private static partial Regex DayRange();

    private static DateOnly? Date(string? value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None,
            out DateOnly parsed)
        && parsed >= DateOnly.FromDateTime(DateTime.Today)
        && parsed <= DateOnly.FromDateTime(DateTime.Today.AddDays(MaxDaysAhead))
            ? parsed
            : null;

    private static TimeOnly? Time(string? value) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None,
            out TimeOnly parsed)
            ? parsed
            : null;

    private static string Cut(string value, int max) =>
        value.Length > max ? value[..max].TrimEnd() : value;

    private static string? Text(JsonElement item, string name) =>
        item.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim()
            : null;
}
