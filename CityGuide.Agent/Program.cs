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

// Every external request goes through the throttler: minimum interval + jitter
// per host, so no portal or API ever sees a burst. Slow but never blocked.
using var http = new HttpClient(new ThrottlingHandler(
    TimeSpan.FromSeconds(config.Throttle.SecondsBetweenRequests),
    new Uri(config.Umbraco.BaseUrl).Host));
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
foreach (RunConfig run in discoveryEnabled ? config.Runs : [])
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

    List<DiscoveredPlace> places = await google.SearchAsync(query, run.MaxPlaces);
    Console.WriteLine($"  Google returned {places.Count} places");

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

    foreach (DiscoveredPlace place in places)
    {
        if (knownPlaceIds.TryGetValue(place.GooglePlaceId, out Guid existingId))
        {
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
            Enrichment enrichment = await enricher!.EnrichAsync(place, categoryPrompt);

            Guid targetParentId = parent.Value.Id;
            string? cuisine = subcategories is null ? null : CuisineMap.SubcategoryFor(place.Types);
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

            Guid id = await umbraco.CreatePlaceAsync(targetParentId, place, enrichment);
            knownPlaceIds[place.GooglePlaceId] = id;
            created++;
            string state = config.Umbraco.PublishImmediately ? "published" : "draft";
            Console.WriteLine($"  + {place.Name}{(cuisine is null ? "" : $" → {cuisine}")} ({state}, {id})");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! {place.Name} failed: {ex.Message}");
        }
    }
}

Console.WriteLine($"\nDone. Created {created} place(s)" +
    (config.Umbraco.PublishImmediately ? "." : " as drafts — review and publish them in the backoffice."));

// Rating backfill: refresh the Google rating of every published place. Places
// without a stored googlePlaceId (e.g. seeded content) are matched by name and
// address near their coordinates, and the found place id is stored for next runs.
if (!string.IsNullOrEmpty(config.Google.ApiKey))
{
    Console.WriteLine("\n== Rating backfill");
    foreach (UmbracoClient.PublishedPlace place in await umbraco.GetPublishedPlacesAsync())
    {
        if (place.Latitude == 0 && place.Longitude == 0)
        {
            continue;
        }

        try
        {
            GooglePlacesClient.RatingLookup? found = place.GooglePlaceId is not null
                ? await google.GetRatingByIdAsync(place.GooglePlaceId)
                : await google.FindRatingNearAsync(
                    place.Name, place.Address, place.Latitude, place.Longitude);
            if (found?.Rating is not double foundRating)
            {
                Console.WriteLine($"  ? {place.Name}: sin match en Google, omitido");
                continue;
            }

            bool updated = await umbraco.UpdatePlaceRatingAsync(
                place.Id, foundRating, found.UserRatingCount ?? 0,
                place.GooglePlaceId is null ? found.GooglePlaceId : null);
            Console.WriteLine(
                $"  {(updated ? "*" : "=")} {place.Name}: ★ {foundRating:0.0} ({found.UserRatingCount ?? 0})"
                + (place.GooglePlaceId is null ? $" ← \"{found.Name}\"" : ""));
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! {place.Name}: {ex.Message}");
        }
    }
}

// Daily job: one sync failing must not stop the others.
int failures = 0;
if (config.Cinemas.Enabled && config.Cinemas.Sites.Count > 0)
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

if (config.Events.Enabled && config.Events.Sources.Count > 0)
{
    try
    {
        await new EventSync(http, umbraco, config.Events).RunAsync();
    }
    catch (Exception ex)
    {
        failures++;
        Console.Error.WriteLine($"\n! Event sync failed: {ex.Message}");
    }
}

return failures == 0 ? 0 : 1;
