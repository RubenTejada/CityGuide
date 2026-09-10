using System.Text.Json;

namespace CityGuide.Agent;

/// <summary>
/// What the model writes about a discovered place, in both languages. The English
/// side costs no extra call and no extra Google request — it is three more fields on
/// the answer the place already pays for — which is what keeps a place created today
/// from waiting for the next translation pass to have an English page.
/// </summary>
public record Enrichment(
    string Description,
    string[] Facilities,
    string MetaTitle,
    string MetaDescription,
    string DescriptionEn,
    string MetaTitleEn,
    string MetaDescriptionEn);

/// <summary>
/// A piece of what is put to the model: a run of text, or the address of an image it
/// should look at. Almost every step the agent asks about is text and passes one string;
/// the Instagram pass is the exception, because half of what a bar announces is drawn
/// inside the flyer and nowhere in the caption.
/// </summary>
public record PromptPart(string? Text, string? ImageUrl)
{
    public static PromptPart Say(string text) => new(text, null);

    public static PromptPart Show(string imageUrl) => new(null, imageUrl);
}

/// <summary>
/// The agent's model-backed steps: a Spanish description + facility mapping for a
/// newly discovered place, the category of a scraped event, the cuisine of a restaurant
/// Google types generically, the carta behind a restaurant's menu page, the agenda a
/// venue writes on its own site or announces on its Instagram, and the English
/// translation of the prose already in the CMS. Implemented by
/// AzureOpenAiClient (production) and ClaudeClient (fallback). Everything else
/// (dedupe, rating refresh, cinema sync, trailers, event scraping) is plain code.
/// </summary>
public interface IEnrichmentClient
{
    Task<Enrichment> EnrichAsync(DiscoveredPlace place, string? categoryPrompt = null);

    /// <summary>Categories a batch of scraped events, keyed by their position in
    /// the list. Positions the model left out stay uncategorized.</summary>
    Task<Dictionary<int, string>> ClassifyEventsAsync(IReadOnlyList<ScrapedEvent> events);

    /// <summary>The cuisine of a batch of restaurants Google typed as nothing more than
    /// "restaurant", keyed by their position in the list. Positions the model left out
    /// keep the subcategory they have.</summary>
    Task<Dictionary<int, string>> ClassifyCuisinesAsync(IReadOnlyList<CuisineCandidate> places);

    /// <summary>Structures the text of a restaurant's menu page into its carta, in both
    /// languages, or null when the page turned out not to be one.</summary>
    Task<StructuredMenu?> StructureMenuAsync(string placeName, string cityName, string menuText);

    /// <summary>The activities a place's own page announces, dated or weekly. Empty
    /// when the page announces none, which is the normal answer: "Eventos" on a
    /// hotel's site is its salones for hire and not an agenda.</summary>
    Task<IReadOnlyList<AgendaEvent>> ReadAgendaAsync(
        string placeName, string cityName, string pageUrl, string pageText);

    /// <summary>The activities a place announces in its own Instagram publications,
    /// each with the publication it was read from. The captions and the pictures go
    /// together: it is the one step of the agent that looks at an image, because half
    /// of what a bar announces is written only inside the flyer.</summary>
    Task<IReadOnlyList<FeedEvent>> ReadFeedEventsAsync(
        string placeName, string cityName, IReadOnlyList<InstagramPost> posts);

    /// <summary>Translates a batch of Spanish prose into English, keyed by the entry's
    /// position in the list and then by property alias. Entries or fields the model left
    /// out stay untranslated, and the next pass asks for them again.</summary>
    Task<Dictionary<int, Dictionary<string, string>>> TranslateAsync(IReadOnlyList<TranslationRequest> entries);
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
            descriptionEn = new
            {
                type = "string",
                description = "La misma descripción en inglés de Estados Unidos. No es una traducción "
                    + "literal: que suene escrita en inglés, con los mismos datos y ninguno más. Los "
                    + "nombres propios (el lugar, la calle, el sector, la plaza) se quedan como están.",
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
            metaTitleEn = new
            {
                type = "string",
                description = $"El título para Google en inglés, máximo {MaxMetaTitle} caracteres, "
                    + "con las mismas reglas que el español.",
            },
            metaDescriptionEn = new
            {
                type = "string",
                description = $"La descripción para Google en inglés, entre 120 y {MaxMetaDescription} "
                    + "caracteres, con las mismas reglas que la española.",
            },
        },
        required = new[]
        {
            "description", "descriptionEn", "facilities",
            "metaTitle", "metaDescription", "metaTitleEn", "metaDescriptionEn",
        },
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
        Escribe la descripción en español y en inglés, selecciona las facilidades y
        redacta el título y la descripción para Google en los dos idiomas. El portal
        publica cada página en ambos, así que las dos versiones dicen lo mismo.
        """;

    /// <summary>Parses the tool-call arguments into an Enrichment.</summary>
    public static Enrichment Parse(JsonElement input)
    {
        string description = input.GetProperty("description").GetString() ?? "";
        string[] facilities = input.TryGetProperty("facilities", out JsonElement facilitiesElement)
            && facilitiesElement.ValueKind == JsonValueKind.Array
            ? [.. facilitiesElement.EnumerateArray().Select(f => f.GetString()!).Where(FacilityOptions.Contains)]
            : [];
        return new Enrichment(
            description,
            facilities,
            MetaTitle(input, "metaTitle"),
            Text(input, "metaDescription"),
            Text(input, "descriptionEn"),
            MetaTitle(input, "metaTitleEn"),
            Text(input, "metaDescriptionEn"));
    }

    /// <summary>The SEO title, or "" when the model went over budget: an over-long
    /// title is stored verbatim by the frontend, so it is better to leave the field
    /// empty and let the page derive its own.</summary>
    private static string MetaTitle(JsonElement input, string name) =>
        Text(input, name) is { Length: > 0 and <= MaxMetaTitle } title ? title : "";

    private static string Text(JsonElement input, string name) =>
        input.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? (value.GetString() ?? "").Trim()
            : "";
}
