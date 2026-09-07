using System.Text.Json;
using System.Text.Json.Serialization;

namespace CityGuide.Agent;

/// <summary>One dish. The price is kept as the carta writes it ("RD$450", "Desde
/// RD$284"), because a menu says more than a number: a range, a "desde", a portion.</summary>
public record MenuDish(
    string Name,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Price,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Description,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? DescriptionEn);

/// <summary>A part of the carta: "Entrantes", "Postres".</summary>
public record MenuGroup(
    string Name,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? NameEn,
    IReadOnlyList<MenuDish> Items);

/// <summary>The carta as the portal stores it: one document holding both languages.</summary>
public record StructuredMenu(IReadOnlyList<MenuGroup> Sections);

/// <summary>
/// Turning the text of a restaurant's menu page into the carta the portal renders.
/// It is the answer to what the image pass cannot reach: half the sites publish their
/// menu as HTML text with prices, and a picture is not what that is.
///
/// Both languages come back in one call, inline in the same structure — the section
/// names and the dish descriptions, never the dish names, which are what a dish is
/// called. That keeps the two sides of the portal in step without a second call and
/// without the alignment risk of two parallel lists.
/// </summary>
public static class MenuPrompt
{
    public const string ToolName = "save_menu";
    public const string ToolDescription = "Save the restaurant's menu, structured, for the city guide portal.";

    /// <summary>Room for a long carta in both languages. A menu of sixty dishes with
    /// descriptions is several thousand tokens, and an answer cut in half is a menu
    /// that ends mid-course.</summary>
    public const int MaxAnswerTokens = 8192;

    /// <summary>What a menu may hold before the rest is somebody's catering brochure.
    /// A carta that overruns these is cut rather than dropped: what fits is a menu.</summary>
    private const int MaxSections = 24;
    private const int MaxItemsPerSection = 60;
    private const int MaxItems = 200;

    /// <summary>Under this many dishes it is not a carta — it is the three specials on
    /// the home page, or the model reading a menu into an "about us" page.</summary>
    private const int MinItems = 4;

    private const int MaxPriceLength = 40;
    private const int MaxDescriptionLength = 300;

    /// <summary>JSON schema of the forced tool call (same shape for Anthropic
    /// input_schema and OpenAI parameters).</summary>
    public static object Schema => new
    {
        type = "object",
        properties = new
        {
            sections = new
            {
                type = "array",
                description = "Las secciones de la carta, en el orden en que aparecen. "
                    + "Vacío si el texto no es una carta.",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        name = new
                        {
                            type = "string",
                            description = "El nombre de la sección tal como lo escribe la carta "
                                + "(\"Entrantes\", \"Tropijugos\", \"Postres\").",
                        },
                        nameEn = new
                        {
                            type = "string",
                            description = "El nombre de la sección en inglés de Estados Unidos "
                                + "(\"Starters\", \"Desserts\").",
                        },
                        items = new
                        {
                            type = "array",
                            description = "Los platos de esta sección.",
                            items = new
                            {
                                type = "object",
                                properties = new
                                {
                                    name = new
                                    {
                                        type = "string",
                                        description = "El nombre del plato, tal cual, sin traducir.",
                                    },
                                    price = new
                                    {
                                        type = "string",
                                        description = "El precio como lo escribe la carta "
                                            + "(\"RD$450\", \"Desde RD$284\"). Vacío si no lo dice.",
                                    },
                                    description = new
                                    {
                                        type = "string",
                                        description = "Lo que la carta dice del plato, en español. "
                                            + "Vacío si no dice nada.",
                                    },
                                    descriptionEn = new
                                    {
                                        type = "string",
                                        description = "Esa misma descripción en inglés. "
                                            + "Vacío si no hay descripción.",
                                    },
                                },
                                required = new[] { "name" },
                            },
                        },
                    },
                    required = new[] { "name", "items" },
                },
            },
        },
        required = new[] { "sections" },
    };

    public static string UserMessage(string placeName, string cityName, string menuText) =>
        $"""
        Este es el texto de la página del menú de {placeName}, un restaurante de
        {cityName}. Ordénalo como carta para una guía de la ciudad.

        Reglas:
        - Copia, no escribas: los platos y los precios son los que están en el texto.
          No inventes ninguno, no completes los que falten y no cambies un precio.
        - El precio va tal como lo escribe la carta ("RD$450", "Desde RD$284"). Si un
          plato no lo dice, déjalo vacío.
        - El nombre del plato se queda como está, sin traducir: un plato se llama como
          se llama ("Mangú", "Pica Pollo", "Tiramisú").
        - Lo que sí va en los dos idiomas es el nombre de la sección ("nameEn") y la
          descripción del plato ("descriptionEn").
        - Descarta lo que no es la carta: el menú de navegación del sitio, el horario,
          la dirección, los teléfonos, las promociones y el pie de página.
        - Si el texto no es una carta de restaurante, devuelve la lista vacía. Es una
          respuesta correcta y es mejor que inventarse un menú.

        Texto de la página:
        {menuText}
        """;

    /// <summary>
    /// Parses the tool call into the carta the portal stores, or null when the answer
    /// is not one: no sections, or too few dishes to be a menu. A section without a
    /// name or without dishes is dropped, a dish without a name is dropped, and what
    /// overruns the caps is cut — a menu that arrives half-formed is still a menu, but
    /// one that arrives empty is the model agreeing the page was not a carta.
    /// </summary>
    public static StructuredMenu? Parse(JsonElement input)
    {
        if (!input.TryGetProperty("sections", out JsonElement sections)
            || sections.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var groups = new List<MenuGroup>();
        var dishes = 0;
        foreach (JsonElement section in sections.EnumerateArray())
        {
            if (groups.Count >= MaxSections || dishes >= MaxItems)
            {
                break;
            }

            if (Text(section, "name", 120) is not string name
                || !section.TryGetProperty("items", out JsonElement items)
                || items.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            var parsed = new List<MenuDish>();
            foreach (JsonElement item in items.EnumerateArray())
            {
                if (parsed.Count >= MaxItemsPerSection || dishes >= MaxItems)
                {
                    break;
                }

                if (Text(item, "name", 200) is not string dish)
                {
                    continue;
                }

                parsed.Add(new MenuDish(
                    dish,
                    Text(item, "price", MaxPriceLength),
                    Text(item, "description", MaxDescriptionLength),
                    Text(item, "descriptionEn", MaxDescriptionLength)));
                dishes++;
            }

            if (parsed.Count > 0)
            {
                groups.Add(new MenuGroup(name, Text(section, "nameEn", 120), parsed));
            }
        }

        return dishes >= MinItems ? new StructuredMenu(groups) : null;
    }

    /// <summary>The carta as it is stored: one JSON document the frontend reads,
    /// carrying both languages. Written from the parsed records and never from the
    /// model's answer, so nothing reaches the CMS that this side has not checked.</summary>
    public static string ToJson(StructuredMenu menu) => JsonSerializer.Serialize(menu, JsonOptions);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    /// <summary>A trimmed string property, or null when it is missing, empty or so long
    /// that it is prose the model wrote rather than the line the carta holds.</summary>
    private static string? Text(JsonElement element, string property, int maxLength) =>
        element.TryGetProperty(property, out JsonElement value)
        && value.ValueKind == JsonValueKind.String
        && value.GetString()?.Trim() is { Length: > 0 } text
            ? text.Length > maxLength ? text[..maxLength].TrimEnd() : text
            : null;
}
