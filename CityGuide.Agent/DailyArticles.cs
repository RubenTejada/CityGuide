using System.Globalization;
using System.Text;

namespace CityGuide.Agent;

/// <summary>
/// The article of the day, one per city: what the city is talking about today, joined
/// to what the portal holds and written as a guide. Four steps, each one the cheapest
/// tool that can do it:
///  1. The day's headlines (<see cref="TrendingNews"/>: Google News and Google Trends,
///     free and keyless).
///  2. A topic (<see cref="ArticlePlanPrompt"/>, one model call) chosen against the
///     portal's sections and calendar, never one the city already published nor one
///     another city was given today; a headline used by one city is taken off the list
///     of the next. The model also names the establishment a headline is about when the
///     portal lacks it, and the discovery path creates it (Google, billed, at most
///     <see cref="ArticlePlanPrompt.MaxNewPlaces"/>).
///  3. The places, events, films and excursions it may recommend, looked up here by
///     section, facility and keyword, and the article itself (<see cref="ArticleWritePrompt"/>,
///     one model call, both languages). The headings, the photos and every link are put
///     around the prose by this class, from the candidate the model named by number.
///  4. The photos, cropped around their subject (<see cref="ArticleImages"/>), and the
///     article published through <see cref="ArticleWriter"/>.
/// A city that already has an article dated today (in the Dominican Republic) is left
/// alone, so the pass can run after both daily crons and the second one only writes
/// what the first did not.
/// </summary>
public class DailyArticles(
    UmbracoClient umbraco, IEnrichmentClient model, TrendingNews news, ArticleImages images, ArticleWriter writer)
{
    public const string Author = "Equipo QueHacerRD";

    /// <summary>Places put to the writing call. Enough to choose from, few enough that
    /// each one is described rather than listed.</summary>
    private const int MaxPlaces = 18;

    private const int MaxEvents = 8;
    private const int MaxMovies = 6;

    /// <summary>How many of the city's own titles the planner reads to avoid repeating
    /// one: two months of daily articles.</summary>
    private const int RecentTitles = 60;

    /// <summary>Sections that hold no establishment a headline could name.</summary>
    private static readonly HashSet<string> NoNewPlaces = new(StringComparer.OrdinalIgnoreCase) { "eventos", "cines" };

    private static readonly CultureInfo Spanish = CultureInfo.GetCultureInfo("es-DO");

    /// <summary>
    /// Writes the day's article in every city <paramref name="selected"/> keeps (asked
    /// with the city's "articulos" path, so "--section santiago" is one city). Without
    /// <paramref name="apply"/> every step runs but nothing is created or published —
    /// the model calls still run, so a plan is billed like a pass. <paramref name="createPlace"/>
    /// creates an establishment by name under a section path and answers its node, or is
    /// null when Google is off. Returns how many cities failed.
    /// </summary>
    public async Task<int> RunAsync(
        bool apply,
        Func<string, bool> selected,
        Func<string, Task<UmbracoClient.CityAgentConfig?>> cityConfigOf,
        Func<string, string, Task<Guid?>>? createPlace)
    {
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-4));
        List<UmbracoClient.PublishedNode> cities =
        [
            .. (await umbraco.GetPublishedNodesAsync("city", ContentCultures.Spanish))
                .Where(c => selected($"/{c.Path.Trim('/')}/articulos")),
        ];
        if (cities.Count == 0)
        {
            Console.WriteLine("\n== Artículo del día: ninguna ciudad seleccionada.");
            return 0;
        }

        var portal = new Portal(
            await umbraco.GetPublishedItemsAsync("article"),
            await umbraco.GetPublishedItemsAsync("place"),
            await umbraco.GetPublishedItemsAsync("mall"),
            await umbraco.GetPublishedItemsAsync("eventItem"),
            await umbraco.GetPublishedItemsAsync("movie"),
            await umbraco.GetPublishedItemsAsync("tour"),
            await umbraco.GetPublishedNodesAsync("categoryPage", ContentCultures.Spanish));
        List<Headline> national = await news.NationalAsync();
        var usedHeadlines = new HashSet<string>(StringComparer.Ordinal);
        var topicsToday = new List<string>();
        var failures = 0;
        foreach (UmbracoClient.PublishedNode city in cities)
        {
            try
            {
                await CityAsync(
                    city, today, portal, national, usedHeadlines, topicsToday, apply, cityConfigOf, createPlace);
            }
            catch (Exception ex)
            {
                failures++;
                Console.Error.WriteLine($"  ! artículo de {city.Name}: {ex.Message}");
            }
        }

        return failures;
    }

    /// <summary>Everything published that an article may draw on, read once per pass.</summary>
    private record Portal(
        List<UmbracoClient.PublishedItem> Articles,
        List<UmbracoClient.PublishedItem> Places,
        List<UmbracoClient.PublishedItem> Malls,
        List<UmbracoClient.PublishedItem> Events,
        List<UmbracoClient.PublishedItem> Movies,
        List<UmbracoClient.PublishedItem> Tours,
        List<UmbracoClient.PublishedNode> Sections);

    private async Task CityAsync(
        UmbracoClient.PublishedNode city, DateOnly today, Portal portal, List<Headline> national,
        HashSet<string> usedHeadlines, List<string> topicsToday, bool apply,
        Func<string, Task<UmbracoClient.CityAgentConfig?>> cityConfigOf,
        Func<string, string, Task<Guid?>>? createPlace)
    {
        string cityPath = $"/{city.Path.Trim('/')}";
        string citySlug = cityPath.Trim('/');
        string cityName = (await cityConfigOf(citySlug))?.CityName ?? city.Name;
        Console.WriteLine($"\n== Artículo del día en {city.Name}");

        bool InCity(UmbracoClient.PublishedItem item) =>
            item.Path.StartsWith($"{cityPath}/", StringComparison.OrdinalIgnoreCase);

        List<UmbracoClient.PublishedItem> articles = [.. portal.Articles.Where(InCity).OrderByDescending(PublishDate)];
        if (articles.FirstOrDefault(a => DominicanDay(PublishDate(a)) == today) is { } todays)
        {
            Console.WriteLine($"  ya tiene el de hoy: {todays.Name}");
            return;
        }

        List<UmbracoClient.PublishedItem> places = [.. portal.Places.Concat(portal.Malls).Where(InCity)];
        HashSet<Guid> malls = [.. portal.Malls.Select(m => m.Id)];
        List<UmbracoClient.PublishedItem> events =
        [
            .. portal.Events.Where(InCity)
                .Select(e => (Event: e, Start: EventStart(e)))
                .Where(e => e.Event.Text.ContainsKey("recurrence") || e.Start is { } start && DateOnly.FromDateTime(start) >= today)
                .OrderBy(e => e.Start ?? DateTime.MaxValue)
                .Take(30)
                .Select(e => e.Event),
        ];
        List<UmbracoClient.PublishedItem> movies = [.. portal.Movies.Where(InCity)];
        List<UmbracoClient.PublishedItem> tours = [.. portal.Tours.Where(InCity)];
        var sections = portal.Sections
            .Where(s => s.Path.Trim('/').Split('/') is [var c, _] && c.Equals(citySlug, StringComparison.OrdinalIgnoreCase))
            .Select(s => (Slug: s.Path.Trim('/').Split('/')[1], s.Name))
            .Select(s => (s.Slug, s.Name, Count: places.Count(p => Section(p) == s.Slug) + tours.Count(t => Section(t) == s.Slug)))
            .Where(s => s.Count > 0 || s.Slug == "cines" && movies.Count > 0)
            .ToList();
        if (events.Count > 0)
        {
            sections.Add(("eventos", "Eventos", events.Count));
        }

        List<Headline> headlines =
        [
            .. (await news.ForCityAsync(cityName)).Concat(national)
                .Where(h => !usedHeadlines.Contains(h.Url))
                .DistinctBy(h => TextMatch.Normalize(h.Title)),
        ];
        Console.WriteLine($"  {headlines.Count} titulares, {sections.Count} secciones, {events.Count} eventos próximos");

        var brief = new ArticleBrief(
            cityName, today, headlines, sections,
            [.. events.Select(EventLine)],
            [.. movies.Select(m => m.Name).Take(20)],
            [.. articles.Select(a => a.Name).Take(RecentTitles)],
            topicsToday);
        ArticlePlan plan = await model.PlanArticleAsync(brief)
            ?? throw new InvalidOperationException("el modelo no propuso ningún tema");
        Console.WriteLine($"  tema: {plan.Topic}");
        Console.WriteLine($"  enfoque: {plan.Angle}");
        Console.WriteLine($"  secciones {string.Join(", ", plan.Sections)}; facilidades {string.Join(", ", plan.Facilities)}; "
            + $"palabras {string.Join(", ", plan.Keywords)}; categoría {plan.Category}");
        List<Headline> cited = [.. plan.Headlines.Select(i => headlines[i])];
        foreach (Headline headline in cited)
        {
            Console.WriteLine($"  titular: {headline.Title} ({headline.Source})");
        }

        // The establishment a headline is about, when the portal does not have it.
        var featured = new List<Guid>();
        foreach (NewPlaceRequest wanted in plan.NewPlaces.Where(p => !NoNewPlaces.Contains(p.Section)))
        {
            if (places.FirstOrDefault(p => TextMatch.MatchesWords(wanted.Name, p.Name)) is { } stored)
            {
                featured.Add(stored.Id);
                Console.WriteLine($"  {wanted.Name}: ya está en el portal ({stored.Path})");
                continue;
            }

            string sectionPath = $"{cityPath}/{wanted.Section}";
            if (!apply || createPlace is null)
            {
                Console.WriteLine($"  {wanted.Name}: no está en el portal; "
                    + (createPlace is null ? "sin Google no se crea" : $"se buscaría en Google y se crearía en {sectionPath}"));
                continue;
            }

            Console.WriteLine($"  {wanted.Name}: no está en el portal, se busca en Google");
            if (await createPlace(sectionPath, wanted.Name) is { } id
                && await umbraco.GetPublishedItemAsync(id) is { } item)
            {
                places.Add(item);
                featured.Add(id);
                Console.WriteLine($"  + {item.Name} ({item.Path})");
            }
        }

        List<ArticleCandidate> candidates = Candidates(plan, places, malls, events, movies, tours, featured);
        if (candidates.Count < ArticleWritePrompt.MinItems)
        {
            throw new InvalidOperationException($"solo {candidates.Count} candidato(s) para el tema");
        }

        ArticleDraft draft = await model.WriteArticleAsync(cityName, plan, cited, candidates)
            ?? throw new InvalidOperationException("el modelo no devolvió un artículo publicable");
        if (articles.Any(a => a.Name.Equals(draft.Title, StringComparison.OrdinalIgnoreCase)))
        {
            // The writer would update the article that carries the title, overwriting a
            // published one with today's.
            throw new InvalidOperationException($"el título ya existe en la ciudad: {draft.Title}");
        }

        List<(ArticleItem Item, ArticleCandidate Candidate)> chosen =
            [.. draft.Items.Select(item => (item, candidates[item.Candidate]))];
        Dictionary<int, string> photos = await images.PrepareAsync(
            [
                .. chosen
                    .Select((c, i) => (c.Candidate, i))
                    .Where(c => c.Candidate.PhotoUrl is not null)
                    // An event the agent imported carries its venue's picture, and the
                    // venue is often recommended beside it: one photo is shown once.
                    .DistinctBy(c => c.Candidate.PhotoUrl)
                    .Select(c => new ArticleImages.Source(c.i, c.Candidate.Name, c.Candidate.PhotoUrl!, c.Candidate.PhotoCredit)),
            ],
            apply);

        var englishPaths = new Dictionary<Guid, string>();
        foreach ((_, ArticleCandidate candidate) in chosen)
        {
            // A page nobody has translated yet has no English address, and the English
            // article links to the Spanish one rather than to nothing.
            englishPaths[candidate.Id] =
                (await umbraco.GetPublishedItemAsync(candidate.Id, ContentCultures.English))?.Path ?? candidate.Path;
        }

        string? hero = Enumerable.Range(0, chosen.Count).Where(photos.ContainsKey).Select(i => photos[i]).FirstOrDefault();
        var spanish = new ArticleFile(
            draft.Title, draft.Summary,
            Body(draft.Intro, chosen.Select((c, i) => (c.Candidate, c.Item.Text, photos.GetValueOrDefault(i), c.Candidate.Path)),
                draft.Tips, draft.Closing, cited, english: false),
            plan.Category, hero, Author, draft.MetaTitle, draft.MetaDescription);
        var english = new ArticleFile(
            draft.TitleEn, draft.SummaryEn,
            Body(draft.IntroEn, chosen.Select((c, i) => (c.Candidate, c.Item.TextEn, photos.GetValueOrDefault(i), englishPaths[c.Candidate.Id])),
                draft.TipsEn, draft.ClosingEn, cited, english: true),
            plan.Category, null, null, draft.MetaTitleEn, draft.MetaDescriptionEn);

        foreach ((ArticleItem item, ArticleCandidate candidate) in chosen)
        {
            Console.WriteLine($"  · {candidate.Name} [{candidate.Kind}] {candidate.Path}");
        }

        await writer.WriteAsync(cityPath, spanish, english, apply);
        if (!apply)
        {
            // What a plan is for: reading the article before it goes out.
            Console.WriteLine($"\n--- {spanish.Title}\n{spanish.Body}\n---");
        }

        topicsToday.Add($"{city.Name}: {plan.Topic}");
        usedHeadlines.UnionWith(cited.Select(h => h.Url));
    }

    /// <summary>
    /// What the article may recommend: the establishments of the plan's sections and the
    /// ones whose name, description or facilities answer its keywords — the ones that
    /// answer most first, then the ones the portal describes, then the best known — plus
    /// the events, films and excursions the plan asked for. What a headline named comes
    /// first whatever its score.
    /// </summary>
    private static List<ArticleCandidate> Candidates(
        ArticlePlan plan,
        List<UmbracoClient.PublishedItem> places,
        HashSet<Guid> malls,
        List<UmbracoClient.PublishedItem> events,
        List<UmbracoClient.PublishedItem> movies,
        List<UmbracoClient.PublishedItem> tours,
        List<Guid> featured)
    {
        ArticleCandidate PlaceCandidate(UmbracoClient.PublishedItem place) =>
            DailyArticles.PlaceCandidate(place, malls.Contains(place.Id) ? "plaza" : "lugar");

        int Hits(UmbracoClient.PublishedItem place)
        {
            string facilities = place.Text.GetValueOrDefault("facilities", "");
            string haystack = $"{place.Name} {place.Path} {place.Text.GetValueOrDefault("description")} {facilities}";
            return plan.Keywords.Count(k => TextMatch.Matches(k, haystack, 1.0))
                + 2 * plan.Facilities.Count(f => facilities.Contains(f, StringComparison.OrdinalIgnoreCase));
        }

        var candidates = new List<ArticleCandidate>();
        candidates.AddRange(places.Where(p => featured.Contains(p.Id)).Select(p => PlaceCandidate(p) with { Lead = true }));
        candidates.AddRange(plan.Events.Select(i => events[i]).Select(e =>
            new ArticleCandidate(e.Id, "evento", e.Name, e.Path, EventLine(e), e.PhotoUrl, Lead: true, e.PhotoCredit)));
        candidates.AddRange(places
            .Where(p => !featured.Contains(p.Id))
            .Select(p => (Place: p, Hits: Hits(p)))
            .Where(p => p.Hits > 0 || plan.Sections.Contains(Section(p.Place)))
            .OrderByDescending(p => p.Hits)
            .ThenByDescending(p => p.Place.Text.ContainsKey("description"))
            .ThenByDescending(p => Number(p.Place, "googleRating") * Math.Log10(Number(p.Place, "googleRatingCount") + 10))
            .Take(MaxPlaces)
            .Select(p => PlaceCandidate(p.Place)));

        if (plan.Sections.Contains("eventos"))
        {
            candidates.AddRange(events.Take(MaxEvents).Select(e =>
                new ArticleCandidate(e.Id, "evento", e.Name, e.Path, EventLine(e), e.PhotoUrl, PhotoCredit: e.PhotoCredit)));
        }
        if (plan.Sections.Contains("cines"))
        {
            // A film's poster is portrait and lettered: no crop would make it a photo.
            candidates.AddRange(movies.Take(MaxMovies).Select(m => new ArticleCandidate(
                m.Id, "película", m.Name, m.Path,
                Join(m.Text.GetValueOrDefault("genre"), Trim(m.Text.GetValueOrDefault("synopsis"))), null)));
        }

        if (tours.Count > 0 && plan.Sections.Contains(Section(tours[0])))
        {
            candidates.AddRange(tours.Select(t => new ArticleCandidate(
                t.Id, "excursión", t.Name, t.Path,
                Join(t.Text.GetValueOrDefault("durationHours") is { } hours ? $"{hours} horas" : null,
                    t.Text.GetValueOrDefault("season"), Trim(t.Text.GetValueOrDefault("description"))),
                t.PhotoUrl, PhotoCredit: t.PhotoCredit)));
        }

        return [.. candidates.DistinctBy(c => c.Id)];
    }

    private static ArticleCandidate PlaceCandidate(UmbracoClient.PublishedItem place, string kind)
    {
        string[] segments = place.Path.Trim('/').Split('/');
        double rating = Number(place, "googleRating");
        int reviews = (int)Number(place, "googleRatingCount");
        return new ArticleCandidate(
            place.Id, kind, place.Name, place.Path,
            Join(
                string.Join(" / ", segments.Skip(1).SkipLast(1)),
                rating > 0 ? $"{rating.ToString("0.0", CultureInfo.InvariantCulture)} en Google ({reviews} reseñas)" : null,
                place.Text.GetValueOrDefault("address"),
                place.Text.GetValueOrDefault("facilities"),
                Trim(place.Text.GetValueOrDefault("description"))),
            place.PhotoUrl, PhotoCredit: place.PhotoCredit);
    }

    /// <summary>
    /// The credit of a Commons or Google photo as one Markdown line — "Foto: [Autor](página
    /// del archivo) · CC BY-SA 4.0" —, which is what CC BY and CC BY-SA ask (author, licence
    /// and link) and what Google's terms ask for its photos. The author links to the source;
    /// without one the provider takes their place. Null for a picture that owes no credit.
    /// </summary>
    private static string? CreditLine(PhotoCredit? credit, bool english)
    {
        if (credit is null || credit.IsEmpty)
        {
            return null;
        }

        string? provider = Uri.TryCreate(credit.Source, UriKind.Absolute, out Uri? source)
            ? source.Host.EndsWith("wikimedia.org", StringComparison.OrdinalIgnoreCase) ? "Wikimedia Commons"
            : source.Host.Contains("google.", StringComparison.OrdinalIgnoreCase) ? "Google Maps"
            : null
            : null;
        string? who = Clean(credit.Author) ?? provider;
        string? author = who is null ? null
            // A Commons file name may carry parentheses, which would end the link early.
            : source is not null ? $"[{who}]({credit.Source!.Replace("(", "%28").Replace(")", "%29")})"
            : who;
        string[] parts =
        [
            .. new[] { author, Clean(credit.License), credit.Author is not null ? provider : null }
                .OfType<string>(),
        ];
        return parts.Length == 0 ? null : $"{(english ? "Photo" : "Foto")}: {string.Join(" · ", parts)}";

        // Square brackets would close the link text early.
        static string? Clean(string? text) =>
            string.IsNullOrWhiteSpace(text) ? null : text.Trim().Replace('[', '(').Replace(']', ')');
    }

    /// <summary>An event as one line: when, where, what kind and what it says.</summary>
    private static string EventLine(UmbracoClient.PublishedItem e)
    {
        string? recurrence = e.Text.GetValueOrDefault("recurrence");
        string? when = recurrence is not null
            ? $"cada {recurrence.Split(':').Last()}"
            : EventStart(e)?.ToString("dddd d 'de' MMMM, h:mm tt", Spanish);
        return $"{e.Name} — " + Join(when, e.Text.GetValueOrDefault("venueName"), e.Text.GetValueOrDefault("category"),
            Trim(e.Text.GetValueOrDefault("description"), 160));
    }

    /// <summary>
    /// The Markdown <c>ArticleBody</c> renders: the intro, then one block per
    /// recommendation — its name as the heading, its cropped photo, the model's paragraph
    /// and the link to its page — the tips, the closing line and the news it drew on.
    /// </summary>
    private static string Body(
        string intro,
        IEnumerable<(ArticleCandidate Candidate, string Text, string? Photo, string Path)> items,
        IReadOnlyList<string> tips, string closing, IReadOnlyList<Headline> sources, bool english)
    {
        var body = new StringBuilder(intro.Trim()).Append("\n\n");
        foreach ((ArticleCandidate candidate, string text, string? photo, string path) in items)
        {
            string name = candidate.Name.Replace('[', '(').Replace(']', ')');
            body.Append($"## {name}\n\n");
            if (photo is not null)
            {
                // The credit goes on the line under the picture, inside the same block,
                // which ArticleBody renders as the figure's caption.
                body.Append($"![{name}]({photo})");
                if (CreditLine(candidate.PhotoCredit, english) is { } credit)
                {
                    body.Append('\n').Append(credit);
                }

                body.Append("\n\n");
            }

            body.Append(text.Trim()).Append("\n\n");
            body.Append($"[{LinkLabel(candidate.Kind, english)}]({path})\n\n");
        }

        if (tips.Count > 0)
        {
            body.Append(english ? "## Before you go\n\n" : "## Antes de ir\n\n");
            body.Append(string.Join("\n", tips.Select(t => $"- {t}"))).Append("\n\n");
        }

        if (closing.Length > 0)
        {
            body.Append(closing.Trim()).Append("\n\n");
        }

        if (sources.Count > 0)
        {
            body.Append(english ? "Sources: " : "Fuentes: ");
            body.Append(string.Join(" · ", sources.Select(h => $"[{h.Title}]({h.Url}) ({h.Source})")));
            body.Append('\n');
        }

        return body.ToString().Trim();
    }

    private static string LinkLabel(string kind, bool english) => (kind, english) switch
    {
        ("evento", false) => "Ver el evento",
        ("evento", true) => "See the event",
        ("película", false) => "Ver horarios de la película",
        ("película", true) => "See showtimes",
        ("excursión", false) => "Ver la excursión",
        ("excursión", true) => "See the tour",
        (_, false) => "Ver horario, mapa y fotos",
        (_, true) => "See hours, map and photos",
    };

    /// <summary>The section a node lives in: the segment after the city.</summary>
    private static string Section(UmbracoClient.PublishedItem item) =>
        item.Path.Trim('/').Split('/') is [_, var section, ..] ? section : "";

    private static DateTime PublishDate(UmbracoClient.PublishedItem article) =>
        DateTime.TryParse(article.Text.GetValueOrDefault("publishDate"), CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out DateTime date)
            ? date
            : article.CreateDate;

    /// <summary>The Dominican calendar day of a UTC moment (UTC-4, no daylight saving).</summary>
    private static DateOnly DominicanDay(DateTime utc) => DateOnly.FromDateTime(utc.AddHours(-4));

    /// <summary>An event's start, the Dominican wall clock the portals state.</summary>
    private static DateTime? EventStart(UmbracoClient.PublishedItem e) =>
        DateTime.TryParse(e.Text.GetValueOrDefault("startDate"), CultureInfo.InvariantCulture,
            DateTimeStyles.None, out DateTime start) ? start : null;

    private static double Number(UmbracoClient.PublishedItem item, string alias) =>
        double.TryParse(item.Text.GetValueOrDefault(alias), NumberStyles.Float, CultureInfo.InvariantCulture, out double value)
            ? value
            : 0;

    private static string Join(params string?[] parts) =>
        string.Join(" | ", parts.Where(p => !string.IsNullOrWhiteSpace(p)));

    private static string? Trim(string? text, int max = 240) =>
        text is null ? null : text.Length <= max ? text : text[..max] + "…";
}
