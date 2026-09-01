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
          dotnet user-secrets set "Anthropic:ApiKey" "<anthropic-api-key>"
        """);
    return 1;
}

bool discoveryEnabled =
    !string.IsNullOrEmpty(config.Google.ApiKey) && !string.IsNullOrEmpty(config.Anthropic.ApiKey);
if (!discoveryEnabled && config.Runs.Count > 0)
{
    Console.WriteLine("Google/Anthropic keys not configured — skipping discovery runs.");
}

using var http = new HttpClient();
var google = new GooglePlacesClient(http, config.Google.ApiKey);
var claude = new ClaudeClient(http, config.Anthropic.ApiKey, config.Anthropic.Model);
var umbraco = new UmbracoClient(http, config.Umbraco);

Dictionary<string, Guid> knownPlaceIds = await umbraco.GetKnownGooglePlaceIdsAsync();
Console.WriteLine($"Known places in CMS: {knownPlaceIds.Count}");

var created = 0;
foreach (RunConfig run in discoveryEnabled ? config.Runs : [])
{
    Console.WriteLine($"\n== Run: \"{run.Query}\" -> {run.ParentPath}");

    (Guid Id, string Name)? parent = await umbraco.GetContentByPathAsync(run.ParentPath);
    if (parent is null)
    {
        Console.Error.WriteLine($"  Parent path not found in CMS, skipping: {run.ParentPath}");
        continue;
    }

    List<DiscoveredPlace> places = await google.SearchAsync(run.Query, run.MaxPlaces);
    Console.WriteLine($"  Google returned {places.Count} places");

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
            Enrichment enrichment = await claude.EnrichAsync(place);
            Guid id = await umbraco.CreatePlaceAsync(parent.Value.Id, place, enrichment);
            knownPlaceIds[place.GooglePlaceId] = id;
            created++;
            string state = config.Umbraco.PublishImmediately ? "published" : "draft";
            Console.WriteLine($"  + {place.Name} ({state}, {id})");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! {place.Name} failed: {ex.Message}");
        }
    }
}

Console.WriteLine($"\nDone. Created {created} place(s)" +
    (config.Umbraco.PublishImmediately ? "." : " as drafts — review and publish them in the backoffice."));

if (config.Cinemas.Enabled && config.Cinemas.Sites.Count > 0)
{
    var cinemaSync = new CinemaSync(
        umbraco, new CaribbeanCinemasClient(http), new YoutubeTrailerFinder(http), config.Cinemas);
    await cinemaSync.RunAsync();
}

return 0;
