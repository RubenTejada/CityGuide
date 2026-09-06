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

    /// <summary>Significant tokens of a name: normalized, longer than 2 chars, no stop words.
    /// Apostrophes split like any other separator, so a chain Google spells both ways
    /// ("McDonald's", "McDonalds") yields the same token either way.</summary>
    public static string[] Tokens(string value) => [.. Normalize(value)
        .Split(Separators, StringSplitOptions.RemoveEmptyEntries)
        .Where(t => t.Length > 2 && !StopWords.Contains(t))];

    /// <summary>True when at least <paramref name="ratio"/> of the reference name's
    /// significant tokens appear in the candidate.</summary>
    /// <summary>
    /// True when the words of <paramref name="reference"/> appear in
    /// <paramref name="candidate"/> as a run of consecutive words — "Western Union" in
    /// "Vimeca Western Union", "DHL" in "D H L Ágora Mall" (the run is compared with its
    /// spaces removed, so a chain Google spells letter by letter still matches) — and never
    /// "BM Cargo" in "Transporte RC Cargo Express". This is what decides that a place is a
    /// branch of a chain: <see cref="Matches"/> takes the words in any order and drops the
    /// short ones, which is right for recognising the same place under two names and wrong
    /// for a brand, where "cargo" alone names nothing.
    /// </summary>
    public static bool ContainsPhrase(string reference, string? candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return false;
        }

        string phrase = string.Concat(Words(reference));
        if (phrase.Length == 0)
        {
            return false;
        }

        string[] words = Words(candidate);
        for (int start = 0; start < words.Length; start++)
        {
            var run = new System.Text.StringBuilder();
            for (int end = start; end < words.Length && run.Length < phrase.Length; end++)
            {
                run.Append(words[end]);
                if (run.Length == phrase.Length && run.ToString() == phrase)
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static readonly char[] Separators =
        [' ', '-', '.', ',', '(', ')', '\'', '\u2019'];

    /// <summary>Every word, however short — "BM" and "de" included — lowercased and unaccented.</summary>
    public static string[] Words(string value) =>
        Normalize(value).Split(Separators, StringSplitOptions.RemoveEmptyEntries);

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

    /// <summary>
    /// True when every significant word of <paramref name="reference"/> is a word of
    /// <paramref name="candidate"/> — not merely a run of letters inside one. This is
    /// the strict cousin of <see cref="Matches"/>, for deciding whether a file found on
    /// an open catalogue really pictures this place: "Scape Park" is contained in
    /// "RiverScape MetroPark, Dayton" and is not the same thing.
    /// </summary>
    public static bool MatchesWords(string reference, string? candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return false;
        }

        string[] tokens = Tokens(reference);
        var words = new HashSet<string>(
            Normalize(candidate).Split(Separators, StringSplitOptions.RemoveEmptyEntries),
            StringComparer.Ordinal);
        return tokens.Length > 0 && tokens.All(words.Contains);
    }
}
