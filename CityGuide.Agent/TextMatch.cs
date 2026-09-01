namespace CityGuide.Agent;

/// <summary>
/// Accent- and case-insensitive name comparison, shared by the Google rating
/// lookup and the company matcher. Both answer the same question: "is this the
/// same business as the one we already have?".
/// </summary>
public static class TextMatch
{
    private static readonly string[] StopWords =
        ["de", "del", "la", "el", "los", "las", "y", "en", "sucursal", "oficina", "principal"];

    /// <summary>Lowercase, accents stripped.</summary>
    public static string Normalize(string value) => string.Concat(
        value.Normalize(System.Text.NormalizationForm.FormD)
            .Where(c => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c)
                != System.Globalization.UnicodeCategory.NonSpacingMark))
        .ToLowerInvariant();

    /// <summary>Significant tokens of a name: normalized, longer than 2 chars, no stop words.</summary>
    public static string[] Tokens(string value) => [.. Normalize(value)
        .Split([' ', '-', '.', ',', '(', ')'], StringSplitOptions.RemoveEmptyEntries)
        .Where(t => t.Length > 2 && !StopWords.Contains(t))];

    /// <summary>True when at least <paramref name="ratio"/> of the reference name's
    /// significant tokens appear in the candidate.</summary>
    public static bool Matches(string reference, string? candidate, double ratio = 0.5)
    {
        if (string.IsNullOrEmpty(candidate))
        {
            return false;
        }

        string[] tokens = Tokens(reference);
        if (tokens.Length == 0)
        {
            return false;
        }

        string haystack = Normalize(candidate);
        return tokens.Count(haystack.Contains) >= tokens.Length * ratio;
    }
}
