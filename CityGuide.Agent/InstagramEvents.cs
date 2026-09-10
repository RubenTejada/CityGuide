namespace CityGuide.Agent;

/// <summary>
/// What a city's own places announce on Instagram.
///
/// It is the same gap <see cref="VenueEvents"/> answers, one step further down: no
/// ticket portal lists a town without a box office, and most of its bars have no site
/// of their own either — what they have is a feed. The handle is already in the CMS,
/// stored as the place's "website", so nothing has to be captured by hand (see
/// <see cref="InstagramFeeds"/>).
///
/// It has two halves. <see cref="ReportAsync"/> is the diagnostic: it reads the feeds
/// and prints what they carry, writing nothing and spending nothing, which is what
/// answered whether the pass was worth building — how much of what a bar announces is
/// written in the caption, and how much is drawn inside the flyer.
///
/// <see cref="RunAsync"/> is the pass itself, and the flyer is the reason it costs
/// anything: the pictures go to the model together with the captions, which is the one
/// step of the agent that reads an image. Not one Google request either way. What it
/// finds is written through the same <see cref="EventWriter"/> the site pass uses, so
/// the two never publish the same night twice and "--purge-event-source instagram"
/// undoes this one alone.
/// </summary>
public class InstagramEvents(MetaClient meta, UmbracoClient umbraco, EventsCityConfig city)
{
    /// <summary>What the events this pass creates carry as their source, so
    /// "--purge-event-source instagram" undoes a pass exactly as it undoes a portal's.</summary>
    public const string SourceName = "instagram";

    /// <summary>How old a publication may be before it is history rather than an
    /// announcement. A bar posts its week; two months back is last season's flyer.</summary>
    private const int MaxPostAgeDays = 60;

    /// <summary>How many publications are read per account. A bar announces its week,
    /// so a dozen covers a month of them and the API charges nothing per post.</summary>
    private const int PostsPerAccount = 12;

    /// <summary>How much of a caption is printed. Enough to see whether it states the
    /// night or only points at the picture.</summary>
    private const int CaptionPreview = 220;

    /// <summary>
    /// Prints, for the <paramref name="accounts"/> best-rated places of the city whose
    /// website is an Instagram account, what business discovery answers about them:
    /// whether the account is a business at all (a personal one is refused by Meta),
    /// and every recent publication with its date, its kind and its caption. Reads the
    /// CMS and Meta; writes nothing, spends nothing — not one Google request and not
    /// one model token.
    /// </summary>
    public async Task ReportAsync(int accounts)
    {
        Console.WriteLine($"\n== Instagram de los lugares de {city.CityPath} (solo lectura)");

        List<(UmbracoClient.PublishedPlace Place, string Handle)> feeds = await FeedsAsync(accounts);
        if (feeds.Count == 0)
        {
            Console.WriteLine("  Ningún lugar de la ciudad guarda una cuenta de Instagram como sitio web.");
            return;
        }

        // Which places have a feed at all is worth knowing on its own, and it is
        // answered by the CMS alone: without the Meta credentials the accounts are
        // listed and nothing is read.
        if (!meta.CanReadInstagram)
        {
            foreach ((UmbracoClient.PublishedPlace place, string handle) in feeds)
            {
                Console.WriteLine($"  {place.Name} — @{handle}");
            }

            Console.WriteLine(
                $"\n  {feeds.Count} cuenta(s), ninguna leída: faltan las credenciales de Meta. "
                + "Leer otra cuenta necesita lo mismo que publicar, Social:InstagramUserId y "
                + "Social:AccessToken (user-secrets en local, secretos del repositorio en Azure).");
            return;
        }

        Console.WriteLine($"  {feeds.Count} cuenta(s) por leer, {PostsPerAccount} publicaciones de cada una.");

        var answered = 0;
        var posts = 0;
        var withDate = 0;
        var flyers = 0;
        foreach ((UmbracoClient.PublishedPlace place, string handle) in feeds)
        {
            Console.WriteLine(
                $"\n  {place.Name} — @{handle}"
                + (place.Rating > 0 ? $"  ({place.Rating:0.0}, {place.RatingCount} reseñas)" : ""));

            InstagramProfile? profile;
            try
            {
                profile = await meta.DiscoverAsync(handle, PostsPerAccount);
            }
            catch (Exception ex)
            {
                // The normal failure is the account being personal rather than a
                // business, which Meta refuses by design. It is a finding, not a fault.
                Console.WriteLine($"    sin respuesta: {ex.Message}");
                continue;
            }

            if (profile is null)
            {
                Console.WriteLine("    sin respuesta: la cuenta no existe o no es de empresa.");
                continue;
            }

            answered++;
            Console.WriteLine(
                $"    {profile.Followers} seguidores, {profile.MediaCount} publicaciones; "
                + $"{profile.Posts.Count} leída(s).");

            foreach (InstagramPost post in profile.Posts)
            {
                posts++;
                int signals = EventSources.DateSignals(post.Caption);
                bool image = post.MediaType is "IMAGE" or "CAROUSEL_ALBUM";
                if (signals > 0)
                {
                    withDate++;
                }
                else if (image)
                {
                    flyers++;
                }

                Console.WriteLine(
                    $"    {post.Taken:yyyy-MM-dd}  {post.MediaType,-16} "
                    + $"fecha en el texto: {(signals > 0 ? $"sí ({signals})" : "no")}  {post.Permalink}");
                if (!string.IsNullOrWhiteSpace(post.Caption))
                {
                    Console.WriteLine($"      {Preview(post.Caption)}");
                }
            }
        }

        Console.WriteLine(
            $"\n  {answered} de {feeds.Count} cuenta(s) respondieron, {posts} publicación(es) leída(s): "
            + $"{withDate} indican fecha o día en el texto, {flyers} son imagen sin fecha escrita "
            + "(el anuncio va dentro del flyer).");
    }

