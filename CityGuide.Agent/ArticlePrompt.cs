using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>
/// What the planning call is told about a city on a given day: the news, the portal's
/// own sections and calendar, and the topics it may not repeat — the city's recent
/// articles and what the other cities were given today.
/// </summary>
public record ArticleBrief(
    string CityName,
    DateOnly Today,
    IReadOnlyList<Headline> Headlines,
    IReadOnlyList<(string Slug, string Name, int Count)> Sections,
    IReadOnlyList<string> Events,
    IReadOnlyList<string> Movies,
    IReadOnlyList<string> RecentTitles,
    IReadOnlyList<string> TopicsToday);

/// <summary>An establishment a headline names that the portal does not hold yet, and
/// the section it would be filed in.</summary>
public record NewPlaceRequest(string Name, string Section);

/// <summary>The topic chosen for the day and what the code should look for in the
/// portal to write it: positions are 0-based into the brief's lists.</summary>
public record ArticlePlan(
    string Topic,
    string Angle,
    int[] Headlines,
    string[] Sections,
    string[] Facilities,
    string[] Keywords,
    int[] Events,
    NewPlaceRequest[] NewPlaces,
    string Category);

/// <summary>Something of the portal an article may recommend, with what the model is
/// told about it. Only these can be linked, and the link is written by the code.
/// <paramref name="Lead"/> marks what the topic is about — the event the plan chose, the
/// establishment a headline named — which the article has to include.
/// <paramref name="PhotoCredit"/> is the credit the picture is stored with, which its
/// crop carries on.</summary>
public record ArticleCandidate(
    Guid Id, string Kind, string Name, string Path, string Detail, string? PhotoUrl, bool Lead = false,
    PhotoCredit? PhotoCredit = null);

/// <summary>One recommendation of the article: which candidate, and what is said about
/// it in each language.</summary>
public record ArticleItem(int Candidate, string Text, string TextEn);

/// <summary>The article as the model wrote it, both languages at once, before the
/// code puts the headings, the photos and the links around it.</summary>
public record ArticleDraft(
    string Title, string TitleEn,
    string Summary, string SummaryEn,
    string? MetaTitle, string? MetaTitleEn,
    string? MetaDescription, string? MetaDescriptionEn,
    string Intro, string IntroEn,
    IReadOnlyList<ArticleItem> Items,
    IReadOnlyList<string> Tips, IReadOnlyList<string> TipsEn,
    string Closing, string ClosingEn);

/// <summary>
/// The first of the two calls behind the daily article: from the day's headlines and
/// what the portal holds, one topic that connects the two. The model only chooses —
/// sections, facilities and categories from closed lists, headlines and events by
/// their number — and the code is what then looks the places up.
/// </summary>
public static class ArticlePlanPrompt
{
    public const string ToolName = "plan_article";
    public const string ToolDescription = "Choose today's article topic for one city of the guide portal.";

    /// <summary>How many establishments one article may ask to be added to the portal.
    /// Each is a Google search and a description, both billed.</summary>
    public const int MaxNewPlaces = 2;

