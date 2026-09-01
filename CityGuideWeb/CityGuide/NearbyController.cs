using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PublishedCache;
using Umbraco.Cms.Core.Services.Navigation;
using Umbraco.Extensions;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// "¿Qué está cerca?" — returns published places within a radius of a point,
/// sorted by distance. City-scale data: linear haversine scan over the content cache.
/// </summary>
[ApiController]
[Route("api/nearby")]
public class NearbyController : ControllerBase
{
    private readonly IPublishedContentCache _contentCache;
    private readonly IDocumentNavigationQueryService _navigation;
    private readonly IPublishedValueFallback _fallback;

    public NearbyController(
        IPublishedContentCache contentCache,
        IDocumentNavigationQueryService navigation,
        IPublishedValueFallback fallback)
    {
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
        [FromQuery] Guid? exclude = null, [FromQuery] int limit = 20)
    {
        if (!_navigation.TryGetRootKeys(out IEnumerable<Guid> rootKeys))
        {
            return Ok(Array.Empty<NearbyPlace>());
        }

        var results = new List<NearbyPlace>();
        foreach (Guid rootKey in rootKeys)
        {
            if (!_navigation.TryGetDescendantsKeysOfType(rootKey, "place", out IEnumerable<Guid> placeKeys))
            {
                continue;
            }

            foreach (Guid key in placeKeys)
            {
                if (key == exclude)
                {
                    continue;
                }

                IPublishedContent? place = await _contentCache.GetByIdAsync(key);
                if (place is null)
                {
                    continue;
                }

                var placeLat = (double)place.Value<decimal>(_fallback, "latitude");
                var placeLng = (double)place.Value<decimal>(_fallback, "longitude");
                if (placeLat == 0 && placeLng == 0)
                {
                    continue;
                }

                // Category = nearest ancestor categoryPage (walking up through subcategory
                // and company levels). A branch place under a company is shown prefixed
                // with the company name so it is unambiguous on the map.
                string categoryName = string.Empty;
                string displayName = place.Name;
                string? photo = PhotoUrl(place);
                string? icon = null;
                if (_navigation.TryGetAncestorsKeys(key, out IEnumerable<Guid> ancestorKeys))
                {
                    foreach (Guid ancestorKey in ancestorKeys)
                    {
                        IPublishedContent? ancestor = await _contentCache.GetByIdAsync(ancestorKey);
                        if (ancestor?.ContentType.Alias == "company")
                        {
                            displayName = BranchDisplayName(place.Name, ancestor.Name);
                            icon = PhotoUrl(ancestor);
                            photo ??= icon;
                        }

                        if (ancestor?.ContentType.Alias == "categoryPage")
                        {
                            categoryName = ancestor.Name;
                            break;
                        }
                    }
                }
                if (category is not null && !string.Equals(categoryName, category, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                double distance = HaversineMeters(lat, lng, placeLat, placeLng);
                if (distance > radius)
                {
                    continue;
                }

                var rating = (double)place.Value<decimal>(_fallback, "googleRating");
                var ratingCount = place.Value<int>(_fallback, "googleRatingCount");
                results.Add(new NearbyPlace(
                    place.Key, displayName, place.Url(), categoryName,
                    place.Value<string>(_fallback, "address"), placeLat, placeLng, Math.Round(distance), photo,
                    icon, rating > 0 ? rating : null, rating > 0 ? ratingCount : null));
            }
        }

        return Ok(results.OrderBy(r => r.DistanceMeters).Take(Math.Clamp(limit, 1, 100)));
    }

    /// <summary>Words that name the trade, not the chain, so they identify nothing on their own.</summary>
    private static readonly HashSet<string> GenericWords = new(StringComparer.Ordinal)
    {
        "banco", "banca", "supermercado", "supermercados", "farmacia", "farmacias",
        "cine", "cines", "cinemas", "tienda", "tiendas", "grupo", "plaza",
        "la", "el", "los", "las", "de", "del",
    };

    /// <summary>
    /// Name shown for a branch: its company's name plus its own, since branch names
    /// repeat across chains ("Oficina Principal" is seven different banks). Kept as the
    /// branch's own name when it already says which chain it is ("Jumbo Luperón").
    /// Mirrors branchDisplayName in the frontend (frontend/lib/branches.ts).
    /// </summary>
    private static string BranchDisplayName(string branchName, string companyName)
    {
        string branch = Fold(branchName);
        bool identified = Fold(companyName)
            .Split([' ', '-', '.', ',', '(', ')'], StringSplitOptions.RemoveEmptyEntries)
            .Where(word => word.Length > 2 && !GenericWords.Contains(word))
            .Any(branch.Contains);
        return identified ? branchName : $"{companyName} — {branchName}";
    }

    /// <summary>Lowercase, accents stripped.</summary>
    private static string Fold(string value) => string.Concat(
        value.Normalize(System.Text.NormalizationForm.FormD)
            .Where(c => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c)
                != System.Globalization.UnicodeCategory.NonSpacingMark))
        .ToLowerInvariant();

    /// <summary>
    /// Relative URL of the first image in the node's MediaPicker3 "photo" property.
    /// The converter returns a single MediaWithCrops for single-item pickers and an
    /// enumerable for multi-item pickers, so both shapes are handled.
    /// </summary>
    private string? PhotoUrl(IPublishedContent node)
    {
        object? value = node.Value(_fallback, "photo");
        MediaWithCrops? media = value as MediaWithCrops
            ?? (value as IEnumerable<MediaWithCrops>)?.FirstOrDefault();
        return media?.Url();
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