    /// <summary>
    /// Reads the Instagram of the <paramref name="accounts"/> best-rated places of the
    /// city and creates what they announce as events of its section. The city is the
    /// whole of the scoping, as it is for every event pass: "--section" picks which
    /// cities run, and inside one there is nothing to narrow — only a handful of places
    /// store a feed at all. Prints the plan and writes nothing unless
    /// <paramref name="apply"/>, which matters more here than anywhere else: an event
    /// read off a flyer is a transcription no code can check, and the line printed for
    /// it carries the publication it came from.
    /// </summary>
    public async Task RunAsync(bool apply, int accounts, IEnrichmentClient enricher)
    {
        Console.WriteLine(apply
            ? $"\n== Eventos desde el Instagram de cada lugar: {city.CityPath}/eventos"
            : $"\n== Eventos desde el Instagram de cada lugar en {city.CityPath} "
              + "(simulación; agrega --apply para aplicarla)");

        if (!meta.CanReadInstagram)
        {
            Console.Error.WriteLine(
                "  Leer otra cuenta necesita lo mismo que publicar: Social:InstagramUserId y "
                + "Social:AccessToken (user-secrets en local, secretos del repositorio en Azure).");
            return;
        }

        var events = new EventWriter(umbraco, city, SourceName);
        if (!await events.OpenAsync())
        {
            return;
        }

        List<(UmbracoClient.PublishedPlace Place, string Handle)> feeds = await FeedsAsync(accounts);
        if (feeds.Count == 0)
        {
            Console.WriteLine("  Ningún lugar de la ciudad guarda una cuenta de Instagram como sitio web.");
            return;
        }

        Console.WriteLine(
            $"  {feeds.Count} cuenta(s) por leer, {PostsPerAccount} publicaciones de cada una. "
            + "Ni una petición a Google; el modelo se paga una vez por cuenta que responda, "
            + "y lee los flyers además de los textos.");

        var created = 0;
        var withEvents = 0;
        foreach ((UmbracoClient.PublishedPlace place, string handle) in feeds)
        {
            IReadOnlyList<InstagramPost> posts;
            IReadOnlyList<FeedEvent> announced;
            try
            {
                if (await meta.DiscoverAsync(handle, PostsPerAccount) is not { } profile)
                {
                    continue;
                }

                posts = Recent(profile.Posts);
                if (posts.Count == 0)
                {
                    continue;
                }

                announced = await enricher.ReadFeedEventsAsync(place.Name, events.CityName, posts);
            }
            catch (Exception ex)
            {
                // A personal account is refused by Meta by design; it is a finding and
                // not a fault, and the next place is read exactly the same.
                Console.Error.WriteLine($"  ! @{handle}: {ex.Message}");
                continue;
            }

            if (announced.Count == 0)
            {
                continue;
            }

            withEvents++;
            Console.WriteLine($"  {place.Name} — @{handle}");
            foreach ((AgendaEvent activity, InstagramPost post) in announced)
            {
                if (await events.AddAsync(activity, place, post.Permalink, apply) == EventOutcome.Created)
                {
                    created++;
                }

                Console.WriteLine($"      {post.Permalink}");
            }
        }

        Console.WriteLine(apply
            ? $"\n  {created} evento(s) creados desde {withEvents} cuenta(s) con anuncios, "
              + $"de {feeds.Count} leída(s)."
            : $"\n  {withEvents} cuenta(s) con anuncios de {feeds.Count} leída(s).");
    }

    /// <summary>
    /// The places of the city that store an Instagram account as their website, best
    /// rated first and one entry per account: a chain's two locations point at the same
    /// feed, and reading it twice would publish its Thursday under both.
    /// </summary>
    private async Task<List<(UmbracoClient.PublishedPlace Place, string Handle)>> FeedsAsync(int accounts)
    {
        string cityPrefix = $"{city.CityPath.TrimEnd('/')}/";
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        return
            [.. (await umbraco.GetPublishedPlacesAsync())
                .Where(p => p.Path.StartsWith(cityPrefix, StringComparison.OrdinalIgnoreCase))
                .Select(p => (Place: p, Handle: InstagramFeeds.HandleOf(p.Website)))
                .Where(f => f.Handle is not null)
                .OrderByDescending(f => f.Place.Rating)
                .ThenByDescending(f => f.Place.RatingCount)
                .Where(f => seen.Add(f.Handle!))
                .Take(accounts)
                .Select(f => (f.Place, Handle: f.Handle!))];
    }

    /// <summary>The publications worth a model call: recent enough to be announcing
    /// something rather than remembering it, and carrying either a caption to read or a
    /// picture to look at.</summary>
    private static List<InstagramPost> Recent(IEnumerable<InstagramPost> posts) =>
        [.. posts.Where(p =>
            p.Taken >= DateTimeOffset.UtcNow.AddDays(-MaxPostAgeDays)
            && (!string.IsNullOrWhiteSpace(p.Caption) || InstagramEventPrompt.HasImage(p)))];

    private static string Preview(string caption)
    {
        string flat = string.Join(' ', caption.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return flat.Length > CaptionPreview ? $"{flat[..CaptionPreview]}…" : flat;
    }
}