    public static object Schema(ArticleBrief brief) => new
    {
        type = "object",
        properties = new
        {
            topic = new { type = "string", description = "El tema del artículo en una frase corta, en español." },
            angle = new
            {
                type = "string",
                description = "Qué recomienda el artículo y por qué hoy: el enfoque práctico para el lector, en 1-2 frases.",
            },
            headlines = new
            {
                type = "array",
                items = new { type = "integer" },
                description = "Números de los titulares en los que se apoya el tema. Vacío si el tema sale del calendario del portal.",
            },
            sections = new
            {
                type = "array",
                items = new { type = "string", @enum = brief.Sections.Select(s => s.Slug).ToArray() },
                description = "Secciones del portal donde están los lugares que el artículo va a recomendar.",
            },
            facilities = new
            {
                type = "array",
                items = new { type = "string", @enum = CityGuide.Agent.Facilities.All },
                description = "Facilidades que deben tener los lugares recomendados, si el tema pide alguna. Normalmente 0-2.",
            },
            keywords = new
            {
                type = "array",
                items = new { type = "string" },
                description = "3-8 palabras sueltas que aparecerían en el nombre o la descripción de los lugares adecuados (\"mariscos\", \"terraza\", \"café\").",
            },
            events = new
            {
                type = "array",
                items = new { type = "integer" },
                description = "Números de los eventos de la agenda del portal que encajan con el tema.",
            },
            newPlaces = new
            {
                type = "array",
                maxItems = MaxNewPlaces,
                description = "Establecimientos concretos de esta ciudad que un titular nombra y que el artículo "
                    + "debería recomendar (un restaurante que abrió, la sede de un festival). Casi siempre vacío.",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        name = new { type = "string", description = "El nombre exacto como aparece en el titular." },
                        section = new { type = "string", @enum = brief.Sections.Select(s => s.Slug).ToArray() },
                    },
                    required = new[] { "name", "section" },
                },
            },
            category = new { type = "string", @enum = TranslatedVocabulary.CategoryNames.ToArray() },
        },
        required = new[] { "topic", "angle", "headlines", "sections", "facilities", "keywords", "events", "newPlaces", "category" },
    };

    public static string UserMessage(ArticleBrief brief)
    {
        CultureInfo spanish = CultureInfo.GetCultureInfo("es-DO");
        string day = brief.Today.ToDateTime(TimeOnly.MinValue).ToString("dddd d 'de' MMMM 'de' yyyy", spanish);
        return $"""
            Eres el editor de QueHacerRD, la guía de ocio de {brief.CityName} (República
            Dominicana): restaurantes, bares, tiendas, atracciones, eventos, cines. Hoy es
            {day}. Elige el tema del artículo que el portal publica hoy en {brief.CityName}.

            El tema tiene que unir algo de lo que se habla hoy con lo que el portal ofrece,
            y servirle a alguien para decidir qué hacer: dónde comer, salir, ir con niños,
            qué ver, a qué evento ir. Ejemplos del tipo de puente que buscamos: llega una
            vaguada → planes bajo techo; juega el equipo de la ciudad → bares para ver el
            juego; se anuncia un festival → dónde comer cerca y qué más hacer ese fin de
            semana; empieza la temporada de ballenas → excursiones.

            Reglas:
            - Nunca un tema de crimen, accidentes, muertes, política, tragedias, protestas
              o alarmas de salud: no se recomienda un plan a partir de eso.
            - Un titular sirve solo si es de esta ciudad (cuidado: hay un Santiago de los
              Caballeros en México) o del país entero y conecta con la ciudad.
            - Si ningún titular sirve, elige un tema oportuno por la fecha (el fin de
              semana, la temporada, un feriado cercano, un evento de la agenda) y deja
              "headlines" vacío.
            - El enfoque no supone nada que el titular no diga: si la noticia es que un
              equipo entrena en la ciudad, no hay "partido para ver en un bar".
            - Tampoco supone lo que ofrecen los lugares: un Oktoberfest pide bares de
              cerveza, no "comida alemana", que ningún dato del portal promete.
            - No repitas un tema ya publicado en la ciudad ni uno de los elegidos hoy para
              otras ciudades (listas abajo): ni el mismo asunto ni el mismo ángulo.
            - Las secciones son las que el portal tiene en esta ciudad; elige aquellas
              donde están los lugares a recomendar.
            - "newPlaces" solo para un establecimiento concreto que un titular nombra y que
              el artículo necesita; el código lo busca y lo añade si no está.

            Titulares de hoy:
            {Numbered(brief.Headlines.Select(h => $"{h.Title} ({h.Source}, {h.Published:yyyy-MM-dd})"))}

            Secciones del portal en {brief.CityName} (slug: nombre, lugares):
            {string.Join("\n", brief.Sections.Select(s => $"- {s.Slug}: {s.Name}, {s.Count}"))}

            Agenda del portal:
            {Numbered(brief.Events)}

            En cartelera:
            {(brief.Movies.Count == 0 ? "(nada)" : string.Join("; ", brief.Movies))}

            Artículos ya publicados en la ciudad:
            {(brief.RecentTitles.Count == 0 ? "(ninguno)" : string.Join("\n", brief.RecentTitles.Select(t => $"- {t}")))}

            Temas elegidos hoy para otras ciudades:
            {(brief.TopicsToday.Count == 0 ? "(ninguno)" : string.Join("\n", brief.TopicsToday.Select(t => $"- {t}")))}
            """;
    }

    private static string Numbered(IEnumerable<string> lines)
    {
        string text = string.Join("\n", lines.Select((line, i) => $"{i + 1}. {line}"));
        return text.Length == 0 ? "(nada)" : text;
    }

    /// <summary>The plan, or null when the answer has no topic. Numbers out of range
    /// and values outside the closed lists are dropped rather than trusted.</summary>
    public static ArticlePlan? Parse(JsonElement input, ArticleBrief brief)
    {
        string topic = Text(input, "topic");
        if (topic.Length == 0)
        {
            return null;
        }

        HashSet<string> sections = [.. brief.Sections.Select(s => s.Slug)];
        string category = Text(input, "category");
        return new ArticlePlan(
            topic,
            Text(input, "angle"),
            Positions(input, "headlines", brief.Headlines.Count),
            [.. Strings(input, "sections").Where(sections.Contains).Distinct()],
            [.. Strings(input, "facilities").Where(CityGuide.Agent.Facilities.All.Contains).Distinct()],
            [.. Strings(input, "keywords").Where(k => k.Length > 1).Distinct(StringComparer.OrdinalIgnoreCase).Take(8)],
            Positions(input, "events", brief.Events.Count),
            [
                .. (input.TryGetProperty("newPlaces", out JsonElement places) && places.ValueKind == JsonValueKind.Array
                    ? places.EnumerateArray()
                    : Enumerable.Empty<JsonElement>())
                    .Select(p => new NewPlaceRequest(Text(p, "name"), Text(p, "section")))
                    .Where(p => p.Name.Length > 2 && sections.Contains(p.Section))
                    .Take(MaxNewPlaces),
            ],
            TranslatedVocabulary.CategoryNames.Contains(category) ? category : "Cultura");
    }

    internal static string Text(JsonElement input, string name) =>
        input.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()!.Trim()
            : "";

    internal static IEnumerable<string> Strings(JsonElement input, string name) =>
        input.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray()
                .Where(v => v.ValueKind == JsonValueKind.String)
                .Select(v => v.GetString()!.Trim())
                .Where(v => v.Length > 0)
            : [];

    /// <summary>1-based numbers from the answer as 0-based positions inside the list.</summary>
    private static int[] Positions(JsonElement input, string name, int count) =>
        input.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Array
            ? [.. value.EnumerateArray()
                .Where(v => v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out _))
                .Select(v => v.GetInt32() - 1)
                .Where(i => i >= 0 && i < count)
                .Distinct()]
            : [];
}

