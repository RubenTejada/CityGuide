using CityGuide.Agent;
using Microsoft.Extensions.Configuration;

AgentConfig config = new ConfigurationBuilder()
    .SetBasePath(AppContext.BaseDirectory)
    .AddJsonFile("appsettings.json")
    .AddUserSecrets<AgentConfig>(optional: true)
    .AddEnvironmentVariables()
    .Build()
    .Get<AgentConfig>() ?? new AgentConfig();

if (string.IsNullOrEmpty(config.Umbraco.ClientSecret))
{
    Console.Error.WriteLine("""
        Missing configuration. Set via user-secrets or environment variables:
          dotnet user-secrets set "Umbraco:ClientId" "umbraco-back-office-<api-user-name>"
          dotnet user-secrets set "Umbraco:ClientSecret" "<api-user-secret>"
        The Umbraco API user is created in the backoffice: Users → API Users → Create.
        Optional, needed only for the Google-discovery Runs:
          dotnet user-secrets set "Google:ApiKey" "<google-places-api-key>"
        The enrichment model is Azure OpenAI (AzureOpenAI:Endpoint in appsettings.json,
        keyless auth via "az login" locally / managed identity in Azure), with
        Anthropic:ApiKey as fallback provider.
        """);
    return 1;
}

// --section limits the run to one part of the site ("--section eventos",
// "--section restaurantes", repeatable or comma-separated). A slug matches when
// it is any segment of a Run's ParentPath, so both a category ("tiendas") and a
// subcategory ("farmacias") work; "cines" and "eventos" select those syncs.
// Without it every run and sync executes, as before.
var sections = new HashSet<string>(
    args.SkipWhile(a => a != "--section").Skip(1).Take(1)
        .SelectMany(a => a.Split(',', StringSplitOptions.RemoveEmptyEntries))
        .Select(a => a.Trim()),
    StringComparer.OrdinalIgnoreCase);
bool SectionSelected(string path) => sections.Count == 0
    || path.Trim('/').Split('/').Any(sections.Contains);
if (sections.Count > 0)
{
    Console.WriteLine($"Secciones seleccionadas: {string.Join(", ", sections)}");
}

// Every external request goes through the throttler: minimum interval + jitter
// per host, so no portal or API ever sees a burst. Slow but never blocked.
using var http = new HttpClient(new ThrottlingHandler(
    TimeSpan.FromSeconds(config.Throttle.SecondsBetweenRequests),
    new Uri(config.Umbraco.BaseUrl).Host))
{
    // Azure OpenAI stalls requests well past the 100s default when the
    // deployment is over its tokens-per-minute quota; give them room.
    Timeout = TimeSpan.FromMinutes(5),
};
var google = new GooglePlacesClient(http, config.Google.ApiKey);
var umbraco = new UmbracoClient(http, config.Umbraco);

// Enrichment (the only LLM step): prefer Azure OpenAI, fall back to Anthropic.
IEnrichmentClient? enricher = !string.IsNullOrEmpty(config.AzureOpenAI.Endpoint)
    ? new AzureOpenAiClient(http, config.AzureOpenAI)
    : !string.IsNullOrEmpty(config.Anthropic.ApiKey)
        ? new ClaudeClient(http, config.Anthropic.ApiKey, config.Anthropic.Model)
        : null;
Console.WriteLine($"Enrichment model: {enricher switch
{
    AzureOpenAiClient => $"Azure OpenAI ({config.AzureOpenAI.Deployment})",
    ClaudeClient => $"Anthropic ({config.Anthropic.Model})",
    _ => "none",
}}");

bool discoveryEnabled = !string.IsNullOrEmpty(config.Google.ApiKey) && enricher is not null;
if (!discoveryEnabled && config.Runs.Count > 0)
{
    Console.WriteLine("Google key or enrichment model not configured — skipping discovery runs.");
}

// Per-city agent config from the CMS ("Agente" tab on the city node), cached per city slug.
var cityConfigs = new Dictionary<string, UmbracoClient.CityAgentConfig?>(StringComparer.OrdinalIgnoreCase);
async Task<UmbracoClient.CityAgentConfig?> CityConfigAsync(string citySlug)
{
    if (!cityConfigs.TryGetValue(citySlug, out UmbracoClient.CityAgentConfig? cached))
    {
        cached = await umbraco.GetCityAgentConfigAsync($"/{citySlug}");
        cityConfigs[citySlug] = cached;
    }

    return cached;
}

