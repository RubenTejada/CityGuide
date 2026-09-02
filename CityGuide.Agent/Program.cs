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

// --publish releases the drafts the agent left in the selected sections when the run
// ends: everything unpublished below the parent path of each selected Run, this pass's
// creations and the ones earlier passes left for review alike. Drafts in every other
// section stay drafts, which is why it only works together with --section.
bool publishSections = args.Contains("--publish");
if (publishSections && sections.Count == 0)
{
    Console.Error.WriteLine(
        "--publish requiere --section: sin ella publicaría el sitio entero. "
        + "Ejemplo: dotnet run -- --section restaurantes --publish");
    return 1;
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

// Diagnostic: scrape the configured event sources and print what each yields, plus
// whether the city filter would keep it. Reads the city node and Google; writes nothing.
if (args.Contains("--scrape-events"))
{
    await new EventSync(http, umbraco, config.Events, google, enricher).ReportSourcesAsync();
    return 0;
}

// Maintenance pass: send to the recycle bin the events imported from a portal the
// sync no longer scrapes ("--purge-event-source TicketExpress"). Plan until --apply.
if (args.Contains("--purge-event-source"))
{
    string? source = args.SkipWhile(a => a != "--purge-event-source").Skip(1).FirstOrDefault();
    if (string.IsNullOrWhiteSpace(source) || source.StartsWith("--", StringComparison.Ordinal))
    {
        Console.Error.WriteLine(
            "--purge-event-source requiere el nombre de la fuente, tal como aparece en "
            + "Events:Sources. Ejemplo: dotnet run -- --purge-event-source TicketExpress");
        return 1;
    }

    await new EventSync(http, umbraco, config.Events, google, enricher)
        .PurgeSourceAsync(source, args.Contains("--apply"));
    return 0;
}

// Maintenance pass: recategorize the events the agent already created — the sync
// left them without a category until it learned to ask for one, and a startup of
// the CMS stamped every category-less event as "Gastronomía". Prints the plan and
// changes nothing without --apply.
if (args.Contains("--recategorize-events"))
{
    await new EventSync(http, umbraco, config.Events, google, enricher)
        .RecategorizeAsync(args.Contains("--apply"));
    return 0;
}

// Maintenance pass: the events the agent imported before it asked where they happen.
// Every ticket portal lists the whole country, so the section filled up with Santiago,
// Higüey and Punta Cana; each venue is looked up inside the city rectangle and the ones
// that are not there go to the recycle bin. Prints the plan without --apply.
if (args.Contains("--purge-foreign-events"))
{
    await new EventSync(http, umbraco, config.Events, google, enricher)
        .PurgeForeignAsync(args.Contains("--apply"));
    return 0;
}

// Plazas comerciales of a city, drafts included: the run that creates them says
// where they live (its ParentPath), so nothing here has to know the section slug.
// Cached per city — every shops run asks for the same list.
var mallsByCity = new Dictionary<string, List<KnownMall>>(StringComparer.OrdinalIgnoreCase);

string? MallsPathOf(string citySlug) => config.Runs
    .FirstOrDefault(r => r.CreatesMalls
        && r.ParentPath.Trim('/').Split('/').FirstOrDefault() == citySlug)?.ParentPath;

async Task<List<KnownMall>> MallsAsync(string citySlug)
{
    if (mallsByCity.TryGetValue(citySlug, out List<KnownMall>? cached))
    {
        return cached;
    }

    var malls = new List<KnownMall>();
    mallsByCity[citySlug] = malls;
    if (MallsPathOf(citySlug) is not string mallsPath
        || await umbraco.GetContentByPathAsync(mallsPath) is not { } mallsParent)
    {
        return malls;
    }

    Guid mallTypeId = await umbraco.GetMallDocumentTypeIdAsync();
    foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(mallsParent.Id))
    {
        if (child.DocumentTypeId != mallTypeId)
        {
            continue;
        }

        UmbracoClient.PlaceDetail detail = await umbraco.GetPlaceDetailAsync(child.Id);
        malls.Add(new KnownMall(child.Id, child.Name, detail.Latitude, detail.Longitude));
    }

    Console.WriteLine($"Plazas comerciales de {citySlug}: {malls.Count}");
    return malls;
}

