namespace CityGuide.Agent;

/// <summary>
/// Fills the facilities of the places a city already has from what Google states about
/// them. The model guesses a place's facilities when it is created, from its type and
/// its hours alone, and for most places that guess is empty; Google meanwhile knows
/// whether the place has a terrace, plays live music, shows the game, takes groups or
/// lets a dog in, because its visitors are asked. Those answers ride on Place Details at
/// the "Enterprise + Atmosphere" tier ($25 per 1.000), which no other pass asks for, so
/// this one is capped by how many places it covers, best known first, and prints the
/// bill before spending it.
///
/// It only ever adds: what an editor ticked, or the model guessed, stays. A place that
/// was asked is stamped ("facilitiesUpdated") whatever Google answered, so the next pass
/// moves on to the places nobody has asked about instead of paying for the same ones.
/// </summary>
public class PlaceFacilities(GooglePlacesClient google, UmbracoClient umbraco)
{
    /// <summary>What one Place Details request costs at the Atmosphere tier, in dollars.</summary>
    private const decimal DetailsCost = 0.025m;

    public async Task RunAsync(bool apply, Func<string, bool> sectionSelected, int places, bool force)
    {
        List<UmbracoClient.PublishedPlace> candidates =
            [.. (await umbraco.GetPublishedPlacesAsync("place"))
                .Where(p => sectionSelected(p.Path)
                    && p.GooglePlaceId is not null
                    && (force || !p.FacilitiesRead))
                .OrderByDescending(p => p.RatingCount)
                .Take(places)];

        Console.WriteLine(apply
            ? "== Facilidades según Google"
            : "== Facilidades según Google (simulación; agrega --apply)");
        if (candidates.Count == 0)
        {
            Console.WriteLine("Ningún lugar por preguntar en las secciones seleccionadas.");
            return;
        }

        Console.WriteLine(
            $"{candidates.Count} lugar(es), una consulta cada uno: "
            + $"${candidates.Count * DetailsCost:0.00} en Google.");

        var changed = 0;
        foreach (UmbracoClient.PublishedPlace place in candidates)
        {
            if (!apply)
            {
                Console.WriteLine($"  {place.Name} ({place.RatingCount} reseñas) — {place.Path}");
                continue;
            }

            try
            {
                if (await google.GetAtmosphereAsync(place.GooglePlaceId!) is not { } atmosphere)
                {
                    Console.WriteLine($"  {place.Name}: Google no respondió");
                    continue;
                }

                string[] added = await umbraco.AddFacilitiesAsync(
                    place.Id, Facilities.From(atmosphere), stamp: true);
                if (added.Length > 0)
                {
                    changed++;
                }

                Console.WriteLine(
                    $"  {place.Name}: {(added.Length == 0 ? "nada nuevo" : string.Join(", ", added))}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  ! facilidades de {place.Name}: {ex.Message}");
            }
        }

        Console.WriteLine(apply
            ? $"\n{changed} lugar(es) con facilidades nuevas de {candidates.Count} preguntados."
            : $"\n{candidates.Count} lugar(es) por preguntar.");
    }
}
