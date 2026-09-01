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

/// <summary>Google Places API (New) — Text Search.</summary>
public class GooglePlacesClient(HttpClient http, string apiKey)
{
    public async Task<List<DiscoveredPlace>> SearchAsync(string query, int max)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "https://places.googleapis.com/v1/places:searchText")
        {
            Content = JsonContent.Create(new { textQuery = query, languageCode = "es", pageSize = Math.Clamp(max, 1, 20) }),
        };
        request.Headers.Add("X-Goog-Api-Key", apiKey);
        request.Headers.Add("X-Goog-FieldMask", string.Join(",",
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
        return (data?.Places ?? [])
            .Where(p => p.Id is not null && p.DisplayName?.Text is not null && p.Location is not null)
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

    public record RatingLookup(
        string GooglePlaceId, string Name, double? Rating, int? UserRatingCount, string? PhotoName = null);

    /// <summary>Current rating of a known place — Place Details by id. Null when the place is gone.</summary>
    public async Task<RatingLookup?> GetRatingByIdAsync(string placeId)
    {
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
    /// location. Accepts the closest result within 200 m, or within 2 km when its name
    /// also matches (large places like parks report a centroid far from our pin); anything
    /// else is rejected so a neighbour's rating is never attached.
    /// </summary>
    public async Task<RatingLookup?> FindRatingNearAsync(
        string name, string? address, double latitude, double longitude)
    {
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
            .Where(x => x.Distance <= 200
                || (x.Distance <= 2000 && NamesMatch(name, x.Place.DisplayName?.Text)))
            .OrderBy(x => x.Distance)
            .Select(x => x.Place)
            .FirstOrDefault();
        return best is null
            ? null
            : new RatingLookup(best.Id!, best.DisplayName?.Text ?? "", best.Rating, best.UserRatingCount,
                best.Photos?.FirstOrDefault()?.Name);
    }

    /// <summary>True when most significant tokens of the stored name appear in Google's name.</summary>
    private static bool NamesMatch(string stored, string? google)
    {
        if (string.IsNullOrEmpty(google))
        {
            return false;
        }

        static string Normalize(string s) => string.Concat(
            s.Normalize(System.Text.NormalizationForm.FormD)
                .Where(c => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c)
                    != System.Globalization.UnicodeCategory.NonSpacingMark))
            .ToLowerInvariant();

        string[] stopWords = ["de", "del", "la", "el", "los", "las", "y", "en"];
        string[] tokens = Normalize(stored)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length > 2 && !stopWords.Contains(t))
            .ToArray();
        if (tokens.Length == 0)
        {
            return false;
        }

        string haystack = Normalize(google);
        int hits = tokens.Count(haystack.Contains);
        return hits * 2 >= tokens.Length; // at least half the tokens
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

    private record SearchResponse([property: JsonPropertyName("places")] List<PlaceModel>? Places);

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
