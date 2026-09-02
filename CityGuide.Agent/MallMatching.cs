namespace CityGuide.Agent;

/// <summary>A plaza comercial already in the CMS, with the data needed to place things in it.</summary>
public sealed record KnownMall(Guid Id, string Name, double Latitude, double Longitude);

/// <summary>
/// Decides whether a discovered establishment belongs inside a plaza comercial.
/// Google gives the plaza away in the address ("Ágora Mall, Av. Abraham Lincoln…")
/// or in the name ("Hummus — Ágora Mall"), but the mention alone also fires on the
/// place across the street ("al frente de Downtown Center"), so a mention only
/// counts when the coordinates put the establishment on the plaza itself.
/// </summary>
public static class MallMatching
{
    /// <summary>How far from the plaza's coordinates an establishment inside it can be.
    /// Wide enough for a corner of Sambil, tight enough to exclude the block across.</summary>
    private const double InsideMeters = 250;

    /// <summary>How far the same plaza discovered again can be from the one stored.
    /// Wider than the radius above on purpose: a plaza typed in by hand carries the
    /// coordinates of its corner or its entrance, which put "Downtown Center" three
    /// blocks from where Google puts it, and the name test is what identifies it.</summary>
    private const double SameMallMeters = 400;

    /// <summary>
    /// The plaza this establishment sits inside, or null when nothing says it does.
    /// The nearest one wins when two plazas are both named and close (Acrópolis and
    /// Blue Mall are three blocks apart). A place whose name reads as the plaza's own
    /// is taken for the plaza and left alone — unless <paramref name="isBranch"/> says
    /// it hangs from a company, which no plaza does: Caribbean Cinemas calls its screens
    /// inside Ágora Mall exactly "Ágora Mall", and that cinema belongs on the plaza's
    /// page like every other tenant.
    /// </summary>
    public static KnownMall? Containing(
        string placeName, string? address, double latitude, double longitude,
        IEnumerable<KnownMall> malls, bool isBranch = false)
        => malls
            .Where(mall => Mentions(mall.Name, placeName, address)
                && (isBranch || !IsSameMall(mall, placeName, latitude, longitude))
                && Distance(mall, latitude, longitude) <= InsideMeters)
            .OrderBy(mall => Distance(mall, latitude, longitude))
            .FirstOrDefault();

    /// <summary>
    /// The stored plaza this discovered place *is* — a plaza run rediscovering
    /// "Ágora Mall", or a shops run turning it up again. The name has to be the
    /// plaza's and nothing else: "Hummus — Ágora Mall" and "Sucursal Ágora Mall"
    /// both carry the plaza's words, but each adds its own, so they are tenants.
    /// </summary>
    public static KnownMall? Same(
        string placeName, double latitude, double longitude, IEnumerable<KnownMall> malls)
        => malls
            .Where(mall => IsSameMall(mall, placeName, latitude, longitude))
            .OrderBy(mall => Distance(mall, latitude, longitude))
            .FirstOrDefault();

    private static bool IsSameMall(KnownMall mall, string placeName, double latitude, double longitude)
    {
        string plaza = Letters(BareName(mall.Name));
        string place = Letters(BareName(placeName));
        return plaza.Length > 0
            && place.Length > 0
            && (place.StartsWith(plaza, StringComparison.Ordinal)
                || plaza.StartsWith(place, StringComparison.Ordinal))
            && Distance(mall, latitude, longitude) <= SameMallMeters;
    }

    /// <summary>
    /// A name reduced to its letters and digits, so spelling of the same plaza matches
    /// however Google writes it: "BlueMall Santo Domingo", "Blue Mall" and "Sambil" all
    /// start with the plaza stored. What a tenant adds it adds in front — "Sucursal Ágora
    /// Mall", "Hummus — Ágora Mall" — which is why only a shared start counts as the
    /// same plaza.
    /// </summary>
    private static string Letters(string name) =>
        string.Concat(TextMatch.Normalize(name).Where(char.IsLetterOrDigit));

    /// <summary>The name without the address that was appended to tell it from a twin
    /// ("Downtown Center — Av. José Núñez de Cáceres"). Both the plaza stored and the
    /// one discovered again may carry one, each quoting a different street.</summary>
    private static string BareName(string name) =>
        name.Split(['—', '–'], 2)[0].Trim();

    /// <summary>True when the plaza is spelled out in the establishment's name or address.
    /// Every significant word of the plaza has to be there: "Bella Vista Mall" must not
    /// match the branch whose address is only the sector, "Av. Sarasota, Bella Vista".</summary>
    private static bool Mentions(string mallName, string placeName, string? address)
        => TextMatch.Matches(mallName, placeName, 1.0) || TextMatch.Matches(mallName, address, 1.0);

    /// <summary>Metres between an establishment and a plaza (haversine).</summary>
    private static double Distance(KnownMall mall, double latitude, double longitude)
    {
        if (mall.Latitude == 0 && mall.Longitude == 0)
        {
            return double.MaxValue;
        }

        const double earthRadius = 6371000;
        double lat1 = Math.PI * mall.Latitude / 180;
        double lat2 = Math.PI * latitude / 180;
        double deltaLat = lat2 - lat1;
        double deltaLng = Math.PI * (longitude - mall.Longitude) / 180;
        double a = (Math.Sin(deltaLat / 2) * Math.Sin(deltaLat / 2))
            + (Math.Cos(lat1) * Math.Cos(lat2) * Math.Sin(deltaLng / 2) * Math.Sin(deltaLng / 2));
        return 2 * earthRadius * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}
