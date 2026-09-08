namespace CityGuide.Agent;

/// <summary>
/// Maintenance pass over the restaurants an earlier pass filed under
/// <see cref="CuisineMap.Fallback"/>: Google types most of them as "restaurant" and
/// nothing more, so the cuisine map had no answer and "Otros" ended up holding more
/// places than every cuisine subcategory put together (483 of 1.006 in Santo Domingo).
/// The name, the address and the description the place already paid for say what is
/// cooked there, so the model reads those — no Google request at all — and each place
/// is moved to the subcategory it belongs in, created when the city lacks it.
///
/// Only what the agent created is moved: a restaurant an editor filed by hand stays
/// where they put it, which is the same rule every other maintenance pass follows.
/// </summary>
public class RestaurantCuisines(UmbracoClient umbraco, IEnrichmentClient enricher)
{
    /// <summary>
    /// Reviews the "Otros" subcategory of each of <paramref name="categoryPaths"/> (the
    /// restaurant categories the AutoCategorize runs write into, one per city) and moves
    /// what the model can place. Prints the plan and moves nothing without
    /// <paramref name="apply"/>.
    /// </summary>
    public async Task RunAsync(bool apply, IReadOnlyList<string> categoryPaths)
    {
        Console.WriteLine(apply
            ? "== Recategorizando los restaurantes de 'Otros'"
            : "== Recategorización de restaurantes (simulación; agrega --apply para aplicarla)");
        if (categoryPaths.Count == 0)
        {
            Console.WriteLine("Ninguna categoría de restaurantes seleccionada.");
            return;
        }

        Guid subcategoryTypeId = await umbraco.GetDocumentTypeIdAsync("Subcategory");
        Guid placeTypeId = await umbraco.GetDocumentTypeIdAsync("Place");

        // What the portal already says about each place, read in one paged request
        // instead of one Management API call per node: the description is the field
        // that names the cuisine, and it is only ever on the published document.
        Dictionary<Guid, UmbracoClient.PublishedItem> published =
            (await umbraco.GetPublishedItemsAsync("place")).ToDictionary(p => p.Id);

        var moved = 0;
        foreach (string categoryPath in categoryPaths)
        {
            if (await umbraco.GetContentByPathAsync(categoryPath) is not { } category)
            {
                Console.Error.WriteLine($"  No encontré '{categoryPath}'.");
                continue;
            }

            // The cuisines this city has today, so a place lands in the existing node
            // rather than in a second one spelled the same.
            var subcategories = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(category.Id))
            {
                if (child.DocumentTypeId == subcategoryTypeId)
                {
                    subcategories[child.Name] = child.Id;
                }
            }

            if (!subcategories.TryGetValue(CuisineMap.Fallback, out Guid fallbackId))
            {
                Console.WriteLine($"\n{categoryPath}: sin subcategoría '{CuisineMap.Fallback}'.");
                continue;
            }

            // Only the places filed straight under "Otros". A company sitting there is
            // left alone on purpose: its branches would travel with it, and the chain's
            // own node is what a CreatesCompanies run decides.
            var ids = new List<Guid>();
            var candidates = new List<CuisineCandidate>();
            foreach (UmbracoClient.ChildDocument child in await umbraco.GetChildrenAsync(fallbackId))
            {
                if (child.DocumentTypeId != placeTypeId
                    || !published.TryGetValue(child.Id, out UmbracoClient.PublishedItem? item)
                    || item.Text.GetValueOrDefault("source")?.StartsWith("agent", StringComparison.OrdinalIgnoreCase) != true)
                {
                    continue;
                }

                ids.Add(child.Id);
                candidates.Add(new CuisineCandidate(
                    item.Name, item.Text.GetValueOrDefault("address"), [],
                    item.Text.GetValueOrDefault("description")));
            }

            Console.WriteLine($"\n{categoryPath}: {candidates.Count} restaurante(s) en '{CuisineMap.Fallback}'");
            if (candidates.Count == 0)
            {
                continue;
            }

            Dictionary<int, string> cuisines = await PlaceCuisines.ClassifyAsync(enricher, candidates);
            var unplaced = 0;
            for (var i = 0; i < candidates.Count; i++)
            {
                // A place the model left out, or answered "Otros" for, is exactly the
                // place that belongs where it already is: it stays, and no node is
                // created for it.
                if (!cuisines.TryGetValue(i, out string? cuisine) || cuisine == CuisineMap.Fallback)
                {
                    unplaced++;
                    continue;
                }

                Console.WriteLine($"  {candidates[i].Name} → {cuisine}");
                moved++;
                if (!apply)
                {
                    continue;
                }

                try
                {
                    if (!subcategories.TryGetValue(cuisine, out Guid targetId))
                    {
                        // Created in both cultures: English only routes when every
                        // ancestor is published in it, and the translation pass gives
                        // the node its English name from the curated table.
                        targetId = await umbraco.CreateDocumentAsync(
                            category.Id, subcategoryTypeId, cuisine, [], alsoInEnglish: true);
                        subcategories[cuisine] = targetId;
                        Console.WriteLine($"  + subcategoría '{cuisine}'");
                    }

                    await umbraco.MoveDocumentAsync(ids[i], targetId);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"  ! {candidates[i].Name}: {ex.Message}");
                }
            }

            Console.WriteLine($"  {unplaced} se quedan en '{CuisineMap.Fallback}'");
        }

        Console.WriteLine(apply
            ? $"\n{moved} restaurante(s) recategorizado(s)"
            : $"\n{moved} restaurante(s) cambiarían de subcategoría");
    }
}
