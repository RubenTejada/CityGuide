using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace CityGuide.Agent;

/// <summary>
/// Umbraco client: reads published content through the Delivery API (anonymous)
/// and writes through the Management API using API-user client credentials.
/// </summary>
public class UmbracoClient(HttpClient http, UmbracoConfig config)
{
    private string? _accessToken;
    private DateTime _tokenExpiresAt;
    private readonly Dictionary<string, Guid> _docTypeIds = new(StringComparer.OrdinalIgnoreCase);

    // ---- Delivery API (read) ----

    /// <summary>Route-path item lookup; returns (id, name) or null.</summary>
    public async Task<(Guid Id, string Name)?> GetContentByPathAsync(string path)
    {
        HttpResponseMessage response =
            await http.GetAsync($"{config.BaseUrl}/umbraco/delivery/api/v2/content/item{path}");
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return (doc.RootElement.GetProperty("id").GetGuid(), doc.RootElement.GetProperty("name").GetString()!);
    }

    /// <summary>A published node as the Delivery API serves it, in one culture.</summary>
    public record PublishedNode(Guid Id, string ContentType, string Name, string Path, Dictionary<string, string> Text);

    /// <summary>
    /// Every published node of a content type, with its text properties, in one culture.
    /// Read from the Delivery API rather than walked through the Management API: one
    /// request per hundred nodes instead of one per node, and it answers a culture with
    /// exactly what is published in it — which is how the translation pass knows what it
    /// has already covered.
    /// </summary>
    public async Task<List<PublishedNode>> GetPublishedNodesAsync(string contentType, string culture)
    {
        var nodes = new List<PublishedNode>();
        var total = 0;
        const int pageSize = 100;
        for (var skip = 0; ; skip += pageSize)
        {
            var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"{config.BaseUrl}/umbraco/delivery/api/v2/content"
                + $"?filter=contentType:{Uri.EscapeDataString(contentType)}&skip={skip}&take={pageSize}");
            request.Headers.Add("Accept-Language", culture);

            HttpResponseMessage response = await http.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                break;
            }

            using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            total = doc.RootElement.GetProperty("total").GetInt32();
            var page = 0;
            foreach (JsonElement item in doc.RootElement.GetProperty("items").EnumerateArray())
            {
                var text = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (JsonProperty property in item.GetProperty("properties").EnumerateObject())
                {
                    if (property.Value.ValueKind == JsonValueKind.String
                        && property.Value.GetString() is { Length: > 0 } value)
                    {
                        text[property.Name] = value;
                    }
                }

                nodes.Add(new PublishedNode(
                    item.GetProperty("id").GetGuid(),
                    contentType,
                    item.GetProperty("name").GetString() ?? "",
                    item.GetProperty("route").GetProperty("path").GetString() ?? "",
                    text));
                page++;
            }