// Diagnostic: scrape the configured event sources and print, without touching the CMS.
if (args.Contains("--scrape-events"))
{
    var scraper = new EventSync(http, umbraco, config.Events);
    foreach (EventSourceConfig source in config.Events.Sources)
    {
        try
        {
            List<ScrapedEvent> scraped = await scraper.ScrapeSourceAsync(source);
            Console.WriteLine($"\n== {source.Name}: {scraped.Count} eventos futuros");
            foreach (ScrapedEvent ev in scraped.Take(5))
            {
                Console.WriteLine($"  {ev.Start:yyyy-MM-dd HH:mm}  {ev.Name}  [{ev.Venue}]  {ev.Url}");
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"\n== {source.Name} FAILED: {ex.Message}");
        }
    }

    return 0;
}

Dictionary<string, Guid> knownPlaceIds = await umbraco.GetKnownGooglePlaceIdsAsync();
Console.WriteLine($"Known places in CMS: {knownPlaceIds.Count}");

var created = 0;

// Subtrees already scanned for draft places, so the overlapping runs that share a
// parent path walk it once between them.
var scannedParents = new HashSet<Guid>();

foreach (RunConfig run in discoveryEnabled ? config.Runs.Where(r => SectionSelected(r.ParentPath)) : [])
{
    // /santo-domingo/bares-y-clubes → city slug "santo-domingo", category slug "bares-y-clubes".
    string[] segments = run.ParentPath.Trim('/').Split('/');
    UmbracoClient.CityAgentConfig? cityConfig = segments.Length > 0 ? await CityConfigAsync(segments[0]) : null;
    string query = run.Query.Replace("{city}", cityConfig?.CityName ?? segments[0].Replace('-', ' '));
    string? categoryPrompt = segments.Length > 1 && cityConfig is not null
        && cityConfig.CategoryPrompts.TryGetValue(segments[1], out string? prompt)
        ? prompt
        : null;

    Console.WriteLine($"\n== Run: \"{query}\" -> {run.ParentPath}"
        + (categoryPrompt is null ? "" : " (con prompt de categoría)"));

    (Guid Id, string Name)? parent = await umbraco.GetContentByPathAsync(run.ParentPath);
    if (parent is null)
    {
        Console.Error.WriteLine($"  Parent path not found in CMS, skipping: {run.ParentPath}");
        continue;
    }

    // The baseline above lists published places only. The agent creates places as
    // drafts, so without this every draft from an earlier run looks new and is
    // created again. Published ids win, keeping the rating refresh on the live node.
    if (scannedParents.Add(parent.Value.Id))
    {
        Dictionary<string, Guid> drafts = await umbraco.GetDescendantPlaceIdsAsync(parent.Value.Id);
        var added = 0;
        foreach ((string googlePlaceId, Guid id) in drafts)
        {
            if (knownPlaceIds.TryAdd(googlePlaceId, id))
            {
                added++;
            }
        }

        if (added > 0)
        {
            Console.WriteLine($"  {added} lugar(es) sin publicar ya existentes bajo {run.ParentPath}");
        }
    }

    List<DiscoveredPlace> places = await google.SearchAsync(query, run.MaxPlaces, cityConfig?.Area);
    Console.WriteLine($"  Google returned {places.Count} places");
    var runCreated = 0;
    var runSkipped = 0;

    // AutoCategorize: existing cuisine subcategories under this category, by name.
    Dictionary<string, Guid>? subcategories = null;
    Guid subcategoryTypeId = default;
    if (run.AutoCategorize)
    {
        subcategoryTypeId = await umbraco.GetDocumentTypeIdAsync("Subcategory");
        subcategories = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(parent.Value.Id))
        {
            if (child.DocumentTypeId == subcategoryTypeId)
            {
                subcategories[child.Name] = child.Id;
            }
        }
    }

    // Chains (banks, supermarkets, pharmacies) keep one "company" node per brand
    // with the logo and general info, and their branches as child places. Discovered
    // branches must land under that node, never flat under the category, or they lose
    // the logo the frontend inherits. Run.CompanyName pins the target explicitly;
    // otherwise a place whose name contains a company's name is nested under it.
    Guid companyTypeId = await umbraco.GetDocumentTypeIdAsync("Company");
    var companies = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
    foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(parent.Value.Id))
    {
        if (child.DocumentTypeId == companyTypeId)
        {
            companies[child.Name] = child.Id;
        }
    }

    Guid? pinnedCompanyId = null;
    if (!string.IsNullOrWhiteSpace(run.CompanyName))
    {
        pinnedCompanyId = companies
            .Where(c => TextMatch.Matches(run.CompanyName, c.Key, 1.0))
            .Select(c => (Guid?)c.Value)
            .FirstOrDefault();
        if (pinnedCompanyId is null)
        {
            Console.Error.WriteLine(
                $"  Empresa '{run.CompanyName}' no existe bajo {run.ParentPath} — "
                + "créala en el backoffice (con su logo) antes de importar sus sucursales. Run omitido.");
            continue;
        }
    }

    foreach (DiscoveredPlace place in places)
    {
        if (knownPlaceIds.TryGetValue(place.GooglePlaceId, out Guid existingId))
        {
            runSkipped++;
            if (place.Rating is double rating)
            {
                try
                {
                    bool updated = await umbraco.UpdatePlaceRatingAsync(
                        existingId, rating, place.UserRatingCount ?? 0);
                    Console.WriteLine($"  = {place.Name} ({(updated ? "rating refreshed" : "already in CMS, skipped")})");
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"  ! {place.Name} rating refresh failed: {ex.Message}");
                }
            }
            else
            {
                Console.WriteLine($"  = {place.Name} (already in CMS, skipped)");
            }

            continue;
        }

        try
        {
            // Branches inherit description/phone/website/hours from their company,
            // so they cost no LLM tokens.
            Guid? companyId = pinnedCompanyId ?? companies
                .Where(c => TextMatch.Matches(c.Key, place.Name, 1.0))
                .Select(c => (Guid?)c.Value)
                .FirstOrDefault();
            Enrichment? enrichment = companyId is null
                ? await enricher!.EnrichAsync(place, categoryPrompt)
                : null;

            // Main image: first Google photo, uploaded to the Media library.
            // Photo failures never block creating the place.
            Guid? photoKey = null;
            if (place.PhotoName is not null)
            {
                try
                {
                    (byte[] Bytes, string ContentType)? image = await google.DownloadPhotoAsync(place.PhotoName);
                    if (image is not null)
                    {
                        photoKey = await umbraco.CreateMediaImageAsync(
                            place.Name, image.Value.Bytes, image.Value.ContentType);
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"  ! foto de {place.Name}: {ex.Message}");
                }
            }

            Guid targetParentId = companyId ?? parent.Value.Id;
            string? cuisine = companyId is not null || subcategories is null
                ? null
                : CuisineMap.SubcategoryFor(place.Types);
            if (cuisine is not null)
            {
                if (!subcategories!.TryGetValue(cuisine, out Guid subcategoryId))
                {
                    subcategoryId = await umbraco.CreateDocumentAsync(
                        parent.Value.Id, subcategoryTypeId, cuisine, []);
                    subcategories[cuisine] = subcategoryId;
                    Console.WriteLine($"  + subcategoría '{cuisine}'");
                }

                targetParentId = subcategoryId;
            }

            string? companyName = companyId is null
                ? null
                : companies.First(c => c.Value == companyId).Key;
            Guid id = await umbraco.CreatePlaceAsync(
                targetParentId, place, enrichment, photoKey, companyName);
            knownPlaceIds[place.GooglePlaceId] = id;
            created++;
            runCreated++;
            string state = config.Umbraco.PublishImmediately ? "published" : "draft";
            string target = companyName is not null
                ? $" (sucursal de {companyName})"
                : cuisine is null ? "" : $" → {cuisine}";
            Console.WriteLine($"  + {place.Name}{target} ({state}, {id})");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! {place.Name} failed: {ex.Message}");
        }
    }

    // Queries overlap on purpose (a broad one plus per-sector and per-cuisine
    // ones): the skipped count is how much of this run the others already had.
    Console.WriteLine($"  Run: {runCreated} nuevos, {runSkipped} ya en el CMS");
}

