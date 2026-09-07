namespace CityGuide.Agent;

/// <summary>
/// Fills the menu of the places a section leads with: the best rated get the pages of
/// their carta, read from their own site, and shown on the detail page as a viewer the
/// visitor opens. Everyone else keeps the page they have — a place with no menu shows
/// no button, which is what makes a source that answers half the time usable.
///
/// The pass costs nothing. Google states no menu, so the site is the only source, and
/// it is fetched over the same throttled client the free photos use: no Google request,
/// no model token. What it spends is time.
/// </summary>
public class PlaceMenus(MenuSources menus, UmbracoClient umbraco, int minReviews)
{
    /// <summary>
    /// Gives the <paramref name="places"/> best-rated places of the selected sections
    /// their menu, skipping the ones that already have one and the ones with no site of
    /// their own to read it from — a branch stores no website, so a chain's locations
    /// are left alone and the company page is where its carta would belong, and a place
    /// whose "website" is a delivery app or a review portal is not read at all. "Best
    /// rated" is
    /// read among the places with enough reviews to mean it. Prints the plan and writes
    /// nothing unless <paramref name="apply"/>.
    /// </summary>
    public async Task RunAsync(bool apply, Func<string, bool> sectionSelected, int places)
    {
        List<UmbracoClient.PublishedPlace> candidates =
            [.. (await umbraco.GetPublishedPlacesAsync("place"))
                .Where(p => sectionSelected(p.Path)
                    && p.MenuCount == 0
                    && MenuSources.CanRead(p.Website)
                    && p.RatingCount >= minReviews)
                .OrderByDescending(p => p.Rating)
                .ThenByDescending(p => p.RatingCount)
                .Take(places)];

        Console.WriteLine(apply
            ? "== Menús"
            : "== Menús (simulación; agrega --apply)");
        if (candidates.Count == 0)
        {
            Console.WriteLine(
                $"Ningún lugar sin menú, con sitio web y {minReviews}+ reseñas "
                + "en las secciones seleccionadas.");
            return;
        }

        Console.WriteLine(
            $"{candidates.Count} lugar(es) por revisar. Solo se lee su propio sitio: "
            + "sin peticiones a Google ni al modelo.");

        var filled = 0;
        foreach (UmbracoClient.PublishedPlace place in candidates)
        {
            Console.WriteLine($"  {place.Name} ({place.Rating:0.0}★ {place.RatingCount}) — {place.Website}");
            if (!apply)
            {
                continue;
            }

            if (await FillAsync(place) is not string source)
            {
                Console.WriteLine("    sin menú publicado en el sitio");
                continue;
            }

            filled++;
            Console.WriteLine($"    {source}");
        }

        Console.WriteLine(apply
            ? $"\n{filled} menú(s) de {candidates.Count} lugar(es) revisados."
            : $"\n{candidates.Count} lugar(es) por revisar.");
    }

    /// <summary>
    /// Reads one place's menu and writes it as its pages. Returns what it wrote, or
    /// null when the site publishes none — which is the normal answer and never an
    /// error: a restaurant whose carta lives in a photo on Instagram simply keeps the
    /// page it has.
    /// </summary>
    private async Task<string?> FillAsync(UmbracoClient.PublishedPlace place)
    {
        try
        {
            if (await menus.FindAsync(place.Website) is not FoundMenu menu)
            {
                return null;
            }

            var mediaKeys = new List<Guid>();
            foreach (FoundImage page in menu.Pages)
            {
                mediaKeys.Add(await umbraco.CreateMediaImageAsync(
                    $"{place.Name} — Menú {mediaKeys.Count + 1}", page.Bytes, page.ContentType));
            }

            if (mediaKeys.Count == 0)
            {
                return null;
            }

            await umbraco.SetMenuAsync(place.Id, mediaKeys, menu.SourceUrl);
            return $"{mediaKeys.Count} página(s) — {menu.SourceUrl}";
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"    ! menú de {place.Name}: {ex.Message}");
            return null;
        }
    }
}
