namespace CityGuide.Agent;

/// <summary>
/// Keeps the "Cines" section in sync with Caribbean Cinemas so it no longer
/// depends on the one-shot seeder:
///  - upserts the "Caribbean Cinemas" company and one branch place per cinema
///    (name, address, phone, coordinates from the Caribbean API, with config
///    fallbacks for coordinates the API doesn't have), and
///  - maintains the movie catalog ("movie" documents under the Cines category)
///    with synopsis, poster and a YouTube trailer in Latin American Spanish.
/// All cinema-sync content is published immediately: it is deterministic data
/// from Caribbean Cinemas, not AI-generated drafts.
/// </summary>
public class CinemaSync(
    UmbracoClient umbraco,
    CaribbeanCinemasClient caribbean,
    YoutubeTrailerFinder trailers,
    CinemasConfig config)
{
    public async Task RunAsync()
    {
        Console.WriteLine($"\n== Cinema sync: {config.CityPath}/cines");

        (Guid Id, string Name)? cines = await umbraco.GetContentByPathAsync($"{config.CityPath}/cines");
        if (cines is null)
        {
            (Guid Id, string Name)? city = await umbraco.GetContentByPathAsync(config.CityPath);
            if (city is null)
            {
                Console.Error.WriteLine($"  City path not found in CMS, skipping: {config.CityPath}");
                return;
            }

            Guid categoryTypeId = await umbraco.GetDocumentTypeIdAsync("Category Page");
            Guid newId = await umbraco.CreateDocumentAsync(city.Value.Id, categoryTypeId, "Cines",
                [new { alias = "intro", value = "Carteleras y salas de cine." }]);
            cines = (newId, "Cines");
            Console.WriteLine("  + created 'Cines' category");
        }

        Guid companyId = await EnsureCompanyAsync(cines.Value.Id);
        await SyncBranchesAsync(companyId);
        await SyncMoviesAsync(cines.Value.Id);
    }

    private async Task<Guid> EnsureCompanyAsync(Guid cinesId)
    {
        Guid companyTypeId = await umbraco.GetDocumentTypeIdAsync("Company");
        List<UmbracoClient.ChildDocument> children = await umbraco.GetChildrenAsync(cinesId);
        UmbracoClient.ChildDocument? existing = children.FirstOrDefault(c =>
            c.DocumentTypeId == companyTypeId && c.Name.Equals(config.CompanyName, StringComparison.OrdinalIgnoreCase));
        if (existing is not null)
        {
            return existing.Id;
        }

        Guid id = await umbraco.CreateDocumentAsync(cinesId, companyTypeId, config.CompanyName,
        [
            new { alias = "description", value = (object)("La cadena de cines líder del Caribe: salas CXC, 4DX y VIP "
                + "con la cartelera más completa de estrenos.") },
            new { alias = "website", value = (object)"https://rd.caribbeancinemas.com" },
        ]);
        Console.WriteLine($"  + company '{config.CompanyName}'");
        return id;
    }

    private async Task SyncBranchesAsync(Guid companyId)
    {
        Guid placeTypeId = await umbraco.GetDocumentTypeIdAsync("Place");
        List<UmbracoClient.ChildDocument> existing = await umbraco.GetChildrenAsync(companyId);

        foreach (CinemaSiteConfig siteConfig in config.Sites)
        {
            CinemaSite? site = await caribbean.GetSiteAsync(siteConfig.Id);
            if (site is null)
            {
                Console.Error.WriteLine($"  ! Caribbean site {siteConfig.Id} not reachable, skipped");
                continue;
            }

            // Coordinate data type stores decimal(_,6); more decimals fail publish.
            decimal latitude = Math.Round(site.Latitude ?? siteConfig.Lat, 6);
            decimal longitude = Math.Round(site.Longitude ?? siteConfig.Lng, 6);
            object[] values =
            [
                new { alias = "address", value = (object)(site.Address ?? "") },
                new { alias = "phone", value = (object)(site.Phone ?? "") },
                new { alias = "latitude", value = (object)latitude },
                new { alias = "longitude", value = (object)longitude },
                new { alias = "facilities", value = (object)"[\"Aire Acondicionado\",\"Parqueo\",\"Apto para Niños\"]" },
                new { alias = "source", value = (object)"agent" },
            ];

            UmbracoClient.ChildDocument? match = existing.FirstOrDefault(c =>
                c.Name.Equals(site.Name, StringComparison.OrdinalIgnoreCase));
            if (match is null)
            {
                await umbraco.CreateDocumentAsync(companyId, placeTypeId, site.Name, values);
                Console.WriteLine($"  + branch {site.Name}");
            }
            else
            {
                await umbraco.UpdateDocumentAsync(match.Id, site.Name, values);
                Console.WriteLine($"  ~ branch {site.Name}");
            }
        }
    }

    private async Task SyncMoviesAsync(Guid cinesId)
    {
        // Union of every configured cinema's catalog (each site lists its own copy).
        var catalog = new Dictionary<string, CinemaMovie>(StringComparer.OrdinalIgnoreCase);
        foreach (CinemaSiteConfig siteConfig in config.Sites)
        {
            foreach (CinemaMovie movie in await caribbean.GetMoviesAsync(siteConfig.Id))
            {
                catalog.TryAdd(movie.Name, movie);
            }
        }

        if (catalog.Count == 0)
        {
            Console.Error.WriteLine("  ! Caribbean returned no movies; leaving existing catalog untouched");
            return;
        }

        Guid movieTypeId = await umbraco.GetDocumentTypeIdAsync("Movie");
        List<UmbracoClient.ChildDocument> existing =
            [.. (await umbraco.GetChildrenAsync(cinesId)).Where(c => c.DocumentTypeId == movieTypeId)];
        var seen = new HashSet<Guid>();

        foreach (CinemaMovie movie in catalog.Values)
        {
            UmbracoClient.ChildDocument? match = existing.FirstOrDefault(c =>
                c.Name.Equals(movie.Name, StringComparison.OrdinalIgnoreCase));

            string? trailerId = await trailers.FindAsync(movie.Name) ?? movie.TrailerYoutubeId;

            object[] values =
            [
                new { alias = "synopsis", value = (object)StripHtml(movie.Synopsis ?? "") },
                new { alias = "posterUrl", value = (object)(movie.PosterImage is { } p
                    ? $"https://indy-systems.imgix.net/{p}?w=342&auto=format" : "") },
                new { alias = "trailerYoutubeId", value = (object)(trailerId ?? "") },
                new { alias = "genre", value = (object)(movie.Genre ?? "") },
                new { alias = "rating", value = (object)(movie.Rating ?? "") },
                new { alias = "duration", value = (object)(movie.Duration?.ToString() ?? "") },
                new { alias = "caribbeanSlug", value = (object)movie.UrlSlug },
            ];

            try
            {
                if (match is null)
                {
                    seen.Add(await umbraco.CreateDocumentAsync(cinesId, movieTypeId, movie.Name, values));
                    Console.WriteLine($"  + movie {movie.Name}" + (trailerId is null ? " (no trailer)" : ""));
                }
                else
                {
                    seen.Add(match.Id);
                    await umbraco.UpdateDocumentAsync(match.Id, movie.Name, values);
                    Console.WriteLine($"  ~ movie {movie.Name}");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! movie {movie.Name} failed: {ex.Message}");
            }
        }

        foreach (UmbracoClient.ChildDocument stale in existing.Where(c => !seen.Contains(c.Id)))
        {
            await umbraco.DeleteDocumentAsync(stale.Id);
            Console.WriteLine($"  - movie {stale.Name} (no longer in cartelera)");
        }
    }

    private static string StripHtml(string value) =>
        System.Text.RegularExpressions.Regex.Replace(value, "<[^>]+>", string.Empty).Trim();
}
