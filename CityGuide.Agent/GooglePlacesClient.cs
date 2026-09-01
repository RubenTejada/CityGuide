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
    int? UserRatingCount);

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
            "places.rating", "places.userRatingCount"));

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
                p.Rating, p.UserRatingCount))
            .ToList();
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
        [property: JsonPropertyName("userRatingCount")] int? UserRatingCount);

    private record DisplayName([property: JsonPropertyName("text")] string? Text);

    private record OpeningHours([property: JsonPropertyName("weekdayDescriptions")] string[]? WeekdayDescriptions);

    private record Location(
        [property: JsonPropertyName("latitude")] double Latitude,
        [property: JsonPropertyName("longitude")] double Longitude);
}