/// <summary>
/// The second call: the article itself, in Spanish and English at once, recommending
/// only the candidates the code looked up. The model writes prose and nothing else —
/// the headings, the photos and every link are put around it by the code, from the
/// candidate the model named by its number, so an address in the portal is never
/// something a model typed.
/// </summary>
public static partial class ArticleWritePrompt
{
    public const string ToolName = "save_article";
    public const string ToolDescription = "Save the article written for the city guide portal, in Spanish and English.";

    /// <summary>A long article in two languages, with room to spare.</summary>
    public const int MaxAnswerTokens = 9000;

    public const int MinItems = 4;
    public const int MaxItems = 8;

    public static object Schema => new
    {
        type = "object",
        properties = new
        {
            title = new { type = "string", description = "Título en español, máximo 70 caracteres, concreto y con el nombre de la ciudad." },
            titleEn = new { type = "string", description = "El título en inglés de Estados Unidos." },
            summary = new { type = "string", description = "Entradilla en español, 1-2 frases, máximo 220 caracteres." },
            summaryEn = new { type = "string" },
            metaTitle = new { type = "string", description = $"Título SEO en español, máximo {EnrichmentPrompt.MaxMetaTitle} caracteres." },
            metaTitleEn = new { type = "string" },
            metaDescription = new { type = "string", description = $"Descripción SEO en español, máximo {EnrichmentPrompt.MaxMetaDescription} caracteres." },
            metaDescriptionEn = new { type = "string" },
            intro = new
            {
                type = "string",
                description = "1-2 párrafos en español separados por una línea en blanco: el contexto del día y qué propone el artículo.",
            },
            introEn = new { type = "string" },
            items = new
            {
                type = "array",
                minItems = MinItems,
                maxItems = MaxItems,
                description = "Las recomendaciones, en el orden en que se leen.",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        candidate = new { type = "integer", description = "Número del candidato que se recomienda." },
                        text = new { type = "string", description = "Un párrafo en español, 50-110 palabras." },
                        textEn = new { type = "string", description = "El mismo párrafo en inglés de Estados Unidos." },
                    },
                    required = new[] { "candidate", "text", "textEn" },
                },
            },
            tips = new
            {
                type = "array",
                items = new { type = "string" },
                maxItems = 4,
                description = "0-4 consejos prácticos cortos en español, sin datos inventados.",
            },
            tipsEn = new { type = "array", items = new { type = "string" }, maxItems = 4 },
            closing = new { type = "string", description = "Una frase final en español." },
            closingEn = new { type = "string" },
        },
        required = new[]
        {
            "title", "titleEn", "summary", "summaryEn", "metaTitle", "metaTitleEn", "metaDescription",
            "metaDescriptionEn", "intro", "introEn", "items", "tips", "tipsEn", "closing", "closingEn",
        },
    };

    public static string UserMessage(
        string cityName, ArticlePlan plan, IReadOnlyList<Headline> headlines,
        IReadOnlyList<ArticleCandidate> candidates) =>
        $"""
        Escribe el artículo de hoy de QueHacerRD en {cityName}, en español dominicano
        neutro y en inglés de Estados Unidos (que suene escrito en inglés, no traducido).

        Tema: {plan.Topic}
        Enfoque: {plan.Angle}

        {(headlines.Count == 0
            ? "No se apoya en noticias: el contexto es la fecha y la agenda."
            : "Noticias en las que se apoya (cítalas por el nombre del medio, \"según Diario Libre\"):\n"
                + string.Join("\n", headlines.Select(h => $"- {h.Title} ({h.Source})")))}

        Reglas:
        - Recomienda entre 5 y 7 candidatos de la lista (nunca menos de {MinItems}), cada uno
          una sola vez, los que mejor sirvan al tema. Solo esos: no menciones otros lugares
          del portal.
        - Los candidatos marcados con ★ son el centro del tema: van todos, y primero.
        - Usa solo los datos dados (nombre, sección, dirección, valoración, descripción,
          facilidades, fecha). No inventes precios, horarios, platos, premios ni fechas.
        - Encajar con el tema no le da a un lugar los rasgos del tema: un bar de tapas
          no sirve "comida alemana" porque el artículo hable del Oktoberfest. Lo que se
          dice de cada lugar sale de sus datos, también en la introducción, la entradilla
          y la descripción SEO.
        - Si una valoración aparece, puedes mencionarla ("4.7 en Google").
        - Sin enlaces, sin URLs, sin Markdown, sin títulos: solo texto. El código pone el
          encabezado, la foto y el enlace de cada recomendación.
        - La noticia o la fecha va en la introducción; cada recomendación habla de su lugar,
          de por qué encaja con el plan, sin repetir el motivo en cada párrafo.
        - Tono de guía de ciudad: cercano, útil, concreto. Nada de "sin duda", "joya
          escondida", "descubre" ni "este artículo".

        Candidatos:
        {string.Join("\n", candidates.Select((c, i) => $"{i + 1}. {(c.Lead ? "★ " : "")}[{c.Kind}] {c.Name} | {c.Detail}"))}
        """;

    /// <summary>
    /// The draft, or null when it cannot be published as it came: a recommendation must
    /// name a candidate that exists, once, and say something in both languages; fewer than
    /// <see cref="MinItems"/> of them is not an article. Prose is stripped of any Markdown
    /// the model wrote despite being told not to, so the only links in the page are the
    /// ones the code adds.
    /// </summary>
    public static ArticleDraft? Parse(JsonElement input, int candidateCount)
    {
        var seen = new HashSet<int>();
        var items = new List<ArticleItem>();
        if (input.TryGetProperty("items", out JsonElement list) && list.ValueKind == JsonValueKind.Array)
        {
            foreach (JsonElement entry in list.EnumerateArray())
            {
                if (!entry.TryGetProperty("candidate", out JsonElement number)
                    || !number.TryGetInt32(out int position)
                    || position < 1 || position > candidateCount
                    || !seen.Add(position))
                {
                    continue;
                }

                string text = Prose(ArticlePlanPrompt.Text(entry, "text"));
                string textEn = Prose(ArticlePlanPrompt.Text(entry, "textEn"));
                if (text.Length > 0 && textEn.Length > 0)
                {
                    items.Add(new ArticleItem(position - 1, text, textEn));
                }
            }
        }

        string title = Line(ArticlePlanPrompt.Text(input, "title"));
        string titleEn = Line(ArticlePlanPrompt.Text(input, "titleEn"));
        string summary = Line(ArticlePlanPrompt.Text(input, "summary"));
        string summaryEn = Line(ArticlePlanPrompt.Text(input, "summaryEn"));
        string intro = Prose(ArticlePlanPrompt.Text(input, "intro"));
        string introEn = Prose(ArticlePlanPrompt.Text(input, "introEn"));
        if (items.Count < MinItems || new[] { title, titleEn, summary, summaryEn, intro, introEn }.Any(v => v.Length == 0))
        {
            return null;
        }

        return new ArticleDraft(
            title, titleEn, summary, summaryEn,
            Meta(input, "metaTitle", EnrichmentPrompt.MaxMetaTitle),
            Meta(input, "metaTitleEn", EnrichmentPrompt.MaxMetaTitle),
            Meta(input, "metaDescription", int.MaxValue),
            Meta(input, "metaDescriptionEn", int.MaxValue),
            intro, introEn, items,
            [.. ArticlePlanPrompt.Strings(input, "tips").Select(Line).Where(t => t.Length > 0).Take(4)],
            [.. ArticlePlanPrompt.Strings(input, "tipsEn").Select(Line).Where(t => t.Length > 0).Take(4)],
            Prose(ArticlePlanPrompt.Text(input, "closing")),
            Prose(ArticlePlanPrompt.Text(input, "closingEn")));
    }

    /// <summary>A title over the template's budget is dropped rather than cut, exactly
    /// as for a place: the frontend then derives one from the article's own title.</summary>
    private static string? Meta(JsonElement input, string name, int max) =>
        Line(ArticlePlanPrompt.Text(input, name)) is { Length: > 0 } value && value.Length <= max ? value : null;

    [GeneratedRegex(@"!?\[([^\]]*)\]\([^)]*\)")]
    private static partial Regex MarkdownLink();

    [GeneratedRegex(@"https?://\S+")]
    private static partial Regex BareUrl();

    /// <summary>Paragraphs of plain text: links reduced to their words, bare addresses,
    /// heading marks and emphasis removed, blank lines kept as paragraph breaks.</summary>
    private static string Prose(string text)
    {
        string cleaned = BareUrl().Replace(MarkdownLink().Replace(text, "$1"), "").Replace("**", "").Replace("__", "");
        return string.Join("\n\n", cleaned
            .ReplaceLineEndings("\n")
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Select(paragraph => Line(paragraph.TrimStart('#', ' ', '-', '*')))
            .Where(paragraph => paragraph.Length > 0));
    }

    /// <summary>One line of plain text, its whitespace collapsed.</summary>
    private static string Line(string text) =>
        string.Join(' ', MarkdownLink().Replace(text, "$1").Replace("**", "")
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}
