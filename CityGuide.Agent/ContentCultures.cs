namespace CityGuide.Agent;

/// <summary>
/// The portal's two cultures, and which property aliases differ between them. The
/// variance itself is declared in the CMS (TranslatedDocumentTypes in CityGuideSeeder);
/// the agent only needs to know which values carry a culture on the Management API wire
/// and which are shared — coordinates, phone, website, photos, Google ids and ratings
/// say the same thing in either language. Every document type the agent writes varies
/// by culture, so one set covers all of them.
/// </summary>
public static class ContentCultures
{
    /// <summary>The culture the portal's existing pages are written in.</summary>
    public const string Spanish = "es-DO";

    /// <summary>The culture the portal is being translated into.</summary>
    public const string English = "en-US";

    private static readonly HashSet<string> Translated = new(StringComparer.OrdinalIgnoreCase)
    {
        "description", "intro", "country", "hours", "summary", "body",
        "synopsis", "genre", "category", "metaTitle", "metaDescription",
    };

    /// <summary>Whether a property's value belongs to one culture rather than to both.</summary>
    public static bool VariesByCulture(string alias) => Translated.Contains(alias);

    /// <summary>
    /// The culture to stamp on a value of this property when writing it, or null when
    /// the property is shared. The Management API rejects a culture on a shared property
    /// and a shared value on a varying one.
    /// </summary>
    public static string? CultureOf(string alias, string culture) =>
        Translated.Contains(alias) ? culture : null;

    /// <summary>Whether a value read back belongs to the culture being worked on: its
    /// own culture, or none at all because the property is shared.</summary>
    public static bool Belongs(string? valueCulture, string culture) =>
        valueCulture is null || string.Equals(valueCulture, culture, StringComparison.OrdinalIgnoreCase);
}