Console.WriteLine($"\nDone. Created {created} place(s)" +
    (config.Umbraco.PublishImmediately ? "." : " as drafts — review and publish them in the backoffice."));

// Rating and photo backfill. Places without a stored googlePlaceId (e.g. seeded
// content) are matched by name and address near their coordinates, and the found
// place id is stored for next runs. "mall" nodes (plazas comerciales) carry the
// same coordinates and photo but no rating properties, so they get the photo only.
if (!string.IsNullOrEmpty(config.Google.ApiKey))
{
    Console.WriteLine("\n== Rating & photo backfill");

    // A branch stores only its own name ("Sucursal Zona Colonial"), which on its own
    // matches nothing on Google: the query needs the chain it belongs to. Longest path
    // first so a company nested under another wins over its ancestor.
    List<UmbracoClient.PublishedPlace> companyNodes = await umbraco.GetPublishedPlacesAsync("company");
    companyNodes.Sort((a, b) => b.Path.Length.CompareTo(a.Path.Length));
    string? CompanyOf(string path) => companyNodes
        .FirstOrDefault(c => path.StartsWith(c.Path, StringComparison.OrdinalIgnoreCase))?.Name;

    foreach (string contentType in new[] { "place", "mall" })
    {
        foreach (UmbracoClient.PublishedPlace node in await umbraco.GetPublishedPlacesAsync(contentType))
        {
            if ((node.Latitude == 0 && node.Longitude == 0) || !SectionSelected(node.Path))
            {
                continue;
            }

            try
            {
                string searchName = CompanyOf(node.Path) is { } company
                    && !TextMatch.Matches(company, node.Name, 1.0)
                    ? $"{company} {node.Name}"
                    : node.Name;
                GooglePlacesClient.RatingLookup? found = node.GooglePlaceId is not null
                    ? await google.GetRatingByIdAsync(node.GooglePlaceId)
                    : await google.FindRatingNearAsync(
                        searchName, node.Address, node.Latitude, node.Longitude);
                if (found is null)
                {
                    Console.WriteLine($"  ? {node.Name}: sin match en Google, omitido");
                    continue;
                }

                bool updated = false;
                if (contentType == "place" && found.Rating is double foundRating)
                {
                    updated = await umbraco.UpdatePlaceRatingAsync(
                        node.Id, foundRating, found.UserRatingCount ?? 0,
                        node.GooglePlaceId is null ? found.GooglePlaceId : null);
                }

                // Photo backfill: nodes without a main image (seeded atracciones,
                // bares, plazas comerciales) get their first Google photo.
                bool photoAdded = false;
                if (!node.HasPhoto && found.PhotoName is not null)
                {
                    try
                    {
                        (byte[] Bytes, string ContentType)? image = await google.DownloadPhotoAsync(found.PhotoName);
                        if (image is not null)
                        {
                            Guid mediaKey = await umbraco.CreateMediaImageAsync(
                                node.Name, image.Value.Bytes, image.Value.ContentType);
                            await umbraco.SetPhotoAsync(node.Id, mediaKey);
                            photoAdded = true;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine($"  ! foto de {node.Name}: {ex.Message}");
                    }
                }

                Console.WriteLine(
                    $"  {(updated || photoAdded ? "*" : "=")} {node.Name}"
                    + (found.Rating is double r ? $": ★ {r:0.0} ({found.UserRatingCount ?? 0})" : "")
                    + (photoAdded ? " +foto" : "")
                    + (node.GooglePlaceId is null ? $" ← \"{found.Name}\"" : ""));
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! {node.Name}: {ex.Message}");
            }
        }
    }
}

// Daily job: one sync failing must not stop the others.
int failures = 0;
if (config.Cinemas.Enabled && config.Cinemas.Sites.Count > 0 && SectionSelected($"{config.Cinemas.CityPath}/cines"))
{
    try
    {
        var cinemaSync = new CinemaSync(
            umbraco, new CaribbeanCinemasClient(http), new YoutubeTrailerFinder(http), config.Cinemas);
        await cinemaSync.RunAsync();
    }
    catch (Exception ex)
    {
        failures++;
        Console.Error.WriteLine($"\n! Cinema sync failed: {ex.Message}");
    }
}

if (config.Events.Enabled && config.Events.Sources.Count > 0 && SectionSelected($"{config.Events.CityPath}/eventos"))
{
    try
    {
        await new EventSync(http, umbraco, config.Events, google).RunAsync();
    }
    catch (Exception ex)
    {
        failures++;
        Console.Error.WriteLine($"\n! Event sync failed: {ex.Message}");
    }
}

return failures == 0 ? 0 : 1;
