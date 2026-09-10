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
/// This is the diagnostic half: it reads the feeds and prints what they carry, writing
/// nothing at all. Whether the pass is worth building on top of it is one question —
/// how much of what a bar announces is written in the caption, and how much is drawn
/// inside the flyer where only a model that reads images would find it — and this
/// answers it with the accounts of the city instead of a guess.
/// </summary>
public class InstagramEvents(MetaClient meta, UmbracoClient umbraco, EventsCityConfig city)
{
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

        string cityPrefix = $"{city.CityPath.TrimEnd('/')}/";
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        List<(UmbracoClient.PublishedPlace Place, string Handle)> feeds =
            [.. (await umbraco.GetPublishedPlacesAsync())
                .Where(p => p.Path.StartsWith(cityPrefix, StringComparison.OrdinalIgnoreCase))
                .Select(p => (Place: p, Handle: InstagramFeeds.HandleOf(p.Website)))
                .Where(f => f.Handle is not null)
                .OrderByDescending(f => f.Place.Rating)
                .ThenByDescending(f => f.Place.RatingCount)
                .Where(f => seen.Add(f.Handle!))
                .Take(accounts)
                .Select(f => (f.Place, Handle: f.Handle!))];

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

    private static string Preview(string caption)
    {
        string flat = string.Join(' ', caption.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return flat.Length > CaptionPreview ? $"{flat[..CaptionPreview]}…" : flat;
    }
}
