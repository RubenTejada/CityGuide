using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace CityGuide.Agent;

public record DiscoveredPlace(
    string GooglePlaceId,
    string Name,
    string? Address,
    string? Phone,
    string? Website,
    string[] Hours,
    double Latitude,
    double Longitude,
    string[] Types,
    double? Rating,
    int? UserRatingCount,
    string? PhotoName);

/// <summary>A rectangle a text search is confined to, corner to corner.</summary>
public record GeoArea(double SouthLat, double WestLng, double NorthLat, double EastLng)
{
    /// <summary>True when the point falls inside the rectangle. The same box that
    /// keeps Google's answers inside the city also answers, for free, whether a
    /// place a portal already gave coordinates for belongs to it.</summary>
    public bool Contains(double latitude, double longitude) =>
        latitude >= SouthLat && latitude <= NorthLat
        && longitude >= WestLng && longitude <= EastLng;
}

/// <summary>Google Places API (New) — Text Search.</summary>
public class GooglePlacesClient(HttpClient http, string apiKey)
{
    /// <summary>False when no key is configured, or when the run left it out because it
    /// was told to spend nothing. Every lookup then answers "nothing found" without
    /// leaving the process: an unkeyed request would only earn a 403 per call, and the
    /// callers already treat an empty answer as "Google could not tell me", which is
    /// exactly what it is.</summary>
    public bool Enabled { get; } = !string.IsNullOrWhiteSpace(apiKey);

    /// <summary>
    /// Text Search, paged. Google returns at most 20 results per page and up to
    /// three pages, so <paramref name="max"/> above 20 keeps paging until Google
    /// runs out. Results are ranked by review count before being cut to
    /// <paramref name="max"/>: the point of a bigger run is the best-known
    /// places, not an arbitrary slice of relevance order.
    /// </summary>
    public async Task<List<DiscoveredPlace>> SearchAsync(string query, int max, GeoArea? area = null)
    {
        if (!Enabled)
        {
            return [];
        }

        var collected = new List<PlaceModel>();
        string? pageToken = null;
        do
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "https://places.googleapis.com/v1/places:searchText")
            {
                Content = JsonContent.Create(new
                {
                    textQuery = query,
                    languageCode = "es",
                    pageSize = Math.Clamp(max - collected.Count, 1, 20),
                    pageToken,
                    // Without this Google answers a city query with the whole country:
                    // "bares en Santo Domingo" brings back Punta Cana. Text Search only
                    // takes a rectangle here, never a radius.
                    locationRestriction = area is null ? null : new
                    {
                        rectangle = new
                        {
                            low = new { latitude = area.SouthLat, longitude = area.WestLng },
                            high = new { latitude = area.NorthLat, longitude = area.EastLng },
                        },
                    },
                }),
            };
            request.Headers.Add("X-Goog-Api-Key", apiKey);
            request.Headers.Add("X-Goog-FieldMask", string.Join(",",
                "nextPageToken",
                "places.id", "places.displayName", "places.formattedAddress", "places.location",
                "places.nationalPhoneNumber", "places.websiteUri",
                "places.regularOpeningHours.weekdayDescriptions", "places.types",
                "places.rating", "places.userRatingCount", "places.photos"));

            HttpResponseMessage response = await http.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(
                    $"Google Places search failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
            }

