using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PublishedCache;
using Umbraco.Cms.Core.Services.Navigation;
using Umbraco.Extensions;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// One published place, projected once and kept ready for the "¿Qué está cerca?"
/// queries. Everything the panel draws is already resolved here — category,
/// branch name, photo, logo, url — so answering a request is a haversine over
/// an array instead of a walk over the content cache.
/// </summary>
public record NearbyEntry(
    Guid Id, string Name, string Url, string Category, string? Address,
    double Latitude, double Longitude, string? Photo, string? Icon,
    double? Rating, int? RatingCount);

/// <summary>
/// The index behind <see cref="NearbyController"/>. A request used to read every
/// place node and each of its ancestors out of the content cache — hundreds of
/// lookups for an answer that only changes when content is published — so the
/// projection is built once and held until a publish, unpublish, delete or move
/// invalidates it (<see cref="NearbyIndexInvalidator"/>).
///
/// The build runs inside the request that finds the index empty: resolving a
/// node's URL needs the ambient request state, so it cannot be done on a
/// background scope. Concurrent requests wait on the same build instead of each
/// running their own.
/// </summary>
public sealed class NearbyIndex
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private IReadOnlyList<NearbyEntry>? _entries;
    /// <summary>Bumped by every invalidation, so a build that started before one
    /// finished is thrown away instead of publishing a stale snapshot.</summary>
    private long _version;

    public void Invalidate()
    {
        Interlocked.Increment(ref _version);
        Volatile.Write(ref _entries, null);
    }

    public async Task<IReadOnlyList<NearbyEntry>> GetAsync(
        IPublishedContentCache contentCache,
        IDocumentNavigationQueryService navigation,
        IPublishedValueFallback fallback,
        CancellationToken cancellationToken)
    {
        IReadOnlyList<NearbyEntry>? current = Volatile.Read(ref _entries);
        if (current is not null)
        {
            return current;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            current = Volatile.Read(ref _entries);
            if (current is not null)
            {
                return current;
            }

            long version = Interlocked.Read(ref _version);
            IReadOnlyList<NearbyEntry> built = await BuildAsync(contentCache, navigation, fallback);
            if (Interlocked.Read(ref _version) == version)
            {
                Volatile.Write(ref _entries, built);
            }

            return built;
        }
        finally
        {
            _gate.Release();
        }
    }

    private static async Task<IReadOnlyList<NearbyEntry>> BuildAsync(
        IPublishedContentCache contentCache,
        IDocumentNavigationQueryService navigation,
        IPublishedValueFallback fallback)
    {
        var entries = new List<NearbyEntry>();
        if (!navigation.TryGetRootKeys(out IEnumerable<Guid> rootKeys))
        {
            return entries;
        }

        foreach (Guid rootKey in rootKeys)
        {
            if (!navigation.TryGetDescendantsKeysOfType(rootKey, "place", out IEnumerable<Guid> placeKeys))
            {
                continue;
            }

            foreach (Guid key in placeKeys)
            {
                IPublishedContent? place = await contentCache.GetByIdAsync(key);
                if (place is null)
                {
                    continue;
                }

                var latitude = (double)place.Value<decimal>(fallback, "latitude");
                var longitude = (double)place.Value<decimal>(fallback, "longitude");
                if (latitude == 0 && longitude == 0)
                {
                    continue;
                }

                // Category = nearest ancestor categoryPage (walking up through subcategory
                // and company levels). A branch place under a company is shown prefixed
                // with the company name so it is unambiguous on the map.
                string category = string.Empty;
                string displayName = place.Name;
                string? photo = PhotoUrl(place, fallback);
                string? icon = null;
                if (navigation.TryGetAncestorsKeys(key, out IEnumerable<Guid> ancestorKeys))
                {
                    foreach (Guid ancestorKey in ancestorKeys)
                    {
                        IPublishedContent? ancestor = await contentCache.GetByIdAsync(ancestorKey);
                        if (ancestor?.ContentType.Alias == "company")
                        {
                            displayName = BranchDisplayName(place.Name, ancestor.Name);
                            icon = PhotoUrl(ancestor, fallback);
                            photo ??= icon;
                        }

                        if (ancestor?.ContentType.Alias == "categoryPage")
                        {
                            category = ancestor.Name;
                            break;
                        }
                    }
                }

                var rating = (double)place.Value<decimal>(fallback, "googleRating");
                entries.Add(new NearbyEntry(
                    place.Key, displayName, place.Url(), category,
                    place.Value<string>(fallback, "address"), latitude, longitude,
                    photo, icon, rating > 0 ? rating : null,
                    rating > 0 ? place.Value<int>(fallback, "googleRatingCount") : null));
            }
        }

        return entries;
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
    private static string? PhotoUrl(IPublishedContent node, IPublishedValueFallback fallback)
    {
        object? value = node.Value(fallback, "photo");
        MediaWithCrops? media = value as MediaWithCrops
            ?? (value as IEnumerable<MediaWithCrops>)?.FirstOrDefault();
        return media?.Url();
    }
}
