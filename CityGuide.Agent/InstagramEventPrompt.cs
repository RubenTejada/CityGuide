using System.Text;
using System.Text.Json;

namespace CityGuide.Agent;

/// <summary>One activity read out of a publication, with the publication it came from:
/// the permalink is what the event stores as its page, so an editor — and a visitor —
/// can go and look at the flyer the portal read.</summary>
public record FeedEvent(AgendaEvent Event, InstagramPost Post);

/// <summary>
/// Reading a place's Instagram into the events the portal publishes.
///
/// It is the last source there is for a town without a box office. No ticket portal
/// lists Juan Dolio, and most of its bars have no site either — what they have is a
/// feed, and half of what they announce there is not written anywhere: it is drawn
/// inside the flyer. So the model is given the pictures as well as the captions, which
/// is the one step of the agent that reads an image, and the only one that could reach
/// that half at all.
///
/// The prompt copies and the answer is verified, exactly as on an agenda page. What
/// changes is what a quote can be checked against: a caption is text this side holds,
/// so a quote of it is confirmed word for word, while a quote read off a flyer is a
/// transcription nothing here can confirm. Such an event is accepted only from a
/// publication that really carries an image, and the pass prints it — with its
/// permalink — before anything is written, which is what --apply is for.
/// </summary>
public static class InstagramEventPrompt
{
    public const string ToolName = "save_instagram_events";

    public const string ToolDescription =
        "Save the events the venue announces in its own Instagram publications.";

    /// <summary>How much of a caption is put to the model. A bar writes a paragraph and
    /// thirty hashtags; past this it is the hashtags.</summary>
    private const int MaxCaptionCharacters = 1_200;

