using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>The agenda a place publishes, and the address it was read from.</summary>
public record FoundAgenda(string SourceUrl, string Text);

/// <summary>
/// What a place says on its own site about what happens there. It is the only source
/// there is for a small town: a ticket portal sells seats for the venues that have a
/// box office, so Juan Dolio — no amphitheatre, no theatre, no arena — is absent from
/// every one of them (Eventbrite's own "Juan Dolio" page answers with Santo Domingo
/// and La Romana, not one listing inside the city). What that town does have is a bar
/// with live music on Thursdays and a club with a tournament on Sunday, written on the
/// place's own page and nowhere else.
///
/// Nothing here is billed: the site is fetched over the same throttled client the free
/// photos and the menus use. The home page is asked for the links that say "agenda",
/// "eventos", "actividades" or "calendario", each candidate is followed once, and the
/// one whose text carries the most dates and weekdays is the agenda — a page with none
/// is a page about renting a hall for a wedding, which is what "Eventos" means on a
/// hotel's site and is not an agenda at all.
/// </summary>
public partial class EventSources(WebFiles web, int maxTextCharacters)
{
    /// <summary>How many links off the home page are followed before giving up.</summary>
    private const int MaxCandidates = 4;

    /// <summary>Shorter than this the page is a banner, not an agenda.</summary>
    private const int MinTextLength = 200;

    /// <summary>How many dates or weekdays a page has to state before its text is taken
    /// for an agenda. One is "abierto de lunes a domingo" in the footer of every page;
    /// several are a programme.</summary>
    private const int MinDateSignals = 3;

    /// <summary>What a link says when it leads to what happens at the place. Normalized,
    /// so "Programación" and "programacion" are the same word.</summary>
    private static readonly string[] AgendaWords =
    [
        "evento", "eventos", "agenda", "calendario", "calendar", "actividad", "actividades",
        "programacion", "programa", "espectaculo", "espectaculos", "show", "shows",
        "entretenimiento", "fiesta", "fiestas", "noches", "event", "events", "whatson",
    ];

    /// <summary>A day of the week, a date written in figures, or one written out with
    /// its month. What tells a programme from a page of prose about the place.</summary>
    [GeneratedRegex(
        @"\b(lunes|martes|miercoles|jueves|viernes|sabado|sabados|domingo|domingos"
        + @"|monday|tuesday|wednesday|thursday|friday|saturday|sunday"
        + @"|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b"
        + @"|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b",
        RegexOptions.IgnoreCase)]
    private static partial Regex DateSignal();

    /// <summary>How many dates or weekdays a text states. It is what tells a programme
    /// from prose about the place, on a page of a site and equally in the caption of a
    /// publication — one signal is "abierto de lunes a domingo", several are an agenda.</summary>
    public static int DateSignals(string? text) =>
        string.IsNullOrEmpty(text) ? 0 : DateSignal().Matches(TextMatch.Normalize(text)).Count;

    private static bool SaysAgenda(string? text) =>
        text is not null && AgendaWords.Any(TextMatch.Normalize(text).Contains);

    /// <summary>
    /// The agenda published on <paramref name="website"/>, or null when the site has
    /// none this side can read — which is the normal answer and never an error. The
    /// home page counts as a candidate: a beach bar of one page writes its live music
    /// on the page it has, and no link leads anywhere.
    /// </summary>
    public async Task<FoundAgenda?> FindAsync(string? website)
    {
        if (!MenuSources.CanRead(website)
            || WebFiles.ReadableSite(website) is not Uri site
            || await web.GetStringAsync(site.AbsoluteUri) is not string html)
        {
            return null;
        }

        var best = Agenda(html, site);
        foreach (Uri candidate in AgendaLinks(html, site).Take(MaxCandidates))
        {
            if (await web.GetStringAsync(candidate.AbsoluteUri) is not string page)
            {
                continue;
            }

            (FoundAgenda? found, int signals) = Agenda(page, candidate);
            if (found is not null && signals > best.Signals)
            {
                best = (found, signals);
            }
        }

        return best.Found;
    }

    /// <summary>The text of a page when it reads like an agenda, capped at what one
    /// model call is worth, with how many dates it states — which is what picks the
    /// agenda out of the four pages of a site that all mention the word.</summary>
    private (FoundAgenda? Found, int Signals) Agenda(string html, Uri url)
    {
        string text = WebFiles.ReadableText(html);
        int signals = DateSignals(text);
        if (text.Length < MinTextLength || signals < MinDateSignals)
        {
            return (null, 0);
        }

        return (
            new FoundAgenda(
                url.AbsoluteUri,
                text.Length > maxTextCharacters ? text[..maxTextCharacters] : text),
            signals);
    }

    /// <summary>The links of the home page that say they lead to what happens at the
    /// place. A link off the site is dropped: a hotel's "eventos" button often opens
    /// the chain's booking engine, which lists no agenda of this place.</summary>
    private static IEnumerable<Uri> AgendaLinks(string html, Uri page)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach ((string href, string text) in WebFiles.Anchors(html))
        {
            // "#eventos" is the navigation scrolling down the page it is already on.
            if (href.StartsWith('#')
                || (!SaysAgenda(href) && !SaysAgenda(text))
                || !Uri.TryCreate(page, href.Trim(), out Uri? url)
                || (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps)
                || !WebFiles.SameSite(url, page)
                || !seen.Add(url.AbsoluteUri))
            {
                continue;
            }

            yield return url;
        }
    }
}
