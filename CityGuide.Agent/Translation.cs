using System.Text.Json;

namespace CityGuide.Agent;

/// <summary>One node's Spanish text, as it is put to the model.</summary>
/// <param name="Name">The node's Spanish name, for context — a description reads
/// differently once you know it is about a plaza and not a restaurant.</param>
/// <param name="Kind">What the node is ("restaurante", "plaza comercial", "película"),
/// again only as context.</param>
/// <param name="Fields">Property alias to the Spanish text to translate.</param>
public record TranslationRequest(string Name, string Kind, IReadOnlyDictionary<string, string> Fields);

/// <summary>
/// Translating the prose the portal already holds. Only prose reaches here: opening
/// hours, section names, categories and genres are closed vocabularies that
/// <see cref="TranslatedVocabulary"/> answers for free, which is most of the Spanish
/// text in the CMS by volume. What is left is descriptions, intros, article bodies and
/// the SEO pair — the fields where a person would notice a machine had been at work.
/// </summary>
public static class Translation
{
    public const string ToolName = "save_translations";
    public const string ToolDescription = "Save the English translation of each listed entry for the city guide portal.";

    /// <summary>Spanish characters put in one call. A batch is cheaper per node (the
    /// instructions are paid once) but a batch big enough to run into the answer limit
    /// loses whole nodes, and one article body alone is several thousand characters.</summary>
    public const int MaxBatchCharacters = 6000;

    /// <summary>Entries per call, whatever their size.</summary>
    public const int MaxBatchEntries = 12;

    /// <summary>Room for a full batch coming back; English runs a little shorter than
    /// Spanish, but not enough to bet the batch on.</summary>
    public const int MaxAnswerTokens = 8192;

    /// <summary>JSON schema of the forced tool call (same shape for Anthropic
    /// input_schema and OpenAI parameters).</summary>
    public static object Schema => new
    {
        type = "object",
        properties = new
        {
            translations = new
            {
                type = "array",
                description = "Una entrada por cada elemento de la lista, con su número.",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        index = new { type = "integer", description = "Número del elemento en la lista." },
                        fields = new
                        {
                            type = "array",
                            description = "Los mismos campos que recibió el elemento, traducidos.",
                            items = new
                            {
                                type = "object",
                                properties = new
                                {
                                    alias = new { type = "string", description = "El nombre del campo, tal cual." },
                                    text = new { type = "string", description = "El texto en inglés." },
                                },
                                required = new[] { "alias", "text" },
                            },
                        },
                    },
                    required = new[] { "index", "fields" },
                },
            },
        },
        required = new[] { "translations" },
    };

    public static string UserMessage(IReadOnlyList<TranslationRequest> entries) =>
        $"""
        Traduce al inglés de Estados Unidos el contenido de una guía de ciudad de la
        República Dominicana. Es texto que van a leer visitantes, no una traducción literal:
        que suene escrito en inglés.

        Reglas:
        - Los nombres propios se quedan como están: lugares, marcas, calles, sectores y
          plazas ("Zona Colonial", "Av. Winston Churchill", "Ágora Mall", "Piantini").
        - Traduce lo que sí es descripción: tipos de comida, de local y de ambiente
          ("comida criolla" es "Dominican food", "malecón" es "the seafront").
        - No añadas ningún dato que no esté en el texto español, y no quites ninguno.
        - Mantén el tono: es una guía, no un folleto publicitario.
        - "metaTitle": máximo {EnrichmentPrompt.MaxMetaTitle} caracteres, empieza por el
          nombre del lugar. Si no cabe, escribe uno más corto en vez de cortarlo.
        - "metaDescription": una sola frase de entre 120 y {EnrichmentPrompt.MaxMetaDescription}
          caracteres, sin comillas ni emoji.
        - "body" viene con su formato (párrafos, listas): devuélvelo con el mismo formato.

        Devuelve exactamente los mismos campos que recibe cada elemento, con el mismo
        nombre de campo. La lista tiene {entries.Count} elementos: devuelve {entries.Count}
        entradas, una por cada número del 1 al {entries.Count}.

        {string.Join("\n\n", entries.Select((e, i) =>
            $"{i + 1}. {e.Name} ({e.Kind})\n"
            + string.Join("\n", e.Fields.Select(f => $"   {f.Key}: {f.Value}"))))}
        """;

    /// <summary>
    /// Parses the tool call into "list position → alias → English text". An entry the
    /// model skipped, numbered out of range or answered with a field nobody asked for is
    /// dropped, and so is a "metaTitle" over budget: the node keeps that field untranslated
    /// and the next pass asks for it again, which is better than storing a title the
    /// frontend would print past the end of a Google result.
    /// </summary>
    public static Dictionary<int, Dictionary<string, string>> Parse(
        JsonElement input, IReadOnlyList<TranslationRequest> entries)
    {
        var byIndex = new Dictionary<int, Dictionary<string, string>>();
        if (!input.TryGetProperty("translations", out JsonElement translations)
            || translations.ValueKind != JsonValueKind.Array)
        {
            return byIndex;
        }

        foreach (JsonElement entry in translations.EnumerateArray())
        {
            if (!entry.TryGetProperty("index", out JsonElement index)
                || !index.TryGetInt32(out int position)
                || position < 1 || position > entries.Count
                || !entry.TryGetProperty("fields", out JsonElement fields)
                || fields.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            IReadOnlyDictionary<string, string> asked = entries[position - 1].Fields;
            var translated = new Dictionary<string, string>();
            foreach (JsonElement field in fields.EnumerateArray())
            {
                string? alias = field.TryGetProperty("alias", out JsonElement a) ? a.GetString() : null;
                string text = (field.TryGetProperty("text", out JsonElement t) ? t.GetString() : null)?.Trim() ?? "";
                if (alias is null || text.Length == 0 || !asked.ContainsKey(alias))
                {
                    continue;
                }

                if (alias == "metaTitle" && text.Length > EnrichmentPrompt.MaxMetaTitle)
                {
                    continue;
                }

                translated[alias] = text;
            }

            if (translated.Count > 0)
            {
                byIndex[position - 1] = translated;
            }
        }

        return byIndex;
    }
}
