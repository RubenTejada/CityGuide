namespace CityGuide.Agent;

/// <summary>
/// The one place that decides where a place's main image comes from, and the only
/// one that uploads it. The order is cheapest first, because a Google place photo
/// is the only source here that is billed (per download, $7 per 1.000 with 1.000
/// free a month) and for the pages a guide leads with it is not even the best one:
///  - a landmark — anything under "Atracciones", a plaza, or a place Google types
///    as a monument, museum, park or beach — is looked up on Wikimedia Commons,
///  - anything else with a website takes the image that site declares for social
///    previews, which is the picture the business chose of itself,
///  - and Google answers for what is left.
/// Every step degrades to the next: a source that finds nothing, or fails, only
/// costs the next one its turn, and a place with no image anywhere keeps none —
/// no photo has ever blocked writing a node.
/// </summary>
public class PlacePhotos(GooglePlacesClient google, FreePhotos free, UmbracoClient umbraco)
{
    /// <summary>
    /// Uploads the best free-first image of a place into the Media library and
    /// returns its key, or null when nothing was found. The media item is named
    /// after the place and the source it came from, so provenance survives in the
    /// backoffice — a Commons photograph carries a licence its author is owed.
    /// </summary>
    public async Task<Guid?> UploadAsync(
        string name,
        Func<Task<string?>>? googlePhoto = null,
        string routePath = "",
        IEnumerable<string>? googleTypes = null,
        string? website = null,
        string? cityName = null,
        GeoArea? cityArea = null)
    {
        try
        {
            FoundImage? image = null;
            if (FreePhotos.IsLandmark(routePath, googleTypes))
            {
                image = await free.FromCommonsAsync(name, cityName ?? "República Dominicana", cityArea);
            }

            if (image is null && !string.IsNullOrWhiteSpace(website))
            {
                image = await free.FromWebsiteAsync(website);
            }

            // Asked for last and lazily: a node whose picture came free never spends the
            // request that would name the Google one, let alone the one that downloads it.
            if (image is null && googlePhoto is not null && await googlePhoto() is string photoName)
            {
                (byte[] Bytes, string ContentType)? photo = await google.DownloadPhotoAsync(photoName);
                image = photo is null ? null : new FoundImage(photo.Value.Bytes, photo.Value.ContentType, "Google");
            }

            return image is null
                ? null
                : await umbraco.CreateMediaImageAsync($"{name} — {image.Source}", image.Bytes, image.ContentType);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  ! foto de {name}: {ex.Message}");
            return null;
        }
    }
}
