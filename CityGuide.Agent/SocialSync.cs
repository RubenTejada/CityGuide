using System.Globalization;

namespace CityGuide.Agent;

/// <summary>
/// Announces the portal's own content on Facebook and Instagram: the events of the
/// week, the films that just reached the cartelera, and the best-rated places a
/// discovery run has added. It writes nothing to the CMS except its own memory of what
/// it has already posted.
///
/// Nothing here is written by a model and nothing is asked of Google, so the pass is
/// free: a caption is the content the CMS already holds — the name, the rating, the
/// first sentence of a description an enrichment call paid for long ago — arranged in a
/// sentence. That is also why it needs no <c>--paid</c>.
///
/// What it must never do is announce the same place twice, and the container the agent
/// runs in keeps nothing between passes, so the memory lives in the CMS beside the
/// query log: "Publicaciones ya hechas" on the city node.
/// </summary>
public class SocialSync(
    UmbracoClient umbraco, MetaClient meta, SocialConfig config, SocialCityConfig city)
{
    /// <summary>Spanish is the portal's own language and the one the accounts post in.</summary>
    private static readonly CultureInfo Spanish = CultureInfo.GetCultureInfo("es-DO");

    /// <summary>
    /// One post, ready to go out. <paramref name="Instagram"/> is false for what
    /// Instagram will not take — a film poster is 2:3, outside the 4:5 – 1.91:1 window —
    /// and for anything with no picture at all, which on Facebook becomes a link post
    /// whose preview the portal's own Open Graph tags draw.
    /// </summary>
    private record Post(
        Guid Id, string Kind, string Name, string Url, string? ImageUrl, string Caption, bool Instagram);

    public async Task<int> RunAsync(bool apply, int maxPosts)
    {
        Console.WriteLine(apply
            ? $"\n== Redes sociales ({city.CityPath})"
            : $"\n== Redes sociales ({city.CityPath}) (simulación; agrega --apply)");

        if (await umbraco.GetContentByPathAsync(city.CityPath) is not { } cityNode)
        {
            Console.Error.WriteLine($"  ! No existe la ciudad {city.CityPath}");
            return 0;
        }

        UmbracoClient.CityAgentConfig? agent = await umbraco.GetCityAgentConfigAsync(city.CityPath);
        Dictionary<Guid, UmbracoClient.SocialLogEntry> log = agent?.SocialLog ?? [];

        List<Post> candidates = Interleave(
            await UpcomingEventsAsync(log),
            await NewMoviesAsync(log, cityNode.Name),
            await BestPlacesAsync(log, cityNode.Name))
            .Take(maxPosts)
            .ToList();

        if (candidates.Count == 0)
        {
            Console.WriteLine("  Nada nuevo que publicar.");
            return 0;
        }

        var posted = 0;
        foreach (Post post in candidates)
        {
            Console.WriteLine($"\n  [{post.Kind}] {post.Name}");
            Console.WriteLine($"  {post.Url}");
            Console.WriteLine($"  Imagen: {post.ImageUrl ?? "ninguna (se publica como enlace)"}");
            Console.WriteLine($"  Redes: Facebook{(post.Instagram ? " + Instagram" : "")}");
            Console.WriteLine(Indent(post.Caption));

            if (!apply)
            {
                continue;
            }

            try
            {
                await PublishAsync(post);
                log[post.Id] = new UmbracoClient.SocialLogEntry(
                    DateOnly.FromDateTime(DateTime.UtcNow), post.Name);
                posted++;
            }
            catch (Exception ex)
            {
                // A post that failed is not written to the log, so the next pass offers
                // it again — which is right for a rejected image and harmless for an
                // outage.
                Console.Error.WriteLine($"  ! No se publicó: {ex.Message}");
            }
        }

        if (apply && posted > 0)
        {
            await umbraco.SetTextValueAsync(
                cityNode.Id, "agentSocialLog", UmbracoClient.FormatSocialLog(log));
        }

        Console.WriteLine($"\n  {posted} publicación(es).");
        return posted;
    }

    /// <summary>
    /// Facebook always; Instagram only for what it accepts. A post with no picture is a
    /// link post — Instagram has no such thing, which is the other reason a caption
    /// there repeats the address as text.
    /// </summary>
    private async Task PublishAsync(Post post)
    {
        if (meta.CanPostToFacebook)
        {
            string id = post.ImageUrl is null
                ? await meta.PostFacebookLinkAsync(post.Caption, post.Url)
                : await meta.PostFacebookPhotoAsync(post.Caption, post.ImageUrl);
            Console.WriteLine($"  → Facebook {id}");
        }

        if (post.Instagram && post.ImageUrl is not null && meta.CanPostToInstagram)
        {
            string id = await meta.PostInstagramAsync(
                $"{post.Caption}\n\n🔗 Enlace en la bio", post.ImageUrl);
            Console.WriteLine($"  → Instagram {id}");
        }
    }

    // ---- what is worth a post ----

    /// <summary>
    /// The events happening within the next few days. Soonest first: an event announced
    /// the week after it happened is worse than not announcing it.
    /// </summary>
    private async Task<List<Post>> UpcomingEventsAsync(
        Dictionary<Guid, UmbracoClient.SocialLogEntry> log)
    {
        DateTime now = DateTime.Now;
        DateTime horizon = now.AddDays(config.EventDaysAhead);
        var posts = new List<Post>();

        foreach (UmbracoClient.PublishedItem item in Mine(await umbraco.GetPublishedItemsAsync("eventItem")))
        {
            if (log.ContainsKey(item.Id)
                || !DateTime.TryParse(item.Text.GetValueOrDefault("startDate"), out DateTime start)
                || start < now.Date || start > horizon)
            {
                continue;
            }

            string venue = item.Text.GetValueOrDefault("venueName", "");
            var caption = new List<string>
            {
                $"🎟️ {item.Name}",
                $"📅 {start.ToString("dddd d 'de' MMMM, h:mm tt", Spanish)}",
            };
            if (venue.Length > 0)
            {
                caption.Add($"📍 {venue}");
            }

            posts.Add(new Post(
                item.Id, "evento", item.Name, Link(item.Path), Image(item.PhotoUrl),
                Caption(
                    string.Join("\n", caption),
                    Lead(item.Text.GetValueOrDefault("summary") ?? item.Text.GetValueOrDefault("description")),
                    $"Info y entradas 👉 {Link(item.Path)}"),
                Instagram: true));
        }

        return [.. posts.OrderBy(p => p.Name)];
    }

    /// <summary>
    /// The films the cinema sync catalogued in the last few days: what is new in the
    /// cartelera, which is the one thing on the portal that changes every week. Facebook
    /// only — an Instagram post of a 2:3 poster is rejected by the container.
    /// </summary>
    private async Task<List<Post>> NewMoviesAsync(
        Dictionary<Guid, UmbracoClient.SocialLogEntry> log, string cityName)
    {
        DateTime since = DateTime.UtcNow.AddDays(-config.MovieDaysNew);
        var posts = new List<Post>();

        foreach (UmbracoClient.PublishedItem item in Mine(await umbraco.GetPublishedItemsAsync("movie")))
        {
            if (log.ContainsKey(item.Id) || item.CreateDate < since)
            {
                continue;
            }

            posts.Add(new Post(
                item.Id, "película", item.Name, Link(item.Path),
                Image(item.Text.GetValueOrDefault("posterUrl")),
                Caption(
                    $"🎬 {item.Name} — ya en cartelera en {cityName}",
                    Lead(item.Text.GetValueOrDefault("synopsis")),
                    $"Horarios y salas 👉 {Link(item.Path)}"),
                Instagram: false));
        }

        return [.. posts.OrderByDescending(p => p.Name)];
    }

    /// <summary>
    /// The best-rated places the portal has not announced yet, which on the first pass is
    /// the top of the guide and after that whatever a discovery run has added. A place
    /// with no photo is skipped rather than posted as a link: a listing card without a
    /// picture is exactly the post nobody stops at.
    /// </summary>
    private async Task<List<Post>> BestPlacesAsync(
        Dictionary<Guid, UmbracoClient.SocialLogEntry> log, string cityName)
    {
        List<UmbracoClient.PublishedPlace> places =
            [.. (await umbraco.GetPublishedPlacesAsync("place"))
                .Where(p => p.Path.StartsWith($"{city.CityPath.TrimEnd('/')}/", StringComparison.OrdinalIgnoreCase)
                    && !log.ContainsKey(p.Id)
                    && p.PhotoUrl is not null
                    && p.Rating >= config.MinRating
                    && p.RatingCount >= config.MinReviews)
                .OrderByDescending(p => p.Rating)
                .ThenByDescending(p => p.RatingCount)
                // Read a few more than will be posted: the ones with nothing to say are
                // dropped below, and the pass should still have its pick.
                .Take(config.MaxPostsPerPass * 4)];

        var posts = new List<Post>();
        foreach (UmbracoClient.PublishedPlace place in places)
        {
            if (posts.Count >= config.MaxPostsPerPass)
            {
                break;
            }

            // The description is on the document rather than in the listing projection,
            // and it is the one sentence that makes the post worth reading. A place
            // without one is a branch reading its company's prose, or a node an editor
            // typed in half way: neither is worth a post.
            Dictionary<string, string?> values = await umbraco.GetTextValuesAsync(place.Id);
            string? lead = Lead(values.GetValueOrDefault("description"));
            if (lead is null)
            {
                continue;
            }

            posts.Add(new Post(
                place.Id, "lugar", place.Name, Link(place.Path), Image(place.PhotoUrl),
                Caption(
                    $"✨ {place.Name} — {Section(place.Path)} en {cityName}\n"
                    + $"⭐ {place.Rating.ToString("0.0", Spanish)} ({place.RatingCount} reseñas en Google)",
                    lead,
                    $"Horario, fotos y cómo llegar 👉 {Link(place.Path)}"),
                Instagram: true));
        }

        return posts;
    }

    // ---- shaping ----

    /// <summary>Only this city's content: every reader here answers for the whole site.</summary>
    private IEnumerable<UmbracoClient.PublishedItem> Mine(IEnumerable<UmbracoClient.PublishedItem> items) =>
        items.Where(i => i.Path.StartsWith($"{city.CityPath.TrimEnd('/')}/", StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// One of each kind before a second of any: three restaurants in a row is a feed
    /// nobody follows, and the three sources rarely have the same amount to offer.
    /// </summary>
    private static IEnumerable<Post> Interleave(params List<Post>[] sources)
    {
        for (var index = 0; sources.Any(source => index < source.Count); index++)
        {
            foreach (List<Post> source in sources)
            {
                if (index < source.Count)
                {
                    yield return source[index];
                }
            }
        }
    }

    private string Tags => string.Join(" ", config.Hashtags.Concat(city.Hashtags).Distinct());

    private string Caption(string headline, string? lead, string call)
    {
        var parts = new List<string> { headline };
        if (!string.IsNullOrWhiteSpace(lead))
        {
            parts.Add(lead);
        }

        parts.Add(call);
        if (Tags.Length > 0)
        {
            parts.Add(Tags);
        }

        return string.Join("\n\n", parts);
    }

    /// <summary>
    /// The opening of a description, whole sentences only: a caption cut mid-word reads
    /// as broken, and the page it links to has the rest.
    /// </summary>
    private static string? Lead(string? description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            return null;
        }

        string text = description.Trim();
        if (text.Length <= 220)
        {
            return text;
        }

        int cut = text.LastIndexOf(". ", 220, StringComparison.Ordinal);
        return cut > 60 ? text[..(cut + 1)] : text[..217].TrimEnd() + "…";
    }

    /// <summary>The section a place lives in, as a person would say it ("Bares y Clubes").</summary>
    private static string Section(string path)
    {
        string[] segments = path.Trim('/').Split('/');
        string slug = segments.Length > 1 ? segments[1] : "";
        return string.Join(" ", slug.Split('-')
            .Select(word => word.Length > 2 ? Spanish.TextInfo.ToTitleCase(word) : word));
    }

    private string Link(string path) => $"{config.SiteUrl.TrimEnd('/')}/{path.Trim('/')}";

    /// <summary>
    /// Meta downloads the picture itself, so a CMS-relative /media path is served
    /// through the portal's own origin — which is public, branded, and the same proxy
    /// the site's own pages use.
    /// </summary>
    private string? Image(string? url) => url switch
    {
        null or "" => null,
        _ when url.StartsWith("http", StringComparison.OrdinalIgnoreCase) => url,
        _ => $"{config.SiteUrl.TrimEnd('/')}/{url.TrimStart('/')}",
    };

    private static string Indent(string caption) =>
        string.Join("\n", caption.Split('\n').Select(line => $"  | {line}"));
}
