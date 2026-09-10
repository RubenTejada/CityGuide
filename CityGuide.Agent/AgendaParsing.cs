using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>
/// What both readers of an announcement have to check before the CMS sees it.
///
/// A place announces its Thursday on its own site (<see cref="EventAgendaPrompt"/>) or,
/// where it has no site, on its Instagram (<see cref="InstagramEventPrompt"/>). The
/// prose differs and the checking does not: a schema that offers a day of the week gets
/// one whether it was asked about a resort's nightly show or about a flyer, so the model
/// is made to quote the sentence that announces the day and the quote is verified here
/// instead of trusted.
/// </summary>
public static partial class AgendaParsing
{
    /// <summary>What one source may yield before the rest is a listing of somebody
    /// else's calendar. A source over this is cut, not dropped.</summary>
    public const int MaxEvents = 20;

    public const int MaxNameLength = 120;
    public const int MaxDescriptionLength = 400;

    /// <summary>How far ahead a stated date may be before it is somebody's archive
    /// heading rather than a coming event. A year is generous for a beach town.</summary>
    public const int MaxDaysAhead = 400;

    /// <summary>
    /// Whether <paramref name="text"/> really announces something on
    /// <paramref name="weekday"/>, which is the one question this side can answer for
    /// itself and the one the model keeps getting wrong. It is asked to quote the
    /// sentence that says so, and the quote has to be in the text: a resort's nightly
    /// show came back as "viernes" under two different wordings of the rules, and no
    /// quote of it exists.
    ///
    /// A quote that does exist is still not always an announcement. "Miércoles a Sábado
    /// – 20h" is when the restaurant opens, and a model asked for events read two
    /// cultural evenings into it — so a sentence that runs from one day to another is
    /// an opening-hours line and never an event.
    /// </summary>
    public static bool Announces(string text, string? evidence, DayOfWeek weekday) =>
        Quotes(text, evidence) && NamesDay(evidence, weekday);

    /// <summary>Whether the quote is really in the text it was taken from. What a model
    /// cannot quote, it did not read.</summary>
    public static bool Quotes(string text, string? evidence) =>
        evidence is { Length: > 0 }
        && Flatten(text).Contains(Flatten(evidence), StringComparison.Ordinal);

    /// <summary>
    /// Whether the quote announces <paramref name="weekday"/> and no other: it has to
    /// name that day, and it must not name a run of days. Two different weekdays with
    /// nothing but a connector between them is a range, and a range is when the place
    /// opens rather than when something happens.
    /// </summary>
    public static bool NamesDay(string? evidence, DayOfWeek weekday)
    {
        if (evidence is not { Length: > 0 })
        {
            return false;
        }

        string quote = Flatten(evidence);
        return quote.Contains(TextMatch.Normalize(EventRecurrence.SpanishDays[(int)weekday]),
                StringComparison.Ordinal)
            && DayRange().Matches(quote).All(range =>
                range.Groups[1].Value.TrimEnd('s') == range.Groups[2].Value.TrimEnd('s'));
    }

    /// <summary>Text as one run of lowercase, unaccented words, which is how a quote is
    /// compared with the text it should have come from. A page is flattened because
    /// ReadableText makes every tag a line break, so a sentence wrapped in a &lt;b&gt;
    /// arrives in three pieces and a quote of it would never be found; a caption for the
    /// line breaks its author typed.</summary>
    public static string Flatten(string value) =>
        Whitespace().Replace(TextMatch.Normalize(value), " ").Trim();

    /// <summary>A date the model states, or null when it is not a date, is already past,
    /// or is so far ahead it is an archive heading. <paramref name="notBefore"/> is the
    /// earliest it may be: an announcement never precedes itself, so a flyer published
    /// in March cannot be announcing a night in January.</summary>
    public static DateOnly? Date(string? value, DateOnly? notBefore = null)
    {
        DateOnly floor = notBefore is { } earliest && earliest > DateOnly.FromDateTime(DateTime.Today)
            ? earliest
            : DateOnly.FromDateTime(DateTime.Today);
        return DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out DateOnly parsed)
            && parsed >= floor
            && parsed <= DateOnly.FromDateTime(DateTime.Today.AddDays(MaxDaysAhead))
                ? parsed
                : null;
    }

    public static TimeOnly? Time(string? value) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None,
            out TimeOnly parsed)
            ? parsed
            : null;

    public static string Cut(string value, int max) =>
        value.Length > max ? value[..max].TrimEnd() : value;

    public static string? Text(JsonElement item, string name) =>
        item.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim()
            : null;

    /// <summary>The category the model chose, or null when it named none of the
    /// portal's own. An event stays uncategorized rather than mislabelled.</summary>
    public static string? Category(JsonElement item) =>
        Text(item, "category") is { Length: > 0 } category && EventCategories.Options.Contains(category)
            ? category
            : null;

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>"miércoles a sábado", "de lunes a viernes", "jueves - domingo": how an
    /// opening-hours line names the days a place is open. The days are matched without
    /// their accents, since the quote is compared flattened.</summary>
    [GeneratedRegex(
        @"(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)"
        + @"\s*(?:a|al|hasta|-|–|—|/)\s*"
        + @"(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)")]
    private static partial Regex DayRange();
}