// Lists under each plaza every published place that sits inside it but lives elsewhere
// in the tree — a bank branch under its company, a restaurant under its cuisine, a
// cinema under Caribbean Cinemas. The node keeps its single home; the plaza only gains
// a reference. Runs at the end of every ingestion pass (what the agent just created as
// a draft is linked when it is created; this covers everything already published, from
// any source) and on its own through --link-malls.
async Task<int> LinkEstablishmentsAsync(bool apply)
{
    var linked = 0;
    foreach (string citySlug in config.Runs
        .Select(r => r.ParentPath.Trim('/').Split('/').First())
        .Distinct(StringComparer.OrdinalIgnoreCase))
    {
        List<KnownMall> cityMalls = await MallsAsync(citySlug);
        if (cityMalls.Count == 0)
        {
            continue;
        }

        var mallPaths = new Dictionary<Guid, string>();
        foreach (UmbracoClient.PublishedPlace mall in await umbraco.GetPublishedPlacesAsync("mall"))
        {
            mallPaths[mall.Id] = mall.Path;
        }

        // A branch of a chain is never a plaza, however Caribbean Cinemas named it.
        List<UmbracoClient.PublishedPlace> companyNodes = await umbraco.GetPublishedPlacesAsync("company");
        bool IsBranch(string path) => companyNodes
            .Any(c => path.StartsWith(c.Path, StringComparison.OrdinalIgnoreCase));

        // What each plaza already lists, so only what is missing is reported or written.
        var listed = new Dictionary<Guid, HashSet<Guid>>();
        foreach (KnownMall mall in cityMalls)
        {
            listed[mall.Id] = [.. await umbraco.GetMallEstablishmentsAsync(mall.Id)];
        }

        foreach (UmbracoClient.PublishedPlace node in await umbraco.GetPublishedPlacesAsync("place"))
        {
            if (!node.Path.Trim('/').StartsWith(citySlug, StringComparison.OrdinalIgnoreCase)
                || (node.Latitude == 0 && node.Longitude == 0)
                || !SectionSelected(node.Path))
            {
                continue;
            }

            if (MallMatching.Containing(
                    node.Name, node.Address, node.Latitude, node.Longitude, cityMalls,
                    IsBranch(node.Path)) is not { } mall)
            {
                continue;
            }

            // What already lives under the plaza is on its page through the tree.
            if (mallPaths.TryGetValue(mall.Id, out string? mallPath)
                && node.Path.StartsWith(mallPath, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (listed.TryGetValue(mall.Id, out HashSet<Guid>? already) && already.Contains(node.Id))
            {
                continue;
            }

            if (!apply)
            {
                linked++;
                Console.WriteLine($"  + {node.Name} -> {mall.Name}");
                continue;
            }

            try
            {
                if (await umbraco.AddMallEstablishmentAsync(mall.Id, node.Id))
                {
                    linked++;
                    Console.WriteLine($"  + {node.Name} -> {mall.Name}");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! {node.Name} -> {mall.Name}: {ex.Message}");
            }
        }
    }

    return linked;
}

// The same pass on its own, so a plaza can be filled in without an ingestion run.
if (args.Contains("--link-malls"))
{
    bool applyLinks = args.Contains("--apply");
    Console.WriteLine(applyLinks
        ? "== Enlazando establecimientos a su plaza"
        : "== Establecimientos por enlazar a su plaza (simulación; agrega --apply)");
    int count = await LinkEstablishmentsAsync(applyLinks);
    Console.WriteLine($"\n{count} establecimiento(s) {(applyLinks ? "enlazados" : "por enlazar")}.");
    return 0;
}

// Maintenance: fold one plaza into another ("--merge-mall <origen> <destino>"), for the
// pair the matcher cannot unify on its own — Google's name for a plaza the CMS already
// has under another ("Acrópolis Business Mall" beside "Acrópolis Center"). Same rule as
// every other pass here: nothing is written without --apply.
if (args.Contains("--merge-mall"))
{
    string[] names = [.. args.SkipWhile(a => a != "--merge-mall").Skip(1).Take(2)];
    if (names.Length < 2 || names.Any(n => n.StartsWith("--", StringComparison.Ordinal)))
    {
        Console.Error.WriteLine(
            "--merge-mall necesita dos nombres: el que sobra y el que se queda. "
            + "Ejemplo: dotnet run -- --merge-mall \"Acrópolis Business Mall\" \"Acrópolis Center\"");
        return 1;
    }

    bool applyMerge = args.Contains("--apply");
    foreach (string citySlug in config.Runs
        .Select(r => r.ParentPath.Trim('/').Split('/').First())
        .Distinct(StringComparer.OrdinalIgnoreCase))
    {
        List<KnownMall> cityMalls = await MallsAsync(citySlug);
        KnownMall? Find(string name) => cityMalls
            .FirstOrDefault(m => string.Equals(m.Name, name, StringComparison.OrdinalIgnoreCase));

        if (Find(names[0]) is not { } from || Find(names[1]) is not { } into)
        {
            continue;
        }

        Console.WriteLine(applyMerge
            ? $"Fundiendo '{from.Name}' en '{into.Name}'"
            : $"Se fundiría '{from.Name}' en '{into.Name}' (simulación; agrega --apply)");
        if (applyMerge)
        {
            int moved = await umbraco.MergeMallAsync(from.Id, into.Id);
            Console.WriteLine(
                $"  {moved} elemento(s) movido(s); '{from.Name}' a la papelera, "
                + $"y '{into.Name}' se quedó con los datos que le faltaban.");
        }

        return 0;
    }

    Console.Error.WriteLine(
        $"No encontré ambas plazas ('{names[0]}' y '{names[1]}') bajo la misma ciudad.");
    return 1;
}

// Maintenance: move one node under another parent ("--move-place <ruta> <ruta padre>"),
// for the file-away no rule can decide — an establishment an earlier pass parented to a
// plaza, whose real section only a human knows ("Carrefour" is a supermarket, and
// nothing stored on the node says so). The plaza it leaves keeps showing it: the
// reference goes in on the way out. Nothing is written without --apply.
if (args.Contains("--move-place"))
{
    string[] paths = [.. args.SkipWhile(a => a != "--move-place").Skip(1).Take(2)];
    if (paths.Length < 2 || paths.Any(p => p.StartsWith("--", StringComparison.Ordinal)))
    {
        Console.Error.WriteLine(
            "--move-place necesita dos rutas: la del nodo y la de su nuevo padre. Ejemplo: "
            + "dotnet run -- --move-place "
            + "/santo-domingo/tiendas/plazas-comerciales-y-malls/plaza-duarte/carrefour "
            + "/santo-domingo/tiendas/supermercados");
        return 1;
    }

    if (await umbraco.GetContentByPathAsync(paths[0]) is not { } node)
    {
        Console.Error.WriteLine($"No encontré '{paths[0]}'.");
        return 1;
    }

    if (await umbraco.GetContentByPathAsync(paths[1]) is not { } destination)
    {
        Console.Error.WriteLine($"No encontré el destino '{paths[1]}'.");
        return 1;
    }

    // The plaza it hangs from today, if any: its page would lose the establishment
    // with the move, so it gains the reference that keeps it there.
    string trimmed = paths[0].TrimEnd('/');
    (Guid Id, string Name)? currentParent =
        await umbraco.GetContentByPathAsync(trimmed[..trimmed.LastIndexOf('/')]);
    KnownMall? mall = currentParent is { } parentNode
        ? (await MallsAsync(trimmed.Trim('/').Split('/').First()))
            .FirstOrDefault(m => m.Id == parentNode.Id)
        : null;

    bool applyMove = args.Contains("--apply");
    Console.WriteLine(applyMove
        ? $"Moviendo '{node.Name}' a {paths[1]}"
        : $"Se movería '{node.Name}' a {paths[1]} (simulación; agrega --apply)");
    if (mall is not null)
    {
        Console.WriteLine($"  '{mall.Name}' lo seguirá listando por referencia");
    }

    if (applyMove)
    {
        await umbraco.MoveDocumentAsync(node.Id, destination.Id);
        if (mall is not null)
        {
            await umbraco.AddMallEstablishmentAsync(mall.Id, node.Id);
        }
    }

    return 0;
}

// Maintenance pass over the shops section: recreate with the "mall" type the plazas
// stored as one more shop, and send to the recycle bin the plaza duplicates the agent
// made. It never moves an establishment into a plaza — a place lives in the section
// that says what it is, and the plaza lists it by reference (--link-malls). Prints the
// plan and changes nothing without --apply.
if (args.Contains("--regroup-malls"))
{
    bool apply = args.Contains("--apply");
    Console.WriteLine(apply
        ? "== Revisando las plazas comerciales"
        : "== Revisión de las plazas comerciales (simulación; agrega --apply para aplicarla)");

    var duplicates = 0;
    var converted = 0;
    foreach (string citySlug in config.Runs
        .Select(r => r.ParentPath.Trim('/').Split('/').First())
        .Distinct(StringComparer.OrdinalIgnoreCase))
    {
        List<KnownMall> malls = await MallsAsync(citySlug);
        // The category the plazas live in ("/santo-domingo/tiendas"): everything
        // filed below it is a shop that may belong to one of them.
        string? mallsPath = MallsPathOf(citySlug);
        string? shopsPath = mallsPath?[..mallsPath.LastIndexOf('/')];
        if (malls.Count == 0 || shopsPath is null
            || await umbraco.GetContentByPathAsync(shopsPath) is not { } shopsParent)
        {
            continue;
        }

        Console.WriteLine($"\n-- {shopsPath}");
        Guid placeTypeId = await umbraco.GetPlaceDocumentTypeIdAsync();
        Guid companyTypeId = await umbraco.GetDocumentTypeIdAsync("Company");
        Guid mallTypeId = await umbraco.GetMallDocumentTypeIdAsync();
        var mallIds = new HashSet<Guid>(malls.Select(m => m.Id));
        // Everything filed directly under "Plazas Comerciales y Malls" is a plaza,
        // whatever type it was created as.
        Guid plazasParentId = (await umbraco.GetContentByPathAsync(mallsPath!))!.Value.Id;

        await RegroupBelowAsync(shopsParent.Id);

        async Task RegroupBelowAsync(Guid parentId)
        {
            foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(parentId))
            {
                // A company holds its own branches, and what an editor filed inside a
                // plaza is the plaza's own tenant: neither is a plaza mistaken for a shop.
                if (child.DocumentTypeId == companyTypeId
                    || child.DocumentTypeId == mallTypeId
                    || mallIds.Contains(parentId))
                {
                    continue;
                }

                if (child.DocumentTypeId != placeTypeId)
                {
                    await RegroupBelowAsync(child.Id);
                    continue;
                }

                UmbracoClient.PlaceDetail detail = await umbraco.GetPlaceDetailAsync(child.Id);
                if (MallMatching.Same(child.Name, detail.Latitude, detail.Longitude, malls) is { } twin)
                {
                    duplicates++;
                    // Only what the agent itself created goes away, and only to the
                    // recycle bin: a plaza someone typed in by hand may be the one
                    // with the good data, so it is theirs to judge.
                    bool agentMade = detail.Source?.StartsWith("agent", StringComparison.OrdinalIgnoreCase) == true;
                    Console.WriteLine($"  x {child.Name}: duplicado de la plaza '{twin.Name}'"
                        + (agentMade ? " → papelera" : " (creado a mano — revísalo tú)"));
                    if (apply && agentMade)
                    {
                        await umbraco.RecycleDocumentAsync(child.Id);
                    }

                    continue;
                }

                if (parentId == plazasParentId)
                {
                    converted++;
                    Console.WriteLine($"  ^ {child.Name}: plaza guardada como tienda → se recrea como plaza");
                    if (apply)
                    {
                        Guid mallId = await umbraco.ConvertPlaceToMallAsync(parentId, child.Id);
                        // Reachable as a plaza for the rest of this same pass.
                        malls.Add(new KnownMall(mallId, child.Name, detail.Latitude, detail.Longitude));
                        mallIds.Add(mallId);
                    }

                    continue;
                }

            }
        }
    }

    Console.WriteLine($"\n{converted} plaza(s) {(apply ? "recreadas" : "por recrear")} con su tipo, "
        + $"{duplicates} duplicado(s) de plazas.");
    return 0;
}

Dictionary<string, Guid> knownPlaceIds = await umbraco.GetKnownGooglePlaceIdsAsync();
Console.WriteLine($"Known places in CMS: {knownPlaceIds.Count}");

var created = 0;

// Subtrees already scanned for draft places, so the overlapping runs that share a
// parent path walk it once between them.
var scannedParents = new HashSet<Guid>();

// Umbraco numbers same-named siblings ("CachArepa (1)"), a name that says which one
// arrived second and nothing about which one it is. Chains reuse one name across
// locations, so the names already taken under each parent are kept here to catch the
// clash while both places can still be told apart by their address.
var siblingsByParent = new Dictionary<Guid, Dictionary<string, Guid>>();

async Task<Dictionary<string, Guid>> SiblingsAsync(Guid parentId)
{
    if (!siblingsByParent.TryGetValue(parentId, out Dictionary<string, Guid>? names))
    {
        names = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(parentId))
        {
            names[child.Name] = child.Id;
        }

        siblingsByParent[parentId] = names;
    }

    return names;
}

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

    // Plazas comerciales of this city: the shops runs file establishments inside them,
    // the plazas run uses them to recognise a plaza it already has, and every run lists
    // what it creates inside one on that plaza's page.
    List<KnownMall> malls = await MallsAsync(segments[0]);

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
        // A plaza comercial already stored as a "mall" node. Seeded plazas carry no
        // Google place id, so the dedupe above cannot see them and every pass would
        // add the plaza a second time — as a shop. Store the id on the plaza instead,
        // which is what the next pass and the rating backfill look it up by.
        if (!knownPlaceIds.ContainsKey(place.GooglePlaceId)
            && MallMatching.Same(place.Name, place.Latitude, place.Longitude, malls) is { } storedMall)
        {
            runSkipped++;
            knownPlaceIds[place.GooglePlaceId] = storedMall.Id;
            try
            {
                await umbraco.UpdatePlaceRatingAsync(
                    storedMall.Id, place.Rating ?? 0, place.UserRatingCount ?? 0, place.GooglePlaceId);
                Console.WriteLine($"  = {place.Name} (ya existe como plaza, id de Google guardado)");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! {place.Name}: {ex.Message}");
            }

            continue;
        }

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

            // The plaza this establishment sits inside, when its address says so and its
            // coordinates agree. It never becomes the parent: a place lives in the
            // section that says what it is — a bank branch under its company, a
            // supermarket under "Supermercados" — which is what lets the plaza's page
            // group its establishments by category, and what keeps it in its own
            // section's listing. The plaza only gains a reference to it.
            KnownMall? insideMall = MallMatching.Containing(
                place.Name, place.Address, place.Latitude, place.Longitude, malls);

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

            string baseName = companyName is null
                ? place.Name
                : BranchNaming.For(place.Name, place.Address, companyName);
            string name = baseName;
            Dictionary<string, Guid> siblings = await SiblingsAsync(targetParentId);
            if (siblings.TryGetValue(baseName, out Guid twinId))
            {
                // The one already there was named before this twin existed, so it
                // carries the bare name — qualify it too, or the pair still reads
                // as one place with a number stuck on it.
                try
                {
                    string qualified = PlaceNaming.Qualified(baseName, place.Address);
                    string twinName = PlaceNaming.Qualified(
                        baseName, await umbraco.GetPlaceAddressAsync(twinId));

                    // Two branches on one corner can share an address line, and then
                    // the qualifier tells them apart no better than the bare name
                    // does. Leave both alone rather than repeat one name twice.
                    if (qualified != twinName)
                    {
                        name = qualified;
                    }

                    if (twinName != baseName && twinName != name && !siblings.ContainsKey(twinName))
                    {
                        await umbraco.RenameDocumentAsync(twinId, twinName);
                        siblings.Remove(baseName);
                        siblings[twinName] = twinId;
                        Console.WriteLine($"  ~ '{baseName}' -> '{twinName}' (nombre repetido)");
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"  ! renombrar '{baseName}' existente: {ex.Message}");
                }
            }

            Guid id = await umbraco.CreatePlaceAsync(
                targetParentId, place, enrichment, photoKey, companyName, name,
                asMall: run.CreatesMalls);
            if (run.CreatesMalls)
            {
                // Reachable straight away for the shops runs that follow in this pass.
                malls.Add(new KnownMall(id, name, place.Latitude, place.Longitude));
            }

            siblings[name] = id;
            knownPlaceIds[place.GooglePlaceId] = id;
            created++;
            runCreated++;

            // Filed elsewhere but inside a plaza: the plaza's page lists it by reference,
            // so the visitor finds it both ways without a second copy of the data.
            if (insideMall is not null && targetParentId != insideMall.Id)
            {
                try
                {
                    await umbraco.AddMallEstablishmentAsync(insideMall.Id, id);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine(
                        $"  ! enlazar {place.Name} a {insideMall.Name}: {ex.Message}");
                }
            }
            string state = config.Umbraco.PublishImmediately ? "published" : "draft";
            string target = companyName is not null
                ? $" (sucursal de {companyName})"
                : cuisine is null ? "" : $" → {cuisine}";
            if (insideMall is not null)
            {
                target += $" [en {insideMall.Name}]";
            }
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

if (publishSections)
{
    Console.WriteLine("\n== Publicando las secciones seleccionadas");
    var totalPublished = 0;
    foreach (string parentPath in config.Runs
        .Where(r => SectionSelected(r.ParentPath))
        .Select(r => r.ParentPath)
        .Distinct(StringComparer.OrdinalIgnoreCase))
    {
        (Guid Id, string Name)? sectionParent = await umbraco.GetContentByPathAsync(parentPath);
        if (sectionParent is null)
        {
            Console.Error.WriteLine($"  Parent path not found in CMS, skipping: {parentPath}");
            continue;
        }

        try
        {
            int publishedHere = await umbraco.PublishDraftDescendantsAsync(sectionParent.Value.Id);
            totalPublished += publishedHere;
            Console.WriteLine($"  {parentPath}: {publishedHere} publicado(s)");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! {parentPath}: {ex.Message}");
        }
    }

    Console.WriteLine($"  Total publicado: {totalPublished}");
}

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
            umbraco, new CaribbeanCinemasClient(http), new YoutubeTrailerFinder(http),
            new MovieRatingsClient(http, config.Cinemas.Ratings), config.Cinemas);
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
        await new EventSync(http, umbraco, config.Events, google, enricher).RunAsync();
    }
    catch (Exception ex)
    {
        failures++;
        Console.Error.WriteLine($"\n! Event sync failed: {ex.Message}");
    }
}

// Last, so it also covers what the cinema sync just published: every published place
// that sits inside a plaza is listed on that plaza's page. The pass writes only what is
// missing, so a run with nothing new to link costs a handful of reads.
try
{
    Console.WriteLine("\n== Establecimientos dentro de plazas");
    int linkedNow = await LinkEstablishmentsAsync(apply: true);
    Console.WriteLine($"  {linkedNow} enlace(s) nuevo(s)");
}
catch (Exception ex)
{
    failures++;
    Console.Error.WriteLine($"\n! Mall establishment linking failed: {ex.Message}");
}

return failures == 0 ? 0 : 1;
