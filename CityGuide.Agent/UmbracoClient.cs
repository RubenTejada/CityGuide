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

    /// <summary>Google Place ID → document id of every published place — used for dedupe and rating refresh.</summary>
    public async Task<Dictionary<string, Guid>> GetKnownGooglePlaceIdsAsync()
    {
        HttpResponseMessage response = await http.GetAsync(
            $"{config.BaseUrl}/umbraco/delivery/api/v2/content?filter=contentType%3Aplace&take=1000");
        var known = new Dictionary<string, Guid>(StringComparer.Ordinal);
        if (!response.IsSuccessStatusCode)
        {
            return known;
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
        if (_accessToken is not null)
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

    /// <summary>Children of a document via the management tree (includes drafts).</summary>
    public async Task<List<ChildDocument>> GetChildrenAsync(Guid parentId)
    {
        HttpRequestMessage request = await AuthorizedRequestAsync(
            HttpMethod.Get,
            $"/umbraco/management/api/v1/tree/document/children?parentId={parentId}&skip=0&take=200");
        HttpResponseMessage response = await http.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var children = new List<ChildDocument>();
        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        foreach (JsonElement item in doc.RootElement.GetProperty("items").EnumerateArray())
        {
            string name = item.GetProperty("variants")[0].GetProperty("name").GetString() ?? "";
            children.Add(new ChildDocument(
                item.GetProperty("id").GetGuid(),
                name,
                item.GetProperty("documentType").GetProperty("id").GetGuid()));
        }

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

    /// <summary>
    /// Updates only the Google rating properties of an existing place, preserving
    /// every other value. Republishes only documents that were already published.
    /// Returns false when the stored rating already matches.
    /// </summary>
    public async Task<bool> UpdatePlaceRatingAsync(Guid id, double rating, int ratingCount)
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
                case "googleRating":
                case "googleRatingCount":
                    break;
                default:
                    values.Add(new { alias, value = (object?)value.Clone() });
                    break;
            }
        }

        if (currentRating == rating && currentCount == ratingCount)
        {
            return false;
        }

        values.Add(new { alias = "googleRating", value = rating });
        values.Add(new { alias = "googleRatingCount", value = ratingCount });

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

    /// <summary>Creates a place document (draft), optionally publishing it. Returns the new document id.</summary>
    public async Task<Guid> CreatePlaceAsync(Guid parentId, DiscoveredPlace place, Enrichment enrichment)
    {
        Guid docTypeId = await GetPlaceDocumentTypeIdAsync();
        var documentId = Guid.NewGuid();

        object?[] values =
        [
            new { alias = "description", value = enrichment.Description },
            new { alias = "address", value = place.Address },
            new { alias = "phone", value = place.Phone },
            new { alias = "website", value = place.Website },
            new { alias = "hours", value = string.Join("\n", place.Hours) },
            new { alias = "latitude", value = place.Latitude },
            new { alias = "longitude", value = place.Longitude },
            new { alias = "facilities", value = enrichment.Facilities },
            new { alias = "googlePlaceId", value = place.GooglePlaceId },
            new { alias = "googleRating", value = place.Rating },
            new { alias = "googleRatingCount", value = place.UserRatingCount },
            new { alias = "source", value = "agent" },
        ];

        HttpRequestMessage request = await AuthorizedRequestAsync(HttpMethod.Post, "/umbraco/management/api/v1/document");
        request.Content = JsonContent.Create(new
        {
            id = documentId,
            parent = new { id = parentId },
            documentType = new { id = docTypeId },
            template = (object?)null,
            values,
            variants = new[] { new { culture = (string?)null, segment = (string?)null, name = place.Name } },
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
