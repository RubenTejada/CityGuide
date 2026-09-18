namespace CityGuide.Agent;

/// <summary>
/// An article as a person writes it: a Markdown file whose first lines, between two
/// "---", state what the CMS stores apart from the body.
///
/// <code>
/// ---
/// title: Los restaurantes con las mejores vistas de Santiago
/// summary: Cinco mesas desde las que se ve la ciudad entera.
/// category: Gastronomía
/// heroImage: /media/abc123/camp-david.jpg
/// metaTitle: Restaurantes con vista en Santiago
/// metaDescription: ...
/// ---
/// El cuerpo, en el Markdown que pinta ArticleBody: párrafos, "## ", listas con "- ",
/// **negrita**, [enlaces](/santiago/restaurantes/...) e ![imágenes](/media/...).
/// </code>
///
/// The title, the summary and a body are what an article cannot go out without; the
/// rest is optional and an English file only needs the three that read differently in
/// English (title, summary, body) plus its own meta pair.
/// </summary>
public record ArticleFile(
    string Title, string Summary, string Body, string? Category, string? HeroImage,
    string? Author, string? MetaTitle, string? MetaDescription)
{
    public static ArticleFile Parse(string text)
    {
        string[] lines = text.ReplaceLineEndings("\n").Split('\n');
        int open = Array.FindIndex(lines, l => l.Trim().Length > 0);
        int close = open < 0 ? -1 : Array.FindIndex(lines, open + 1, l => l.Trim() == "---");
        if (open < 0 || lines[open].Trim() != "---" || close < 0)
        {
            throw new FormatException(
                "El archivo tiene que empezar con un encabezado entre dos líneas \"---\" "
                + "(title, summary, category, heroImage…).");
        }

        var header = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string line in lines[(open + 1)..close].Where(l => l.Trim().Length > 0))
        {
            int colon = line.IndexOf(':');
            if (colon <= 0)
            {
                throw new FormatException($"Línea del encabezado sin \"clave: valor\": {line}");
            }

            header[line[..colon].Trim()] = line[(colon + 1)..].Trim();
        }

        string? Optional(string key) =>
            header.TryGetValue(key, out string? value) && value.Length > 0 ? value : null;
        string Required(string key) => Optional(key)
            ?? throw new FormatException($"Al encabezado le falta \"{key}\".");

        string body = string.Join('\n', lines[(close + 1)..]).Trim();
        if (body.Length == 0)
        {
            throw new FormatException("El artículo no tiene cuerpo debajo del encabezado.");
        }

        return new ArticleFile(
            Required("title"), Required("summary"), body, Optional("category"),
            Optional("heroImage"), Optional("author"), Optional("metaTitle"),
            Optional("metaDescription"));
    }

    /// <summary>The values of one language of the article, as the CMS takes them. The
    /// shared ones (cover, author, date) are only stated by the Spanish file.</summary>
    public IEnumerable<object> Values(bool shared)
    {
        yield return new { alias = "summary", value = (object?)Summary };
        yield return new { alias = "body", value = (object?)Body };
        if (Category is not null)
        {
            yield return new { alias = "category", value = (object?)Category };
        }

        if (MetaTitle is not null)
        {
            yield return new { alias = "metaTitle", value = (object?)MetaTitle };
        }

        if (MetaDescription is not null)
        {
            yield return new { alias = "metaDescription", value = (object?)MetaDescription };
        }

        if (!shared)
        {
            yield break;
        }

        if (HeroImage is not null)
        {
            yield return new { alias = "heroImageUrl", value = (object?)HeroImage };
        }

        if (Author is not null)
        {
            yield return new { alias = "author", value = (object?)Author };
        }
    }
}
