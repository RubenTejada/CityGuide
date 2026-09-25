namespace CityGuide.Agent;

/// <summary>
/// Gives a credit to the photos the agent downloaded before it kept one. A Commons
/// photograph is only ours to show with its author, its licence and a link, and a Google
/// place photo only with the attribution Google hands over with it; every upload now
/// stores that on the media item, and this pass is the one-off catch-up for the ones
/// already in the library. It reads what the places and plazas point at — the main photo
/// and the gallery — and sorts each uncredited picture by the source its media name
/// records:
///  - Wikimedia Commons ("… — Wikimedia Commons — File.jpg") names its file, so the
///    credit is asked of Commons by that title and written onto the same media item.
///    Free, and nothing else changes.
///  - Google ("… — Google", "… — Google 3" in a gallery) cannot be traced back: the photo
///    name that would find its attribution was never kept, and a place's photos change
///    order, so crediting today's first photo could name the wrong author. The picture is
///    downloaded again instead, credit and all, and the old one goes to the media recycle
///    bin — the main photo through the usual chain (a free source first, if one has found
///    something since), the gallery from Google. That download is billed, so it needs
///    --paid, and the plan prints the bill.
///  - Anything else — the venue's own og:image, an editor's upload, a seeded logo —
///    needs no credit, or is not the agent's to change.
/// Plan until --apply.
/// </summary>
public class PhotoCredits(
    FreePhotos free,
    UmbracoClient umbraco,
    PlaceGalleries galleries,
    Func<UmbracoClient.PublishedPlace, Task<bool>> resetPhoto)
{
    /// <summary>What one Google place photo download costs, in dollars.</summary>
    private const decimal PhotoCost = 0.007m;

    public async Task RunAsync(bool apply, bool paid, Func<string, bool> sectionSelected)
    {
        List<UmbracoClient.PublishedPlace> nodes =
            [.. (await umbraco.GetPublishedPlacesAsync("place"))
                .Concat(await umbraco.GetPublishedPlacesAsync("mall"))
                .Where(n => sectionSelected(n.Path))];

        // One media item can hang from two nodes (a copy's photo handed to the survivor),
        // and it is credited once.
        var commons = new Dictionary<Guid, (string File, UmbracoClient.PublishedPlace Node)>();
        var googleMain = new List<UmbracoClient.PublishedPlace>();
        var googleGallery = new List<UmbracoClient.PublishedPlace>();
        foreach (UmbracoClient.PublishedPlace node in nodes)
        {
            IEnumerable<UmbracoClient.MediaRef> pictures =
                (node.PhotoMedia is { } main ? [main] : Array.Empty<UmbracoClient.MediaRef>())
                    .Concat(node.GalleryMedia ?? []);
            foreach (UmbracoClient.MediaRef media in pictures.Where(m => !m.Credited))
            {
                if (CommonsFile(media.Name) is string file)
                {
                    commons.TryAdd(media.Key, (file, node));
                }
            }

            if (node.PhotoMedia is { Credited: false } photo && FromGoogle(photo.Name))
            {
                googleMain.Add(node);
            }

            if ((node.GalleryMedia ?? []).Any(m => !m.Credited && FromGoogle(m.Name)))
            {
                googleGallery.Add(node);
            }
        }

        Console.WriteLine(apply
            ? "== Créditos de fotos"
            : "== Créditos de fotos (simulación; agrega --apply)");

        await CreditCommonsAsync(commons, apply);

        int downloads = googleMain.Count + googleGallery.Sum(n => n.GalleryMedia!.Count);
        Console.WriteLine($"\nGoogle: {googleMain.Count} foto(s) principal(es) y {googleGallery.Count} "
            + $"galería(s) sin crédito — hasta ${downloads * PhotoCost:0.00} en descargas.");
        if (!paid)
        {
            foreach (UmbracoClient.PublishedPlace node in googleMain.Concat(googleGallery).DistinctBy(n => n.Id))
            {
                Console.WriteLine($"  {node.Name} — {node.Path}");
            }

            if (downloads > 0)
            {
                Console.WriteLine("  Se vuelven a descargar con su crédito; la descarga se factura. Añade --paid.");
            }

            return;
        }

        foreach (UmbracoClient.PublishedPlace node in googleMain)
        {
            if (!apply)
            {
                Console.WriteLine($"  foto: {node.Name} — {node.Path}");
                continue;
            }

            Console.WriteLine(await resetPhoto(node)
                ? $"  * foto: {node.Name} (la anterior, a la papelera de medios)"
                : $"  ? foto: {node.Name}: ninguna fuente respondió; se queda la que tenía, sin crédito");
        }

        foreach (UmbracoClient.PublishedPlace node in googleGallery)
        {
            if (node.GooglePlaceId is null)
            {
                Console.WriteLine($"  ? galería: {node.Name}: sin id de Google, no se puede rehacer");
                continue;
            }

            if (!apply)
            {
                Console.WriteLine($"  galería: {node.Name} ({node.GalleryMedia!.Count} fotos) — {node.Path}");
                continue;
            }

            int uploaded = await galleries.FillAsync(node);
            Console.WriteLine(uploaded > 0
                ? $"  * galería: {node.Name}, {uploaded} foto(s) (las anteriores, a la papelera de medios)"
                : $"  ? galería: {node.Name}: Google no respondió; se queda la que tenía");
        }
    }

    private async Task CreditCommonsAsync(
        Dictionary<Guid, (string File, UmbracoClient.PublishedPlace Node)> commons, bool apply)
    {
        Console.WriteLine($"Wikimedia Commons: {commons.Count} foto(s) sin crédito.");
        if (commons.Count == 0)
        {
            return;
        }

        Dictionary<string, PhotoCredit> credits =
            await free.CommonsCreditsAsync(commons.Values.Select(c => c.File));
        foreach ((Guid mediaKey, (string file, UmbracoClient.PublishedPlace node)) in commons)
        {
            if (!credits.TryGetValue(FreePhotos.BareTitle(file), out PhotoCredit? credit))
            {
                Console.WriteLine($"  ? {node.Name}: Commons ya no tiene «{file}»");
                continue;
            }

            Console.WriteLine($"  {(apply ? "* " : "")}{node.Name}: {credit.Author ?? "(sin autor)"}, "
                + $"{credit.License ?? "(sin licencia)"} — {file}");
            if (apply)
            {
                await umbraco.SetMediaCreditAsync(mediaKey, credit);
            }
        }
    }

    /// <summary>The Commons file a media item was downloaded from, read off its name, or null.</summary>
    private static string? CommonsFile(string mediaName)
    {
        int at = mediaName.IndexOf(FreePhotos.CommonsSource, StringComparison.Ordinal);
        return at < 0 ? null : mediaName[(at + FreePhotos.CommonsSource.Length)..].Trim();
    }

    /// <summary>Whether a media item is a Google download: "… — Google", or "… — Google 3"
    /// for a gallery image.</summary>
    private static bool FromGoogle(string mediaName)
    {
        int at = mediaName.LastIndexOf(" — Google", StringComparison.Ordinal);
        return at >= 0 && mediaName[(at + " — Google".Length)..].Trim().All(char.IsDigit);
    }
}
