using System.Text.Json;

namespace CityGuide.Agent;

/// <summary>
/// The "Categoría" of an event, as the frontend badge and the events filter show
/// it. The portals the agent scrapes say nothing about it — a listing is a title,
/// a venue and a date — and the title is usually just the artist's name ("Yiyo
/// Sarante 'Solo'"), so telling a concert from a stand-up night from a congress
/// takes knowing who that is. That is why this is the one part of the event sync
/// that spends model tokens: one batched call per portal, no call at all when no
/// model is configured (the events are then created without a category, which the
/// frontend hides, rather than with a wrong one).
/// </summary>
public static class EventCategories
{
    /// <summary>The vocabulary, matching the values the seeded events carry: the
    /// events filter lists whatever values exist, so a new one would split the
    /// dropdown instead of grouping with its peers.</summary>
    public static readonly string[] Options =
    [
        "Conciertos", "Música", "Teatro y Danza", "Espectáculos",
        "Deportes", "Arte y Cultura", "Ferias y Exposiciones", "Gastronomía",
    ];

    public const string ToolName = "save_event_categories";
    public const string ToolDescription = "Save the category of each listed event for the city guide portal.";

    /// <summary>Events sent per model call. The portals cap at 30 per source, so a
    /// batch is normally one call for the whole source.</summary>
    public const int BatchSize = 40;

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
                description = "Una entrada por evento de la lista, con su número.",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        index = new { type = "integer", description = "Número del evento en la lista." },
                        category = new { type = "string", @enum = Options },
                    },
                    required = new[] { "index", "category" },
                },
            },
        },
        required = new[] { "events" },
    };

    /// <summary>One line per event: everything the portal gave us, which for the
    /// ticket portals is little more than the title and the venue.</summary>
    public static string UserMessage(IReadOnlyList<ScrapedEvent> events) =>
        $"""
        Clasifica cada evento de esta cartelera dominicana en una de estas categorías:
        - Conciertos: música en vivo de un artista o grupo anunciado por su nombre.
        - Música: fiestas, DJ, festivales musicales y noches de música sin un artista principal.
        - Teatro y Danza: obras de teatro, ópera, ballet, danza y musicales.
        - Espectáculos: comedia y stand-up, circo, magia, charlas motivacionales, desfiles y shows.
        - Deportes: partidos, carreras, torneos y exhibiciones deportivas.
        - Arte y Cultura: exposiciones de arte, museos, literatura, cine y conferencias culturales.
        - Ferias y Exposiciones: ferias, expos, congresos, convenciones y mercados.
        - Gastronomía: eventos cuyo centro es la comida o la bebida (festivales gastronómicos, catas, cervecerías).

        Usa lo que sepas del artista o del evento: el título suele ser solo el nombre
        del artista. Si dudas entre dos, elige la que describa lo que el público va a ver.
        La lista tiene {events.Count} eventos: devuelve exactamente {events.Count} entradas,
        una por cada número del 1 al {events.Count}.

        {string.Join("\n", events.Select((e, i) =>
            $"{i + 1}. {e.Name}"
            + (string.IsNullOrWhiteSpace(e.Venue) ? "" : $" | Lugar: {e.Venue}")
            + (string.IsNullOrWhiteSpace(e.Description) ? "" : $" | {Trim(e.Description)}")))}
        """;

    private static string Trim(string description) =>
        description.Length <= 200 ? description : description[..200];

    /// <summary>Parses the tool-call arguments into "list position → category".
    /// Entries the model skipped, numbered out of range or answered with a value
    /// outside the vocabulary are dropped: those events stay uncategorized.</summary>
    public static Dictionary<int, string> Parse(JsonElement input, int count)
    {
        var byIndex = new Dictionary<int, string>();
        if (!input.TryGetProperty("events", out JsonElement events)
            || events.ValueKind != JsonValueKind.Array)
        {
            return byIndex;
        }

        foreach (JsonElement entry in events.EnumerateArray())
        {
            if (!entry.TryGetProperty("index", out JsonElement index)
                || !index.TryGetInt32(out int position)
                || position < 1 || position > count)
            {
                continue;
            }

            string? category = entry.TryGetProperty("category", out JsonElement value)
                ? value.GetString()
                : null;
            if (category is not null && Options.Contains(category))
            {
                byIndex[position - 1] = category;
            }
        }

        return byIndex;
    }
}