            SearchResponse? data = await response.Content.ReadFromJsonAsync<SearchResponse>();
            collected.AddRange(data?.Places ?? []);
            pageToken = string.IsNullOrEmpty(data?.NextPageToken) ? null : data.NextPageToken;
        }
        while (pageToken is not null && collected.Count < max);

        return collected
            .Where(p => p.Id is not null && p.DisplayName?.Text is not null && p.Location is not null)
            .DistinctBy(p => p.Id)
            .OrderByDescending(p => p.UserRatingCount ?? 0)
            .Take(max)
            .Select(p => new DiscoveredPlace(
                p.Id!, p.DisplayName!.Text!, p.FormattedAddress, p.NationalPhoneNumber, p.WebsiteUri,
                p.RegularOpeningHours?.WeekdayDescriptions ?? [],
                p.Location!.Latitude, p.Location.Longitude, p.Types ?? [],
                p.Rating, p.UserRatingCount, p.Photos?.FirstOrDefault()?.Name))
            .ToList();
    }

    /// <summary>
    /// Downloads a place photo (Photo Media endpoint; follows Google's redirect
    /// to the image bytes). Null when the photo is gone or the request fails —
    /// a missing photo must never block creating the place.
    /// </summary>
    public async Task<(byte[] Bytes, string ContentType)?> DownloadPhotoAsync(string photoName, int maxWidthPx = 1200)
    {
        if (!Enabled)
        {
            return null;
        }

        var request = new HttpRequestMessage(
            HttpMethod.Get, $"https://places.googleapis.com/v1/{photoName}/media?maxWidthPx={maxWidthPx}");
        request.Headers.Add("X-Goog-Api-Key", apiKey);

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        byte[] bytes = await response.Content.ReadAsByteArrayAsync();
        return bytes.Length == 0
            ? null
            : (bytes, response.Content.Headers.ContentType?.MediaType ?? "image/jpeg");
    }

    /// <summary>
    /// First Google photo of the best text-search match for a free-text query
    /// (used to illustrate an event by its venue). Null when nothing matches or
    /// the match has no photo.
    /// </summary>
    public async Task<string?> FindPhotoAsync(string query)
    {
        List<DiscoveredPlace> matches = await SearchAsync(query, 1);
        return matches.FirstOrDefault()?.PhotoName;
    }

    public record RatingLookup(
        string GooglePlaceId, string Name, double? Rating, int? UserRatingCount, string? PhotoName = null);

    /// <summary>Current rating of a known place — Place Details by id. Null when the place is gone.</summary>
    public async Task<RatingLookup?> GetRatingByIdAsync(string placeId)
    {
        if (!Enabled)
        {
            return null;
        }

        var request = new HttpRequestMessage(
            HttpMethod.Get, $"https://places.googleapis.com/v1/places/{placeId}");
        request.Headers.Add("X-Goog-Api-Key", apiKey);
        request.Headers.Add("X-Goog-FieldMask", "id,displayName,rating,userRatingCount,photos");

        HttpResponseMessage response = await http.SendAsync(request);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Google Place details failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

        PlaceModel? place = await response.Content.ReadFromJsonAsync<PlaceModel>();
        return place?.Id is null
            ? null
            : new RatingLookup(place.Id, place.DisplayName?.Text ?? "", place.Rating, place.UserRatingCount,
                place.Photos?.FirstOrDefault()?.Name);
    }

    /// <summary>
    /// Rating of a place identified by name near a coordinate — Text Search biased to the
    /// location. The name has to match and the match has to be within 2 km (large places
    /// like parks report a centroid far from our pin), so neither a neighbour's rating nor
    /// the one of the building a place sits in is ever attached: a cinema inside a plaza
    /// shares its coordinates with the plaza, and the plaza is the bigger Google result.
    /// </summary>
    public async Task<RatingLookup?> FindRatingNearAsync(
        string name, string? address, double latitude, double longitude)
    {
        if (!Enabled)
        {
            return null;
        }

        string query = $"{name} {address}".Trim();
        var request = new HttpRequestMessage(HttpMethod.Post, "https://places.googleapis.com/v1/places:searchText")
        {
            Content = JsonContent.Create(new
            {
                textQuery = query,
                languageCode = "es",
                pageSize = 5,
                locationBias = new
                {
                    circle = new
                    {
                        center = new { latitude, longitude },
                        radius = 500.0,
                    },
                },
            }),
        };
        request.Headers.Add("X-Goog-Api-Key", apiKey);
        request.Headers.Add("X-Goog-FieldMask", string.Join(",",
            "places.id", "places.displayName", "places.location",
            "places.rating", "places.userRatingCount", "places.photos"));

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Google Places search failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

        SearchResponse? data = await response.Content.ReadFromJsonAsync<SearchResponse>();
        PlaceModel? best = (data?.Places ?? [])
            .Where(p => p.Id is not null && p.Location is not null)
            .Select(p => (Place: p, Distance: HaversineMeters(
                latitude, longitude, p.Location!.Latitude, p.Location.Longitude)))
            .Where(x => x.Distance <= 2000 && TextMatch.Matches(name, x.Place.DisplayName?.Text))
            .OrderBy(x => x.Distance)
            .Select(x => x.Place)
            .FirstOrDefault();
        return best is null
            ? null
            : new RatingLookup(best.Id!, best.DisplayName?.Text ?? "", best.Rating, best.UserRatingCount,
                best.Photos?.FirstOrDefault()?.Name);
    }

    /// <summary>
    /// Rating and photo of a place the CMS stores without coordinates — a seeded node,
    /// or one an editor typed in — which leaves <see cref="FindRatingNearAsync"/> nothing
    /// to bias its search with. The city rectangle keeps the answer in town and the name
    /// still has to match, so a same-named business in another city is never taken for it.
    /// </summary>
    public async Task<RatingLookup?> FindRatingInAreaAsync(string name, string? address, GeoArea? area)
    {
        if (!Enabled)
        {
            return null;
        }

        List<DiscoveredPlace> matches = await SearchAsync($"{name} {address}".Trim(), 5, area);
        DiscoveredPlace? best = matches.FirstOrDefault(p => TextMatch.Matches(name, p.Name));
        return best is null
            ? null
            : new RatingLookup(
                best.GooglePlaceId, best.Name, best.Rating, best.UserRatingCount, best.PhotoName);
    }

    private static double HaversineMeters(double lat1, double lng1, double lat2, double lng2)
    {
        const double earthRadius = 6371000;
        double ToRad(double d) => d * Math.PI / 180;
        double dLat = ToRad(lat2 - lat1);
        double dLng = ToRad(lng2 - lng1);
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                   + Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2))
                   * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return earthRadius * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }

    private record SearchResponse(
        [property: JsonPropertyName("places")] List<PlaceModel>? Places,
        [property: JsonPropertyName("nextPageToken")] string? NextPageToken);

    private record PlaceModel(
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("displayName")] DisplayName? DisplayName,
        [property: JsonPropertyName("formattedAddress")] string? FormattedAddress,
        [property: JsonPropertyName("nationalPhoneNumber")] string? NationalPhoneNumber,
        [property: JsonPropertyName("websiteUri")] string? WebsiteUri,
        [property: JsonPropertyName("regularOpeningHours")] OpeningHours? RegularOpeningHours,
        [property: JsonPropertyName("location")] Location? Location,
        [property: JsonPropertyName("types")] string[]? Types,
        [property: JsonPropertyName("rating")] double? Rating,
        [property: JsonPropertyName("userRatingCount")] int? UserRatingCount,
        [property: JsonPropertyName("photos")] List<PhotoModel>? Photos);

    private record PhotoModel([property: JsonPropertyName("name")] string? Name);

    private record DisplayName([property: JsonPropertyName("text")] string? Text);

    private record OpeningHours([property: JsonPropertyName("weekdayDescriptions")] string[]? WeekdayDescriptions);

    private record Location(
        [property: JsonPropertyName("latitude")] double Latitude,
        [property: JsonPropertyName("longitude")] double Longitude);
}
