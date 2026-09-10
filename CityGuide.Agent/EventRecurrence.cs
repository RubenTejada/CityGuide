using System.Globalization;

namespace CityGuide.Agent;

/// <summary>
/// An event that happens on a fixed night every week, and the date it next falls on.
///
/// A ticket portal answers a capital with an amphitheatre; it has nothing at all to
/// say about a beach town, where what there is to do on a Wednesday is the live music
/// at the bar on the boulevard — the same music, the same bar, every Wednesday. That
/// is not a listing anybody publishes as an event, so the portal stores it as one node
/// carrying its weekday ("semanal:miércoles") and moves its date forward as each night
/// passes, instead of deleting it the way an event with a date of its own is deleted.
///
/// The value is written the way the backoffice reads: "semanal:" and the day in
/// Spanish. English is accepted too, and so is a day written without its accent, since
/// what parses this is also reading what a model answered.
/// </summary>
public static class EventRecurrence
{
    /// <summary>The one shape stored, kept beside the parser so a value this agent
    /// writes is a value it reads back.</summary>
    public const string WeeklyPrefix = "semanal:";

    /// <summary>The days of the week as the backoffice writes them, indexed by
    /// <see cref="DayOfWeek"/>. Sunday first, as the enum counts.</summary>
    public static readonly string[] SpanishDays =
        ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

    private static readonly string[] EnglishDays =
        ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    /// <summary>The stored value for a weekly event on <paramref name="day"/>.</summary>
    public static string Weekly(DayOfWeek day) => WeeklyPrefix + SpanishDays[(int)day];

    /// <summary>
    /// The weekday an event repeats on, or null when it carries no recurrence — which
    /// is every event that happens once. A value nobody can read is answered the same
    /// way: an event whose rule is a typo keeps its date and is treated as a one-off,
    /// never rolled to a day that was guessed.
    /// </summary>
    public static DayOfWeek? WeekdayOf(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        string normalized = TextMatch.Normalize(value);
        int separator = normalized.IndexOf(':');
        string day = (separator >= 0 ? normalized[(separator + 1)..] : normalized).Trim();
        for (var index = 0; index < SpanishDays.Length; index++)
        {
            if (day.Equals(TextMatch.Normalize(SpanishDays[index]), StringComparison.Ordinal)
                || day.Equals(EnglishDays[index], StringComparison.Ordinal))
            {
                return (DayOfWeek)index;
            }
        }

        return null;
    }

    /// <summary>
    /// The first <paramref name="day"/> on or after <paramref name="from"/>. Today
    /// counts: an event tonight is still tonight's event at nine in the morning, and
    /// rolling it a week forward would take the evening off the portal.
    /// </summary>
    public static DateTime NextOccurrence(DateTime from, DayOfWeek day) =>
        from.Date.AddDays(((int)day - (int)from.Date.DayOfWeek + 7) % 7);

    /// <summary>
    /// Where a recurring event's dates should be for it to be the next one, given the
    /// dates it carries now — or null when it is already in the future and nothing has
    /// to move. The time of day is kept (the music starts at nine whichever Wednesday
    /// it is) and so is how long it lasts.
    /// </summary>
    public static (DateTime Start, DateTime? End)? Roll(
        DateTime start, DateTime? end, DayOfWeek day, DateTime today)
    {
        DateTime last = end ?? start;
        if (last.Date >= today.Date)
        {
            return null;
        }

        DateTime next = NextOccurrence(today, day).Add(start.TimeOfDay);
        return (next, end is null ? null : next + (end.Value - start));
    }

    /// <summary>How the recurrence reads in the plan a maintenance pass prints.</summary>
    public static string Describe(DayOfWeek day) =>
        CultureInfo.InvariantCulture.TextInfo.ToTitleCase(SpanishDays[(int)day]);
}
