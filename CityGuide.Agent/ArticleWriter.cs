namespace CityGuide.Agent;

/// <summary>
/// Writes an article under a city's "Artículos", both languages, by the one path every
/// article takes — the one written by a person ("--add-article") and the one the agent
/// writes every day. An article with the same title as one already there is updated
/// instead of duplicated, and its publish date stays the one of its first day: it is
/// what orders the section and what the article declares to search engines.
/// </summary>
public class ArticleWriter(UmbracoClient umbraco)
{
    /// <summary>
    /// Prints what would be written and, with <paramref name="apply"/>, writes and
    /// publishes it. Throws <see cref="ArgumentException"/> for what the caller has to
    /// fix: a category the English side cannot name, or a city that does not exist.
    /// </summary>
    public async Task WriteAsync(string cityPath, ArticleFile spanish, ArticleFile? english, bool apply)
    {
        // La categoría es vocabulario y no texto libre: la página inglesa la traduce por
        // tabla, y una que la tabla no conoce saldría en español.
        if (spanish.Category is not null)
        {
            if (TranslatedVocabulary.Category(spanish.Category) is not { } englishCategory)
            {
                throw new ArgumentException($"Categoría desconocida: {spanish.Category}.");
            }

            english = english is null ? null : english with { Category = englishCategory };
        }

        // La sección solo existe en las ciudades que el CMS sembró con artículos de muestra;
        // en las demás la crea el primer artículo, con su nombre en los dos idiomas, porque
        // una cultura solo enruta cuando todos sus ancestros están publicados en ella.
        cityPath = $"/{cityPath.Trim('/')}";
        string articlesPath = $"{cityPath}/articulos";
        (Guid Id, string Name)? articlesPage = await umbraco.GetContentByPathAsync(articlesPath);
        if (articlesPage is null && await umbraco.GetContentByPathAsync(cityPath) is null)
        {
            throw new ArgumentException($"No hay ninguna ciudad publicada en {cityPath}.");
        }

        UmbracoClient.ChildDocument? existingArticle = articlesPage is null
            ? null
            : (await umbraco.GetChildrenAsync(articlesPage.Value.Id))
                .FirstOrDefault(c => c.Name.Equals(spanish.Title, StringComparison.OrdinalIgnoreCase));
        Console.WriteLine(apply
            ? $"\n== Artículo en {articlesPath}"
            : $"\n== Artículo en {articlesPath} (simulación; agrega --apply para aplicarla)");
        if (articlesPage is null)
        {
            Console.WriteLine($"  la sección {articlesPath} no existe: se crea");
        }

        Console.WriteLine($"  {(existingArticle is null ? "nuevo" : "se actualiza")}: {spanish.Title}");
        Console.WriteLine($"  {spanish.Summary}");
        Console.WriteLine($"  {spanish.Body.Length} caracteres, categoría {spanish.Category ?? "ninguna"}, "
            + $"portada {spanish.HeroImage ?? "ninguna"}");
        Console.WriteLine(english is null
            ? "  sin versión en inglés: queda para --translate"
            : $"  en inglés: {english.Title} ({english.Body.Length} caracteres)");
        if (!apply)
        {
            return;
        }

        if (articlesPage is null)
        {
            (Guid cityId, _) = (await umbraco.GetContentByPathAsync(cityPath))!.Value;
            articlesPage = (await umbraco.CreateDocumentAsync(
                cityId, await umbraco.GetDocumentTypeIdAsync("Articles Page"), "Artículos",
                [new
                {
                    alias = "intro",
                    value = (object?)"Guías, rutas e ideas escritas para disfrutar la ciudad: "
                        + "planes por barrio, por presupuesto y para cada tipo de plan.",
                }],
                englishValues: [new
                {
                    alias = "intro",
                    value = (object?)"Guides, routes and ideas for enjoying the city: plans by "
                        + "neighborhood, by budget and for every kind of outing.",
                }]), "Artículos");
        }

        Guid articleId;
        if (existingArticle is null)
        {
            articleId = await umbraco.CreateDocumentAsync(
                articlesPage.Value.Id, await umbraco.GetDocumentTypeIdAsync("Article"), spanish.Title,
                spanish.Values(shared: true).Append(new
                {
                    alias = "publishDate",
                    value = (object?)DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                }));
        }
        else
        {
            articleId = existingArticle.Id;
            await umbraco.WriteCultureAsync(
                articleId, spanish.Title, spanish.Values(shared: true), ContentCultures.Spanish);
        }

        if (english is not null)
        {
            await umbraco.WriteCultureAsync(
                articleId, english.Title, english.Values(shared: false), ContentCultures.English);
        }

        Console.WriteLine("  publicado");
    }
}