            if (page == 0 || nodes.Count >= total)
            {
                break;
            }
        }

        // The Delivery API's list endpoint reads from an Examine index, and a CMS that
        // has just restarted answers with a total it cannot yet fill — pages come back
        // empty while the index rebuilds. Silently returning the short list would let a
        // caller work over a slice of the site and report that it had covered all of it.
        if (nodes.Count < total)
        {
            throw new InvalidOperationException(
                $"The Delivery API listed {total} '{contentType}' nodes in '{culture}' but only "
                + $"returned {nodes.Count}. Its index is probably still rebuilding after a "
                + "restart — wait for it to finish and run this again.");
        }

        return nodes;
    }

    /// <summary>
    /// Writes one culture of a document and publishes that culture. Everything the
    /// document holds in the other one is carried through untouched.
    /// </summary>
    public async Task WriteCultureAsync(Guid id, string name, IEnumerable<object> values, string culture)
    {
        await PutDocumentAsync(id, name, values, culture);
        await PublishAsync(id, culture);
    }

    public record CityAgentConfig(
        string CityName,
        Dictionary<string, string> CategoryPrompts,
        GeoArea? Area,
        HashSet<string> ExcludedPlaceIds,
        Dictionary<string, DateOnly> QueryLog,
        Dictionary<Guid, SocialLogEntry> SocialLog);

    /// <summary>One line of the social log: when a node was announced, and what it was
    /// called — the name is there for the editor reading the field, and is carried
    /// through every rewrite so an old line never loses it.</summary>
    public record SocialLogEntry(DateOnly Date, string Name);

    /// <summary>
    /// Agent configuration stored on the city node ("Agente" tab): the city name
    /// used in Google queries ({city} placeholder), per-category editor prompts,
    /// one "categoria-slug: instrucciones" line each, and the Google place ids the
    /// agent must never turn into content. Falls back to the node name when the tab
    /// is empty; null when the city path does not exist.
    /// </summary>
    public async Task<CityAgentConfig?> GetCityAgentConfigAsync(string cityPath)
    {
        HttpResponseMessage response =
            await http.GetAsync($"{config.BaseUrl}/umbraco/delivery/api/v2/content/item{cityPath}");
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        JsonElement props = doc.RootElement.GetProperty("properties");
        string? Text(string alias) =>
            props.TryGetProperty(alias, out JsonElement v) && v.ValueKind == JsonValueKind.String
                ? v.GetString()
                : null;

        string cityName = Text("agentCityName") is { Length: > 0 } configured
            ? configured
            : doc.RootElement.GetProperty("name").GetString()!;

        var prompts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string line in (Text("agentPrompts") ?? "").Split('\n'))
        {
            int colon = line.IndexOf(':');
            if (colon > 0 && line[(colon + 1)..].Trim() is { Length: > 0 } prompt)
            {
                prompts[line[..colon].Trim()] = prompt;
            }
        }

        return new CityAgentConfig(
            cityName, prompts, ParseArea(Text("agentArea")), ParseExcluded(Text("agentExcludedPlaces")),
            ParseQueryLog(Text("agentQueryLog")), ParseSocialLog(Text("agentSocialLog")));
    }

    /// <summary>
    /// The "Consultas ya hechas" field: one "yyyy-MM-dd la consulta tal cual se envió"
    /// line per Google text search the agent has paid for. It is the agent's own memory,
    /// kept on the city node because the container it runs in keeps nothing; an editor
    /// who empties it is asking for the next pass to search everything again.
    /// </summary>
    private static Dictionary<string, DateOnly> ParseQueryLog(string? value)
    {
        var log = new Dictionary<string, DateOnly>(StringComparer.OrdinalIgnoreCase);
        foreach (string line in (value ?? "").Split('\n'))
        {
            string[] parts = line.Trim().Split(' ', 2, StringSplitOptions.TrimEntries);
            if (parts.Length == 2
                && DateOnly.TryParse(parts[0], System.Globalization.CultureInfo.InvariantCulture, out DateOnly date)
                && parts[1].Length > 0)
            {
                log[parts[1]] = date;
            }
        }

        return log;
    }

    /// <summary>The same field written back, newest date per query, one line each.</summary>
    public static string FormatQueryLog(Dictionary<string, DateOnly> log) => string.Join("\n",
        log.OrderBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase)
            .Select(entry => $"{entry.Value:yyyy-MM-dd} {entry.Key}"));

    /// <summary>
    /// The "Publicaciones ya hechas" field: one "yyyy-MM-dd &lt;id&gt; el nombre" line per
    /// node the agent has already announced on Facebook and Instagram. Same reason as the
    /// query log — the container the agent runs in keeps nothing between passes — and the
    /// same consequence: an editor who empties it is asking for the portal to announce its
    /// restaurants a second time.
    /// </summary>
    private static Dictionary<Guid, SocialLogEntry> ParseSocialLog(string? value)
    {
        var log = new Dictionary<Guid, SocialLogEntry>();
        foreach (string line in (value ?? "").Split('\n'))
        {
            string[] parts = line.Trim().Split(' ', 3, StringSplitOptions.TrimEntries);
            if (parts.Length >= 2
                && DateOnly.TryParse(parts[0], System.Globalization.CultureInfo.InvariantCulture, out DateOnly date)
                && Guid.TryParse(parts[1], out Guid id))
            {
                log[id] = new SocialLogEntry(date, parts.Length > 2 ? parts[2] : "");
            }
        }

        return log;
    }

    /// <summary>The same field written back, newest first so the last pass reads at the top.</summary>
    public static string FormatSocialLog(Dictionary<Guid, SocialLogEntry> log) => string.Join("\n", log
        .OrderByDescending(entry => entry.Value.Date)
        .Select(entry => $"{entry.Value.Date:yyyy-MM-dd} {entry.Key} {entry.Value.Name}".TrimEnd()));

    /// <summary>
    /// The "Lugares excluidos" field: one Google place id per line, with an optional
    /// "# por qué" an editor writes to remember what the id was. Everything after the
    /// id on its line is a note, so a pasted line stays readable in the backoffice.
    /// </summary>
    private static HashSet<string> ParseExcluded(string? value)
    {
        var excluded = new HashSet<string>(StringComparer.Ordinal);
        foreach (string line in (value ?? "").Split('\n'))
        {
            string entry = line.Split('#')[0].Trim();
            if (entry.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() is { Length: > 0 } id)
            {
                excluded.Add(id);
            }
        }

        return excluded;
    }

    /// <summary>"lat,lng;lat,lng" (southwest corner, then northeast) into a search
    /// rectangle. Anything that does not parse means no restriction, as an empty
    /// field does: a malformed box must not silently shrink a run to nothing.</summary>
    private static GeoArea? ParseArea(string? value)
    {
        string[] corners = (value ?? "").Split(';',
            StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (corners.Length != 2)
        {
            return null;
        }

        double[] numbers = [.. corners
            .SelectMany(c => c.Split(',', StringSplitOptions.TrimEntries))
            .Select(n => double.TryParse(n, System.Globalization.CultureInfo.InvariantCulture, out double d)
                ? d
                : double.NaN)];

        return numbers.Length == 4 && !numbers.Any(double.IsNaN)
            ? new GeoArea(numbers[0], numbers[1], numbers[2], numbers[3])
            : null;
    }

    /// <summary>
    /// Every item of a Delivery API filter, paged to the end. One request answers at
    /// most a page — the catalogue outgrew any single page long ago — and a truncated
    /// list is invisible to its callers: the dedupe would recreate the places it did
    /// not see, and the backfill would never complete the ones past the cut.
    /// </summary>
    private async Task<List<JsonElement>> GetDeliveryItemsAsync(
        string filter, Func<HttpResponseMessage, Exception>? onFailure = null)
    {
        // The page the server actually returns decides the stride, so a deployment
        // that caps the page size smaller than this is paged correctly all the same.
        const int pageSize = 500;
        var items = new List<JsonElement>();
        int total;
        do
        {
            HttpResponseMessage response = await http.GetAsync(
                $"{config.BaseUrl}/umbraco/delivery/api/v2/content"
                + $"?filter={filter}&skip={items.Count}&take={pageSize}");
            if (!response.IsSuccessStatusCode)
            {
                throw onFailure?.Invoke(response)
                    ?? new HttpRequestException(
                        $"Delivery API {filter}: {(int)response.StatusCode} {response.StatusCode}");
            }

            using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            total = doc.RootElement.GetProperty("total").GetInt32();
            int before = items.Count;
            foreach (JsonElement item in doc.RootElement.GetProperty("items").EnumerateArray())
            {
                items.Add(item.Clone());
            }

            // An empty page with items still missing would otherwise loop forever.
            if (items.Count == before)
            {
                break;
            }
        }
        while (items.Count < total);

        return items;
    }

    /// <summary>Google Place ID → document id of every published place — used for dedupe and rating refresh.</summary>
    public async Task<Dictionary<string, Guid>> GetKnownGooglePlaceIdsAsync()
    {
        // Never degrade to a partial baseline: a place the list does not carry looks
        // new and gets created a second time, so the read is paged to the end and a
        // CMS that cannot answer stops the run instead.
        List<JsonElement> items = await GetDeliveryItemsAsync(
            "contentType%3Aplace",
            response => new InvalidOperationException(
                $"No se pudo leer los lugares publicados del CMS ({(int)response.StatusCode} "
                + $"{response.StatusCode}). Sin esa lista el dedupe no funciona y la corrida "
                + "duplicaría el catálogo, así que se aborta."));
        var known = new Dictionary<string, Guid>(StringComparer.Ordinal);

        foreach (JsonElement item in items)
        {
            if (item.GetProperty("properties").TryGetProperty("googlePlaceId", out JsonElement id)
                && id.ValueKind == JsonValueKind.String)
            {
                known[id.GetString()!] = item.GetProperty("id").GetGuid();
            }
        }

        return known;
    }

    // ---- Management API (write) ----

    private async Task<string> GetAccessTokenAsync()
    {
        // Tokens expire (default 300s); refresh shortly before to survive long runs.
        if (_accessToken is not null && DateTime.UtcNow < _tokenExpiresAt)
        {
            return _accessToken;
        }

        HttpResponseMessage response = await http.PostAsync(
            $"{config.BaseUrl}/umbraco/management/api/v1/security/back-office/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = config.ClientId,
                ["client_secret"] = config.ClientSecret,
            }));
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Umbraco token request failed ({(int)response.StatusCode}). " +
                "Create an API user in the backoffice (Users → API users) and configure ClientId/ClientSecret. " +
                await response.Content.ReadAsStringAsync());
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        _accessToken = doc.RootElement.GetProperty("access_token").GetString()!;
        int expiresIn = doc.RootElement.TryGetProperty("expires_in", out JsonElement exp)
            ? exp.GetInt32()
            : 300;
        _tokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn - 30);
        return _accessToken;
    }

    private async Task<HttpRequestMessage> AuthorizedRequestAsync(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, $"{config.BaseUrl}{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await GetAccessTokenAsync());
        return request;
    }

    /// <summary>Looks up a document type id by its display name (e.g. "Place", "Movie").</summary>
    public async Task<Guid> GetDocumentTypeIdAsync(string name)
    {
        if (_docTypeIds.TryGetValue(name, out Guid cached))
        {
            return cached;
        }

        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Get,
            $"/umbraco/management/api/v1/item/document-type/search?query={Uri.EscapeDataString(name)}&take=20");
        HttpResponseMessage response = await http.SendAsync(request);
        response.EnsureSuccessStatusCode();

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        foreach (JsonElement item in doc.RootElement.GetProperty("items").EnumerateArray())
        {
            if (string.Equals(item.GetProperty("name").GetString(), name, StringComparison.OrdinalIgnoreCase))
            {
                Guid id = item.GetProperty("id").GetGuid();
                _docTypeIds[name] = id;
                return id;
            }
        }

        throw new InvalidOperationException($"Document type '{name}' not found via Management API.");
    }

    public Task<Guid> GetPlaceDocumentTypeIdAsync() => GetDocumentTypeIdAsync("Place");

    /// <summary>The plaza comercial document type. The lookup above goes by display
    /// name, and the backoffice shows this one under both words it is called by.</summary>
    public Task<Guid> GetMallDocumentTypeIdAsync() => GetDocumentTypeIdAsync("Mall / Plaza Comercial");

    // ---- Generic document operations (cinema sync) ----

    public record ChildDocument(Guid Id, string Name, Guid DocumentTypeId, string State = "");

    /// <summary>
    /// Children of a document via the management tree (includes drafts). Pages through
    /// the whole list: a truncated one would silently break the dedupe that depends on it.
    /// </summary>
    public async Task<List<ChildDocument>> GetChildrenAsync(Guid parentId)
    {
        const int pageSize = 200;
        var children = new List<ChildDocument>();
        var total = 0;

        do
        {
            HttpRequestMessage request = await AuthorizedRequestAsync(
                HttpMethod.Get,
                "/umbraco/management/api/v1/tree/document/children"
                    + $"?parentId={parentId}&skip={children.Count}&take={pageSize}");
            HttpResponseMessage response = await http.SendAsync(request);
            response.EnsureSuccessStatusCode();

            using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            total = doc.RootElement.GetProperty("total").GetInt32();
            var page = 0;
            foreach (JsonElement item in doc.RootElement.GetProperty("items").EnumerateArray())
            {
                JsonElement itemVariant = VariantOf(item, ContentCultures.Spanish);
                string name = itemVariant.GetProperty("name").GetString() ?? "";
                children.Add(new ChildDocument(
                    item.GetProperty("id").GetGuid(),
                    name,
                    item.GetProperty("documentType").GetProperty("id").GetGuid(),
                    itemVariant.TryGetProperty("state", out JsonElement state)
                        ? state.GetString() ?? ""
                        : ""));
                page++;
            }

            // An empty page with more promised would loop forever.
            if (page == 0)
            {
                break;
            }
        }
        while (children.Count < total);

        return children;
    }

    /// <summary>A value as the Management API takes it: the property, its content, and
    /// the culture it belongs to — null when the property is shared by every culture.</summary>
    private record CultureValue(string Alias, object? Value, string? Culture, string? Segment = null);

    /// <summary>A document's name in one culture.</summary>
    private record CultureVariant(string? Culture, string? Segment, string Name);

    /// <summary>
    /// Stamps the culture onto the values a caller built. Callers describe a document in
    /// one language as plain { alias, value } pairs; which of those properties actually
    /// vary by culture is part of the Management API's wire format, and this client is
    /// the layer that owns it. The API rejects a culture on a shared property and a
    /// culture-less value on a varying one, so both cases have to be got right here.
    /// </summary>
    private static List<CultureValue> WithCulture(IEnumerable<object> values, string culture) =>
    [
        .. values.Select(v =>
        {
            JsonElement element = JsonSerializer.SerializeToElement(v);
            string alias = element.GetProperty("alias").GetString() ?? "";
            return new CultureValue(
                alias,
                element.TryGetProperty("value", out JsonElement value) ? value.Clone() : null,
                ContentCultures.CultureOf(alias, culture));
        }),
    ];

    /// <summary>Whether a value read back belongs to this culture, or to both.</summary>
    private static bool BelongsTo(JsonElement value, string culture) =>
        ContentCultures.Belongs(
            value.TryGetProperty("culture", out JsonElement own) ? own.GetString() : null, culture);

    /// <summary>
    /// The variant of a document carrying this culture. A translated document has one
    /// variant per language and the order is not guaranteed, so the first one is only a
    /// fallback for content that varies by nothing.
    /// </summary>
    private static JsonElement VariantOf(JsonElement root, string culture)
    {
        JsonElement variants = root.GetProperty("variants");
        foreach (JsonElement variant in variants.EnumerateArray())
        {
            if (BelongsTo(variant, culture))
            {
                return variant;
            }
        }

        return variants[0];
    }

    /// <summary>
    /// Writes one culture of a document, keeping everything the caller did not mention.
    /// A PUT replaces the whole document, and a caller only ever describes one language:
    /// what it leaves out is the *other* language's prose — which a discovery run would
    /// otherwise delete from every place the translation pass had covered — and every
    /// shared property, which belongs to no culture and would be deleted by whichever
    /// pass wrote last, taking the address, the phone, the coordinates and the rating
    /// with it. So what is sent is the caller's values plus every value already stored
    /// under a property-and-culture the caller is not writing.
    /// </summary>
    private async Task PutDocumentAsync(
        Guid id, string name, IEnumerable<object> values, string culture)
    {
        List<CultureValue> written = WithCulture(values, culture);
        HashSet<(string, string?)> replaced =
            [.. written.Select(v => (v.Alias, v.Culture))];
        (List<CultureValue> kept, List<CultureVariant> otherVariants) =
            await UntouchedAsync(id, replaced, culture);

        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}");
        request.Content = JsonContent.Create(new
        {
            template = (object?)null,
            values = written.Concat(kept),
            variants = new List<CultureVariant> { new(culture, null, name) }.Concat(otherVariants),
        });

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Update '{name}' failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }
    }

    /// <summary>
    /// What a write must send back unchanged: every stored value the caller is not
    /// replacing — the other culture's prose and the shared properties alike — and the
    /// names of every culture but the one being written.
    /// </summary>
    private async Task<(List<CultureValue> Values, List<CultureVariant> Variants)> UntouchedAsync(
        Guid id, HashSet<(string, string?)> replaced, string culture)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Get, $"/umbraco/management/api/v1/document/{id}");
        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            return ([], []);
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        JsonElement root = doc.RootElement;

        var values = new List<CultureValue>();
        foreach (JsonElement v in root.GetProperty("values").EnumerateArray())
        {
            string alias = v.GetProperty("alias").GetString() ?? "";
            string? valueCulture = v.TryGetProperty("culture", out JsonElement own) ? own.GetString() : null;
            if (!replaced.Contains((alias, valueCulture)))
            {
                values.Add(new CultureValue(alias, v.GetProperty("value").Clone(), valueCulture));
            }
        }

        var variants = new List<CultureVariant>();
        foreach (JsonElement variant in root.GetProperty("variants").EnumerateArray())
        {
            string? variantCulture =
                variant.TryGetProperty("culture", out JsonElement own) ? own.GetString() : null;
            if (!ContentCultures.Belongs(variantCulture, culture))
            {
                variants.Add(new CultureVariant(
                    variantCulture, null, variant.GetProperty("name").GetString() ?? ""));
            }
        }

        return (values, variants);
    }

    /// <summary>
    /// The English name of a node the agent creates. A section is a label the portal
    /// chose and the table knows it ("Cines" is "Movie Theaters"); everything else is a
    /// name out in the world — a chain, a plaza, a cinema — and reads the same in both
    /// languages. A label nobody has mapped keeps its Spanish name rather than blocking
    /// the English page, which is the same call the translation pass makes.
    /// </summary>
    public static string EnglishNameOf(string spanishName) =>
        TranslatedVocabulary.SectionName(spanishName) ?? spanishName;

    /// <summary>
    /// Creates a document and publishes it. Returns the new document id.
    /// <paramref name="alsoInEnglish"/> gives it its English variant too: structure —
    /// a section, a chain, a plaza — carries no prose the agent writes, but a culture
    /// only routes when every ancestor is published in it, so a section left in Spanish
    /// alone would leave every English page under it unreachable. Content that does
    /// carry prose (a film, an event) stays Spanish until the translation pass, rather
    /// than going out as an English page written in Spanish. <paramref name="englishValues"/>
    /// is for the prose the agent writes itself, which it can write in both.
    /// </summary>
    public async Task<Guid> CreateDocumentAsync(
        Guid parentId, Guid docTypeId, string name, IEnumerable<object> values, bool publish = true,
        bool alsoInEnglish = false, IEnumerable<object>? englishValues = null)
    {
        var documentId = Guid.NewGuid();
        HttpRequestMessage request = await AuthorizedRequestAsync(HttpMethod.Post, "/umbraco/management/api/v1/document");
        request.Content = JsonContent.Create(new
        {
            id = documentId,
            parent = new { id = parentId },
            documentType = new { id = docTypeId },
            template = (object?)null,
            values = WithCulture(values, ContentCultures.Spanish),
            variants = new[] { new { culture = ContentCultures.Spanish, segment = (string?)null, name } },
        });

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Create '{name}' failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

        if (publish)
        {
            await PublishAsync(documentId);
        }

        if (alsoInEnglish || englishValues is not null)
        {
            await PutDocumentAsync(
                documentId, EnglishNameOf(name), englishValues ?? [], ContentCultures.English);
            if (publish)
            {
                await PublishAsync(documentId, ContentCultures.English);
            }
        }

        return documentId;
    }

    /// <summary>Replaces a document's Spanish values and republishes it.</summary>
    public async Task UpdateDocumentAsync(Guid id, string name, IEnumerable<object> values)
    {
        await PutDocumentAsync(id, name, values, ContentCultures.Spanish);
        await PublishAsync(id);
    }

    public record PublishedPlace(
        Guid Id, string Name, string Path, double Latitude, double Longitude,
        string? Address, string? GooglePlaceId, Guid? PhotoMediaKey, double Rating,
        string? Source, DateTime CreateDate,
        string? Phone = null, string? Website = null, string? Hours = null,
        int RatingCount = 0, int GalleryCount = 0, int MenuCount = 0,
        string? PhotoUrl = null)
    {
        public bool HasPhoto => PhotoMediaKey is not null;

        public bool HasRating => Rating > 0;

        /// <summary>True when the node still lacks something the agent can fill in from
        /// Google. The backfill does these first: a pass cut short must not leave them
        /// queued behind the daily rating refresh of the nodes that are already complete.</summary>
        public bool Incomplete => !HasPhoto || !HasRating || GooglePlaceId is null;

        /// <summary>True when the agent created the node. What an editor typed in is
        /// never recycled by a maintenance pass, however much it looks like a copy.</summary>
        public bool AgentMade => Source?.StartsWith("agent", StringComparison.OrdinalIgnoreCase) == true;
    }

    /// <summary>
    /// Every published node of a document type with its coordinates — used by the
    /// rating and photo backfill. "mall" nodes carry the same latitude/longitude/photo
    /// properties as places, so plazas are backfilled through the same path.
    /// </summary>
    public async Task<List<PublishedPlace>> GetPublishedPlacesAsync(string contentType = "place")
    {
        var places = new List<PublishedPlace>();
        foreach (JsonElement item in await GetDeliveryItemsAsync($"contentType%3A{contentType}"))
        {
            JsonElement props = item.GetProperty("properties");
            double Coord(string alias) =>
                props.TryGetProperty(alias, out JsonElement v) && v.ValueKind == JsonValueKind.Number
                    ? v.GetDouble()
                    : 0;
            string? Text(string alias) =>
                props.TryGetProperty(alias, out JsonElement v) && v.ValueKind == JsonValueKind.String
                    ? v.GetString()
                    : null;
            // The media key of the main image, so a maintenance pass can hand the picture
            // of a copy to the node that stays instead of downloading it again.
            Guid? photoKey = props.TryGetProperty("photo", out JsonElement photo)
                && photo.ValueKind == JsonValueKind.Array && photo.GetArrayLength() > 0
                && photo[0].TryGetProperty("id", out JsonElement mediaKey)
                && mediaKey.TryGetGuid(out Guid key)
                ? key
                : null;
            // The picture's own address, for the callers that hand it to somebody else
            // rather than move it around inside the CMS (a social post states a URL and
            // the network downloads it itself).
            string? photoAddress = photoKey is not null
                && photo[0].TryGetProperty("url", out JsonElement photoUrl)
                && photoUrl.ValueKind == JsonValueKind.String
                ? photoUrl.GetString()
                : null;
            // How many images the gallery already holds, so the pass that fills it can
            // tell a place that has one from a place that does not without reading the
            // document — the picture URLs themselves are the frontend's business.
            int Images(string alias) =>
                props.TryGetProperty(alias, out JsonElement images)
                    && images.ValueKind == JsonValueKind.Array
                    ? images.GetArrayLength()
                    : 0;
            places.Add(new PublishedPlace(
                item.GetProperty("id").GetGuid(),
                item.GetProperty("name").GetString()!,
                item.GetProperty("route").GetProperty("path").GetString()!,
                Coord("latitude"), Coord("longitude"), Text("address"), Text("googlePlaceId"), photoKey,
                Coord("googleRating"), Text("source"),
                item.GetProperty("createDate").GetDateTime(),
                Text("phone"), Text("website"), Text("hours"),
                (int)Coord("googleRatingCount"), Images("gallery"), Images("menu"),
                photoAddress));
        }

        return places;
    }

    /// <summary>
    /// A published node as something outside the CMS sees it: its name, where it lives,
    /// when it was created, the address of its picture and every property that reads as
    /// text. Unlike <see cref="PublishedPlace"/> it says nothing about what a place is —
    /// it is the shape an event, a film and a place have in common, which is what a social
    /// post needs and all it needs.
    /// </summary>
    public record PublishedItem(
        Guid Id, string Name, string Path, DateTime CreateDate,
        string? PhotoUrl, Dictionary<string, string> Text);

    public async Task<List<PublishedItem>> GetPublishedItemsAsync(string contentType)
    {
        var items = new List<PublishedItem>();
        foreach (JsonElement item in await GetDeliveryItemsAsync($"contentType%3A{contentType}"))
        {
            JsonElement props = item.GetProperty("properties");
            var text = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (JsonProperty property in props.EnumerateObject())
            {
                // A number reads as text here on purpose: a rating and a duration are
                // written into a sentence, never computed with.
                if (property.Value.ValueKind == JsonValueKind.String
                    && property.Value.GetString() is { Length: > 0 } value)
                {
                    text[property.Name] = value;
                }
                else if (property.Value.ValueKind == JsonValueKind.Number)
                {
                    text[property.Name] = property.Value.GetRawText();
                }
            }

            string? photo = props.TryGetProperty("photo", out JsonElement picker)
                && picker.ValueKind == JsonValueKind.Array && picker.GetArrayLength() > 0
                && picker[0].TryGetProperty("url", out JsonElement url)
                && url.ValueKind == JsonValueKind.String
                ? url.GetString()
                : null;

            items.Add(new PublishedItem(
                item.GetProperty("id").GetGuid(),
                item.GetProperty("name").GetString() ?? "",
                item.GetProperty("route").GetProperty("path").GetString() ?? "",
                item.GetProperty("createDate").GetDateTime(),
                photo,
                text));
        }

        return items;
    }

    public record DocumentDetail(string Name, Dictionary<string, string?> TextValues);

    /// <summary>Name plus every scalar property of a document, as text (drafts included).
    /// Numbers come back as they were written, invariant — coordinates above all, which
    /// the Management API returns as JSON numbers.</summary>
    public async Task<DocumentDetail?> GetDocumentTextValuesAsync(Guid id)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Get, $"/umbraco/management/api/v1/document/{id}");
        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (JsonElement v in doc.RootElement.GetProperty("values").EnumerateArray())
        {
            if (!BelongsTo(v, ContentCultures.Spanish))
            {
                continue;
            }

            JsonElement value = v.GetProperty("value");
            if (value.ValueKind is JsonValueKind.String or JsonValueKind.Number)
            {
                values[v.GetProperty("alias").GetString()!] = value.ValueKind == JsonValueKind.String
                    ? value.GetString()
                    : value.GetRawText();
            }
        }

        return new DocumentDetail(
            VariantOf(doc.RootElement, ContentCultures.Spanish).GetProperty("name").GetString() ?? "", values);
    }

    /// <summary>
    /// Google Place IDs of every place below a document, drafts included — used for dedupe.
    /// The Delivery API only sees published content, but the agent creates places as
    /// drafts, so without this a draft is invisible to the next run and gets recreated
    /// on every pass. Recurses because places also sit under company and subcategory
    /// nodes, not just directly under the run's parent.
    /// </summary>
    public async Task<Dictionary<string, Guid>> GetDescendantPlaceIdsAsync(Guid parentId)
    {
        var result = new Dictionary<string, Guid>(StringComparer.Ordinal);
        await CollectAsync(parentId);
        return result;

        async Task CollectAsync(Guid id)
        {
            foreach (ChildDocument child in await GetChildrenAsync(id))
            {
                HttpRequestMessage request = await AuthorizedRequestAsync(
                    HttpMethod.Get, $"/umbraco/management/api/v1/document/{child.Id}");
                HttpResponseMessage response = await http.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    using JsonDocument doc = JsonDocument.Parse(
                        await response.Content.ReadAsStringAsync());
                    foreach (JsonElement v in doc.RootElement.GetProperty("values").EnumerateArray())
                    {
                        if (v.GetProperty("alias").GetString() == "googlePlaceId"
                            && v.GetProperty("value").ValueKind == JsonValueKind.String)
                        {
                            result[v.GetProperty("value").GetString()!] = child.Id;
                        }
                    }
                }

                await CollectAsync(child.Id);
            }
        }
    }

    /// <summary>
    /// Name, publication state and every stored value of a document. A PUT replaces
    /// the document, so every partial update has to read the rest and send it back.
    /// </summary>
    private async Task<(string Name, string State, Dictionary<string, object?> Values)> ReadDocumentAsync(Guid id)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Get, $"/umbraco/management/api/v1/document/{id}");
        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Read document {id} failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        JsonElement root = doc.RootElement;
        JsonElement variant = VariantOf(root, ContentCultures.Spanish);

        var values = new Dictionary<string, object?>();
        foreach (JsonElement v in root.GetProperty("values").EnumerateArray())
        {
            if (BelongsTo(v, ContentCultures.Spanish))
            {
                values[v.GetProperty("alias").GetString()!] = v.GetProperty("value").Clone();
            }
        }

        return (variant.GetProperty("name").GetString() ?? "",
            variant.GetProperty("state").GetString() ?? "",
            values);
    }

    /// <summary>
    /// The text values a document already stores, by alias. Lets a sync keep a value
    /// it could not refresh this run instead of blanking it, since a PUT replaces the
    /// whole document.
    /// </summary>
    public async Task<Dictionary<string, string?>> GetTextValuesAsync(Guid id)
    {
        (_, _, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        return values.ToDictionary(
            v => v.Key,
            v => v.Value is JsonElement { ValueKind: JsonValueKind.String } e ? e.GetString() : null);
    }

    /// <summary>
    /// Writes a document's name and values back. Republishes only documents that were
    /// already published, so the agent's drafts stay drafts until someone reviews them.
    /// </summary>
    private async Task WriteDocumentAsync(
        Guid id, string name, Dictionary<string, object?> values, string state)
    {
        await PutDocumentAsync(
            id, name, values.Select(v => (object)new { alias = v.Key, value = v.Value }),
            ContentCultures.Spanish);

        if (state.StartsWith("Published", StringComparison.Ordinal))
        {
            await PublishAsync(id);
        }
    }

    private static double? Number(Dictionary<string, object?> values, string alias) =>
        values.TryGetValue(alias, out object? v) && v is JsonElement { ValueKind: JsonValueKind.Number } e
            ? e.GetDouble()
            : null;

    private static string? Text(Dictionary<string, object?> values, string alias) =>
        values.TryGetValue(alias, out object? v) && v is JsonElement { ValueKind: JsonValueKind.String } e
            ? e.GetString()
            : null;

    /// <summary>What <see cref="CompletePlaceAsync"/> wrote: the rating, the photo, and
    /// the names of the empty fields it filled in ("teléfono", "horario"…).</summary>
    public record Completion(bool Rating, bool Photo, IReadOnlyList<string> Filled)
    {
        public bool Anything => Rating || Photo || Filled.Count > 0;
    }

    /// <summary>
    /// Fills in whatever Google data a node is missing — rating, place id, main photo,
    /// and the contact fields in <paramref name="details"/> — leaving every value the
    /// node already carries untouched, and refreshes a rating that changed. The photo is
    /// only asked for (<paramref name="photoFactory"/> finds and uploads it) when the
    /// node has none, so a node that is already complete costs one read and no image
    /// traffic. <paramref name="details"/> is what the Enterprise answer carried anyway:
    /// address, phone, website and hours ride along on the request the rating paid for,
    /// so a node seeded by hand is completed for nothing. A blank stays blank — Google
    /// saying nothing about a field never erases what an editor wrote. Returns what was
    /// written.
    /// </summary>
    public async Task<Completion> CompletePlaceAsync(
        Guid id, double? rating, int? ratingCount, string? googlePlaceId = null,
        Func<Task<Guid?>>? photoFactory = null, DiscoveredPlace? details = null)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);

        var ratingWritten = false;
        if (rating is double value
            && (Number(values, "googleRating") != value
                || Number(values, "googleRatingCount") != (ratingCount ?? 0)))
        {
            values["googleRating"] = value;
            values["googleRatingCount"] = ratingCount ?? 0;
            ratingWritten = true;
        }

        bool idWritten = googlePlaceId is not null && Text(values, "googlePlaceId") != googlePlaceId;
        if (idWritten)
        {
            values["googlePlaceId"] = googlePlaceId;
        }

        var photoWritten = false;
        if (photoFactory is not null && !HasPhoto(values) && await photoFactory() is Guid mediaKey)
        {
            values["photo"] = $"[{{\"key\":\"{Guid.NewGuid()}\",\"mediaKey\":\"{mediaKey}\"}}]";
            photoWritten = true;
        }

        // What the same answer carried and the node still lacks. Only ever writes into
        // an empty field: a branch place stores nothing on purpose (it inherits its
        // company's), and an editor's phone number outranks Google's.
        var filled = new List<string>();
        void Fill(string alias, string? value, string label)
        {
            if (string.IsNullOrWhiteSpace(value) || !string.IsNullOrWhiteSpace(Text(values, alias)))
            {
                return;
            }

            values[alias] = value;
            filled.Add(label);
        }

        if (details is not null)
        {
            Fill("address", details.Address, "dirección");
            Fill("phone", details.Phone, "teléfono");
            Fill("website", details.Website, "web");
            Fill("hours", details.Hours.Length > 0 ? string.Join("\n", details.Hours) : null, "horario");
            if (Number(values, "latitude") is null or 0 && details.Latitude != 0)
            {
                values["latitude"] = Math.Round(details.Latitude, 6);
                values["longitude"] = Math.Round(details.Longitude, 6);
                filled.Add("coordenadas");
            }
        }

        if (ratingWritten || idWritten || photoWritten || filled.Count > 0)
        {
            await WriteDocumentAsync(id, name, values, state);
        }

        return new Completion(ratingWritten, photoWritten, filled);
    }

    /// <summary>True when the node already carries a main image. An empty picker comes
    /// back as an empty array or an empty string depending on how it was written.</summary>
    private static bool HasPhoto(Dictionary<string, object?> values) =>
        values.TryGetValue("photo", out object? v) && v is JsonElement e && e.ValueKind switch
        {
            JsonValueKind.Array => e.GetArrayLength() > 0,
            JsonValueKind.String => !string.IsNullOrWhiteSpace(e.GetString()),
            JsonValueKind.Null or JsonValueKind.Undefined => false,
            _ => true,
        };

    /// <summary>
    /// Drops the Google match of a node — place id and rating — leaving every other value
    /// alone. Used when the stored id turns out to belong to another place (a branch that
    /// took the id of the plaza it stands in): the next backfill looks the place up by
    /// name again instead of refreshing the wrong one forever.
    /// </summary>
    public async Task ClearGoogleMatchAsync(Guid id)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        // Written as null rather than dropped from the payload: an explicit empty value
        // clears the property whatever the API does with an alias it is not sent.
        foreach (string alias in new[] { "googlePlaceId", "googleRating", "googleRatingCount" })
        {
            values[alias] = null;
        }

        await WriteDocumentAsync(id, name, values, state);
    }

    /// <summary>
    /// Sets one text property of an existing document, preserving every other value
    /// and its published state.
    /// </summary>
    public async Task SetTextValueAsync(Guid id, string alias, string value)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        values[alias] = value;
        await WriteDocumentAsync(id, name, values, state);
    }

    /// <summary>
    /// Replaces a place's photo gallery with the given media items, in order. Everything
    /// else the document holds survives, including the main "photo": the gallery is the
    /// extra a detail page rotates, not a replacement for the one image the cards use.
    /// </summary>
    public async Task SetGalleryAsync(Guid id, IReadOnlyList<Guid> mediaKeys)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        values["gallery"] = JsonSerializer.SerializeToElement(
            mediaKeys.Select(mediaKey => new { key = Guid.NewGuid(), mediaKey }));
        await WriteDocumentAsync(id, name, values, state);
    }

    /// <summary>
    /// Replaces a place's menu with the given pages, in order, and records where they
    /// were read from and when. The source is what an editor follows to check a price
    /// and what the page declares to a search engine; the date is what says a carta is
    /// old, which is the only way a menu goes wrong without anyone noticing.
    /// </summary>
    public async Task SetMenuAsync(Guid id, IReadOnlyList<Guid> mediaKeys, string sourceUrl)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        values["menu"] = JsonSerializer.SerializeToElement(
            mediaKeys.Select(mediaKey => new { key = Guid.NewGuid(), mediaKey }));
        values["menuSource"] = sourceUrl;
        values["menuUpdated"] = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        await WriteDocumentAsync(id, name, values, state);
    }

    /// <summary>
    /// Renames a document, preserving every value. Used when a second place turns up
    /// with a name already taken by a sibling: both are renamed to say where they are,
    /// instead of letting Umbraco number one of them.
    /// </summary>
    public async Task RenameDocumentAsync(Guid id, string name)
    {
        (_, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        await WriteDocumentAsync(id, name, values, state);
    }

    /// <summary>The address stored on a place, or null when it has none.</summary>
    public async Task<string?> GetPlaceAddressAsync(Guid id)
    {
        (_, _, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        return Text(values, "address");
    }

    public record PlaceDetail(
        string Name, string State, string? Address, double Latitude, double Longitude,
        string? GooglePlaceId, string? Source);

    /// <summary>
    /// The location data of a place or plaza, drafts included. The Delivery API twin of
    /// this (<see cref="GetPublishedPlacesAsync"/>) only sees published nodes, and the
    /// agent's own creations sit there as drafts until someone reviews them.
    /// </summary>
    public async Task<PlaceDetail> GetPlaceDetailAsync(Guid id)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        return new PlaceDetail(
            name, state, Text(values, "address"),
            Number(values, "latitude") ?? 0, Number(values, "longitude") ?? 0,
            Text(values, "googlePlaceId"), Text(values, "source"));
    }

    /// <summary>
    /// Moves a document under another parent, keeping its values and its publication
    /// state. Used to file an establishment under the plaza comercial it turned out to
    /// be inside of.
    /// </summary>
    public async Task MoveDocumentAsync(Guid id, Guid targetParentId)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}/move");
        request.Content = JsonContent.Create(new { target = new { id = targetParentId } });
        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Move {id} failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }
    }

    /// <summary>
    /// Publishes every unpublished document below <paramref name="parentId"/> and returns
    /// how many were published. Everything the agent leaves under a section is a draft
    /// waiting for review, so this is how a whole section is released at once without
    /// touching the drafts sitting in any other section. Parents are published before
    /// their children: Umbraco refuses to publish below an unpublished node.
    /// </summary>
    public async Task<int> PublishDraftDescendantsAsync(Guid parentId)
    {
        var published = 0;
        await PublishBelowAsync(parentId);
        return published;

        async Task PublishBelowAsync(Guid id)
        {
            foreach (ChildDocument child in await GetChildrenAsync(id))
            {
                if (!child.State.StartsWith("Published", StringComparison.Ordinal))
                {
                    await PublishAsync(child.Id);
                    published++;
                    Console.WriteLine($"  ^ {child.Name} publicado");
                }

                await PublishBelowAsync(child.Id);
            }
        }
    }

    /// <summary>
    /// Publishes one culture of a document. Publishing is per culture and additive, so
    /// releasing the Spanish page leaves an English one already published alone — and a
    /// culture nobody has translated is never published, which is what keeps the English
    /// site from serving Spanish text under an English URL.
    /// </summary>
    public async Task PublishAsync(Guid id, string culture = ContentCultures.Spanish)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}/publish");
        request.Content = JsonContent.Create(new
        {
            publishSchedules = new[] { new { culture = (string?)culture, schedule = (object?)null } },
        });
        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Publish {id} failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }
    }

    /// <summary>Values a plaza keeps. A "place" carries two the "mall" type does not
    /// (facilities and the cuisine-ish extras it may have picked up); everything else
    /// describes the same building and survives the conversion.</summary>
    private static readonly string[] MallAliases =
    [
        "description", "address", "phone", "website", "hours", "photo", "latitude", "longitude",
        "googlePlaceId", "source", "googleRating", "googleRatingCount",
        "metaTitle", "metaDescription", "noIndex",
    ];

    /// <summary>
    /// Recreates a "place" as the plaza comercial it is: a "mall" node under the same
    /// parent, carrying its values and whatever was filed under it, with the old node
    /// sent to the recycle bin. Umbraco cannot change a document's type, so a plaza the
    /// agent stored as one more shop can only be fixed by rebuilding it. Returns the id
    /// of the new plaza.
    /// </summary>
    public async Task<Guid> ConvertPlaceToMallAsync(Guid parentId, Guid placeId)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(placeId);
        bool published = state.StartsWith("Published", StringComparison.Ordinal);
        Guid mallId = await CreateDocumentAsync(
            parentId, await GetMallDocumentTypeIdAsync(), name,
            values.Where(v => MallAliases.Contains(v.Key))
                .Select(v => (object)new { alias = v.Key, value = v.Value }),
            published,
            // The plaza has to exist in English or the establishments filed under it
            // are unreachable there; its English description comes with the next
            // translation pass, like any node the agent rebuilds.
            alsoInEnglish: true);

        foreach (ChildDocument child in await GetChildrenAsync(placeId))
        {
            await MoveDocumentAsync(child.Id, mallId);
        }

        await RecycleDocumentAsync(placeId);

        // Umbraco numbered the new node "Plaza Duarte (1)" while the old one was still
        // its sibling. With that one in the recycle bin the name is free again, and the
        // plaza keeps the name (and the URL) it had.
        await RenameDocumentAsync(mallId, name);
        return mallId;
    }

    /// <summary>
    /// Lists a node in a plaza's "establishments" picker, so the plaza page shows the
    /// bank branch, restaurant or shop that sits inside it while the node itself stays
    /// where it belongs — one home, one copy of the data, referenced from the plaza.
    /// Returns false when the plaza already references it.
    /// </summary>
    public async Task<bool> AddMallEstablishmentAsync(Guid mallId, Guid nodeId)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(mallId);
        List<Guid> referenced = Referenced(values);
        if (referenced.Contains(nodeId))
        {
            return false;
        }

        referenced.Add(nodeId);
        values["establishments"] = JsonSerializer.SerializeToElement(
            referenced.Select(id => new { type = "document", unique = id }));
        await WriteDocumentAsync(mallId, name, values, state);
        return true;
    }

    /// <summary>The nodes a plaza lists in its "establishments" picker.</summary>
    public async Task<List<Guid>> GetMallEstablishmentsAsync(Guid mallId)
    {
        (_, _, Dictionary<string, object?> values) = await ReadDocumentAsync(mallId);
        return Referenced(values);
    }

    /// <summary>The nodes a plaza already lists, in the order the picker holds them.</summary>
    private static List<Guid> Referenced(Dictionary<string, object?> mallValues)
    {
        var referenced = new List<Guid>();
        if (!mallValues.TryGetValue("establishments", out object? value)
            || value is not JsonElement { ValueKind: JsonValueKind.Array } array)
        {
            return referenced;
        }

        foreach (JsonElement entry in array.EnumerateArray())
        {
            if (entry.TryGetProperty("unique", out JsonElement unique)
                && unique.TryGetGuid(out Guid id))
            {
                referenced.Add(id);
            }
        }

        return referenced;
    }

    /// <summary>
    /// Folds one plaza into another: everything filed under <paramref name="sourceId"/>
    /// moves to <paramref name="targetId"/>, the target picks up the agent-owned values
    /// it lacks — above all the Google place id, without which the next pass would
    /// discover the plaza again and recreate the duplicate — and the source goes to the
    /// recycle bin. Google names a plaza its own way ("Acrópolis Business Mall" next to
    /// the stored "Acrópolis Center"), and no name rule safely tells that pair apart from
    /// two neighbouring plazas, so which two to fold is a call only an editor can make.
    /// Returns how many children moved.
    /// </summary>
    public async Task<int> MergeMallAsync(Guid sourceId, Guid targetId)
    {
        (_, _, Dictionary<string, object?> source) = await ReadDocumentAsync(sourceId);
        (string targetName, string targetState, Dictionary<string, object?> target) =
            await ReadDocumentAsync(targetId);

        // The target is the curated node: it keeps every value it already has, and only
        // fills the blanks from the copy the agent made.
        var filled = false;
        foreach (string alias in new[]
                 { "googlePlaceId", "googleRating", "googleRatingCount", "photo" })
        {
            bool targetHas = target.TryGetValue(alias, out object? current)
                && current is JsonElement { ValueKind: not (JsonValueKind.Null or JsonValueKind.Undefined) };
            if (targetHas || !source.TryGetValue(alias, out object? value))
            {
                continue;
            }

            target[alias] = value;
            filled = true;
        }

        if (filled)
        {
            await WriteDocumentAsync(targetId, targetName, target, targetState);
        }

        var moved = 0;
        foreach (ChildDocument child in await GetChildrenAsync(sourceId))
        {
            await MoveDocumentAsync(child.Id, targetId);
            moved++;
        }

        await RecycleDocumentAsync(sourceId);
        return moved;
    }

    /// <summary>
    /// Sends a document to the recycle bin. What the agent files away on its own is
    /// recoverable from the backoffice; a plain delete would not be.
    /// </summary>
    public async Task RecycleDocumentAsync(Guid id)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}/move-to-recycle-bin");
        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Recycle {id} failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }
    }

    public async Task DeleteDocumentAsync(Guid id)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Delete, $"/umbraco/management/api/v1/document/{id}");
        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Delete {id} failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }
    }

    // ---- Media (place photos) ----

    // Well-known Umbraco media type keys (stable across installs).
    private static readonly Guid ImageMediaTypeKey = Guid.Parse("cc07b313-0843-4aa8-bbda-871c8da728c8");
    private static readonly Guid FolderMediaTypeKey = Guid.Parse("f38bd2d7-65d0-48e6-95dc-87ce06ec2d3d");
    private Guid? _agentMediaFolderId;

    /// <summary>Root media folder "Lugares (agente)" that groups agent-downloaded photos.</summary>
    private async Task<Guid> EnsureAgentMediaFolderAsync()
    {
        if (_agentMediaFolderId is Guid cached)
        {
            return cached;
        }

        const string folderName = "Agente";
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Get, "/umbraco/management/api/v1/tree/media/root?skip=0&take=100");
        HttpResponseMessage response = await http.SendAsync(request);
        response.EnsureSuccessStatusCode();
        using (JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync()))
        {
            foreach (JsonElement item in doc.RootElement.GetProperty("items").EnumerateArray())
            {
                if (string.Equals(item.GetProperty("variants")[0].GetProperty("name").GetString(),
                        folderName, StringComparison.OrdinalIgnoreCase))
                {
                    _agentMediaFolderId = item.GetProperty("id").GetGuid();
                    return _agentMediaFolderId.Value;
                }
            }
        }

        var folderId = Guid.NewGuid();
        HttpRequestMessage create = await AuthorizedRequestAsync(HttpMethod.Post, "/umbraco/management/api/v1/media");
        create.Content = JsonContent.Create(new
        {
            id = folderId,
            parent = (object?)null,
            mediaType = new { id = FolderMediaTypeKey },
            values = Array.Empty<object>(),
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name = folderName } },
        });
        HttpResponseMessage createResponse = await http.SendAsync(create);
        if (!createResponse.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Create media folder failed ({(int)createResponse.StatusCode}): {await createResponse.Content.ReadAsStringAsync()}");
        }

        _agentMediaFolderId = folderId;
        return folderId;
    }

    /// <summary>Uploads image bytes as a Media item (temporary file → media). Returns the media key.</summary>
    public async Task<Guid> CreateMediaImageAsync(string name, byte[] bytes, string contentType)
    {
        Guid folderId = await EnsureAgentMediaFolderAsync();

        string extension = contentType switch
        {
            "image/png" => ".png",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            _ => ".jpg",
        };
        var temporaryFileId = Guid.NewGuid();
        HttpRequestMessage upload = await AuthorizedRequestAsync(
            HttpMethod.Post, "/umbraco/management/api/v1/temporary-file");
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        upload.Content = new MultipartFormDataContent
        {
            { new StringContent(temporaryFileId.ToString()), "Id" },
            { file, "File", SafeFileName(name) + extension },
        };
        HttpResponseMessage uploadResponse = await http.SendAsync(upload);
        if (!uploadResponse.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Temporary file upload failed ({(int)uploadResponse.StatusCode}): {await uploadResponse.Content.ReadAsStringAsync()}");
        }

        var mediaId = Guid.NewGuid();
        HttpRequestMessage create = await AuthorizedRequestAsync(HttpMethod.Post, "/umbraco/management/api/v1/media");
        create.Content = JsonContent.Create(new
        {
            id = mediaId,
            parent = new { id = folderId },
            mediaType = new { id = ImageMediaTypeKey },
            values = new object[]
            {
                new { alias = "umbracoFile", value = new { temporaryFileId } },
            },
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name } },
        });
        HttpResponseMessage createResponse = await http.SendAsync(create);
        if (!createResponse.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Create media '{name}' failed ({(int)createResponse.StatusCode}): {await createResponse.Content.ReadAsStringAsync()}");
        }

        return mediaId;
    }

    private static string SafeFileName(string name)
    {
        string cleaned = new([.. name.Select(c => char.IsLetterOrDigit(c) ? char.ToLowerInvariant(c) : '-')]);
        return string.IsNullOrWhiteSpace(cleaned.Trim('-')) ? "foto" : cleaned.Trim('-');
    }

    /// <summary>
    /// Creates a place document (draft), optionally publishing it. Returns the new document id.
    /// A branch of a company stores only its own data (name, address, coordinates, photo,
    /// rating): description, phone, website and hours are inherited from the parent company
    /// by the frontend, so writing them here would freeze a copy that goes stale.
    /// <paramref name="asMall"/> is the plazas comerciales run: a plaza is a container of
    /// shops, not a shop, and the frontend renders it as one — the only difference here is
    /// that "mall" carries no facilities property.
    /// </summary>
    public async Task<Guid> CreatePlaceAsync(
        Guid parentId, DiscoveredPlace place, Enrichment? enrichment, Guid? photoMediaKey = null,
        string? companyName = null, string? documentName = null, bool asMall = false)
    {
        Guid docTypeId = asMall ? await GetMallDocumentTypeIdAsync() : await GetPlaceDocumentTypeIdAsync();
        var documentId = Guid.NewGuid();
        bool branchOfCompany = companyName is not null;

        // Siblings under a company would otherwise all carry the chain's own name.
        // The caller passes documentName when it had to settle a clash with a sibling.
        string name = documentName ?? (branchOfCompany
            ? BranchNaming.For(place.Name, place.Address, companyName!)
            : place.Name);

        object?[] values =
        [
            branchOfCompany ? null : (object?)new { alias = "description", value = enrichment?.Description },
            new { alias = "address", value = place.Address },
            branchOfCompany ? null : (object?)new { alias = "phone", value = place.Phone },
            branchOfCompany ? null : (object?)new { alias = "website", value = place.Website },
            branchOfCompany ? null : (object?)new { alias = "hours", value = string.Join("\n", place.Hours) },
            // The CMS coordinate data type stores decimal(_,6); more decimals
            // fail publish validation ("ContentInvalid").
            new { alias = "latitude", value = Math.Round(place.Latitude, 6) },
            new { alias = "longitude", value = Math.Round(place.Longitude, 6) },
            branchOfCompany || asMall
                ? null
                : (object?)new { alias = "facilities", value = enrichment?.Facilities },
            // SEO tab: the model writes the page's own title and snippet while it is
            // already describing the place, so a discovered page carries a unique one
            // instead of the shape the frontend derives for every place alike. A branch
            // has no enrichment of its own and keeps the derived title.
            branchOfCompany ? null : (object?)new { alias = "metaTitle", value = enrichment?.MetaTitle },
            branchOfCompany ? null : (object?)new { alias = "metaDescription", value = enrichment?.MetaDescription },
            new { alias = "googlePlaceId", value = place.GooglePlaceId },
            new { alias = "googleRating", value = place.Rating },
            new { alias = "googleRatingCount", value = place.UserRatingCount },
            new { alias = "source", value = "agent" },
            photoMediaKey is Guid mediaKey
                ? (object?)new
                {
                    alias = "photo",
                    value = $"[{{\"key\":\"{Guid.NewGuid()}\",\"mediaKey\":\"{mediaKey}\"}}]",
                }
                : null,
        ];
        values = [.. values.Where(v => v is not null)];

        HttpRequestMessage request = await AuthorizedRequestAsync(HttpMethod.Post, "/umbraco/management/api/v1/document");
        request.Content = JsonContent.Create(new
        {
            id = documentId,
            parent = new { id = parentId },
            documentType = new { id = docTypeId },
            template = (object?)null,
            values = WithCulture(values.Where(v => v is not null)!, ContentCultures.Spanish),
            variants = new[] { new { culture = ContentCultures.Spanish, segment = (string?)null, name } },
        });

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Create document failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

        if (config.PublishImmediately)
        {
            await PublishAsync(documentId);
        }

        await WriteEnglishPlaceAsync(documentId, name, place, enrichment, branchOfCompany);
        return documentId;
    }

    /// <summary>
    /// The English side of a place the discovery run just created, from the same
    /// enrichment call — so a place found today has an English page today instead of
    /// waiting for the next translation pass.
    ///
    /// The name is not translated: a place is called what it is called. Opening hours
    /// are, by the table rather than the model. A branch stores no prose in either
    /// language (it reads its company's), so it gets its English variant with nothing
    /// but a name — and a place whose English prose did not come back is left for the
    /// translation pass rather than published as an English page carrying Spanish text.
    /// </summary>
    private async Task WriteEnglishPlaceAsync(
        Guid documentId, string name, DiscoveredPlace place, Enrichment? enrichment, bool branchOfCompany)
    {
        object[] values;
        if (branchOfCompany)
        {
            values = [];
        }
        else if (string.IsNullOrWhiteSpace(enrichment?.DescriptionEn))
        {
            return;
        }
        else
        {
            values =
            [
                new { alias = "description", value = enrichment.DescriptionEn },
                new { alias = "metaTitle", value = enrichment.MetaTitleEn },
                new { alias = "metaDescription", value = enrichment.MetaDescriptionEn },
                new
                {
                    alias = "hours",
                    value = TranslatedVocabulary.Hours(string.Join("\n", place.Hours)) ?? "",
                },
            ];
        }

        await PutDocumentAsync(documentId, name, values, ContentCultures.English);
        if (config.PublishImmediately)
        {
            await PublishAsync(documentId, ContentCultures.English);
        }
    }
}
