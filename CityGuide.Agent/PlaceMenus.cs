namespace CityGuide.Agent;

/// <summary>
/// Fills the menu of the places a section leads with, in whichever of the two shapes
/// their site publishes it: the scanned pages of a carta, shown in a viewer the visitor
/// opens, or the menu written out as text, which the model turns into the carta the page
/// renders. Everyone else keeps the page they have — a place with no menu shows nothing,
/// which is what makes a source that answers a third of the time usable.
///
/// Google states no menu, so the site is the only source, and it is fetched over the
/// same throttled client the free photos use: not one Google request either way. The
/// pages cost nothing at all; the structured carta is one model call per restaurant,
/// billed per token, which is why it only runs with --paid and why a run without a model
/// still brings home every scanned menu it finds.
/// </summary>
public class PlaceMenus(
    MenuSources menus, UmbracoClient umbraco, IEnrichmentClient? enricher, int minReviews)
{
    /// <summary>
    /// Gives the <paramref name="places"/> best-rated places of the selected sections
    /// their menu, skipping the ones that already have one and the ones with no site of
    /// their own to read it from — a branch stores no website, so a chain's locations
    /// are left alone and the company page is where its carta would belong, and a place
    /// whose "website" is a delivery app or a review portal is not read at all. "Best
    /// rated" is
    /// read among the places with enough reviews to mean it, and a place that already
    /// carries a menu is skipped unless <paramref name="force"/>. Prints the plan and
    /// writes nothing unless <paramref name="apply"/>.
    /// </summary>
    public async Task RunAsync(
        bool apply, Func<string, bool> sectionSelected, int places, bool force = false)
    {
        List<UmbracoClient.PublishedPlace> candidates =
            [.. (await umbraco.GetPublishedPlacesAsync("place"))
                .Where(p => sectionSelected(p.Path)
                    // A menu already stored is left alone: it is what the pass is for.
                    // --force reads the site again and replaces it, which is how a carta
                    // that has gone stale — or one read off the wrong page — is redone.
                    && (force || (p.MenuCount == 0 && !p.HasMenuData))
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
            $"{candidates.Count} lugar(es) por revisar. Solo se lee su propio sitio, "
            + "sin una sola petición a Google. "
            + (enricher is null
                ? "Sin modelo: solo se guardan las cartas escaneadas; las escritas en "
                + "texto necesitan --paid."
                : "Una carta escrita en texto cuesta una llamada al modelo."));

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
    /// Reads one place's menu and writes it. A scanned carta becomes its pages; a menu
    /// written out in text becomes the structured carta the model reads off it, and is
    /// left for a later pass when no model is configured. Returns what it wrote, or null
    /// when the site publishes none — which is the normal answer and never an error: a
    /// restaurant whose carta lives in a photo on Instagram keeps the page it has.
    /// </summary>
    private async Task<string?> FillAsync(UmbracoClient.PublishedPlace place)
    {
        try
        {
            if (await menus.FindAsync(place.Website, place.Name) is not FoundMenu menu)
            {
                return null;
            }

            if (menu.Text is not null)
            {
                return await StructureAsync(place, menu);
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

    /// <summary>
    /// The carta the model reads off a menu page. A page that turns out not to be one
    /// comes back empty and is stored as nothing — the model agreeing with itself is
    /// cheaper than a page of invented dishes on a restaurant's listing.
    /// </summary>
    private async Task<string?> StructureAsync(UmbracoClient.PublishedPlace place, FoundMenu menu)
    {
        if (enricher is null)
        {
            Console.WriteLine("    carta escrita en texto: necesita --paid");
            return null;
        }

        // The city the place lives in, as its own path spells it, so the prompt says
        // where the restaurant is without another lookup.
        string city = place.Path.Trim('/').Split('/').FirstOrDefault()?.Replace('-', ' ') ?? "";
        if (await enricher.StructureMenuAsync(place.Name, city, menu.Text!) is not StructuredMenu carta)
        {
            return null;
        }

        await umbraco.SetMenuAsync(place.Id, [], menu.SourceUrl, MenuPrompt.ToJson(carta));
        int dishes = carta.Sections.Sum(section => section.Items.Count);
        return $"{carta.Sections.Count} sección(es), {dishes} plato(s) — {menu.SourceUrl}";
    }
}
