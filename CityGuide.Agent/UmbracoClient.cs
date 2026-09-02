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

    public record CityAgentConfig(string CityName, Dictionary<string, string> CategoryPrompts, GeoArea? Area);

    /// <summary>
    /// Agent configuration stored on the city node ("Agente" tab): the city name
    /// used in Google queries ({city} placeholder) and per-category editor
    /// prompts, one "categoria-slug: instrucciones" line each. Falls back to the
    /// node name when the tab is empty; null when the city path does not exist.
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

        return new CityAgentConfig(cityName, prompts, ParseArea(Text("agentArea")));
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

    /// <summary>Google Place ID → document id of every published place — used for dedupe and rating refresh.</summary>
    public async Task<Dictionary<string, Guid>> GetKnownGooglePlaceIdsAsync()
    {
        HttpResponseMessage response = await http.GetAsync(
            $"{config.BaseUrl}/umbraco/delivery/api/v2/content?filter=contentType%3Aplace&take=1000");
        var known = new Dictionary<string, Guid>(StringComparer.Ordinal);

        // Never degrade to an empty baseline: with no known places every discovered
        // place looks new and the run duplicates the whole catalogue. A CMS that
        // cannot answer must stop the run instead.
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"No se pudo leer los lugares publicados del CMS ({(int)response.StatusCode} "
                + $"{response.StatusCode}). Sin esa lista el dedupe no funciona y la corrida "
                + "duplicaría el catálogo, así que se aborta.");
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        foreach (JsonElement item in doc.RootElement.GetProperty("items").EnumerateArray())
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
                string name = item.GetProperty("variants")[0].GetProperty("name").GetString() ?? "";
                children.Add(new ChildDocument(
                    item.GetProperty("id").GetGuid(),
                    name,
                    item.GetProperty("documentType").GetProperty("id").GetGuid(),
                    item.GetProperty("variants")[0].TryGetProperty("state", out JsonElement state)
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

    /// <summary>Creates a document and publishes it. Returns the new document id.</summary>
    public async Task<Guid> CreateDocumentAsync(
        Guid parentId, Guid docTypeId, string name, IEnumerable<object> values, bool publish = true)
    {
        var documentId = Guid.NewGuid();
        HttpRequestMessage request = await AuthorizedRequestAsync(HttpMethod.Post, "/umbraco/management/api/v1/document");
        request.Content = JsonContent.Create(new
        {
            id = documentId,
            parent = new { id = parentId },
            documentType = new { id = docTypeId },
            template = (object?)null,
            values,
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name } },
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

        return documentId;
    }

    /// <summary>Replaces a document's values and republishes it.</summary>
    public async Task UpdateDocumentAsync(Guid id, string name, IEnumerable<object> values)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}");
        request.Content = JsonContent.Create(new
        {
            template = (object?)null,
            values,
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name } },
        });

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Update '{name}' failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

        await PublishAsync(id);
    }

    public record PublishedPlace(
        Guid Id, string Name, string Path, double Latitude, double Longitude,
        string? Address, string? GooglePlaceId, bool HasPhoto);

    /// <summary>
    /// Every published node of a document type with its coordinates — used by the
    /// rating and photo backfill. "mall" nodes carry the same latitude/longitude/photo
    /// properties as places, so plazas are backfilled through the same path.
    /// </summary>
    public async Task<List<PublishedPlace>> GetPublishedPlacesAsync(string contentType = "place")
    {
        HttpResponseMessage response = await http.GetAsync(
            $"{config.BaseUrl}/umbraco/delivery/api/v2/content?filter=contentType%3A{contentType}&take=1000");
        response.EnsureSuccessStatusCode();

        var places = new List<PublishedPlace>();
        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        foreach (JsonElement item in doc.RootElement.GetProperty("items").EnumerateArray())
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
            bool hasPhoto = props.TryGetProperty("photo", out JsonElement photo)
                && photo.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined);
            places.Add(new PublishedPlace(
                item.GetProperty("id").GetGuid(),
                item.GetProperty("name").GetString()!,
                item.GetProperty("route").GetProperty("path").GetString()!,
                Coord("latitude"), Coord("longitude"), Text("address"), Text("googlePlaceId"), hasPhoto));
        }

        return places;
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
            JsonElement value = v.GetProperty("value");
            if (value.ValueKind is JsonValueKind.String or JsonValueKind.Number)
            {
                values[v.GetProperty("alias").GetString()!] = value.ValueKind == JsonValueKind.String
                    ? value.GetString()
                    : value.GetRawText();
            }
        }

        return new DocumentDetail(
            doc.RootElement.GetProperty("variants")[0].GetProperty("name").GetString() ?? "", values);
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
        JsonElement variant = root.GetProperty("variants")[0];

        var values = new Dictionary<string, object?>();
        foreach (JsonElement v in root.GetProperty("values").EnumerateArray())
        {
            values[v.GetProperty("alias").GetString()!] = v.GetProperty("value").Clone();
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
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}");
        request.Content = JsonContent.Create(new
        {
            template = (object?)null,
            values = values.Select(v => new { alias = v.Key, value = v.Value }),
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name } },
        });
        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Update '{name}' failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

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

    /// <summary>
    /// Updates only the Google rating properties (and optionally the place id) of an
    /// existing place, preserving every other value. Returns false when the stored
    /// values already match.
    /// </summary>
    public async Task<bool> UpdatePlaceRatingAsync(
        Guid id, double rating, int ratingCount, string? googlePlaceId = null)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);

        if (Number(values, "googleRating") == rating
            && Number(values, "googleRatingCount") == ratingCount
            && (googlePlaceId is null || Text(values, "googlePlaceId") == googlePlaceId))
        {
            return false;
        }

        values["googleRating"] = rating;
        values["googleRatingCount"] = ratingCount;
        if (googlePlaceId is not null)
        {
            values["googlePlaceId"] = googlePlaceId;
        }

        await WriteDocumentAsync(id, name, values, state);
        return true;
    }

    /// <summary>
    /// Sets the "photo" MediaPicker3 value of an existing document, preserving every
    /// other value.
    /// </summary>
    public async Task SetPhotoAsync(Guid id, Guid mediaKey)
    {
        (string name, string state, Dictionary<string, object?> values) = await ReadDocumentAsync(id);
        values["photo"] = $"[{{\"key\":\"{Guid.NewGuid()}\",\"mediaKey\":\"{mediaKey}\"}}]";
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

    public async Task PublishAsync(Guid id)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}/publish");
        request.Content = JsonContent.Create(new
        {
            publishSchedules = new[] { new { culture = (string?)null, schedule = (object?)null } },
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
            published);

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
            values,
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name } },
        });

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Create document failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

        if (config.PublishImmediately)
        {
            HttpRequestMessage publishRequest = await AuthorizedRequestAsync(
                HttpMethod.Put, $"/umbraco/management/api/v1/document/{documentId}/publish");
            publishRequest.Content = JsonContent.Create(new
            {
                publishSchedules = new[] { new { culture = (string?)null, schedule = (object?)null } },
            });
            HttpResponseMessage publishResponse = await http.SendAsync(publishRequest);
            if (!publishResponse.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(
                    $"Publish failed ({(int)publishResponse.StatusCode}): {await publishResponse.Content.ReadAsStringAsync()}");
            }
        }

        return documentId;
    }
}
