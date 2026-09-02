using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PublishedCache;
using Umbraco.Cms.Core.Services.Navigation;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// "¿Qué está cerca?" — returns published places within a radius of a point,
/// sorted by distance. City-scale data: haversine scan over <see cref="NearbyIndex"/>,
/// the projection rebuilt only when content changes.
/// </summary>
[ApiController]
[Route("api/nearby")]
public class NearbyController : ControllerBase
{
    private readonly NearbyIndex _index;
    private readonly IPublishedContentCache _contentCache;
    private readonly IDocumentNavigationQueryService _navigation;
    private readonly IPublishedValueFallback _fallback;

    public NearbyController(
        NearbyIndex index,
        IPublishedContentCache contentCache,
        IDocumentNavigationQueryService navigation,
        IPublishedValueFallback fallback)
    {
        _index = index;
        _contentCache = contentCache;
        _navigation = navigation;
        _fallback = fallback;
    }

    /// <summary><paramref name="Photo"/> illustrates the popup card; <paramref name="Icon"/>
    /// is what the map pin draws — the company logo for a branch, null otherwise, so the
    /// frontend falls back to the section glyph instead of cropping a storefront photo
    /// into a 40px pin.</summary>
    public record NearbyPlace(
        Guid Id, string Name, string Url, string Category, string? Address,
        double Latitude, double Longitude, double DistanceMeters, string? Photo,
        string? Icon, double? Rating, int? RatingCount);

    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] double lat, [FromQuery] double lng,
        [FromQuery] double radius = 2000, [FromQuery] string? category = null,
        [FromQuery] Guid? exclude = null, [FromQuery] int limit = 20,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<NearbyEntry> entries =
            await _index.GetAsync(_contentCache, _navigation, _fallback, cancellationToken);

        var results = new List<NearbyPlace>();
        foreach (NearbyEntry entry in entries)
        {
            if (entry.Id == exclude)
            {
                continue;
            }

            if (category is not null && !string.Equals(entry.Category, category, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            double distance = HaversineMeters(lat, lng, entry.Latitude, entry.Longitude);
            if (distance > radius)
            {
                continue;
            }

            results.Add(new NearbyPlace(
                entry.Id, entry.Name, entry.Url, entry.Category, entry.Address,
                entry.Latitude, entry.Longitude, Math.Round(distance), entry.Photo,
                entry.Icon, entry.Rating, entry.RatingCount));
        }

        return Ok(results.OrderBy(r => r.DistanceMeters).Take(Math.Clamp(limit, 1, 100)));
    }

    private static double HaversineMeters(double lat1, double lng1, double lat2, double lng2)
    {
        const double earthRadius = 6371000;
        double dLat = ToRadians(lat2 - lat1);
        double dLng = ToRadians(lng2 - lng1);
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                   + Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2))
                   * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return earthRadius * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180;
}