    /// <summary>Where the model says it read the sentence it quotes. The two are
    /// checked differently, which is the whole reason it is asked.</summary>
    private const string FromCaption = "texto";
    private const string FromImage = "imagen";

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
                    "Un elemento por actividad que alguna publicación anuncie con fecha o "
                    + "con día de la semana. Vacío si ninguna anuncia una.",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        index = new
                        {
                            type = "integer",
                            description = "El número de la publicación de la que sale esta actividad.",
                        },
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
                                "La fecha exacta que anuncia la publicación, en formato aaaa-mm-dd. "
                                + "Si el anuncio da el día y el mes pero no el año, usa el año que "
                                + "corresponda a la fecha en que se publicó. Si la actividad es "
                                + "semanal, deja este campo fuera y responde \"weekday\".",
                        },
                        weekday = new
                        {
                            type = "string",
                            @enum = EventRecurrence.SpanishDays,
                            description =
                                "El día de la semana, solo si el anuncio dice que la actividad se "
                                + "repite ese día (\"todos los jueves\", \"cada miércoles\"). Si "
                                + "anuncia una fecha concreta, deja este campo fuera.",
                        },
                        time = new
                        {
                            type = "string",
                            description =
                                "La hora a la que empieza, en formato 24 h (\"21:00\"), si el "
                                + "anuncio la dice.",
                        },
                        description = new
                        {
                            type = "string",
                            description =
                                "Una o dos frases en español sobre la actividad, con lo que dice "
                                + "el anuncio y nada más. Sin precios que no aparezcan.",
                        },
                        category = new { type = "string", @enum = EventCategories.Options },
                        atThisPlace = new
                        {
                            type = "boolean",
                            description =
                                "Verdadero solo si la actividad ocurre en este mismo local. Falso "
                                + "si la publicación anuncia algo de otro sitio, de otra ciudad o "
                                + "de otra cuenta.",
                        },
                        evidenceSource = new
                        {
                            type = "string",
                            @enum = new[] { FromCaption, FromImage },
                            description =
                                $"\"{FromCaption}\" si la frase de \"evidence\" está en el texto "
                                + $"de la publicación; \"{FromImage}\" si la leíste dentro de la "
                                + "imagen. No lo confundas: la del texto se comprueba palabra por "
                                + "palabra y una que no aparezca se descarta.",
                        },
                        evidence = new
                        {
                            type = "string",
                            description =
                                "La frase que anuncia esta actividad con su día o su fecha, "
                                + "copiada palabra por palabra: del texto de la publicación, o de "
                                + "lo que está escrito dentro de la imagen. Cópiala tal cual, sin "
                                + "resumirla ni corregirla. Si no puedes señalar una frase así, la "
                                + "actividad no va en la respuesta.",
                        },
                    },
                    required = new[] { "index", "name", "atThisPlace", "evidenceSource", "evidence" },
                },
            },
        },
        required = new[] { "events" },
    };

    /// <summary>
    /// The publications as the model sees them: the rules once, then each publication
    /// announced by its number, its date and its text, with its picture right after it.
    /// The number is how an answer points back at the publication it came from, which is
    /// what gives the event its permalink and what bounds its date.
    /// </summary>
    public static IReadOnlyList<PromptPart> UserMessage(
        string placeName, string cityName, IReadOnlyList<InstagramPost> posts)
    {
        var parts = new List<PromptPart>
        {
            PromptPart.Say(
                $"""
                Estas son las publicaciones recientes de la cuenta de Instagram de
                "{placeName}", un establecimiento de {cityName} (República Dominicana).

                Saca las actividades abiertas al público que anuncien: conciertos, música
                en vivo, karaoke, fiestas, torneos, degustaciones, noches temáticas.

                Reglas, en este orden:
                1. Copia, no deduzcas. Si una publicación no dice ni una fecha ni un día de
                   la semana, no anuncia ningún evento y no va en la respuesta.
                2. Una foto del plato, del local o de la clientela no es un anuncio. Una
                   frase como "te esperamos" tampoco: hace falta un día o una fecha.
                3. Lo que ya pasó no se publica. Mira la fecha de la publicación: un
                   anuncio nunca es anterior a sí mismo, y una foto de la fiesta del
                   sábado pasado no es un evento por venir.
                4. Si el anuncio dice que algo se repite todas las semanas el mismo día,
                   responde "weekday" y no inventes una fecha. Si da una fecha concreta,
                   responde "date". Nunca elijas un día que el anuncio no haya escrito.
                5. Un rango de días es el horario del local, no un evento: "Miércoles a
                   Sábado – 8pm" dice cuándo abre y nada más.
                6. Si la publicación anuncia algo que pasa en otro sitio —otro local, otra
                   ciudad, el cartel de un artista de gira— responde "atThisPlace" falso.
                7. Por cada actividad copia en "evidence" la frase exacta que la anuncia
                   con su día o su fecha, y di en "evidenceSource" si esa frase está en el
                   texto de la publicación o escrita dentro de la imagen.
                8. No repitas la misma actividad dos veces, aunque salga en dos
                   publicaciones.

                Hoy es {DateTime.Today:yyyy-MM-dd}.
                """),
        };

        for (var index = 0; index < posts.Count; index++)
        {
            InstagramPost post = posts[index];
            var heading = new StringBuilder()
                .AppendLine($"— Publicación {index}, publicada el {post.Taken:yyyy-MM-dd} —");
            heading.AppendLine(string.IsNullOrWhiteSpace(post.Caption)
                ? "Texto: (sin texto)"
                : $"Texto: {AgendaParsing.Cut(post.Caption, MaxCaptionCharacters)}");
            parts.Add(PromptPart.Say(heading.ToString()));
            if (HasImage(post))
            {
                parts.Add(PromptPart.Show(post.MediaUrl!));
            }
        }

        return parts;
    }

    /// <summary>Whether the publication carries a picture the model can be shown. A
    /// carousel names no single image and a video names a frame at best, so what is
    /// read is exactly what Meta hands over as the publication's own image.</summary>
    public static bool HasImage(InstagramPost post) =>
        !string.IsNullOrEmpty(post.MediaUrl) && post.MediaType is "IMAGE" or "CAROUSEL_ALBUM";

    /// <summary>
    /// The events of the tool call, dropping what cannot become one: a publication
    /// number that names none, an announcement about somebody else's venue, no name,
    /// neither a date nor a weekday, and a date that is past, too far ahead, or earlier
    /// than the publication announcing it.
    ///
    /// The quote decides the rest. One the model says it read in the caption is checked
    /// against that caption word for word and dropped when it is not there — the same
    /// rule an agenda page gets. One it says it read inside the flyer cannot be checked
    /// against anything, so it is accepted only from a publication that really carries a
    /// picture: the answer to a caption-only post claiming to quote an image is that
    /// there was no image to read.
    /// </summary>
    public static IReadOnlyList<FeedEvent> Parse(JsonElement input, IReadOnlyList<InstagramPost> posts)
    {
        if (!input.TryGetProperty("events", out JsonElement events)
            || events.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var parsed = new List<FeedEvent>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (JsonElement item in events.EnumerateArray())
        {
            if (Index(item) is not { } index || index < 0 || index >= posts.Count
                || !Flag(item, "atThisPlace")
                || AgendaParsing.Text(item, "name") is not { Length: > 0 } name)
            {
                continue;
            }

            InstagramPost post = posts[index];
            string? evidence = AgendaParsing.Text(item, "evidence");
            bool fromImage = AgendaParsing.Text(item, "evidenceSource") == FromImage;
            if (fromImage
                ? !HasImage(post)
                : !AgendaParsing.Quotes(post.Caption ?? "", evidence))
            {
                continue;
            }

            DateOnly? date = AgendaParsing.Date(
                AgendaParsing.Text(item, "date"), DateOnly.FromDateTime(post.Taken.Date));
            DayOfWeek? weekday = EventRecurrence.WeekdayOf(AgendaParsing.Text(item, "weekday"));
            if (weekday is { } day && !AgendaParsing.NamesDay(evidence, day))
            {
                weekday = null;
            }

            if (date is null && weekday is null)
            {
                continue;
            }

            // A date and a weekday together is a single night the flyer happens to say
            // the weekday of; the date is the more specific answer and wins.
            if (date is not null)
            {
                weekday = null;
            }

            if (!seen.Add($"{TextMatch.Normalize(name)}|{date}|{weekday}"))
            {
                continue;
            }

            parsed.Add(new FeedEvent(
                new AgendaEvent(
                    AgendaParsing.Cut(name, AgendaParsing.MaxNameLength), date, weekday,
                    AgendaParsing.Time(AgendaParsing.Text(item, "time")),
                    AgendaParsing.Text(item, "description") is { Length: > 0 } summary
                        ? AgendaParsing.Cut(summary, AgendaParsing.MaxDescriptionLength)
                        : null,
                    AgendaParsing.Category(item)),
                post));
            if (parsed.Count == AgendaParsing.MaxEvents)
            {
                break;
            }
        }

        return parsed;
    }

    private static int? Index(JsonElement item) =>
        item.TryGetProperty("index", out JsonElement value)
        && value.ValueKind == JsonValueKind.Number
        && value.TryGetInt32(out int index)
            ? index
            : null;

    private static bool Flag(JsonElement item, string name) =>
        item.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.True;
}
