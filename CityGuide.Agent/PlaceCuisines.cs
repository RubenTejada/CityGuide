using System.Text.Json;

namespace CityGuide.Agent;

/// <summary>What the model is asked about, in the one shape both callers have: the
/// discovery run knows the Google types and nothing the model wrote yet, the
/// maintenance pass knows the description an earlier enrichment paid for and no types
/// at all. Whichever is missing is simply left out of the line.</summary>
public record CuisineCandidate(
    string Name, string? Address, IReadOnlyList<string> Types, string? Description);

/// <summary>
/// The cuisine of a restaurant Google types as nothing more than "restaurant".
/// <see cref="CuisineMap"/> answers from the Google types when they say what kind of
/// food it is, which is free and authoritative; most of them do not, and that is what
/// filled "Otros" with more places than every cuisine put together. The name, the
/// address and the description the place already paid for say it plainly ("Capitán
/// Seafood", "La Cocina de Papá"), so this is a batched classification over text the
/// agent already has: no Google request, and a handful of tokens per place.
/// </summary>
public static class PlaceCuisines
{
    public const string ToolName = "save_place_cuisines";
    public const string ToolDescription =
        "Save the cuisine subcategory of each listed restaurant for the city guide portal.";

    /// <summary>Places sent per model call. A discovery run answers with at most 60
    /// places and the maintenance pass reads hundreds, so the batch is what keeps the
    /// answer inside the token budget of one call.</summary>
    public const int BatchSize = 40;

    /// <summary>JSON schema of the forced tool call (same shape for Anthropic
    /// input_schema and OpenAI parameters).</summary>
    public static object Schema => new
    {
        type = "object",
        properties = new
        {
            places = new
            {
                type = "array",
                description = "Una entrada por restaurante de la lista, con su número.",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        index = new { type = "integer", description = "Número del restaurante en la lista." },
                        cuisine = new { type = "string", @enum = CuisineMap.Options },
                    },
                    required = new[] { "index", "cuisine" },
                },
            },
        },
        required = new[] { "places" },
    };

    /// <summary>One line per place: its name, where it is, what Google calls it and
    /// what the portal already says about it — which between them name the cuisine
    /// far more often than the Google types alone do.</summary>
    public static string UserMessage(IReadOnlyList<CuisineCandidate> places) =>
        $"""
        Clasifica cada restaurante dominicano de esta lista en una de estas cocinas,
        que son las subcategorías del portal:
        {string.Join("\n", CuisineMap.Options.Select(o => $"- {o}"))}

        Reglas:
        - "Criolla" es la cocina dominicana de toda la vida: mofongo, sancocho, la
          bandera, comedores, cafeterías y pica pollos de barrio.
        - "Comida Rápida" es hamburguesas, sándwiches, pollo frito, fritura al paso y
          las cadenas de comida rápida.
        - "Mariscos" es el lugar cuyo centro es el pescado y el marisco.
        - "Desayunos y Brunch" es la cafetería, la panadería y el brunch, cuando el
          desayuno o el café es lo que se va a buscar.
        - "Otros" solo cuando de verdad no se puede saber qué se come: no adivines
          una cocina que nada en la información sugiere.
        La lista tiene {places.Count} restaurantes: devuelve exactamente {places.Count}
        entradas, una por cada número del 1 al {places.Count}.

        {string.Join("\n", places.Select((p, i) =>
            $"{i + 1}. {p.Name}"
            + (string.IsNullOrWhiteSpace(p.Address) ? "" : $" | {p.Address}")
            + (p.Types.Count == 0 ? "" : $" | Google: {string.Join(", ", p.Types)}")
            + (string.IsNullOrWhiteSpace(p.Description) ? "" : $" | {Trim(p.Description)}")))}
        """;

    private static string Trim(string description) =>
        description.Length <= 300 ? description : description[..300];

    /// <summary>Parses the tool-call arguments into "list position → cuisine". Entries
    /// the model skipped, numbered out of range or answered with a value outside the
    /// vocabulary are dropped: those places stay where they are.</summary>
    public static Dictionary<int, string> Parse(JsonElement input, int count)
    {
        var byIndex = new Dictionary<int, string>();
        if (!input.TryGetProperty("places", out JsonElement places)
            || places.ValueKind != JsonValueKind.Array)
        {
            return byIndex;
        }

        foreach (JsonElement entry in places.EnumerateArray())
        {
            if (!entry.TryGetProperty("index", out JsonElement index)
                || !index.TryGetInt32(out int position)
                || position < 1 || position > count)
            {
                continue;
            }

            string? cuisine = entry.TryGetProperty("cuisine", out JsonElement value)
                ? value.GetString()
                : null;
            if (cuisine is not null && CuisineMap.Options.Contains(cuisine))
            {
                byIndex[position - 1] = cuisine;
            }
        }

        return byIndex;
    }

    /// <summary>
    /// Classifies a whole list in batches, keyed by each place's position in it. A
    /// batch the model failed to answer is reported and skipped rather than stopping
    /// the pass: the places in it keep the subcategory they have, and the next pass
    /// asks about them again.
    /// </summary>
    public static async Task<Dictionary<int, string>> ClassifyAsync(
        IEnrichmentClient enricher, IReadOnlyList<CuisineCandidate> places)
    {
        var cuisines = new Dictionary<int, string>();
        for (int offset = 0; offset < places.Count; offset += BatchSize)
        {
            List<CuisineCandidate> batch = [.. places.Skip(offset).Take(BatchSize)];
            try
            {
                foreach ((int position, string cuisine) in await enricher.ClassifyCuisinesAsync(batch))
                {
                    cuisines[offset + position] = cuisine;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! clasificación de cocinas: {ex.Message}");
            }
        }

        return cuisines;
    }
}
