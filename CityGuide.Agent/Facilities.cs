namespace CityGuide.Agent;

/// <summary>
/// What Google states about the atmosphere of a place, each answer true, false or
/// not stated at all. Only a "true" is ever acted on: a bar Google says nothing about
/// is not thereby a bar without a terrace.
/// </summary>
public record PlaceAtmosphere(
    bool OutdoorSeating, bool LiveMusic, bool GoodForChildren, bool GoodForGroups,
    bool GoodForWatchingSports, bool AllowsDogs, bool ServesBrunch, bool Delivery, bool Parking);

/// <summary>
/// The closed vocabulary of a place's "facilities", which is three lists in one. The
/// first ten are what the model may guess from the type of a place and its hours
/// (<see cref="EnrichmentPrompt.FacilityOptions"/>). The rest are never guessed, because
/// a guess is worth nothing for them — every bar "probably" shows the game — and an
/// article that groups the places carrying one has to be able to trust it: they come
/// from what Google states about the place (<see cref="From"/>) or from a person who
/// looked ("--add-facility"), and nowhere else.
///
/// The same names live in CityGuideSeeder (the checkbox list an editor sees) and in the
/// frontend (the badge icon and the English label); a name missing there still stores
/// and still renders, as a plain badge in Spanish.
/// </summary>
public static class Facilities
{
    public const string Views = "Vistas Panorámicas";
    public const string Sports = "Deportes en Pantalla";
    public const string Groups = "Grupos y Celebraciones";
    public const string Photogenic = "Fotogénico";
    public const string Dogs = "Pet Friendly";
    public const string Brunch = "Brunch";

    /// <summary>The facilities no model call may write.</summary>
    public static readonly string[] Observed = [Views, Sports, Groups, Photogenic, Dogs, Brunch];

    public static readonly string[] All = [.. EnrichmentPrompt.FacilityOptions, .. Observed];

    /// <summary>The facilities Google's answer vouches for. A view and a photogenic room
    /// are in no field of Google's, which is why those two are only ever set by hand.</summary>
    public static string[] From(PlaceAtmosphere atmosphere) =>
    [
        .. new (bool Stated, string Facility)[]
        {
            (atmosphere.OutdoorSeating, "Terraza"),
            (atmosphere.LiveMusic, "Música en Vivo"),
            (atmosphere.GoodForChildren, "Apto para Niños"),
            (atmosphere.Delivery, "Delivery"),
            (atmosphere.Parking, "Parqueo"),
            (atmosphere.GoodForWatchingSports, Sports),
            (atmosphere.GoodForGroups, Groups),
            (atmosphere.AllowsDogs, Dogs),
            (atmosphere.ServesBrunch, Brunch),
        }.Where(f => f.Stated).Select(f => f.Facility),
    ];
}
