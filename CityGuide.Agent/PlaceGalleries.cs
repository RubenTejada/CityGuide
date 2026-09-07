namespace CityGuide.Agent;

/// <summary>
/// Fills the photo gallery of the places a guide leads with: the best rated of a
/// section get the several images their detail page rotates, everyone else keeps the
/// single photo. Google names a place's photos for free, however many there are, and
/// bills only the download ($7 per 1.000), so what this pass costs is exactly the
/// pictures it brings home — which is why it is capped by how many places it may cover
/// and prints that bill before spending it.
///
/// Only the gallery is written: the main "photo" a card, a map popup and the Open Graph
/// tag use is a separate property and is left alone.
/// </summary>
public class PlaceGalleries(
    GooglePlacesClient google, UmbracoClient umbraco, int photosPerPlace, int minReviews)
{
    /// <summary>What one Google place photo download costs, in dollars.</summary>
    private const decimal PhotoCost = 0.007m;

    /// <summary>
    /// Gives the <paramref name="places"/> best-rated places of the selected sections a
    /// gallery, skipping the ones that already have one. "Best rated" is read among the
    /// places with enough reviews to mean it: a five-star average over five reviews would
    /// otherwise outrank a 4,9 over nine thousand. Prints the plan and downloads nothing
    /// unless <paramref name="apply"/>.
    /// </summary>
    public async Task RunAsync(bool apply, Func<string, bool> sectionSelected, int places)
    {
        List<UmbracoClient.PublishedPlace> candidates =
            [.. (await umbraco.GetPublishedPlacesAsync("place"))
                .Where(p => sectionSelected(p.Path)
                    && p.GooglePlaceId is not null
                    && p.GalleryCount == 0
                    && p.RatingCount >= minReviews)
                .OrderByDescending(p => p.Rating)
                .ThenByDescending(p => p.RatingCount)
                .Take(places)];

        Console.WriteLine(apply
            ? "== Galerías de fotos"
            : "== Galerías de fotos (simulación; agrega --apply)");
        if (candidates.Count == 0)
        {
            Console.WriteLine(
                $"Ningún lugar sin galería con {minReviews}+ reseñas en las secciones seleccionadas.");
            return;
        }

        Console.WriteLine(
            $"{candidates.Count} lugar(es), hasta {photosPerPlace} fotos cada uno: "
            + $"hasta ${candidates.Count * photosPerPlace * PhotoCost:0.00} en descargas de Google.");

        var filled = 0;
        foreach (UmbracoClient.PublishedPlace place in candidates)
        {
            Console.WriteLine($"  {place.Name} ({place.Rating:0.0}★ {place.RatingCount}) — {place.Path}");
            if (!apply)
            {
                continue;
            }

            int uploaded = await FillAsync(place);
            if (uploaded > 0)
            {
                filled++;
            }

            Console.WriteLine($"    {uploaded} foto(s)");
        }

        Console.WriteLine($"\n{(apply ? filled : candidates.Count)} galería(s) "
            + $"{(apply ? "creadas" : "por crear")}.");
    }

    /// <summary>
    /// Downloads what Google has of one place and writes it as its gallery. A photo that
    /// fails to download only costs the gallery that image, and a place Google answers
    /// with nothing keeps none — no picture has ever blocked a node.
    /// </summary>
    private async Task<int> FillAsync(UmbracoClient.PublishedPlace place)
    {
        try
        {
            IReadOnlyList<string> names =
                await google.GetPhotoNamesByIdAsync(place.GooglePlaceId!, photosPerPlace);
            var mediaKeys = new List<Guid>();
            foreach (string photoName in names)
            {
                if (await google.DownloadPhotoAsync(photoName) is not (byte[] bytes, string contentType))
                {
                    continue;
                }

                mediaKeys.Add(await umbraco.CreateMediaImageAsync(
                    $"{place.Name} — Google {mediaKeys.Count + 1}", bytes, contentType));
            }

            if (mediaKeys.Count == 0)
            {
                return 0;
            }

            await umbraco.SetGalleryAsync(place.Id, mediaKeys);
            return mediaKeys.Count;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"    ! galería de {place.Name}: {ex.Message}");
            return 0;
        }
    }
}
