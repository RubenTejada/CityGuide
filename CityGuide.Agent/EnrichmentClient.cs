using System.Text.Json;

namespace CityGuide.Agent;

public record Enrichment(string Description, string[] Facilities);

/// <summary>
/// LLM-backed enrichment: Spanish description + facility mapping for a newly
/// discovered place. Implemented by AzureOpenAiClient (production) and
/// ClaudeClient (fallback). This is the ONLY step of the agent that uses a
/// model — everything else (dedupe, rating refresh, cinema sync, trailers)
/// is plain code.
/// </summary>
public interface IEnrichmentClient
{
    Task<Enrichment> EnrichAsync(DiscoveredPlace place, string? categoryPrompt = null);
}

/// <summary>Prompt, schema and response parsing shared by both model providers.</summary>
public static class EnrichmentPrompt
{
    public static readonly string[] FacilityOptions =
    [
        "Romántico", "Aire Acondicionado", "Horario Extendido", "Restaurante en el Lugar",
        "Parqueo", "WiFi", "Delivery", "Terraza", "Música en Vivo", "Apto para Niños",
    ];

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
        },
        required = new[] { "description", "facilities" },
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
        Escribe la descripción y selecciona las facilidades.
        """;

    /// <summary>Parses the tool-call arguments ({description, facilities}) into an Enrichment.</summary>
    public static Enrichment Parse(JsonElement input)
    {
        string description = input.GetProperty("description").GetString() ?? "";
        string[] facilities = input.TryGetProperty("facilities", out JsonElement facilitiesElement)
            && facilitiesElement.ValueKind == JsonValueKind.Array
            ? [.. facilitiesElement.EnumerateArray().Select(f => f.GetString()!).Where(FacilityOptions.Contains)]
            : [];
        return new Enrichment(description, facilities);
    }
}
