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

    // ---- Generic document operations (cinema sync) ----

    public record ChildDocument(Guid Id, string Name, Guid DocumentTypeId);

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
                    item.GetProperty("documentType").GetProperty("id").GetGuid()));
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
        Guid parentId, Guid docTypeId, string name, IEnumerable<object> values)
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

        await PublishAsync(documentId);
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

    /// <summary>Name plus every string-valued property of a document (drafts included).</summary>
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
            if (v.GetProperty("value").ValueKind == JsonValueKind.String)
            {
                values[v.GetProperty("alias").GetString()!] = v.GetProperty("value").GetString();
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
    /// Updates only the Google rating properties (and optionally the place id) of an
    /// existing place, preserving every other value. Republishes only documents that
    /// were already published. Returns false when the stored values already match.
    /// </summary>
    public async Task<bool> UpdatePlaceRatingAsync(
        Guid id, double rating, int ratingCount, string? googlePlaceId = null)
    {
        HttpRequestMessage getRequest = await AuthorizedRequestAsync(
            HttpMethod.Get, $"/umbraco/management/api/v1/document/{id}");
        HttpResponseMessage getResponse = await http.SendAsync(getRequest);
        if (!getResponse.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Read document {id} failed ({(int)getResponse.StatusCode}): {await getResponse.Content.ReadAsStringAsync()}");
        }

        using JsonDocument doc = JsonDocument.Parse(await getResponse.Content.ReadAsStringAsync());
        JsonElement root = doc.RootElement;
        JsonElement variant = root.GetProperty("variants")[0];
        string name = variant.GetProperty("name").GetString() ?? "";
        string state = variant.GetProperty("state").GetString() ?? "";

        double? currentRating = null;
        int? currentCount = null;
        string? currentPlaceId = null;
        var values = new List<object>();
        foreach (JsonElement v in root.GetProperty("values").EnumerateArray())
        {
            string alias = v.GetProperty("alias").GetString()!;
            JsonElement value = v.GetProperty("value");
            switch (alias)
            {
                case "googleRating" when value.ValueKind == JsonValueKind.Number:
                    currentRating = value.GetDouble();
                    break;
                case "googleRatingCount" when value.ValueKind == JsonValueKind.Number:
                    currentCount = value.GetInt32();
                    break;
                case "googlePlaceId" when googlePlaceId is not null:
                    currentPlaceId = value.ValueKind == JsonValueKind.String ? value.GetString() : null;
                    break;
                case "googleRating":
                case "googleRatingCount":
                    break;
                default:
                    values.Add(new { alias, value = (object?)value.Clone() });
                    break;
            }
        }

        if (currentRating == rating && currentCount == ratingCount
            && (googlePlaceId is null || currentPlaceId == googlePlaceId))
        {
            return false;
        }

        values.Add(new { alias = "googleRating", value = rating });
        values.Add(new { alias = "googleRatingCount", value = ratingCount });
        if (googlePlaceId is not null)
        {
            values.Add(new { alias = "googlePlaceId", value = googlePlaceId });
        }

        HttpRequestMessage putRequest = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}");
        putRequest.Content = JsonContent.Create(new
        {
            template = (object?)null,
            values,
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name } },
        });
        HttpResponseMessage putResponse = await http.SendAsync(putRequest);
        if (!putResponse.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Update rating for '{name}' failed ({(int)putResponse.StatusCode}): {await putResponse.Content.ReadAsStringAsync()}");
        }

        if (state.StartsWith("Published", StringComparison.Ordinal))
        {
            await PublishAsync(id);
        }

        return true;
    }

    /// <summary>
    /// Sets the "photo" MediaPicker3 value of an existing document, preserving
    /// every other value. Republishes only documents that were already published.
    /// </summary>
    public async Task SetPhotoAsync(Guid id, Guid mediaKey)
    {
        HttpRequestMessage getRequest = await AuthorizedRequestAsync(
            HttpMethod.Get, $"/umbraco/management/api/v1/document/{id}");
        HttpResponseMessage getResponse = await http.SendAsync(getRequest);
        getResponse.EnsureSuccessStatusCode();

        using JsonDocument doc = JsonDocument.Parse(await getResponse.Content.ReadAsStringAsync());
        JsonElement root = doc.RootElement;
        JsonElement variant = root.GetProperty("variants")[0];
        string name = variant.GetProperty("name").GetString() ?? "";
        string state = variant.GetProperty("state").GetString() ?? "";

        var values = new List<object>();
        foreach (JsonElement v in root.GetProperty("values").EnumerateArray())
        {
            if (v.GetProperty("alias").GetString() != "photo")
            {
                values.Add(new { alias = v.GetProperty("alias").GetString()!, value = (object?)v.GetProperty("value").Clone() });
            }
        }

        values.Add(new
        {
            alias = "photo",
            value = (object?)$"[{{\"key\":\"{Guid.NewGuid()}\",\"mediaKey\":\"{mediaKey}\"}}]",
        });

        HttpRequestMessage putRequest = await AuthorizedRequestAsync(
            HttpMethod.Put, $"/umbraco/management/api/v1/document/{id}");
        putRequest.Content = JsonContent.Create(new
        {
            template = (object?)null,
            values,
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name } },
        });
        HttpResponseMessage putResponse = await http.SendAsync(putRequest);
        if (!putResponse.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Set photo for '{name}' failed ({(int)putResponse.StatusCode}): {await putResponse.Content.ReadAsStringAsync()}");
        }

        if (state.StartsWith("Published", StringComparison.Ordinal))
        {
            await PublishAsync(id);
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
    /// </summary>
    public async Task<Guid> CreatePlaceAsync(
        Guid parentId, DiscoveredPlace place, Enrichment? enrichment, Guid? photoMediaKey = null,
        string? companyName = null)
    {
        Guid docTypeId = await GetPlaceDocumentTypeIdAsync();
        var documentId = Guid.NewGuid();
        bool branchOfCompany = companyName is not null;

        // Siblings under a company would otherwise all carry the chain's own name.
        string name = branchOfCompany
            ? BranchNaming.For(place.Name, place.Address, companyName!)
            : place.Name;

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
            branchOfCompany ? null : (object?)new { alias = "facilities", value = enrichment?.Facilities },
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
