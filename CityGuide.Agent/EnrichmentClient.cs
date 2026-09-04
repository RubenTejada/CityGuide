using System.Text.Json;

namespace CityGuide.Agent;

public record Enrichment(
    string Description,
    string[] Facilities,
    string MetaTitle,
    string MetaDescription);

/// <summary>
/// The agent's model-backed steps: a Spanish description + facility mapping for a
/// newly discovered place, and the category of a scraped event. Implemented by
/// AzureOpenAiClient (production) and ClaudeClient (fallback). Everything else
/// (dedupe, rating refresh, cinema sync, trailers, event scraping) is plain code.
/// </summary>
public interface IEnrichmentClient
{
    Task<Enrichment> EnrichAsync(DiscoveredPlace place, string? categoryPrompt = null);

    /// <summary>Categories a batch of scraped events, keyed by their position in
    /// the list. Positions the model left out stay uncategorized.</summary>
    Task<Dictionary<int, string>> ClassifyEventsAsync(IReadOnlyList<ScrapedEvent> events);
}

/// <summary>Prompt, schema and response parsing shared by both model providers.</summary>
public static class EnrichmentPrompt
{
    public static readonly string[] FacilityOptions =
    [
        "Romántico", "Aire Acondicionado", "Horario Extendido", "Restaurante en el Lugar",
        "Parqueo", "WiFi", "Delivery", "Terraza", "Música en Vivo", "Apto para Niños",
    ];

    /// <summary>What the frontend's title budget leaves for the page's own title:
    /// 60 characters minus the " | QueHacerRD" the template appends. A longer one is
    /// dropped rather than cut, so the page falls back to the derived title.</summary>
    public const int MaxMetaTitle = 47;

    /// <summary>Google's snippet budget, the same the frontend truncates to.</summary>
    public const int MaxMetaDescription = 160;

    public const string ToolName = "save_place";
    public const string ToolDescription = "Save the enriched place information for the city guide portal.";

    /// <summary>JSON schema of the forced tool call (same shape for Anthropic input_schema and OpenAI parameters).</summary>
    public static object Schema => new
    {
        type = "object",
        properties = new
        {
            description = new
            {
                type = "string",
                description = "Descripción atractiva del lugar en español, 2-3 frases, tono de guía de ciudad. "
                    + "Sin inventar datos específicos (premios, años, platos exactos) que no estén en la información dada.",
            },
            facilities = new
            {
                type = "array",
                items = new { type = "string", @enum = FacilityOptions },
                description = "Facilidades que muy probablemente aplican según el tipo de lugar y sus horarios.",
            },
            metaTitle = new
            {
                type = "string",
                description = $"Título para Google, máximo {MaxMetaTitle} caracteres (se le añade \" | QueHacerRD\"). "
                    + "Empieza por el nombre del lugar y añade lo que es y dónde está "
                    + "(\"Sonoma Bistro, italiano en Piantini\"). Sin comillas ni mayúsculas de más.",
            },
            metaDescription = new
            {
                type = "string",
                description = $"Descripción para el resultado de Google, entre 120 y {MaxMetaDescription} caracteres, "
                    + "una sola frase en español que nombre el lugar, qué ofrece y en qué zona o ciudad está. "
                    + "Sin comillas, sin emoji y sin repetir el título palabra por palabra.",
            },
        },
        required = new[] { "description", "facilities", "metaTitle", "metaDescription" },
    };

    public static string UserMessage(DiscoveredPlace place, string? categoryPrompt) =>
        $"""
        Lugar para la guía de ciudad:
        Nombre: {place.Name}
        Dirección: {place.Address}
        Tipos (Google): {string.Join(", ", place.Types)}
        Horario: {string.Join(" | ", place.Hours)}
        Sitio web: {place.Website ?? "n/a"}
        {(string.IsNullOrWhiteSpace(categoryPrompt) ? "" : $"\nInstrucciones del editor para esta categoría: {categoryPrompt}\n")}
        Escribe la descripción, selecciona las facilidades y redacta el título y la
        descripción para Google.
        """;

    /// <summary>Parses the tool-call arguments into an Enrichment.</summary>
    public static Enrichment Parse(JsonElement input)
    {
        string description = input.GetProperty("description").GetString() ?? "";
        string[] facilities = input.TryGetProperty("facilities", out JsonElement facilitiesElement)
            && facilitiesElement.ValueKind == JsonValueKind.Array
            ? [.. facilitiesElement.EnumerateArray().Select(f => f.GetString()!).Where(FacilityOptions.Contains)]
            : [];
        return new Enrichment(description, facilities, MetaTitle(input), MetaDescription(input));
    }

    /// <summary>The SEO title, or "" when the model went over budget: an over-long
    /// title is stored verbatim by the frontend, so it is better to leave the field
    /// empty and let the page derive its own.</summary>
    private static string MetaTitle(JsonElement input) =>
        Text(input, "metaTitle") is { Length: > 0 and <= MaxMetaTitle } title ? title : "";

    /// <summary>The SEO description. A long one is kept: the frontend truncates every
    /// description to the snippet budget on a word boundary.</summary>
    private static string MetaDescription(JsonElement input) => Text(input, "metaDescription");

    private static string Text(JsonElement input, string name) =>
        input.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? (value.GetString() ?? "").Trim()
            : "";
}
